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

// hanetWebhookPayload covers the fields Hanet posts to the webhook URL for
// recognition events. Check-in events land here with one of two shapes:
//
//   - Face event: PersonID is non-empty, PlateNumber is empty.
//   - Plate event: PlateNumber is non-empty (Hanet LPR cameras).
//
// We accept the common plate-field aliases Hanet uses across firmware
// versions (`plate_number`, `plateNumber`, `plate`, `licensePlate`) so a
// firmware update doesn't silently break the dispatcher.
//
// The `hash`/`id`/`placeID` triplet is common to every payload and drives
// tenancy — see matchHanetWebhookTenant.
//
// DMPW reference: dmpw-api/DataModel/Device/CameraModel.cs
// (CheckinDataWebhookModel).
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

	// Plate fields — Hanet LPR firmware isn't consistent about which name
	// it sends, so accept all four and resolve at dispatch time.
	PlateNumber  string `json:"plate_number"`
	PlateCamel   string `json:"plateNumber"`
	Plate        string `json:"plate"`
	LicensePlate string `json:"licensePlate"`

	// Direction is filled on parking LPR events ("in" | "out"). Ignored on
	// face events.
	Direction string `json:"direction"`
}

// resolvedPlate returns the first non-empty plate field, uppercased and
// whitespace-trimmed. Empty string = not a plate event.
func (p hanetWebhookPayload) resolvedPlate() string {
	for _, v := range []string{p.PlateNumber, p.PlateCamel, p.Plate, p.LicensePlate} {
		if s := strings.ToUpper(strings.TrimSpace(v)); s != "" {
			return s
		}
	}
	return ""
}

// ReceiveHanetWebhook handles POST /api/v1/cctv/hanet/webhook.
//
// Mounted as an anonymous route — Hanet can't carry a DM3 JWT. Tenancy is
// established by matching the payload's MD5(client_secret + id) against
// hash + placeID for every Hanet-configured tenant. If no tenant matches,
// the request is silently dropped with 200 (per DMPW) so we don't leak the
// presence/absence of specific secrets via a 401/404.
//
// Every recognized payload becomes one row in dm3_access.access_events,
// with credential_type set from the payload shape:
//
//   - `face` when Hanet sent a personID (face match)
//   - `plate_number` when Hanet sent any plate_* field (LPR match)
//
// `decision` is 'granted' for known subjects (local credential match) and
// 'denied' for unknowns, with the reason code recording which path fired.
func (h *CCTVHandlers) ReceiveHanetWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
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
		slog.Info("hanet webhook: no matching tenant",
			"place_id", p.PlaceID, "device_id", p.DeviceID, "err", err)
		httputil.JSON(w, http.StatusOK, map[string]any{"statusCode": 200, "returnCode": 1})
		return
	}

	h.handleHanetRecognition(r.Context(), tenantID, p)
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

