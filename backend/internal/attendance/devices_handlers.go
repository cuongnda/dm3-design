package attendance

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// AttendanceDevice mirrors dm3_attendance.attendance_devices.
type AttendanceDevice struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	SiteID       *string   `json:"site_id,omitempty"`
	DeviceID     string    `json:"device_id"`
	Function     string    `json:"function"` // clock_in | clock_out | both
	LocationName *string   `json:"location_name,omitempty"`
	IsPrimary    bool      `json:"is_primary"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Join fields for the UI.
	DeviceName string `json:"device_name,omitempty"`
	DeviceKind string `json:"device_kind,omitempty"`
}

// ListAttendanceDevices returns every device registered as a clock-in/out
// terminal for the caller's tenant, joined with dm3_devices.devices for the
// display name and kind.
func (h *AttendanceHandlers) ListAttendanceDevices(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT ad.id::text, ad.tenant_id::text, ad.site_id::text, ad.device_id::text,
		       ad.function, ad.location_name, ad.is_primary, ad.created_at, ad.updated_at,
		       COALESCE(d.name, '') AS device_name,
		       COALESCE(d.kind, '') AS device_kind
		  FROM dm3_attendance.attendance_devices ad
		  LEFT JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		 WHERE ad.tenant_id = $1::uuid
		 ORDER BY ad.is_primary DESC, ad.created_at DESC
	`, tenantID)
	if err != nil {
		slog.Error("list attendance devices", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list devices")
		return
	}
	defer rows.Close()

	devices := make([]AttendanceDevice, 0)
	for rows.Next() {
		var d AttendanceDevice
		var siteID *string
		if err := rows.Scan(
			&d.ID, &d.TenantID, &siteID, &d.DeviceID,
			&d.Function, &d.LocationName, &d.IsPrimary, &d.CreatedAt, &d.UpdatedAt,
			&d.DeviceName, &d.DeviceKind,
		); err != nil {
			slog.Error("scan attendance device", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan device")
			return
		}
		d.SiteID = siteID
		devices = append(devices, d)
	}
	httputil.JSON(w, http.StatusOK, devices)
}

type attendanceDevicePayload struct {
	DeviceID     string  `json:"device_id"`
	SiteID       *string `json:"site_id,omitempty"`
	Function     string  `json:"function"` // clock_in | clock_out | both
	LocationName *string `json:"location_name,omitempty"`
	IsPrimary    *bool   `json:"is_primary,omitempty"`
}

func (p *attendanceDevicePayload) validateFn() error {
	switch strings.ToLower(strings.TrimSpace(p.Function)) {
	case "clock_in", "clock_out", "both":
		return nil
	default:
		return httpError{http.StatusBadRequest, "function must be one of clock_in|clock_out|both"}
	}
}

// RegisterAttendanceDevice creates (or upserts on device_id) an
// attendance_devices row. Idempotent on (tenant_id, device_id) — re-registering
// the same device updates function/location/is_primary instead of erroring.
func (h *AttendanceHandlers) RegisterAttendanceDevice(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var p attendanceDevicePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if p.DeviceID == "" {
		httputil.Error(w, http.StatusBadRequest, "device_id required")
		return
	}
	if err := p.validateFn(); err != nil {
		httpErr := err.(httpError)
		httputil.Error(w, httpErr.code, httpErr.msg)
		return
	}

	// Verify the device exists in core devices table under this tenant.
	var deviceName string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(name, '')
		  FROM dm3_devices.devices
		 WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, p.DeviceID, tenantID).Scan(&deviceName)
	if err != nil {
		if err == pgx.ErrNoRows {
			httputil.Error(w, http.StatusNotFound, "device not found in tenant")
			return
		}
		slog.Error("register attendance device: lookup", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to verify device")
		return
	}

	isPrimary := false
	if p.IsPrimary != nil {
		isPrimary = *p.IsPrimary
	}

	var id string
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_attendance.attendance_devices
			(tenant_id, device_id, site_id, function, location_name, is_primary)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
		ON CONFLICT (tenant_id, device_id) DO UPDATE SET
			site_id       = EXCLUDED.site_id,
			function      = EXCLUDED.function,
			location_name = EXCLUDED.location_name,
			is_primary    = EXCLUDED.is_primary,
			updated_at    = NOW()
		RETURNING id::text
	`, tenantID, p.DeviceID, p.SiteID, p.Function, p.LocationName, isPrimary).Scan(&id)
	if err != nil {
		slog.Error("register attendance device", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to register device")
		return
	}

	h.audit.LogFromRequest(r, "attendance.device_registered", "attendance_device", id, deviceName, "success", nil, map[string]any{
		"device_id": p.DeviceID,
		"function":  p.Function,
	})

	httputil.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

// DeregisterAttendanceDevice removes a device from the attendance registry.
// Access events from the device still land in dm3_access but the consumer
// filter (deviceRegistered in consumer.go) drops them before they can produce
// clock-in/out records — so removing the row here is sufficient to stop
// attendance tracking for that device.
func (h *AttendanceHandlers) DeregisterAttendanceDevice(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "missing id")
		return
	}

	ct, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM dm3_attendance.attendance_devices
		 WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, id, tenantID)
	if err != nil {
		slog.Error("deregister attendance device", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to deregister device")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "attendance device not found")
		return
	}

	h.audit.LogFromRequest(r, "attendance.device_deregistered", "attendance_device", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}
