package access

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

type AccessHandlers struct {
	db      *db.DB
	audit   *audit.Logger
	nats    *natsutil.Client
	objects objectstore.Store
}

func NewAccessHandlers(database *db.DB, auditLog *audit.Logger, natsClient *natsutil.Client, objects objectstore.Store) *AccessHandlers {
	return &AccessHandlers{db: database, audit: auditLog, nats: natsClient, objects: objects}
}

// ─── Access Devices ──────────────────────────────────────────────────────────

func (h *AccessHandlers) ListAccessDevices(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	if cid := authsvc.CompanyIDFromContext(r.Context()); cid != "" {
		where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
		args = append(args, cid)
		idx++
	}

	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("state"); v != "" {
		where += fmt.Sprintf(" AND state = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND name ILIKE $%d", idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_access.access_devices "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`SELECT id, tenant_id, device_id, name, type,
		status, state, mode, unlock_duration_ms, anti_passback, emergency_unlock,
		firmware_version, ip_address, last_event_at, last_heartbeat_at,
		config_version, user_db_version, rules_version, source, source_ref, metadata, created_at, updated_at
		FROM dm3_access.access_devices %s ORDER BY name ASC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list access devices query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	devices := []models.AccessDevice{}
	for rows.Next() {
		var d models.AccessDevice
		if err := rows.Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
			&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
			&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
			&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Source, &d.SourceRef, &d.Metadata,
			&d.CreatedAt, &d.UpdatedAt); err != nil {
			slog.Error("list access devices scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access devices rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, devices, total, page, limit)
}

type createAccessDeviceRequest struct {
	Name             string  `json:"name"`
	Type             string  `json:"type"`
	DeviceID         *string `json:"device_id"`
	UnlockDurationMs *int    `json:"unlock_duration_ms"`
	AntiPassback     *bool   `json:"anti_passback"`
	EmergencyUnlock  *bool   `json:"emergency_unlock"`
}

func (h *AccessHandlers) CreateAccessDevice(w http.ResponseWriter, r *http.Request) {
	var req createAccessDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "name and type are required")
		return
	}

	unlockMs := 5000
	if req.UnlockDurationMs != nil {
		unlockMs = *req.UnlockDurationMs
	}
	antiPassback := false
	if req.AntiPassback != nil {
		antiPassback = *req.AntiPassback
	}
	emergencyUnlock := true
	if req.EmergencyUnlock != nil {
		emergencyUnlock = *req.EmergencyUnlock
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	var d models.AccessDevice
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_devices (name, type, device_id, unlock_duration_ms, anti_passback, emergency_unlock, tenant_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7::uuid)
		 RETURNING id, tenant_id, device_id, name, type,
		 status, state, mode, unlock_duration_ms, anti_passback, emergency_unlock,
		 firmware_version, ip_address, last_event_at, last_heartbeat_at,
		 config_version, user_db_version, rules_version, source, source_ref, metadata, created_at, updated_at`,
		req.Name, req.Type, req.DeviceID, unlockMs, antiPassback, emergencyUnlock, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Source, &d.SourceRef, &d.Metadata,
		&d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		slog.Error("create access device error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.device.create", "access_device", d.ID, d.Name, "success", nil, d)
	httputil.JSON(w, http.StatusCreated, d)
}

func (h *AccessHandlers) GetAccessDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := h.scanAccessDevice(r, id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access device not found")
		return
	}
	httputil.JSON(w, http.StatusOK, d)
}

type updateAccessDeviceRequest struct {
	Name             *string `json:"name"`
	Status           *string `json:"status"`
	State            *string `json:"state"`
	Mode             *string `json:"mode"`
	DeviceID         *string `json:"device_id"`
	UnlockDurationMs *int    `json:"unlock_duration_ms"`
	AntiPassback     *bool   `json:"anti_passback"`
	EmergencyUnlock  *bool   `json:"emergency_unlock"`
}

func (h *AccessHandlers) UpdateAccessDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req updateAccessDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var d models.AccessDevice
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.access_devices SET
			name = COALESCE($2, name),
			status = COALESCE($3, status), state = COALESCE($4, state), mode = COALESCE($5, mode),
			device_id = COALESCE($6, device_id), updated_at = now()
		 WHERE id = $1::uuid AND tenant_id = $7::uuid
		 RETURNING id, tenant_id, device_id, name, type,
		 status, state, mode, unlock_duration_ms, anti_passback, emergency_unlock,
		 firmware_version, ip_address, last_event_at, last_heartbeat_at,
		 config_version, user_db_version, rules_version, source, source_ref, metadata, created_at, updated_at`,
		id, req.Name, req.Status, req.State, req.Mode, req.DeviceID, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Source, &d.SourceRef, &d.Metadata,
		&d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access device not found")
		return
	}
	h.audit.LogFromRequest(r, "access.device.update", "access_device", d.ID, d.Name, "success", nil, d)
	httputil.JSON(w, http.StatusOK, d)
}

func (h *AccessHandlers) DeleteAccessDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_devices WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid)
	if err != nil {
		slog.Error("delete access device error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access device not found")
		return
	}
	h.audit.LogFromRequest(r, "access.device.delete", "access_device", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccessHandlers) BulkDeleteAccessDevices(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "ids required")
		return
	}
	placeholders := make([]string, len(req.IDs))
	args := []any{cid}
	for i, id := range req.IDs {
		placeholders[i] = fmt.Sprintf("$%d::uuid", i+2)
		args = append(args, id)
	}
	query := fmt.Sprintf(`DELETE FROM dm3_access.access_devices WHERE tenant_id = $1::uuid AND id IN (%s)`, strings.Join(placeholders, ","))
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		slog.Error("bulk delete access devices error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.device.bulk_delete", "access_device", "", "", "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── Access Rules (legacy stubs) ─────────────────────────────────────────────

func (h *AccessHandlers) ListRules(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) CreateRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) GetRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) UpdateRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) DeleteRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