// handleHanetRecognition inserts one dm3_access.access_events row per
// webhook, tagged with the correct credential_type derived from the
// payload shape (plate vs face). Unknowns (no matching local credential)
// still get a row — with decision=denied — so the monitoring page and
// event log see every Hanet-camera trigger, not just the matched ones.
//
// Face events are routed to the existing H_<personID> credential via
// credentials.external_ref = personID (equivalent lookup — the value and
// external_ref both carry the personID since migration 000045 switched
// the value from H_<user_code>). Plate events are routed to
// dm3_parking.parking_vehicles.plate_number (the tenant's unified vehicle
// registry), falling back to credentials.value = <plate> + type =
// 'plate_number' for hand-created plate credentials.
func (h *CCTVHandlers) handleHanetRecognition(ctx context.Context, tenantID string, p hanetWebhookPayload) {
	plate := p.resolvedPlate()
	isPlate := plate != ""

	var (
		credentialType string
		credentialVal  string
		userID         string
		userName       string
		userCode       string
	)

	if isPlate {
		credentialType = "plate_number"
		credentialVal = plate
		userID, userName, userCode = h.lookupHanetVehicleOwner(ctx, tenantID, plate)
	} else if p.PersonID != "" {
		credentialType = "face"
		credentialVal = p.PersonID
		userID, userName, userCode = h.lookupHanetFaceUser(ctx, tenantID, p.PersonID)
	} else {
		slog.Warn("hanet webhook: payload has no personID and no plate; ignored",
			"tenant", tenantID, "device_id", p.DeviceID)
		return
	}

	// Direction: Hanet sends "in"/"out" on parking events; default "in" for
	// face check-ins. The access_events table uses the same vocabulary.
	direction := strings.ToLower(strings.TrimSpace(p.Direction))
	if direction != "in" && direction != "out" {
		direction = "in"
	}

	// Resolve access_point via the Hanet camera's device_id.
	var accessPointID string
	_ = h.db.Pool.QueryRow(ctx, `
		SELECT ap.id::text
		  FROM dm3_devices.devices d
		  LEFT JOIN dm3_access.access_point_devices apd ON apd.access_device_id = d.id::text
		  LEFT JOIN dm3_access.access_points ap ON ap.id = apd.access_point_id
		 WHERE d.tenant_id = $1::uuid
		   AND d.device_id = $2
		 LIMIT 1`,
		tenantID, p.DeviceID,
	).Scan(&accessPointID)

	evtTime := time.Now().UTC()
	if p.Time > 0 {
		evtTime = time.UnixMilli(p.Time).UTC()
	}

	decision := "granted"
	reason := "hanet_match_" + credentialType
	if userID == "" {
		decision = "denied"
		reason = "hanet_unknown_" + credentialType
	}

	metadata, _ := json.Marshal(map[string]any{
		"source":             "hanet_webhook",
		"event_kind":         credentialType, // "face" | "plate_number"
		"credential_value":   credentialVal,
		"hanet_person_id":    p.PersonID,
		"hanet_person_name":  p.PersonName,
		"hanet_person_type":  p.PersonType,
		"hanet_plate_number": plate,
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
	_, err := h.db.Pool.Exec(ctx, `
		INSERT INTO dm3_access.access_events (
			time, tenant_id, access_point_id, user_id, user_name,
			credential_type, direction, decision, reason, decided_locally, metadata
		) VALUES (
			$1, $2::uuid, NULLIF($3,'')::uuid, NULLIF($4,'')::uuid, NULLIF($5,''),
			$6, $7, $8, $9, false, $10
		)`,
		evtTime, tenantID, accessPointID, uid, userName,
		credentialType, direction, decision, reason, metadata,
	)
	if err != nil {
		slog.Error("hanet webhook: access event insert failed",
			"tenant", tenantID, "kind", credentialType, "value", credentialVal, "error", err)
		return
	}
	slog.Info("hanet webhook: access event recorded",
		"tenant", tenantID, "kind", credentialType, "value", credentialVal,
		"user_id", userID, "user_code", userCode,
		"device", p.DeviceID, "decision", decision, "direction", direction)
}

// lookupHanetFaceUser returns (user_id, full_name, user_code) for a Hanet
// face event by matching credentials.external_ref. Empty strings on miss.
func (h *CCTVHandlers) lookupHanetFaceUser(ctx context.Context, tenantID, personID string) (string, string, string) {
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
		tenantID, personID,
	).Scan(&userID, &userName, &userCode)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("hanet webhook: face user lookup failed",
			"tenant", tenantID, "person_id", personID, "error", err)
	}
	return userID, userName, userCode
}

// lookupHanetVehicleOwner returns the registered owner of a plate for a
// Hanet LPR event. Tries dm3_parking.parking_vehicles.plate_number first
// (canonical vehicle registry per migration 000010), then falls back to a
// hand-created plate_number credential in dm3_identity.credentials.
// Empty strings on miss.
func (h *CCTVHandlers) lookupHanetVehicleOwner(ctx context.Context, tenantID, plate string) (string, string, string) {
	var userID, userName, userCode string
	err := h.db.Pool.QueryRow(ctx, `
		SELECT u.id::text,
		       TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),
		       COALESCE(u.user_code,'')
		  FROM dm3_parking.parking_vehicles v
		  JOIN dm3_identity.users u ON u.id = v.owner_id
		 WHERE v.tenant_id = $1::uuid
		   AND UPPER(v.plate_number) = $2
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 LIMIT 1`,
		tenantID, plate,
	).Scan(&userID, &userName, &userCode)
	if err == nil {
		return userID, userName, userCode
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		slog.Debug("hanet webhook: parking_vehicles lookup failed",
			"tenant", tenantID, "plate", plate, "error", err)
	}
	// Fallback: a plate stored as a credential (less common — usually
	// people register cars in the parking module, not the credentials
	// table, but handle it gracefully).
	err = h.db.Pool.QueryRow(ctx, `
		SELECT u.id::text,
		       TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),
		       COALESCE(u.user_code,'')
		  FROM dm3_identity.credentials c
		  JOIN dm3_identity.users u ON u.id = c.user_id
		 WHERE c.tenant_id = $1::uuid
		   AND c.type = 'plate_number'
		   AND UPPER(c.value) = $2
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 LIMIT 1`,
		tenantID, plate,
	).Scan(&userID, &userName, &userCode)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("hanet webhook: plate credential lookup failed",
			"tenant", tenantID, "plate", plate, "error", err)
	}
	return userID, userName, userCode
}

