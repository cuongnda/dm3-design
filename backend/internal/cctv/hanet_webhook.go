package cctv

import (
	"context"
	"crypto/md5" //nolint:gosec // MD5 matches Hanet's webhook signature scheme — not a cryptographic choice we made.
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// hanetWebhookPayload covers the superset of fields Hanet posts to the
// webhook URL. Both check-in and person-update events share the
// `hash`/`id`/`placeID` triplet used for signature verification.
//
// DMPW reference: dmpw-api/DataModel/Device/CameraModel.cs (CheckinDataWebhookModel
// + HanetUserDataWebhookModel). data_type="person" → person DB change; any
// other value is a check-in event on a Hanet camera.
type hanetWebhookPayload struct {
	ActionType       string  `json:"action_type"`
	DataType         string  `json:"data_type"`
	Date             string  `json:"date"`
	DetectedImageURL string  `json:"detected_image_url"`
	DeviceID         string  `json:"deviceID"`
	DeviceName       string  `json:"deviceName"`
	Hash             string  `json:"hash"`
	ID               string  `json:"id"`
	KeyCode          string  `json:"keycode"`
	PersonID         string  `json:"personID"`
	PersonName       string  `json:"personName"`
	PersonType       string  `json:"personType"`
	PlaceID          string  `json:"placeID"`
	PlaceName        string  `json:"placeName"`
	Time             int64   `json:"time"`
	Temp             float64 `json:"temp"`
	Avatar           string  `json:"avatar"` // person-update events carry the new avatar here instead of detected_image_url
}

// ReceiveHanetWebhook handles POST /api/v1/cctv/hanet/webhook.
//
// Mounted as an anonymous route — Hanet can't carry a DM3 JWT. Tenancy is
// established by matching the payload's MD5(client_secret + id) against
// hash + placeID for every Hanet-configured tenant. If no tenant matches,
// the request is silently dropped with 200 (per DMPW) so we don't leak the
// presence/absence of specific secrets via a 401/404.
//
// Check-in events -> insert into dm3_access.access_events with decision =
// 'granted' (Hanet only webhooks on successful match in its local DB).
// Person-update events with action_type='delete' -> remove the matching
// H_<user_code> credential so DM3 doesn't keep a stale external_ref.
func (h *CCTVHandlers) ReceiveHanetWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}
	if len(body) == 0 {
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}

	var p hanetWebhookPayload
	if err := json.Unmarshal(body, &p); err != nil {
		slog.Warn("hanet webhook: invalid json", "error", err, "body_preview", trimPayload(body))
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}
	if p.Hash == "" || p.ID == "" || p.PlaceID == "" {
		slog.Warn("hanet webhook: missing hash/id/placeID",
			"hash_len", len(p.Hash), "id_len", len(p.ID), "place_id", p.PlaceID)
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}

	tenantID, err := h.matchHanetWebhookTenant(r.Context(), p.Hash, p.ID, p.PlaceID)
	if err != nil || tenantID == "" {
		// Wrong hash, unknown place, or no Hanet-configured tenant.
		// Log quietly and return 200 — leaking 4xx here would let a
		// probe distinguish "no tenant has Hanet" from "hash mismatch".
		slog.Info("hanet webhook: no matching tenant",
			"place_id", p.PlaceID, "device_id", p.DeviceID, "err", err)
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}

	switch {
	case p.DataType == "person":
		h.handleHanetPersonEvent(r.Context(), tenantID, p)
	default:
		h.handleHanetCheckin(r.Context(), tenantID, p)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
}