// ─── Schedules (legacy stubs) ────────────────────────────────────────────────

func (h *AccessHandlers) ListSchedules(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) GetSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

// ─── Events ──────────────────────────────────────────────────────────────────

// ListEvents returns paginated access event history for the caller's tenant.
//
// @Summary      List access events (history)
// @Description  Returns paginated access event history for the caller's tenant. Supports filtering by access point, user, decision, credential type, and an ISO-8601 time window. Results are sorted newest first.
// @Tags         Access
// @Produce      json
// @Param        page             query  integer  false  "Page number (default 1)"
// @Param        limit            query  integer  false  "Page size (default 20, max 100)"
// @Param        access_point_id  query  string   false  "Filter by access point UUID"
// @Param        user_id          query  string   false  "Filter by user UUID"
// @Param        decision         query  string   false  "Filter by decision (granted, denied)"
// @Param        credential_type  query  string   false  "Filter by credential type (face, card, pin, qr, plate)"
// @Param        from             query  string   false  "ISO-8601 start timestamp"
// @Param        to               query  string   false  "ISO-8601 end timestamp"
// @Success      200  {object}  map[string]any  "Paginated list of access events"
// @Failure      401  {object}  map[string]any  "Missing or invalid bearer token"
// @Failure      403  {object}  map[string]any  "Forbidden"
// @Failure      500  {object}  map[string]any  "Internal server error"
// @Security     BearerAuth
// @Router       /access/events [get]
func (h *AccessHandlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if v := r.URL.Query().Get("access_point_id"); v != "" {
		where += fmt.Sprintf(" AND access_point_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("user_id"); v != "" {
		where += fmt.Sprintf(" AND user_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("decision"); v != "" {
		where += fmt.Sprintf(" AND decision = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("credential_type"); v != "" {
		where += fmt.Sprintf(" AND credential_type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time >= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time <= $%d", idx)
			args = append(args, t)
			idx++
		}
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_access.access_events "+where, countArgs...).Scan(&total)

	// LEFT JOIN to pick one device per access point (the one with the earliest junction entry).
	// access_point_devices.access_device_id is TEXT; access_devices.id is UUID — cast to compare.
	query := fmt.Sprintf(`
		SELECT e.id, COALESCE(e.event_id,''), e.tenant_id, e.time,
		       COALESCE(e.access_point_id::text,''),
		       COALESCE(e.user_id::text,''), COALESCE(e.user_name,''), COALESCE(e.credential_type,''),
		       COALESCE(e.direction,''), e.decision, COALESCE(e.reason,''), e.confidence,
		       COALESCE(e.photo_ref,''), e.metadata,
		       COALESCE(d.id::text,''), COALESCE(d.name,'')
		FROM dm3_access.access_events e
		LEFT JOIN LATERAL (
		    SELECT ad.id, ad.name
		    FROM dm3_access.access_point_devices apd
		    JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id
		    WHERE apd.access_point_id = e.access_point_id
		      AND apd.tenant_id = e.tenant_id
		    ORDER BY apd.created_at
		    LIMIT 1
		) d ON true
		%s ORDER BY e.time DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list events query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	events := []eventResponse{}
	presigner, _ := h.objects.(objectstore.GetURLPresigner)
	for rows.Next() {
		var e eventResponse
		if err := rows.Scan(&e.ID, &e.EventID, &e.TenantID, &e.Time, &e.AccessPointID,
			&e.UserID, &e.UserName, &e.CredentialType, &e.Direction, &e.Decision,
			&e.Reason, &e.Confidence, &e.PhotoRef, &e.Metadata,
			&e.DeviceID, &e.DeviceName); err != nil {
			slog.Error("list events scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		e.PhotoURL = presignPhotoIfMinIOKey(r.Context(), presigner, e.PhotoRef)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list events rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Attach CCTV media captured by cctv-svc (per-camera thumbnails + clips)
	// for every event on this page. We batch-fetch in one query indexed by
	// the device-side event_id text so 20 events → 1 round trip, not 20.
	attachCCTVMedia(r.Context(), h.db.Pool, presigner, events)

	httputil.Paginated(w, events, total, page, limit)
}

// attachCCTVMedia populates eventResponse.CCTVMedia for a page of access
// events by joining dm3_cctv.event_clip_events + dm3_cctv.event_clips. A single
// SELECT covers all events on the page; presigning happens in-loop and is
// cheap (local HMAC). Safe to call with empty events — no query fired.
//
// TODO(refactor): paginate per-event if any event grows > ~50 cameras linked
// (coalescer caps bursts on the same camera, but an AP with many cameras
// could still produce a large set). Sorting is camera_name asc for UI stability.
func attachCCTVMedia(ctx context.Context, pool *pgxpool.Pool, presigner objectstore.GetURLPresigner, events []eventResponse) {
	if len(events) == 0 {
		return
	}
	idx := make(map[string]*eventResponse, len(events))
	ids := make([]string, 0, len(events))
	for i := range events {
		if events[i].EventID == "" {
			continue
		}
		idx[events[i].EventID] = &events[i]
		ids = append(ids, events[i].EventID)
	}
	if len(ids) == 0 {
		return
	}

	queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	rows, err := pool.Query(queryCtx, `
		SELECT j.access_event_id::text,
		       ec.id::text, ec.device_id::text, COALESCE(d.name,''),
		       ec.media_type, ec.status,
		       COALESCE(ec.object_key,''),
		       COALESCE(ec.thumbnail_ref,'')
		  FROM dm3_cctv.event_clip_events j
		  JOIN dm3_cctv.event_clips ec ON ec.id = j.clip_id
		  LEFT JOIN dm3_devices.devices d ON d.id = ec.device_id
		 WHERE j.access_event_id::text = ANY($1::text[])
		 ORDER BY d.name NULLS LAST, ec.created_at`,
		ids,
	)
	if err != nil {
		slog.Warn("access: attach cctv media query failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var (
			eventID      string
			clipID       string
			cameraID     string
			cameraName   string
			mediaType    string
			status       string
			objectKey    string
			thumbRef     string
		)
		if err := rows.Scan(&eventID, &clipID, &cameraID, &cameraName, &mediaType, &status, &objectKey, &thumbRef); err != nil {
			slog.Warn("access: attach cctv media scan failed", "error", err)
			continue
		}
		evt, ok := idx[eventID]
		if !ok {
			continue
		}
		media := cctvMediaDTO{
			ClipID:     clipID,
			CameraID:   cameraID,
			CameraName: cameraName,
			MediaType:  mediaType,
			Status:     status,
		}
		// Thumbnail: prefer the dedicated preview key, else the object itself
		// when it's already a snapshot (JPG). Clip rows mid-extraction may
		// still have only the thumbnail — fine, playback URL stays empty.
		switch {
		case thumbRef != "":
			media.ThumbnailURL = presignOrEmpty(queryCtx, presigner, thumbRef)
		case mediaType == "snapshot" && status == "finalized":
			media.ThumbnailURL = presignOrEmpty(queryCtx, presigner, objectKey)
		}
		// Playback URL: only the real object, never the pending placeholder.
		if status == "finalized" && !strings.HasPrefix(objectKey, "pending/") {
			media.PlaybackURL = presignOrEmpty(queryCtx, presigner, objectKey)
		}
		evt.CCTVMedia = append(evt.CCTVMedia, media)
	}
}

// presignOrEmpty is a tiny wrapper that swallows presign errors — the UI has
// fallbacks for missing URLs and surfacing these to the user is worse than
// just dropping the link for this one tile.
func presignOrEmpty(ctx context.Context, presigner objectstore.GetURLPresigner, key string) string {
	if key == "" || presigner == nil {
		return ""
	}
	u, err := presigner.PresignedGetURL(ctx, key, 5*time.Minute)
	if err != nil {
		return ""
	}
	return u.String()
}

// presignPhotoIfMinIOKey returns a 5-minute presigned GET URL when photoRef is
// a MinIO object key uploaded via the device media-url flow (see
// docs/architecture/mqtt-protocol.md §15). Returns empty string for legacy
// `/photos/...` refs, empty input, or when no presigner is wired (LocalStore
// dev mode). On presign error, logs and returns empty so the frontend falls
// back to assetUrl(photo_ref) — the page should never break because of media.
func presignPhotoIfMinIOKey(ctx context.Context, presigner objectstore.GetURLPresigner, photoRef string) string {
	if photoRef == "" || presigner == nil {
		return ""
	}
	// Accept the two tenant-scoped MinIO prefixes we emit today:
	//   events/       — terminal / generic device media (MQTT §15 flow)
	//   cctv-faces/   — TungSon VIID face captures (internal/cctv/tungson_handlers.go)
	// Legacy "/photos/..." avatar refs still fall through to assetUrl() on the
	// client, so the page never blanks when a photo can't be presigned.
	if !strings.HasPrefix(photoRef, "events/") && !strings.HasPrefix(photoRef, "cctv-faces/") {
		return ""
	}
	u, err := presigner.PresignedGetURL(ctx, photoRef, 5*time.Minute)
	if err != nil {
		slog.Warn("access events: presign photo failed", "key", photoRef, "error", err)
		return ""
	}
	return u.String()
}

// cctvMediaDTO carries one camera's capture for this access event so the
// access-history UI can render all thumbnails inline (device-side + per-camera).
// playback_url is presigned against object_key (mp4 for media_type=clip,
// jpg for media_type=snapshot). thumbnail_url is the preview JPG — for clip
// rows that's a separate thumbnail_ref; for snapshot rows it falls back to
// the same object_key so the UI treats all tiles uniformly.
type cctvMediaDTO struct {
	ClipID       string `json:"clip_id"`
	CameraID     string `json:"camera_id"`
	CameraName   string `json:"camera_name,omitempty"`
	MediaType    string `json:"media_type"` // clip | snapshot
	Status       string `json:"status"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	PlaybackURL  string `json:"playback_url,omitempty"`
}

type eventResponse struct {
	ID             string         `json:"id"`
	EventID        string         `json:"event_id,omitempty"` // device-side NATS event UUID (links to CCTV junction)
	TenantID       string         `json:"tenant_id"`
	Time           time.Time      `json:"time"`
	AccessPointID  string         `json:"access_point_id,omitempty"`
	DeviceID       string         `json:"device_id,omitempty"`
	DeviceName     string         `json:"device_name,omitempty"`
	UserID         string         `json:"user_id,omitempty"`
	UserName       string         `json:"user_name,omitempty"`
	CredentialType string         `json:"credential_type,omitempty"`
	Direction      string         `json:"direction,omitempty"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason,omitempty"`
	Confidence     *float64       `json:"confidence,omitempty"`
	PhotoRef       string         `json:"photo_ref,omitempty"`
	CCTVMedia      []cctvMediaDTO `json:"cctv_media,omitempty"`
	// PhotoURL is a 5-minute presigned MinIO GET URL, populated when PhotoRef
	// looks like an object key (events/<tid>/<did>/...). For legacy /photos/
	// refs (identity-svc avatars) this stays empty and the frontend falls
	// back to assetUrl(photo_ref).
	PhotoURL string         `json:"photo_url,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// exportRow holds one row of export data.
type exportRow struct {
	Time           string
	AccessPointID  string
	DeviceName     string
	UserName       string
	CredentialType string
	Direction      string
	Decision       string
	Reason         string
}

// exportColumns are the column headers used in both CSV and XLSX exports.
var exportColumns = []string{
	"Time", "Access Point ID", "Device Name", "User Name",
	"Credential Type", "Direction", "Decision", "Reason",
}

const exportRowCap = 50_000

// ExportEvents streams access event data as CSV or XLSX.
// Accepts the same filter params as ListEvents plus format=csv|xlsx (default csv).
// Returns 413 if the filtered result would exceed exportRowCap rows.
//
// @Summary      Export access events (history)
// @Description  Streams access event history for the caller's tenant as CSV or XLSX. Accepts the same filters as the list endpoint. Hard-capped at 50,000 rows per export.
// @Tags         Access
// @Produce      text/csv
// @Produce      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Param        format           query  string   false  "Output format (csv or xlsx, default csv)"
// @Param        access_point_id  query  string   false  "Filter by access point UUID"
// @Param        user_id          query  string   false  "Filter by user UUID"
// @Param        decision         query  string   false  "Filter by decision (granted, denied)"
// @Param        credential_type  query  string   false  "Filter by credential type"
// @Param        from             query  string   false  "ISO-8601 start timestamp"
// @Param        to               query  string   false  "ISO-8601 end timestamp"
// @Success      200  {file}    file            "CSV or XLSX file download"
// @Failure      400  {object}  map[string]any  "Bad request"
// @Failure      401  {object}  map[string]any  "Missing or invalid bearer token"
// @Failure      403  {object}  map[string]any  "Forbidden"
// @Failure      413  {object}  map[string]any  "Result exceeds 50,000 row export limit"
// @Failure      500  {object}  map[string]any  "Internal server error"
// @Security     BearerAuth
// @Router       /access/events/export [get]
func (h *AccessHandlers) ExportEvents(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "xlsx" {
		httputil.Error(w, http.StatusBadRequest, "format must be csv or xlsx")
		return
	}

	// Build WHERE clause — identical pattern to ListEvents.
	where := "WHERE e.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if v := r.URL.Query().Get("access_point_id"); v != "" {
		where += fmt.Sprintf(" AND e.access_point_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("user_id"); v != "" {
		where += fmt.Sprintf(" AND e.user_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("decision"); v != "" {
		where += fmt.Sprintf(" AND e.decision = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("credential_type"); v != "" {
		where += fmt.Sprintf(" AND e.credential_type = $%d", idx)
		args = append(args, v)
		idx++
	}

	var fromTime, toTime time.Time
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			fromTime = t
			where += fmt.Sprintf(" AND e.time >= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			toTime = t
			where += fmt.Sprintf(" AND e.time <= $%d", idx)
			args = append(args, t)
			_ = idx // idx incremented but not used further
		}
	}

	// COUNT check before streaming.
	countQuery := "SELECT COUNT(*) FROM dm3_access.access_events e " + where
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	var total int64
	if err := h.db.Pool.QueryRow(r.Context(), countQuery, countArgs...).Scan(&total); err != nil {
		slog.Error("export count query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if total > exportRowCap {
		httputil.Error(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("export too large — narrow filters (%d rows, cap %d)", total, exportRowCap))
		return
	}

	// Derive filename dates.
	from := fromTime.Format("2006-01-02")
	to := toTime.Format("2006-01-02")
	if fromTime.IsZero() {
		from = "all"
	}
	if toTime.IsZero() {
		to = "now"
	}

	// Data query with LEFT LATERAL JOIN for device name (same pattern as ListEvents).
	dataQuery := fmt.Sprintf(`
		SELECT e.time,
		       COALESCE(e.access_point_id::text,''),
		       COALESCE(d.name,''),
		       COALESCE(e.user_name,''),
		       COALESCE(e.credential_type,''),
		       COALESCE(e.direction,''),
		       e.decision,
		       COALESCE(e.reason,'')
		FROM dm3_access.access_events e
		LEFT JOIN LATERAL (
		    SELECT ad.name
		    FROM dm3_access.access_point_devices apd
		    JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id
		    WHERE apd.access_point_id = e.access_point_id
		      AND apd.tenant_id = e.tenant_id
		    ORDER BY apd.created_at
		    LIMIT 1
		) d ON true
		%s ORDER BY e.time DESC`, where)

	rows, err := h.db.Pool.Query(r.Context(), dataQuery, args...)
	if err != nil {
		slog.Error("export data query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	switch format {
	case "csv":
		h.streamCSV(w, r, rows, from, to)
	case "xlsx":
		h.streamXLSX(w, r, rows, from, to)
	}
}

// streamCSV writes access event rows directly to the response as CSV.
func (h *AccessHandlers) streamCSV(w http.ResponseWriter, r *http.Request, rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}, from, to string) {
	filename := fmt.Sprintf("access-history-%s-%s.csv", from, to)
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	cw := csv.NewWriter(w)
	if err := cw.Write(exportColumns); err != nil {
		slog.Error("export csv header write error", "error", err)
		return
	}

	for rows.Next() {
		var (
			evtTime        time.Time
			accessPointID  string
			deviceName     string
			userName       string
			credentialType string
			direction      string
			decision       string
			reason         string
		)
		if err := rows.Scan(&evtTime, &accessPointID, &deviceName, &userName,
			&credentialType, &direction, &decision, &reason); err != nil {
			slog.Error("export csv scan error", "error", err)
			return
		}
		record := []string{
			evtTime.Format(time.RFC3339),
			accessPointID,
			deviceName,
			userName,
			credentialType,
			direction,
			decision,
			reason,
		}
		if err := cw.Write(record); err != nil {
			slog.Error("export csv row write error", "error", err)
			return
		}
	}
	if err := rows.Err(); err != nil {
		slog.Error("export csv rows iteration error", "error", err)
		return
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		slog.Error("export csv flush error", "error", err)
	}
}

// streamXLSX builds the XLSX in a bytes.Buffer (excelize needs random-access for finalization)
// then copies the result to the response.
func (h *AccessHandlers) streamXLSX(w http.ResponseWriter, r *http.Request, rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}, from, to string) {
	filename := fmt.Sprintf("access-history-%s-%s.xlsx", from, to)

	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	sheet := "Access History"
	idx, err := f.NewSheet(sheet)
	if err != nil {
		slog.Error("export xlsx new sheet error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	f.SetActiveSheet(idx)
	_ = f.DeleteSheet("Sheet1")

	sw, err := f.NewStreamWriter(sheet)
	if err != nil {
		slog.Error("export xlsx stream writer error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Write header row.
	headerCells := make([]interface{}, len(exportColumns))
	for i, col := range exportColumns {
		headerCells[i] = col
	}
	if err := sw.SetRow("A1", headerCells); err != nil {
		slog.Error("export xlsx header write error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	rowNum := 2
	for rows.Next() {
		var (
			evtTime        time.Time
			accessPointID  string
			deviceName     string
			userName       string
			credentialType string
			direction      string
			decision       string
			reason         string
		)
		if err := rows.Scan(&evtTime, &accessPointID, &deviceName, &userName,
			&credentialType, &direction, &decision, &reason); err != nil {
			slog.Error("export xlsx scan error", "error", err)
			return
		}
		cell := fmt.Sprintf("A%d", rowNum)
		rowCells := []interface{}{
			evtTime.Format(time.RFC3339),
			accessPointID,
			deviceName,
			userName,
			credentialType,
			direction,
			decision,
			reason,
		}
		if err := sw.SetRow(cell, rowCells); err != nil {
			slog.Error("export xlsx row write error", "error", err)
			return
		}
		rowNum++
	}
	if err := rows.Err(); err != nil {
		slog.Error("export xlsx rows iteration error", "error", err)
		return
	}

	if err := sw.Flush(); err != nil {
		slog.Error("export xlsx stream flush error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var buf bytes.Buffer
	if _, err := f.WriteTo(&buf); err != nil {
		slog.Error("export xlsx write buffer error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", strconv.Itoa(buf.Len()))
	if _, err := buf.WriteTo(w); err != nil {
		slog.Error("export xlsx response write error", "error", err)
	}
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

func (h *AccessHandlers) GetStats(w http.ResponseWriter, r *http.Request) {
	var stats models.DashboardStats
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	// Door counts reflect real-time status from dm3_devices.devices (the gateway
	// updates that table, not dm3_access.access_devices). Join by access_devices.device_id.
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_devices WHERE tenant_id = $1::uuid`, cid).Scan(&stats.AccessDevicesTotal)
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		  FROM dm3_access.access_devices ad
		  JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		 WHERE ad.tenant_id = $1::uuid AND d.status = 'online'`, cid).Scan(&stats.AccessDevicesOnline)
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		  FROM dm3_access.access_devices ad
		  LEFT JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		 WHERE ad.tenant_id = $1::uuid AND (d.status = 'offline' OR d.status IS NULL)`, cid).Scan(&stats.AccessDevicesOffline)
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		  FROM dm3_access.access_devices ad
		  JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		 WHERE ad.tenant_id = $1::uuid AND d.status = 'warning'`, cid).Scan(&stats.AccessDevicesWarning)

	now := time.Now()
	today := now.Truncate(24 * time.Hour)
	hourAgo := now.Add(-1 * time.Hour)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND tenant_id = $2::uuid`, today, cid).Scan(&stats.EventsToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='granted' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.GrantedToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='denied' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.DeniedToday)

	// On-site count: today's ingress minus egress, granted only.
	// Accept both 'in'/'out' and 'entry'/'exit' — devices and simulators emit different vocabularies.
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE direction IN ('in', 'entry'))
			- COUNT(*) FILTER (WHERE direction IN ('out', 'exit'))
		FROM dm3_access.access_events
		WHERE time >= $1 AND decision = 'granted' AND tenant_id = $2::uuid`,
		today, cid).Scan(&stats.OnSiteCount)
	if stats.OnSiteCount < 0 {
		stats.OnSiteCount = 0
	}

	// Activity in the last hour.
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='granted' AND tenant_id = $2::uuid`, hourAgo, cid).Scan(&stats.EntriesLastHour)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='denied' AND tenant_id = $2::uuid`, hourAgo, cid).Scan(&stats.DeniesLastHour)

	// Hourly buckets for today (0..current hour).
	stats.Hourly = make([]models.HourlyBucket, 24)
	for i := 0; i < 24; i++ {
		stats.Hourly[i] = models.HourlyBucket{Hour: i}
	}
	hourlyRows, err := h.db.Pool.Query(r.Context(), `
		SELECT EXTRACT(HOUR FROM time)::int AS h,
			COUNT(*) FILTER (WHERE decision='granted') AS g,
			COUNT(*) FILTER (WHERE decision='denied') AS d
		FROM dm3_access.access_events
		WHERE time >= $1 AND tenant_id = $2::uuid
		GROUP BY h ORDER BY h`, today, cid)
	if err == nil {
		defer hourlyRows.Close()
		for hourlyRows.Next() {
			var h, g, d int
			if err := hourlyRows.Scan(&h, &g, &d); err == nil && h >= 0 && h < 24 {
				stats.Hourly[h].Granted = g
				stats.Hourly[h].Denied = d
				total := g + d
				if total > stats.PeakHourCount {
					stats.PeakHourCount = total
					stats.PeakHourLabel = fmt.Sprintf("%02d:00", h)
				}
			}
		}
	}

	recentQuery := `SELECT id, tenant_id, time, access_point_id, user_id, user_name, credential_type,
		 direction, decision, reason, metadata
		 FROM dm3_access.access_events WHERE tenant_id = $1::uuid ORDER BY time DESC LIMIT 10`
	rows, err := h.db.Pool.Query(r.Context(), recentQuery, cid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var e models.AccessEvent
			if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &e.AccessPointID, &e.UserID,
				&e.UserName, &e.CredentialType, &e.Direction, &e.Decision, &e.Reason, &e.Metadata); err == nil {
				stats.RecentEvents = append(stats.RecentEvents, e)
			}
		}
	}
	if stats.RecentEvents == nil {
		stats.RecentEvents = []models.AccessEvent{}
	}

	httputil.JSON(w, http.StatusOK, stats)
}

// ─── Sync Package ────────────────────────────────────────────────────────────

func (h *AccessHandlers) GetSyncPackage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var accessDeviceID string
	var rulesVersion int
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, rules_version FROM dm3_access.access_devices WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(&accessDeviceID, &rulesVersion)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access device not found")
		return
	}

	pkg := models.SyncPackage{
		AccessDeviceID: accessDeviceID,
		Rules:          []models.AccessRule{},
		RulesVersion:   rulesVersion,
	}
	httputil.JSON(w, http.StatusOK, pkg)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *AccessHandlers) scanAccessDevice(r *http.Request, id string) (models.AccessDevice, error) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		return models.AccessDevice{}, fmt.Errorf("company context required")
	}
	var d models.AccessDevice
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, device_id, name, type,
		 status, state, mode, unlock_duration_ms, anti_passback, emergency_unlock,
		 firmware_version, ip_address, last_event_at, last_heartbeat_at,
		 config_version, user_db_version, rules_version, source, source_ref, metadata, created_at, updated_at
		 FROM dm3_access.access_devices WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Source, &d.SourceRef, &d.Metadata,
		&d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return d, fmt.Errorf("not found")
		}
		return d, err
	}
	return d, nil
}

// parseSorting extracts sort_by / sort_order query params and maps them to
// safe SQL column expressions. allowed maps frontend key → SQL expression.
// Returns the SQL column expression and "ASC" or "DESC".
func parseSorting(r *http.Request, allowed map[string]string, defaultCol string) (col, dir string) {
	sortOrder := strings.ToUpper(r.URL.Query().Get("sort_order"))
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}
	if mapped, ok := allowed[r.URL.Query().Get("sort_by")]; ok {
		return mapped, sortOrder
	}
	return defaultCol, sortOrder
}

func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return page, limit
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
