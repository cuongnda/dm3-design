package cctv

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ListCameras handles GET /cameras
// Supports: ?access_point_id=, ?status=, ?page=, ?limit=
func (h *CCTVHandlers) ListCameras(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	accessPointID := r.URL.Query().Get("access_point_id")
	status := r.URL.Query().Get("status")

	// Build query with optional filters
	args := []any{cid}
	conditions := []string{"d.tenant_id = $1::uuid"}
	argIdx := 2

	if status != "" {
		conditions = append(conditions, fmt.Sprintf("d.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}

	joinClause := ""
	if accessPointID != "" {
		joinClause = "JOIN dm3_access.access_devices ad ON ad.device_id = d.id AND ad.tenant_id = d.tenant_id"
		conditions = append(conditions, fmt.Sprintf("ad.id = $%d::uuid", argIdx))
		args = append(args, accessPointID)
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		%s %s`, joinClause, where)

	var total int64
	if err := h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		logInternalError(w, "list cameras count error", err)
		return
	}

	listArgs := append(args, limit, offset)
	listQuery := fmt.Sprintf(`
		SELECT d.id, d.device_id, d.tenant_id, d.name, d.status, d.last_seen,
		       c.brand, d.model, c.rtsp_url, c.rtsp_username,
		       c.recording_mode, c.pre_roll_sec, c.post_roll_sec,
		       c.stream_profile, c.last_checked_at, d.created_at, d.updated_at
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		%s %s
		ORDER BY d.created_at DESC
		LIMIT $%d OFFSET $%d`, joinClause, where, argIdx, argIdx+1)

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
		if err == pgx.ErrNoRows {
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
	if strings.TrimSpace(req.RTSPUrl) == "" {
		httputil.Error(w, http.StatusBadRequest, "rtsp_url is required")
		return
	}

	recordingMode := "continuous"
	if req.RecordingMode != nil && *req.RecordingMode != "" {
		recordingMode = *req.RecordingMode
	}
	preRoll := 10
	if req.PreRollSec != nil {
		preRoll = *req.PreRollSec
	}
	postRoll := 20
	if req.PostRollSec != nil {
		postRoll = *req.PostRollSec
	}

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
		VALUES ($1::uuid, 'CAM' || upper(substring(gen_random_uuid()::text, 1, 6)), $2, 'camera', $3, 'active')
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
		deviceUUID, cid, req.Brand, strings.TrimSpace(req.RTSPUrl), req.RTSPUsername, encryptedPass,
		recordingMode, preRoll, postRoll, streamProfileJSON,
	)
	if err != nil {
		logInternalError(w, "insert cctv camera error", err)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		logInternalError(w, "commit transaction error", err)
		return
	}

	// Register path in MediaMTX (best-effort — don't fail camera creation on MediaMTX error)
	var decryptedPass string
	if encryptedPass != nil {
		decryptedPass, _ = h.cipher.Decrypt(encryptedPass)
	}
	rtspUsername := ""
	if req.RTSPUsername != nil {
		rtspUsername = *req.RTSPUsername
	}
	sourceURL := composeRTSPURLWithAuth(strings.TrimSpace(req.RTSPUrl), rtspUsername, decryptedPass)
	if err := h.mediamtx.UpsertPath(r.Context(), deviceUUID, PathConfig{
		Source:         sourceURL,
		SourceOnDemand: true,
	}); err != nil {
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
		"rtsp_url":       cam.RTSPUrl,
		"recording_mode": cam.RecordingMode,
	})
	httputil.JSON(w, http.StatusCreated, cam)
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
		if err == pgx.ErrNoRows {
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
	rtspUsername := existing.RTSPUsername
	if req.RTSPUsername != nil {
		rtspUsername = req.RTSPUsername
	}

	// Re-encrypt password if a new one is provided
	var encryptedPass []byte
	var decryptedPass string
	if req.RTSPPassword != nil && *req.RTSPPassword != "" {
		encryptedPass, err = h.cipher.Encrypt(*req.RTSPPassword)
		if err != nil {
			logInternalError(w, "encrypt rtsp password error", err)
			return
		}
		decryptedPass = *req.RTSPPassword
	}

	// Update devices.name
	_, err = h.db.Pool.Exec(r.Context(), `
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
		_, err = h.db.Pool.Exec(r.Context(), `
			UPDATE dm3_cctv.cameras
			SET brand = $3, rtsp_url = $4, rtsp_username = $5, rtsp_password_enc = $6,
			    recording_mode = $7, pre_roll_sec = $8, post_roll_sec = $9, updated_at = now()
			WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
			id, cid, brand, rtspURL, rtspUsername, encryptedPass, recordingMode, preRoll, postRoll,
		)
	} else {
		_, err = h.db.Pool.Exec(r.Context(), `
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

	// Update MediaMTX path if RTSP details changed (best-effort)
	rtspUsernameStr := ""
	if rtspUsername != nil {
		rtspUsernameStr = *rtspUsername
	}
	sourceURL := composeRTSPURLWithAuth(rtspURL, rtspUsernameStr, decryptedPass)
	if err := h.mediamtx.UpsertPath(r.Context(), id, PathConfig{
		Source:         sourceURL,
		SourceOnDemand: true,
	}); err != nil {
		slog.Warn("cctv: mediamtx upsert path failed (non-fatal)", "device_id", id, "error", err)
	}

	cam, err := h.fetchCamera(r, cid, id)
	if err != nil {
		logInternalError(w, "fetch updated camera error", err)
		return
	}

	h.audit.LogFromRequest(r, "cctv.camera.update", "camera", cam.ID, cam.Name, "success", existing, map[string]any{
		"device_id":      cam.DeviceID,
		"rtsp_url":       cam.RTSPUrl,
		"recording_mode": cam.RecordingMode,
	})
	httputil.JSON(w, http.StatusOK, cam)
}

// DeleteCamera handles DELETE /cameras/{id}
func (h *CCTVHandlers) DeleteCamera(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Fetch for audit name before deletion
	var name string
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT name FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(&name)

	// Delete devices row (CASCADE will remove dm3_cctv.cameras row via FK)
	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera'`,
		id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	// Remove from MediaMTX (best-effort)
	if err := h.mediamtx.DeletePath(r.Context(), id); err != nil {
		slog.Warn("cctv: mediamtx delete path failed (non-fatal)", "device_id", id, "error", err)
	}

	h.audit.LogFromRequest(r, "cctv.camera.delete", "camera", id, name, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// TestCameraConnection handles POST /cameras/{id}/test-connection
// Phase 1: checks MediaMTX path status and returns reachability result.
func (h *CCTVHandlers) TestCameraConnection(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Verify camera belongs to tenant
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		id, cid).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	reachable, err := h.mediamtx.PathExists(r.Context(), id)
	if err != nil {
		slog.Warn("cctv: mediamtx path exists check failed", "device_id", id, "error", err)
		reachable = false
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"reachable":  reachable,
		"checked_at": time.Now().UTC(),
		// TODO(Phase 2): return real stream_profile from RTSP DESCRIBE
	})
}

// fetchCamera retrieves a single camera by device UUID, scoped to tenant.
func (h *CCTVHandlers) fetchCamera(r *http.Request, tenantID, deviceID string) (Camera, error) {
	row := h.db.Pool.QueryRow(r.Context(), `
		SELECT d.id, d.device_id, d.tenant_id, d.name, d.status, d.last_seen,
		       c.brand, d.model, c.rtsp_url, c.rtsp_username,
		       c.recording_mode, c.pre_roll_sec, c.post_roll_sec,
		       c.stream_profile, c.last_checked_at, d.created_at, d.updated_at
		FROM dm3_devices.devices d
		JOIN dm3_cctv.cameras c ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		WHERE d.id = $1::uuid AND d.tenant_id = $2::uuid`,
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