// matchHanetWebhookTenant iterates every tenant whose Hanet is configured
// and checks whether MD5(client_secret + id) == hash AND place_id matches.
// Returns the first match. O(N tenants) per webhook — acceptable at the
// scale Hanet webhooks fire, but worth revisiting if the tenant count grows.
func (h *CCTVHandlers) matchHanetWebhookTenant(ctx context.Context, hash, nonce, placeID string) (string, error) {
	if h.cipher == nil {
		return "", errors.New("cctv: credential cipher not configured")
	}
	rows, err := h.db.Pool.Query(ctx, `
		SELECT tenant_id::text, hanet_client_secret_enc
		  FROM dm3_cctv.cctv_settings
		 WHERE hanet_place_id = $1
		   AND hanet_client_secret_enc IS NOT NULL`,
		placeID,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	expectedHash := strings.ToLower(strings.TrimSpace(hash))
	for rows.Next() {
		var tenantID string
		var enc []byte
		if err := rows.Scan(&tenantID, &enc); err != nil {
			continue
		}
		secret, err := h.cipher.Decrypt(enc)
		if err != nil || secret == "" {
			continue
		}
		sum := md5.Sum([]byte(secret + nonce)) //nolint:gosec // matches Hanet's contract
		if strings.ToLower(hex.EncodeToString(sum[:])) == expectedHash {
			return tenantID, nil
		}
	}
	return "", nil
}

// handleHanetCheckin writes a row to dm3_access.access_events when Hanet
// reports a recognized face at a camera. Unknown persons (no local
// credential) are logged but not persisted — DM3 has no "unknown face"
// events table today.
func (h *CCTVHandlers) handleHanetCheckin(ctx context.Context, tenantID string, p hanetWebhookPayload) {
	// Resolve the local user by Hanet personID stored in credentials.external_ref.
	var userID, userName, userCode string
	err := h.db.Pool.QueryRow(ctx, `
		SELECT u.id::text,
		       TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),
		       COALESCE(u.user_code,'')
		  FROM dm3_identity.credentials c
		  JOIN dm3_identity.users u ON u.id = c.user_id
		 WHERE c.tenant_id = $1::uuid
		   AND c.type = 'face'
		   AND c.external_ref = $2
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 LIMIT 1`,
		tenantID, p.PersonID,
	).Scan(&userID, &userName, &userCode)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("hanet webhook: user lookup failed", "tenant", tenantID, "person_id", p.PersonID, "error", err)
		return
	}

	// Resolve access_point via the Hanet device_id stored on the camera row.
	// When the Hanet camera hasn't been linked to any access point, we still
	// insert the event (access_point_id NULL) so it appears on monitoring.
	var accessPointID *string
	var cameraDeviceID *string
	err = h.db.Pool.QueryRow(ctx, `
		SELECT ap.id::text, d.device_id
		  FROM dm3_devices.devices d
		  JOIN dm3_cctv.cameras cam ON cam.device_id = d.id
		  LEFT JOIN dm3_access.access_point_devices apd ON apd.access_device_id = d.id::text
		  LEFT JOIN dm3_access.access_points ap ON ap.id = apd.access_point_id
		 WHERE d.tenant_id = $1::uuid
		   AND (d.device_id = $2 OR cam.rtsp_url LIKE '%' || $2 || '%')
		 LIMIT 1`,
		tenantID, p.DeviceID,
	).Scan(&accessPointID, &cameraDeviceID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Debug("hanet webhook: access_point lookup failed", "tenant", tenantID, "device_id", p.DeviceID, "error", err)
	}

	evtTime := time.Now().UTC()
	if p.Time > 0 {
		evtTime = time.UnixMilli(p.Time).UTC()
	}
	reason := "hanet_match"
	decision := "granted"
	if userID == "" {
		// Unknown person (no local credential). Record the event but mark
		// decision=denied so the monitoring page can show the unknown face.
		// user_id stays NULL. DMPW routes these to a separate "UnknownPerson"
		// events table; we reuse access_events for now.
		decision = "denied"
		reason = "hanet_unknown_person"
	}

	metadata, _ := json.Marshal(map[string]any{
		"source":             "hanet_webhook",
		"hanet_person_id":    p.PersonID,
		"hanet_person_type":  p.PersonType,
		"hanet_place_id":     p.PlaceID,
		"hanet_place_name":   p.PlaceName,
		"hanet_device_id":    p.DeviceID,
		"hanet_device_name":  p.DeviceName,
		"detected_image_url": p.DetectedImageURL,
	})

	var uid any
	if userID != "" {
		uid = userID
	}
	_, err = h.db.Pool.Exec(ctx, `
		INSERT INTO dm3_access.access_events (
			time, tenant_id, access_point_id, user_id, user_name,
			credential_type, direction, decision, reason, decided_locally, metadata
		) VALUES (
			$1, $2::uuid, NULLIF($3,'')::uuid, NULLIF($4,'')::uuid, NULLIF($5,''),
			'face', 'in', $6, $7, false, $8
		)`,
		evtTime, tenantID,
		derefOrEmpty(accessPointID), uid, userName,
		decision, reason, metadata,
	)
	if err != nil {
		slog.Error("hanet webhook: access event insert failed",
			"tenant", tenantID, "person_id", p.PersonID, "error", err)
		return
	}
	slog.Info("hanet webhook: access event recorded",
		"tenant", tenantID, "user_id", userID, "user_code", userCode,
		"person_id", p.PersonID, "device", p.DeviceID, "decision", decision)
}

// handleHanetPersonEvent reacts to person DB changes on the Hanet side. The
// only case we care about today is deletion: if Hanet says a person is
// gone, drop the matching H_<user_code> credential so DM3 isn't left with
// a dangling external_ref. add/update events are logged and ignored —
// DM3 is the source of truth for persons; Hanet shouldn't be adding people
// behind our back.
func (h *CCTVHandlers) handleHanetPersonEvent(ctx context.Context, tenantID string, p hanetWebhookPayload) {
	action := strings.ToLower(strings.TrimSpace(p.ActionType))
	if action != "delete" && action != "remove" {
		slog.Info("hanet webhook: person event (non-delete) ignored",
			"tenant", tenantID, "action", action, "person_id", p.PersonID)
		return
	}
	if p.PersonID == "" {
		return
	}
	cmd, err := h.db.Pool.Exec(ctx, `
		DELETE FROM dm3_identity.credentials
		 WHERE tenant_id = $1::uuid
		   AND type = 'face'
		   AND external_ref = $2
		   AND value LIKE 'H\_%' ESCAPE '\'`,
		tenantID, p.PersonID,
	)
	if err != nil {
		slog.Error("hanet webhook: delete credential failed",
			"tenant", tenantID, "person_id", p.PersonID, "error", err)
		return
	}
	slog.Info("hanet webhook: credential removed after Hanet delete",
		"tenant", tenantID, "person_id", p.PersonID, "rows", cmd.RowsAffected())
}

// derefOrEmpty returns "" for nil, matching the NULLIF($N,'') pattern above.
func derefOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
