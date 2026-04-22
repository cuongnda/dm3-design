package cctv

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// validRecordingModes enumerates accepted values for the recording_mode field.
var validRecordingModes = map[string]struct{}{
	"event_only": {},
	"disabled":   {},
}

// isValidRecordingMode reports whether s is an accepted recording mode.
func isValidRecordingMode(s string) bool {
	_, ok := validRecordingModes[s]
	return ok
}

// validateRollSec bounds-checks pre/post-roll seconds.
func validateRollSec(pre, post int) error {
	if pre < 0 || pre > 60 {
		return fmt.Errorf("pre_roll_sec must be between 0 and 60")
	}
	if post < 0 || post > 120 {
		return fmt.Errorf("post_roll_sec must be between 0 and 120")
	}
	return nil
}

// redactRTSPCredentials strips userinfo from an RTSP URL so it's safe to log.
// On parse failure the raw input is returned unchanged (callers should not crash).
func redactRTSPCredentials(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	u.User = nil
	return u.String()
}

// validCameraStatuses bounds the ?status= query filter.
var validCameraStatuses = map[string]struct{}{
	"online":  {},
	"offline": {},
	"error":   {},
}

// ListCameras handles GET /cameras
// Supports: ?access_point_id=, ?status=, ?page=, ?limit=
func (h *CCTVHandlers) ListCameras(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	page, limit, err := parsePagination(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	offset := (page - 1) * limit

	accessPointID := r.URL.Query().Get("access_point_id")
	status := r.URL.Query().Get("status")

	// Build query with optional filters
	args := []any{cid}
	conditions := []string{"d.tenant_id = $1::uuid"}
	argIdx := 2

	if status != "" {
		if _, ok := validCameraStatuses[status]; !ok {
			httputil.Error(w, http.StatusBadRequest, "invalid status; expected one of: online, offline, error")
			return
		}
		conditions = append(conditions, fmt.Sprintf("d.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}

	// Always LEFT JOIN the access_devices + access_point_devices junction so we
	// can surface access_point_id in the response. Filter with a subquery-style
	// EXISTS predicate when an access_point_id filter is requested, so the main
	// join does not collapse rows.
	bindingJoin := `
		LEFT JOIN dm3_access.access_devices ad
		       ON ad.device_id = d.id AND ad.tenant_id = d.tenant_id
		LEFT JOIN dm3_access.access_point_devices apd
		       ON apd.access_device_id = ad.id::text AND apd.tenant_id = ad.tenant_id`

	if accessPointID != "" {
		conditions = append(conditions, fmt.Sprintf("apd.access_point_id = $%d::uuid", argIdx))
		args = append(args, accessPointID)
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT d.id)
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		%s %s`, bindingJoin, where)

	var total int64
	if err := h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		logInternalError(w, "list cameras count error", err)
		return
	}

	listArgs := append(args, limit, offset)
	listQuery := fmt.Sprintf(`
		SELECT d.id, d.device_id, d.tenant_id, d.name, d.status, d.last_seen,
		       apd.access_point_id::text,
		       c.brand, d.model, c.rtsp_url, c.rtsp_username,
		       c.recording_mode, c.pre_roll_sec, c.post_roll_sec,
		       c.stream_profile, c.last_checked_at, d.created_at, d.updated_at
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		%s %s
		ORDER BY d.created_at DESC
		LIMIT $%d OFFSET $%d`, bindingJoin, where, argIdx, argIdx+1)

	rows, err := h.db.Pool.Query(r.Context(), listQuery, listArgs...)
	if err != nil {
		logInternalError(w, "list cameras query error", err)
		return
	}
	defer rows.Close()

	cameras := make([]Camera, 0)
	for rows.Next() {
		cam, err := scanCamera(rows)
		if err != nil {
			logInternalError(w, "list cameras scan error", err)
			return
		}
		cameras = append(cameras, cam)
	}

	httputil.Paginated(w, cameras, total, page, limit)
}

// GetCamera handles GET /cameras/{id}
func (h *CCTVHandlers) GetCamera(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	cam, err := h.fetchCamera(r, cid, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "camera not found")
			return
		}
		logInternalError(w, "get camera error", err)
		return
	}
	httputil.JSON(w, http.StatusOK, cam)
}

// CreateCamera handles POST /cameras
func (h *CCTVHandlers) CreateCamera(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	var req CameraInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	recordingMode := "event_only"
	if req.RecordingMode != nil && *req.RecordingMode != "" {
		recordingMode = *req.RecordingMode
	}
	if !isValidRecordingMode(recordingMode) {
		httputil.Error(w, http.StatusBadRequest, "invalid recording_mode; expected one of: event_only, disabled")
		return
	}
	preRoll := 10
	if req.PreRollSec != nil {
		preRoll = *req.PreRollSec
	}
	postRoll := 20
	if req.PostRollSec != nil {
		postRoll = *req.PostRollSec
	}
	if err := validateRollSec(preRoll, postRoll); err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	trimmedURL := strings.TrimSpace(req.RTSPUrl)

	// Encrypt password if provided
	var encryptedPass []byte
	if req.RTSPPassword != nil && *req.RTSPPassword != "" {
		var err error
		encryptedPass, err = h.cipher.Encrypt(*req.RTSPPassword)
		if err != nil {
			logInternalError(w, "encrypt rtsp password error", err)
			return
		}
	}

	// Generate device_id short code: "CAM" + first 6 chars of a random UUID segment
	// We'll use the DB gen_random_uuid() and slice it in Go after insert
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		logInternalError(w, "begin transaction error", err)
		return
	}
	defer tx.Rollback(r.Context())

	// Insert into dm3_devices.devices
	var deviceUUID string
	modelVal := req.Model
	if modelVal == nil {
		s := "camera_dc"
		modelVal = &s
	}
	err = tx.QueryRow(r.Context(), `
		INSERT INTO dm3_devices.devices (tenant_id, device_id, name, type, model, status)
		VALUES ($1::uuid, 'CAM' || upper(substring(gen_random_uuid()::text, 1, 6)), $2, 'camera', $3, 'offline')
		RETURNING id::text`,
		cid, strings.TrimSpace(req.Name), modelVal,
	).Scan(&deviceUUID)
	if err != nil {
		logInternalError(w, "insert device error", err)
		return
	}

	// Insert into dm3_cctv.cameras
	streamProfileJSON := []byte("null")
	if req.StreamProfile != nil {
		streamProfileJSON, _ = req.StreamProfile.MarshalJSON()
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO dm3_cctv.cameras
		(device_id, tenant_id, brand, rtsp_url, rtsp_username, rtsp_password_enc, recording_mode, pre_roll_sec, post_roll_sec, stream_profile)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
		deviceUUID, cid, req.Brand, trimmedURL, req.RTSPUsername, encryptedPass,
		recordingMode, preRoll, postRoll, streamProfileJSON,
	)
	if err != nil {
		logInternalError(w, "insert cctv camera error", err)
		return
	}

	// Optional binding to an access point (via dm3_access junction).
	if req.AccessPointID != nil && strings.TrimSpace(*req.AccessPointID) != "" {
		if err := bindCameraToAccessPoint(r.Context(), tx, cid, deviceUUID, strings.TrimSpace(req.Name), strings.TrimSpace(*req.AccessPointID)); err != nil {
			httputil.Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		logInternalError(w, "commit transaction error", err)
		return
	}

	// Register path in MediaMTX (best-effort — don't fail camera creation on MediaMTX error).
	// The camera row is the source of truth; MediaMTX drift should be healed by
	// a periodic reconciliation worker.
	// TODO(cctv): add a reconciler that compares dm3_cctv.cameras against
	// MediaMTX-configured paths and repairs drift on a timer.
	var decryptedPass string
	if encryptedPass != nil {
		decryptedPass, _ = h.cipher.Decrypt(encryptedPass)
	}
	rtspUsername := ""
	if req.RTSPUsername != nil {
		rtspUsername = *req.RTSPUsername
	}
	sourceURL := composeRTSPURLWithAuth(trimmedURL, rtspUsername, decryptedPass)
	cfg := applyRecordDefaults(PathConfig{Source: sourceURL, SourceOnDemand: false}, pathRecordDefaults(r.Context(), h.db, cid))
	if err := h.mediamtx.UpsertPath(r.Context(), deviceUUID, cfg); err != nil {
		slog.Warn("cctv: mediamtx upsert path failed (non-fatal)", "device_id", deviceUUID, "error", err)
	}

	// Fetch the created camera for response
	cam, err := h.fetchCamera(r, cid, deviceUUID)
	if err != nil {
		logInternalError(w, "fetch created camera error", err)
		return
	}

	h.audit.LogFromRequest(r, "cctv.camera.create", "camera", cam.ID, cam.Name, "success", nil, map[string]any{
		"device_id":      cam.DeviceID,
		"rtsp_url":       redactRTSPCredentials(cam.RTSPUrl),
		"recording_mode": cam.RecordingMode,
	})
	httputil.JSON(w, http.StatusCreated, cam)
}

// bindCameraToAccessPoint ensures an access_devices wrapper row exists for the
// camera device and that it is linked to the given access point via
// access_point_devices. Idempotent — safe to call on repeated writes.
func bindCameraToAccessPoint(ctx context.Context, tx pgx.Tx, tenantID, deviceUUID, cameraName, accessPointID string) error {
	// Verify the access point belongs to the same tenant.
	var apExists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_points
		               WHERE id = $1::uuid AND tenant_id = $2::uuid)`,
		accessPointID, tenantID,
	).Scan(&apExists); err != nil {
		return fmt.Errorf("verify access_point tenant: %w", err)
	}
	if !apExists {
		return fmt.Errorf("access_point not found for tenant")
	}

	// Resolve the access_devices wrapper (one per device). Reuse any existing
	// row for this device; otherwise create a new 'camera'-typed row.
	// access_devices has no unique constraint on device_id, so we do an explicit
	// SELECT-then-INSERT.
	var accessDeviceID string
	err := tx.QueryRow(ctx, `
		SELECT id::text FROM dm3_access.access_devices
		WHERE device_id = $1::uuid AND tenant_id = $2::uuid
		LIMIT 1`,
		deviceUUID, tenantID,
	).Scan(&accessDeviceID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("lookup access_device: %w", err)
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO dm3_access.access_devices (tenant_id, device_id, name, type, status, state, mode)
			VALUES ($1::uuid, $2::uuid, $3, 'camera', 'offline', 'locked', 'normal')
			RETURNING id::text`,
			tenantID, deviceUUID, cameraName,
		).Scan(&accessDeviceID); err != nil {
			return fmt.Errorf("insert access_device: %w", err)
		}
	}

	// Remove any prior binding for this access_device (one camera binds to at
	// most one access point in the current UI model).
	if _, err := tx.Exec(ctx, `
		DELETE FROM dm3_access.access_point_devices
		WHERE access_device_id = $1 AND tenant_id = $2::uuid`,
		accessDeviceID, tenantID,
	); err != nil {
		return fmt.Errorf("clear prior access_point binding: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO dm3_access.access_point_devices (tenant_id, access_point_id, access_device_id, role)
		VALUES ($1::uuid, $2::uuid, $3, 'camera')`,
		tenantID, accessPointID, accessDeviceID,
	); err != nil {
		return fmt.Errorf("insert access_point_device: %w", err)
	}
	return nil
}

// unbindCameraFromAccessPoint removes any access_point_devices row referencing
// the camera's access_devices wrapper. Leaves the access_devices row itself in
// place (it is owned by the camera lifecycle and cleaned up on device delete).
func unbindCameraFromAccessPoint(ctx context.Context, tx pgx.Tx, tenantID, deviceUUID string) error {
	_, err := tx.Exec(ctx, `
		DELETE FROM dm3_access.access_point_devices apd
		USING dm3_access.access_devices ad
		WHERE apd.access_device_id = ad.id::text
		  AND apd.tenant_id = ad.tenant_id
		  AND ad.device_id = $1::uuid
		  AND ad.tenant_id = $2::uuid`,
		deviceUUID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("remove access_point binding: %w", err)
	}
	return nil
}

// decryptExistingPassword reads the encrypted rtsp_password_enc column for a
// camera and returns the decrypted plaintext. Returns empty string (nil error)
// when the column is NULL.
func (h *CCTVHandlers) decryptExistingPassword(ctx context.Context, tx pgx.Tx, tenantID, cameraID string) (string, error) {
	var encPass []byte
	err := tx.QueryRow(ctx, `
		SELECT rtsp_password_enc FROM dm3_cctv.cameras
		WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		cameraID, tenantID,
	).Scan(&encPass)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if len(encPass) == 0 {
		return "", nil
	}
	return h.cipher.Decrypt(encPass)
}

// UpdateCamera handles PUT /cameras/{id}
func (h *CCTVHandlers) UpdateCamera(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Fetch existing camera to detect RTSP changes
	existing, err := h.fetchCamera(r, cid, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "camera not found")
			return
		}
		logInternalError(w, "get camera error", err)
		return
	}

	var req CameraInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Apply updates with fallback to existing values
	name := existing.Name
	if strings.TrimSpace(req.Name) != "" {
		name = strings.TrimSpace(req.Name)
	}
	rtspURL := existing.RTSPUrl
	if strings.TrimSpace(req.RTSPUrl) != "" {
		rtspURL = strings.TrimSpace(req.RTSPUrl)
	}
	brand := existing.Brand
	if req.Brand != nil {
		brand = req.Brand
	}
	recordingMode := existing.RecordingMode
	if req.RecordingMode != nil && *req.RecordingMode != "" {
		if !isValidRecordingMode(*req.RecordingMode) {
			httputil.Error(w, http.StatusBadRequest, "invalid recording_mode; expected one of: event_only, disabled")
			return
		}
		recordingMode = *req.RecordingMode
	}
	preRoll := existing.PreRollSec
	if req.PreRollSec != nil {
		preRoll = *req.PreRollSec
	}
	postRoll := existing.PostRollSec
	if req.PostRollSec != nil {
		postRoll = *req.PostRollSec
	}
	if req.PreRollSec != nil || req.PostRollSec != nil {
		if err := validateRollSec(preRoll, postRoll); err != nil {
			httputil.Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	rtspUsername := existing.RTSPUsername
	if req.RTSPUsername != nil {
		rtspUsername = req.RTSPUsername
	}

	// Re-encrypt password if a new one is provided
	var encryptedPass []byte
	var decryptedPass string
	passwordSupplied := req.RTSPPassword != nil && *req.RTSPPassword != ""
	if passwordSupplied {
		encryptedPass, err = h.cipher.Encrypt(*req.RTSPPassword)
		if err != nil {
			logInternalError(w, "encrypt rtsp password error", err)
			return
		}
		decryptedPass = *req.RTSPPassword
	}

	// Wrap device + camera updates in a single transaction for atomicity.
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		logInternalError(w, "begin transaction error", err)
		return
	}
	defer tx.Rollback(r.Context())

	// If no new password supplied, read and decrypt the existing one so that
	// the MediaMTX source URL (composed below) preserves the stored credential.
	// If decryption fails (typically because CCTV_CREDENTIAL_KEY has been
	// rotated since the camera was saved), surface a 400 asking the user to
	// re-enter the password instead of a generic 500.
	if !passwordSupplied {
		existingPass, err := h.decryptExistingPassword(r.Context(), tx, cid, id)
		if err != nil {
			if strings.Contains(err.Error(), "message authentication failed") {
				slog.Warn("cctv: existing password undecryptable; credential key likely rotated",
					"camera_id", id, "tenant_id", cid)
				httputil.Error(w, http.StatusBadRequest,
					"stored RTSP password cannot be decrypted (credential key rotated); please re-enter the password")
				return
			}
			logInternalError(w, "decrypt existing rtsp password error", err)
			return
		}
		decryptedPass = existingPass
	}

	// Update devices.name
	_, err = tx.Exec(r.Context(), `
		UPDATE dm3_devices.devices SET name = $3, updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid, name,
	)
	if err != nil {
		logInternalError(w, "update device error", err)
		return
	}

	// Update cctv.cameras
	if encryptedPass != nil {
		_, err = tx.Exec(r.Context(), `
			UPDATE dm3_cctv.cameras
			SET brand = $3, rtsp_url = $4, rtsp_username = $5, rtsp_password_enc = $6,
			    recording_mode = $7, pre_roll_sec = $8, post_roll_sec = $9, updated_at = now()
			WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
			id, cid, brand, rtspURL, rtspUsername, encryptedPass, recordingMode, preRoll, postRoll,
		)
	} else {
		_, err = tx.Exec(r.Context(), `
			UPDATE dm3_cctv.cameras
			SET brand = $3, rtsp_url = $4, rtsp_username = $5,
			    recording_mode = $6, pre_roll_sec = $7, post_roll_sec = $8, updated_at = now()
			WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
			id, cid, brand, rtspURL, rtspUsername, recordingMode, preRoll, postRoll,
		)
	}
	if err != nil {
		logInternalError(w, "update camera error", err)
		return
	}

	// Handle access_point binding changes. Interpretation:
	//   - field omitted from payload → leave binding untouched
	//   - empty string              → clear binding
	//   - non-empty value           → (re)bind to that access point
	if req.AccessPointID != nil {
		trimmedAP := strings.TrimSpace(*req.AccessPointID)
		if trimmedAP == "" {
			if err := unbindCameraFromAccessPoint(r.Context(), tx, cid, id); err != nil {
				logInternalError(w, "unbind access_point error", err)
				return
			}
		} else {
			if err := bindCameraToAccessPoint(r.Context(), tx, cid, id, name, trimmedAP); err != nil {
				httputil.Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		logInternalError(w, "commit transaction error", err)
		return
	}

	// Update MediaMTX path if RTSP details changed (best-effort — post-commit)
	rtspUsernameStr := ""
	if rtspUsername != nil {
		rtspUsernameStr = *rtspUsername
	}
	sourceURL := composeRTSPURLWithAuth(rtspURL, rtspUsernameStr, decryptedPass)
	cfg := applyRecordDefaults(PathConfig{Source: sourceURL, SourceOnDemand: false}, pathRecordDefaults(r.Context(), h.db, cid))
	if err := h.mediamtx.UpsertPath(r.Context(), id, cfg); err != nil {
		slog.Warn("cctv: mediamtx upsert path failed (non-fatal)", "device_id", id, "error", err)
	}

	cam, err := h.fetchCamera(r, cid, id)
	if err != nil {
		logInternalError(w, "fetch updated camera error", err)
		return
	}

	h.audit.LogFromRequest(r, "cctv.camera.update", "camera", cam.ID, cam.Name, "success", existing, map[string]any{
		"device_id":      cam.DeviceID,
		"rtsp_url":       redactRTSPCredentials(cam.RTSPUrl),
		"recording_mode": cam.RecordingMode,
	})
	httputil.JSON(w, http.StatusOK, cam)
}

// DeleteCameraPreview handles GET /cameras/{id}/delete-preview
// Returns a summary of what will be deleted if the camera is removed.
func (h *CCTVHandlers) DeleteCameraPreview(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	var name string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT name FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera'`,
		id, cid).Scan(&name)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	var clipCount, syncCount, accessPointCount int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_cctv.event_clips WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid).Scan(&clipCount)
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_cctv.camera_face_sync_queue WHERE camera_device_id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid).Scan(&syncCount)
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_access.access_point_devices apd
		 JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id
		 WHERE ad.device_id = $1::uuid AND ad.tenant_id = $2::uuid`,
		id, cid).Scan(&accessPointCount)

	httputil.JSON(w, http.StatusOK, map[string]any{
		"camera_name":        name,
		"event_clips":        clipCount,
		"sync_queue_entries":  syncCount,
		"access_point_links": accessPointCount,
	})
}

// DeleteCamera handles DELETE /cameras/{id}
func (h *CCTVHandlers) DeleteCamera(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Fetch for audit name before deletion — best-effort lookup.
	var name string
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT name FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid).Scan(&name); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("cctv: pre-delete name lookup failed (non-fatal)", "device_id", id, "error", err)
	}

	// Verify camera exists
	var deviceExists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		id, cid).Scan(&deviceExists)
	if !deviceExists {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	// Delete related rows first (FK constraints prevent direct device deletion)
	_, _ = h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_cctv.event_clips WHERE device_id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	_, _ = h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_cctv.camera_face_sync_queue WHERE camera_device_id = $1::uuid AND tenant_id = $2::uuid`, id, cid)

	// Unbind from access points and delete access_devices
	_, _ = h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_point_devices apd
		 USING dm3_access.access_devices ad
		 WHERE apd.access_device_id = ad.id::text AND apd.tenant_id = ad.tenant_id
		   AND ad.device_id = $1::uuid AND ad.tenant_id = $2::uuid`, id, cid)
	_, _ = h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_access.access_devices WHERE device_id = $1::uuid AND tenant_id = $2::uuid`, id, cid)

	// Delete cameras row then device row
	_, _ = h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_cctv.cameras WHERE device_id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera'`,
		id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		logInternalError(w, "delete camera failed", err)
		return
	}

	// Remove from MediaMTX (best-effort)
	if err := h.mediamtx.DeletePath(r.Context(), id); err != nil {
		slog.Warn("cctv: mediamtx delete path failed (non-fatal)", "device_id", id, "error", err)
	}

	h.audit.LogFromRequest(r, "cctv.camera.delete", "camera", id, name, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// TestCameraConnection handles POST /cameras/{id}/test-connection.
// It performs a real RTSP DESCRIBE probe over TCP to verify connectivity and
// credentials, then stores the result in dm3_cctv.cameras.stream_profile.
//
// Response: {ok, latency_ms, codec, resolution, error?}
// Always returns HTTP 200; error details are in the response body.
func (h *CCTVHandlers) TestCameraConnection(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Fetch camera — need the RTSP URL + credentials for the probe.
	cam, err := h.fetchCamera(r, cid, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "camera not found")
			return
		}
		logInternalError(w, "get camera error", err)
		return
	}

	// Decrypt RTSP password if set.
	var rtspPassword string
	var encPass []byte
	if scanErr := h.db.Pool.QueryRow(r.Context(), `
		SELECT rtsp_password_enc FROM dm3_cctv.cameras
		WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid).Scan(&encPass); scanErr == nil && len(encPass) > 0 {
		rtspPassword, _ = h.cipher.Decrypt(encPass)
	}

	rtspUsername := ""
	if cam.RTSPUsername != nil {
		rtspUsername = *cam.RTSPUsername
	}

	result := probeRTSP(r, cam.RTSPUrl, rtspUsername, rtspPassword)

	// Persist last_checked_at and stream_profile regardless of probe outcome.
	profileJSON := fmt.Sprintf(`{"codec":%q,"resolution":%q,"probed_at":%q}`,
		result.Codec, result.Resolution, time.Now().UTC().Format(time.RFC3339))
	_, dbErr := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_cctv.cameras
		SET last_checked_at = now(),
		    stream_profile   = $3::jsonb
		WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid, profileJSON)
	if dbErr != nil {
		slog.Warn("cctv: update stream_profile failed", "device_id", id, "error", dbErr)
	}

	resp := map[string]any{
		"ok":         result.OK,
		"latency_ms": result.LatencyMs,
		"codec":      result.Codec,
		"resolution": result.Resolution,
	}
	if result.Err != "" {
		resp["error"] = result.Err
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// fetchCamera retrieves a single camera by device UUID, scoped to tenant.
func (h *CCTVHandlers) fetchCamera(r *http.Request, tenantID, deviceID string) (Camera, error) {
	row := h.db.Pool.QueryRow(r.Context(), `
		SELECT d.id, d.device_id, d.tenant_id, d.name, d.status, d.last_seen,
		       apd.access_point_id::text,
		       c.brand, d.model, c.rtsp_url, c.rtsp_username,
		       c.recording_mode, c.pre_roll_sec, c.post_roll_sec,
		       c.stream_profile, c.last_checked_at, d.created_at, d.updated_at
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		LEFT JOIN dm3_access.access_devices ad
		       ON ad.device_id = d.id AND ad.tenant_id = d.tenant_id
		LEFT JOIN dm3_access.access_point_devices apd
		       ON apd.access_device_id = ad.id::text AND apd.tenant_id = ad.tenant_id
		WHERE d.id = $1::uuid AND d.tenant_id = $2::uuid
		LIMIT 1`,
		deviceID, tenantID,
	)
	return scanCamera(row)
}

// scanCamera scans a camera row from either Query or QueryRow results.
type scannable interface {
	Scan(dest ...any) error
}

func scanCamera(row scannable) (Camera, error) {
	var cam Camera
	var streamProfileRaw []byte
	err := row.Scan(
		&cam.ID, &cam.DeviceID, &cam.TenantID, &cam.Name, &cam.Status, &cam.LastSeen,
		&cam.AccessPointID,
		&cam.Brand, &cam.Model, &cam.RTSPUrl, &cam.RTSPUsername,
		&cam.RecordingMode, &cam.PreRollSec, &cam.PostRollSec,
		&streamProfileRaw, &cam.LastCheckedAt, &cam.CreatedAt, &cam.UpdatedAt,
	)
	if err != nil {
		return Camera{}, err
	}
	if len(streamProfileRaw) > 0 && string(streamProfileRaw) != "null" {
		raw := json.RawMessage(streamProfileRaw)
		cam.StreamProfile = &raw
	}
	return cam, nil
}
