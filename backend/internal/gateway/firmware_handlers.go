package gateway

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// ─── Device Types ───────────────────────────────────────────────────────────

var validDeviceTypes = []string{
	"icu300n", "itouch_pop", "desktop_app", "itouch_pop_x",
	"dq_mini_plus", "it100", "nexpa_lpr", "xstation2",
	"fv6000", "pm85", "itouch_30a", "dp636x", "df970",
	"biostation2", "icu300nx", "biostation3", "ebkn_reader",
	"ba8300", "icu400", "ra08", "dq8500", "dq200",
	"camera_dc", "tb_vision", "icu970",
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
	ID          string     `json:"id"`
	Version     string     `json:"version"`
	DeviceType  string     `json:"device_type"`
	Description *string    `json:"description"`
	FilePath    string     `json:"file_path"`
	FileSize    int64      `json:"file_size"`
	Checksum    *string    `json:"checksum"`
	IsActive    bool       `json:"is_active"`
	UploadedBy  *string    `json:"uploaded_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ─── Firmware Handlers ──────────────────────────────────────────────────────

type FirmwareHandlers struct {
	db *db.DB
}

func NewFirmwareHandlers(database *db.DB) *FirmwareHandlers {
	return &FirmwareHandlers{db: database}
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
			   f.file_size, f.checksum, f.is_active, f.uploaded_by,
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
			   file_size, checksum, is_active, uploaded_by,
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
		if err == pgx.ErrNoRows {
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

	// Prepare directory
	firmwareDir := filepath.Join("data", "firmware", deviceType)
	if err := os.MkdirAll(firmwareDir, 0755); err != nil {
		slog.Error("failed to create firmware directory", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}

	// Build filename: version_originalname
	safeVersion := strings.ReplaceAll(version, "/", "_")
	filename := fmt.Sprintf("%s_%s", safeVersion, header.Filename)
	destPath := filepath.Join(firmwareDir, filename)

	// Write file and calculate SHA-256 checksum
	dst, err := os.Create(destPath)
	if err != nil {
		slog.Error("failed to create firmware file", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}
	defer dst.Close()

	hasher := sha256.New()
	writer := io.MultiWriter(dst, hasher)

	written, err := io.Copy(writer, file)
	if err != nil {
		slog.Error("failed to write firmware file", "error", err)
		os.Remove(destPath) // cleanup
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.filesystem_error")
		return
	}

	checksum := hex.EncodeToString(hasher.Sum(nil))

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
		version, deviceType, descPtr, destPath, written, checksum, uploadedBy,
	).Scan(&fwID)
	if err != nil {
		os.Remove(destPath) // cleanup on DB error
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
				  checksum, is_active, uploaded_by, created_at, updated_at
	`, strings.Join(setParts, ", "))

	var fw FirmwareDTO
	err := h.db.Pool.QueryRow(r.Context(), query, args...).Scan(
		&fw.ID, &fw.Version, &fw.DeviceType, &fw.Description, &fw.FilePath,
		&fw.FileSize, &fw.Checksum, &fw.IsActive, &fw.UploadedBy,
		&fw.CreatedAt, &fw.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
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

	hard := r.URL.Query().Get("hard") == "true"

	if hard {
		// Get file path before deleting
		var filePath string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT file_path FROM dm3_devices.firmwares WHERE id = $1::uuid`, id,
		).Scan(&filePath)
		if err != nil {
			if err == pgx.ErrNoRows {
				i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
				return
			}
			slog.Error("failed to get firmware for delete", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}

		result, err := h.db.Pool.Exec(r.Context(),
			`DELETE FROM dm3_devices.firmwares WHERE id = $1::uuid`, id,
		)
		if err != nil {
			slog.Error("failed to hard delete firmware", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}
		if result.RowsAffected() == 0 {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}

		// Remove file from disk
		if filePath != "" {
			if err := os.Remove(filePath); err != nil {
				slog.Warn("failed to remove firmware file", "path", filePath, "error", err)
			}
		}

		slog.Info("firmware hard deleted", "id", id)
	} else {
		// Soft delete: set is_active = false
		result, err := h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_devices.firmwares SET is_active = false, updated_at = now() WHERE id = $1::uuid`, id,
		)
		if err != nil {
			slog.Error("failed to soft delete firmware", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}
		if result.RowsAffected() == 0 {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}

		slog.Info("firmware soft deleted", "id", id)
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Firmware deleted successfully",
	})
}

// ListDeviceTypes handles GET /api/v1/system/firmware/device-types
func (h *FirmwareHandlers) ListDeviceTypes(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, map[string]any{
		"device_types": validDeviceTypes,
	})
}

// DeployFirmware handles POST /api/v1/system/firmware/{id}/deploy
func (h *FirmwareHandlers) DeployFirmware(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		DeviceID string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	// Verify firmware exists
	var version, deviceType string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT version, device_type FROM dm3_devices.firmwares WHERE id = $1::uuid AND is_active = true`, id,
	).Scan(&version, &deviceType)
	if err != nil {
		if err == pgx.ErrNoRows {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("failed to get firmware for deploy", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Placeholder: just log the deploy request
	slog.Info("firmware deploy requested",
		"firmware_id", id,
		"version", version,
		"device_type", deviceType,
		"target_device", req.DeviceID,
	)

	httputil.JSON(w, http.StatusAccepted, map[string]string{
		"message":     "Firmware deploy initiated",
		"firmware_id": id,
		"version":     version,
		"device_type": deviceType,
		"device_id":   req.DeviceID,
		"status":      "pending",
	})
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
		if err == pgx.ErrNoRows {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "firmware.not_found")
			return
		}
		slog.Error("failed to get firmware for download", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Serve file
	base := filepath.Base(filePath)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, base))
	http.ServeFile(w, r, filePath)
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
