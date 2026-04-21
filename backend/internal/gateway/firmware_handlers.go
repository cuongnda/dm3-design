package gateway

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	pathpkg "path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// ─── Device Types ───────────────────────────────────────────────────────────

var validDeviceTypes = []string{
	// Terminal
	"ra08", "ba8300", "df970", "dq200", "dq8500", "bd8500", "icu970",
	// Controller
	"icu300n", "ipopx", "itouch_pop_x", "icu400", "dqmini_plus",
	// Camera
	"camera_dc", "cctv",
	// Sensor
	"door_sensor", "de960", "de950",
}

func isValidDeviceType(dt string) bool {
	for _, v := range validDeviceTypes {
		if v == dt {
			return true
		}
	}
	return false
}

// ─── Firmware DTO ───────────────────────────────────────────────────────────

type FirmwareDTO struct {
	ID          string    `json:"id"`
	Version     string    `json:"version"`
	DeviceType  string    `json:"device_type"`
	Description *string   `json:"description"`
	FilePath    string    `json:"file_path"`
	FileSize    int64     `json:"file_size"`
	Checksum    *string   `json:"checksum"`
	IsActive    bool      `json:"is_active"`
	UploadedBy  *string   `json:"uploaded_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ─── Firmware Handlers ──────────────────────────────────────────────────────

type FirmwareHandlers struct {
	db          *db.DB
	objects     objectstore.Store
	mqtt        *mqtt.Client
	audit       *audit.Logger
	downloadURL string // base URL for firmware download (e.g. http://192.168.1.100:8002)
}

func NewFirmwareHandlers(database *db.DB, objects objectstore.Store, mqttClient *mqtt.Client, auditLog *audit.Logger, downloadBaseURL string) *FirmwareHandlers {
	return &FirmwareHandlers{db: database, objects: objects, mqtt: mqttClient, audit: auditLog, downloadURL: downloadBaseURL}
}

// ListFirmwares handles GET /api/v1/system/firmware
func (h *FirmwareHandlers) ListFirmwares(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	if q := r.URL.Query().Get("search"); q != "" {
		where += fmt.Sprintf(" AND (f.version ILIKE $%d OR f.device_type ILIKE $%d)", idx, idx)
		args = append(args, "%"+q+"%")
		idx++
	}

	if dt := r.URL.Query().Get("device_type"); dt != "" {
		where += fmt.Sprintf(" AND f.device_type = $%d", idx)
		args = append(args, dt)
		idx++
	}

	if v := r.URL.Query().Get("is_active"); v != "" {
		where += fmt.Sprintf(" AND f.is_active = $%d", idx)
		args = append(args, v == "true")
		idx++
	}

	// Count total
	var total int64
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_devices.firmwares f %s", where)
	_ = h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT f.id, f.version, f.device_type, f.description, f.file_path,
			   f.file_size, f.checksum, f.is_active,
			   COALESCE((SELECT a.email FROM dm3_auth.accounts a WHERE a.id = f.uploaded_by), f.uploaded_by::text),
			   f.created_at, f.updated_at
		FROM dm3_devices.firmwares f
		%s
		ORDER BY f.created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query firmwares", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	firmwares := []FirmwareDTO{}
	for rows.Next() {
		var fw FirmwareDTO
		err := rows.Scan(
			&fw.ID, &fw.Version, &fw.DeviceType, &fw.Description, &fw.FilePath,
			&fw.FileSize, &fw.Checksum, &fw.IsActive, &fw.UploadedBy,
			&fw.CreatedAt, &fw.UpdatedAt,
		)
		if err != nil {
			slog.Error("failed to scan firmware", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.scan_error")
			return
		}
		firmwares = append(firmwares, fw)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"firmwares": firmwares,
		"pagination": map[string]any{
			"page":  page,
			"limit": limit,
			"total": total,
		},
	})
}

// GetFirmware handles GET /api/v1/system/firmware/{id}
func (h *FirmwareHandlers) GetFirmware(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var fw FirmwareDTO
	query := `
		SELECT id, version, device_type, description, file_path,
			   file_size, checksum, is_active,
			   COALESCE((SELECT a.email FROM dm3_auth.accounts a WHERE a.id = uploaded_by), uploaded_by::text),
			   created_at, updated_at
		FROM dm3_devices.firmwares
		WHERE id = $1::uuid
	`
	err := h.db.Pool.QueryRow(r.Context(), query, id).Scan(
		&fw.ID, &fw.Version, &fw.DeviceType, &fw.Description, &fw.FilePath,
		&fw.FileSize, &fw.Checksum, &fw.IsActive, &fw.UploadedBy,
		&fw.CreatedAt, &fw.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("failed to get firmware", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	httputil.JSON(w, http.StatusOK, fw)
}

// UploadFirmware handles POST /api/v1/system/firmware
func (h *FirmwareHandlers) UploadFirmware(w http.ResponseWriter, r *http.Request) {
	// Max 100MB
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "firmware.file_too_large")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "firmware.file_required")
		return
	}
	defer file.Close()

	version := strings.TrimSpace(r.FormValue("version"))
	deviceType := strings.TrimSpace(r.FormValue("device_type"))
	description := r.FormValue("description")

	if version == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.version_required")
		return
	}
	if !isValidDeviceType(deviceType) {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "firmware.invalid_device_type")
		return
	}

	// Check file size (100MB limit)
	if header.Size > 100<<20 {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "firmware.file_too_large")
		return
	}

	if h.objects == nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}

	safeVersion := sanitizeFirmwarePathSegment(version)
	filename := fmt.Sprintf("%s_%s", safeVersion, pathpkg.Base(header.Filename))
	objectKey := buildFirmwareObjectKey(deviceType, filename)

	hasher := sha256.New()
	data, err := io.ReadAll(io.TeeReader(file, hasher))
	if err != nil {
		slog.Error("failed to read firmware file", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}
	written := int64(len(data))
	checksum := hex.EncodeToString(hasher.Sum(nil))
	contentType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	if err := h.objects.PutObject(r.Context(), objectKey, bytes.NewReader(data), written, contentType); err != nil {
		slog.Error("failed to store firmware object", "error", err, "key", objectKey)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}

	// Get uploader ID
	var uploadedBy *string
	if claims := authsvc.ClaimsFromContext(r.Context()); claims != nil {
		uploadedBy = &claims.Sub
	}

	// Insert into database
	var fwID string
	insertQuery := `
		INSERT INTO dm3_devices.firmwares
		(version, device_type, description, file_path, file_size, checksum, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
		RETURNING id
	`

	var descPtr *string
	if description != "" {
		descPtr = &description
	}

	err = h.db.Pool.QueryRow(r.Context(), insertQuery,
		version, deviceType, descPtr, objectKey, written, checksum, uploadedBy,
	).Scan(&fwID)
	if err != nil {
		_ = h.objects.DeleteObject(r.Context(), objectKey) // cleanup on DB error
		if isUniqueViolation(err) {
			i18n.ErrorResponse(w, r, http.StatusConflict, "firmware.version_exists")
			return
		}
		slog.Error("failed to insert firmware", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	slog.Info("firmware uploaded", "id", fwID, "version", version, "device_type", deviceType, "size", written, "checksum", checksum)

	httputil.JSON(w, http.StatusCreated, map[string]any{
		"id":       fwID,
		"checksum": checksum,
		"size":     written,
		"message":  "Firmware uploaded successfully",
	})
}

// UpdateFirmware handles PUT /api/v1/system/firmware/{id}
func (h *FirmwareHandlers) UpdateFirmware(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Version     *string `json:"version"`
		Description *string `json:"description"`
		IsActive    *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	setParts := []string{}
	args := []any{id}
	idx := 2

	if req.Version != nil {
		setParts = append(setParts, fmt.Sprintf("version = $%d", idx))
		args = append(args, *req.Version)
		idx++
	}
	if req.Description != nil {
		setParts = append(setParts, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.IsActive != nil {
		setParts = append(setParts, fmt.Sprintf("is_active = $%d", idx))
		args = append(args, *req.IsActive)
		idx++
	}

	if len(setParts) == 0 {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.no_fields")
		return
	}

	query := fmt.Sprintf(`
		UPDATE dm3_devices.firmwares
		SET %s, updated_at = now()
		WHERE id = $1::uuid
		RETURNING id, version, device_type, description, file_path, file_size,
				  checksum, is_active,
				  COALESCE((SELECT a.email FROM dm3_auth.accounts a WHERE a.id = uploaded_by), uploaded_by::text),
				  created_at, updated_at
	`, strings.Join(setParts, ", "))

	var fw FirmwareDTO
	err := h.db.Pool.QueryRow(r.Context(), query, args...).Scan(
		&fw.ID, &fw.Version, &fw.DeviceType, &fw.Description, &fw.FilePath,
		&fw.FileSize, &fw.Checksum, &fw.IsActive, &fw.UploadedBy,
		&fw.CreatedAt, &fw.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		if isUniqueViolation(err) {
			i18n.ErrorResponse(w, r, http.StatusConflict, "firmware.version_exists")
			return
		}
		slog.Error("failed to update firmware", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	httputil.JSON(w, http.StatusOK, fw)
}

// DeleteFirmware handles DELETE /api/v1/system/firmware/{id}
func (h *FirmwareHandlers) DeleteFirmware(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Get file path before deleting
	var filePath string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT file_path FROM dm3_devices.firmwares WHERE id = $1::uuid`, id,
	).Scan(&filePath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("failed to get firmware for delete", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Delete deployments referencing this firmware first
	if _, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_devices.firmware_deployments WHERE firmware_id = $1::uuid`, id); err != nil {
		slog.Error("delete firmware deployments error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to delete firmware deployments")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_devices.firmwares WHERE id = $1::uuid`, id,
	)
	if err != nil {
		slog.Error("failed to delete firmware", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	if result.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
		return
	}

	// Remove file from object store
	if filePath != "" && h.objects != nil {
		if err := h.objects.DeleteObject(r.Context(), filePath); err != nil {
			slog.Warn("failed to remove firmware object", "key", filePath, "error", err)
		}
	}

	h.audit.LogFromRequest(r, "firmware.delete", "firmware", id, "", "success", nil, nil)
	slog.Info("firmware deleted", "id", id)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Firmware deleted successfully"})
}

// ListDeviceTypes handles GET /api/v1/system/firmware/device-types
func (h *FirmwareHandlers) ListDeviceTypes(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, map[string]any{
		"device_types": validDeviceTypes,
	})
}

// DeployFirmware handles POST /api/v1/system/firmware/{id}/deploy
// Creates deployment records, generates time-limited download tokens,
// and publishes cfg.firmware MQTT messages to target devices.
func (h *FirmwareHandlers) DeployFirmware(w http.ResponseWriter, r *http.Request) {
	firmwareID := chi.URLParam(r, "id")

	var req struct {
		DeviceIDs []string `json:"device_ids"` // device UUID(s)
		Force     bool     `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}
	if len(req.DeviceIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "device_ids is required")
		return
	}

	// Load firmware
	var fw FirmwareDTO
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, version, device_type, COALESCE(file_path,''), file_size, checksum, is_active
		   FROM dm3_devices.firmwares WHERE id = $1::uuid AND is_active = true`, firmwareID,
	).Scan(&fw.ID, &fw.Version, &fw.DeviceType, &fw.FilePath, &fw.FileSize, &fw.Checksum, &fw.IsActive)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("DeployFirmware: firmware lookup failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	actorID, actorEmail := audit.ActorFromContext(r.Context())
	expiresAt := time.Now().Add(5 * time.Minute)

	type deployResult struct {
		DeploymentID string `json:"deployment_id"`
		DeviceID     string `json:"device_id"`
		Status       string `json:"status"`
		Error        string `json:"error,omitempty"`
	}
	results := make([]deployResult, 0, len(req.DeviceIDs))

	for _, deviceDBID := range req.DeviceIDs {
		// NOTE: This endpoint is under the system_admin route group. The device lookup
		// intentionally has no tenant_id filter — system admins manage firmware across
		// all tenants for global firmware management. The tenant_id is still captured
		// in the deployment record and audit trail for traceability.
		var tenantID, deviceID, deviceModel string
		if lookupErr := h.db.Pool.QueryRow(r.Context(),
			`SELECT tenant_id, device_id, COALESCE(type,'') FROM dm3_devices.devices WHERE id = $1::uuid`, deviceDBID,
		).Scan(&tenantID, &deviceID, &deviceModel); lookupErr != nil {
			results = append(results, deployResult{DeviceID: deviceDBID, Status: "failed", Error: "device not found"})
			continue
		}

		// H-7: Skip devices whose type doesn't match the firmware's device_type.
		if deviceModel != "" && deviceModel != fw.DeviceType {
			slog.Info("DeployFirmware: skipping device_type mismatch", "device", deviceID, "device_type", deviceModel, "firmware_type", fw.DeviceType)
			results = append(results, deployResult{DeviceID: deviceID, Status: "skipped", Error: "device_type_mismatch"})
			continue
		}

		slog.Info("DeployFirmware: deploying to device", "device", deviceID, "tenant_id", tenantID, "firmware", firmwareID)

		// Secure download token (hex, 32 bytes = 64 chars)
		tokenBytes := make([]byte, 32)
		_, _ = io.ReadFull(rand.Reader, tokenBytes)
		token := hex.EncodeToString(tokenBytes)

		downloadURL := fmt.Sprintf("%s/api/v1/gateway/firmware/download/%s", h.downloadURL, token)

		var deployID string
		if insertErr := h.db.Pool.QueryRow(r.Context(),
			`INSERT INTO dm3_devices.firmware_deployments
				(tenant_id, firmware_id, device_id, device_db_id, version, device_type,
				 status, download_token, download_url, expires_at,
				 deployed_by, deployed_by_email, sent_at)
			 VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6,
				 'sent', $7, $8, $9, $10::uuid, $11, now())
			 RETURNING id`,
			tenantID, firmwareID, deviceID, deviceDBID, fw.Version, fw.DeviceType,
			token, downloadURL, expiresAt,
			nullableStrFw(actorID), actorEmail,
		).Scan(&deployID); insertErr != nil {
			slog.Error("DeployFirmware: insert failed", "error", insertErr, "device", deviceID)
			results = append(results, deployResult{DeviceID: deviceID, Status: "failed", Error: "db error"})
			continue
		}

		// Publish cfg.firmware MQTT message
		checksumStr := ""
		if fw.Checksum != nil {
			checksumStr = *fw.Checksum
		}
		topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
		payload, _ := json.Marshal(MQTTEnvelope{
			Version: 1,
			Type:    "cfg.firmware",
			Data: mustMarshalRaw(map[string]any{
				"version":       fw.Version,
				"url":           downloadURL,
				"checksum":      "sha256:" + checksumStr,
				"size_bytes":    fw.FileSize,
				"deployment_id": deployID,
				"force":         req.Force,
			}),
		})
		slog.Info("DeployFirmware: publishing MQTT", "topic", topic, "payload", string(payload))
		if pubErr := h.mqtt.Publish(r.Context(), topic, 2, payload); pubErr != nil {
			slog.Error("DeployFirmware: MQTT publish failed", "error", pubErr, "device", deviceID)
			_, _ = h.db.Pool.Exec(r.Context(),
				`UPDATE dm3_devices.firmware_deployments SET status='failed', error_message=$2, updated_at=now() WHERE id=$1::uuid`,
				deployID, "mqtt publish failed")
			results = append(results, deployResult{DeploymentID: deployID, DeviceID: deviceID, Status: "failed", Error: "mqtt failed"})
			continue
		}

		// Audit + device history
		h.audit.LogFromRequest(r, "firmware.deploy", "firmware_deployment", deployID, deviceID, "success", nil,
			map[string]any{"firmware_id": firmwareID, "version": fw.Version})
		go InsertDeviceEvent(context.Background(), h.db.Pool, DeviceEvent{
			TenantID: tenantID, DeviceID: deviceID, EventType: "firmware_update",
			Description: fmt.Sprintf("Firmware deploy: %s v%s", fw.DeviceType, fw.Version),
			ActorID: strPtr(actorID), ActorEmail: strPtr(actorEmail),
			Metadata: map[string]any{"deployment_id": deployID, "version": fw.Version},
		})

		results = append(results, deployResult{DeploymentID: deployID, DeviceID: deviceID, Status: "sent"})
	}

	httputil.JSON(w, http.StatusAccepted, map[string]any{
		"firmware_id": firmwareID, "version": fw.Version,
		"device_type": fw.DeviceType, "expires_at": expiresAt, "results": results,
	})
}

func mustMarshalRaw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func nullableStrFw(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// DownloadFirmware handles GET /api/v1/system/firmware/{id}/download
func (h *FirmwareHandlers) DownloadFirmware(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var filePath string
	var fileName string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT file_path, version || '_' || device_type FROM dm3_devices.firmwares WHERE id = $1::uuid`, id,
	).Scan(&filePath, &fileName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("failed to get firmware for download", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	if h.objects == nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}

	reader, info, err := h.objects.GetObject(r.Context(), filePath)
	if err != nil {
		slog.Error("failed to fetch firmware object", "error", err, "key", filePath)
		i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
		return
	}
	defer reader.Close()

	base := filepath.Base(filePath)
	if info.ContentType != "" {
		w.Header().Set("Content-Type", info.ContentType)
	}
	if info.Size >= 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size))
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, base))
	if _, err := io.Copy(w, reader); err != nil {
		slog.Warn("failed to stream firmware object", "key", filePath, "error", err)
	}
}

// DownloadFirmwareByToken handles GET /api/v1/gateway/firmware/download/{token}
// This endpoint requires NO JWT auth — the token itself is the credential.
// Called by devices during OTA to fetch the firmware binary.
func (h *FirmwareHandlers) DownloadFirmwareByToken(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		httputil.Error(w, http.StatusBadRequest, "missing token")
		return
	}

	// Look up deployment by token.
	// NOTE: This query intentionally has no tenant_id filter. The download token is a
	// random 32-byte hex (64 chars) meant to be unguessable and single-use — security
	// relies on token entropy (bearer-token pattern), not tenant scoping. Devices
	// download firmware using just the token without any tenant context.
	var filePath, deviceID, deployID, deployTenantID string
	var expiresAt time.Time
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT d.id, d.device_id, d.expires_at, f.file_path, d.tenant_id
		   FROM dm3_devices.firmware_deployments d
		   JOIN dm3_devices.firmwares f ON f.id = d.firmware_id
		  WHERE d.download_token = $1
		    AND d.status IN ('sent', 'downloading')`, token,
	).Scan(&deployID, &deviceID, &expiresAt, &filePath, &deployTenantID)
	if err != nil {
		preview := token
		if len(token) > 8 {
			preview = token[:8] + "..."
		}
		slog.Warn("firmware download: invalid token", "token", preview)
		httputil.Error(w, http.StatusNotFound, "invalid or expired token")
		return
	}

	// Check expiry — scope the status UPDATE by tenant_id from the fetched record.
	if time.Now().After(expiresAt) {
		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_devices.firmware_deployments SET status='expired', updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid`, deployID, deployTenantID)
		httputil.Error(w, http.StatusGone, "download token expired")
		return
	}

	// Mark as downloading — scope by tenant_id from the fetched record.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_devices.firmware_deployments SET status='downloading', download_started_at=now(), updated_at=now()
		  WHERE id=$1::uuid AND tenant_id=$2::uuid AND status='sent'`, deployID, deployTenantID)

	// Stream the binary
	reader, info, err := h.objects.GetObject(r.Context(), filePath)
	if err != nil {
		slog.Error("firmware download: object not found", "error", err, "key", filePath)
		httputil.Error(w, http.StatusNotFound, "firmware file not found")
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	if info.Size >= 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size))
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(filePath)))
	if _, err := io.Copy(w, reader); err != nil {
		slog.Warn("firmware download: stream error", "error", err, "device", deviceID)
	}
}

// ListDeployments handles GET /api/v1/system/firmware/{id}/deployments
// NOTE: This endpoint is under the system_admin route group. The query intentionally
// has no tenant_id filter — system admins need cross-tenant visibility for global
// firmware management. The download_url is redacted from the response to prevent
// token leakage through the admin UI.
func (h *FirmwareHandlers) ListDeployments(w http.ResponseWriter, r *http.Request) {
	firmwareID := chi.URLParam(r, "id")
	page, limit := parsePagination(r)

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_devices.firmware_deployments WHERE firmware_id = $1::uuid`, firmwareID).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, firmware_id, device_id, version, device_type, status,
		        download_url, error_message, progress_pct,
		        COALESCE(deployed_by_email,''), sent_at, download_started_at,
		        install_started_at, completed_at, created_at, updated_at
		   FROM dm3_devices.firmware_deployments
		  WHERE firmware_id = $1::uuid
		  ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		firmwareID, limit, (page-1)*limit)
	if err != nil {
		slog.Error("ListDeployments: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type deploymentDTO struct {
		ID              string     `json:"id"`
		TenantID        string     `json:"tenant_id"`
		FirmwareID      string     `json:"firmware_id"`
		DeviceID        string     `json:"device_id"`
		Version         string     `json:"version"`
		DeviceType      string     `json:"device_type"`
		Status          string     `json:"status"`
		DownloadURL     string     `json:"download_url"`
		ErrorMessage    string     `json:"error_message"`
		ProgressPct     int        `json:"progress_pct"`
		DeployedByEmail string     `json:"deployed_by_email"`
		SentAt          *time.Time `json:"sent_at"`
		DownloadStarted *time.Time `json:"download_started_at"`
		InstallStarted  *time.Time `json:"install_started_at"`
		CompletedAt     *time.Time `json:"completed_at"`
		CreatedAt       time.Time  `json:"created_at"`
		UpdatedAt       time.Time  `json:"updated_at"`
	}
	deployments := []deploymentDTO{}
	for rows.Next() {
		var d deploymentDTO
		if err := rows.Scan(&d.ID, &d.TenantID, &d.FirmwareID, &d.DeviceID, &d.Version, &d.DeviceType,
			&d.Status, &d.DownloadURL, &d.ErrorMessage, &d.ProgressPct,
			&d.DeployedByEmail, &d.SentAt, &d.DownloadStarted,
			&d.InstallStarted, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			slog.Error("ListDeployments: scan failed", "error", err)
			continue
		}
		// Redact download_url to prevent token leakage in admin list responses.
		d.DownloadURL = ""
		deployments = append(deployments, d)
	}
	httputil.Paginated(w, deployments, total, page, limit)
}

func buildFirmwareObjectKey(deviceType, filename string) string {
	return fmt.Sprintf("system/firmware/%s/%s", sanitizeFirmwarePathSegment(deviceType), sanitizeFirmwarePathSegment(filename))
}

func sanitizeFirmwarePathSegment(value string) string {
	value = strings.TrimSpace(value)
	var result []byte
	for i := 0; i < len(value); i++ {
		c := value[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-' {
			result = append(result, c)
		} else {
			result = append(result, '_')
		}
	}
	s := strings.Trim(string(result), ".")
	if s == "" {
		return "file"
	}
	return s
}

// parseFirmwarePagination reuses the gateway parsePagination for consistency
func parseFirmwarePagination(r *http.Request) (int, int) {
	page := 1
	limit := 50
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	return page, limit
}
