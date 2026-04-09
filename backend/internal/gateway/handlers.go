package gateway

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

type GatewayHandlers struct {
	db    *db.DB
	mqtt  *mqtt.Client
	audit *audit.Logger
}

func NewGatewayHandlers(database *db.DB, mqttClient *mqtt.Client, auditLog *audit.Logger) *GatewayHandlers {
	return &GatewayHandlers{db: database, mqtt: mqttClient, audit: auditLog}
}

// ─── Shared scan helpers ────────────────────────────────────────────────────

// deviceColumns is the canonical SELECT column list for dm3_devices.devices.
const deviceColumns = `id, tenant_id, device_id, COALESCE(name,''), type, status,
	COALESCE(model,''), COALESCE(firmware_version,''), COALESCE(location,''),
	ip_address, mac_address,
	COALESCE(timezone,'Asia/Ho_Chi_Minh'), COALESCE(open_relay_ms,3000),
	verify_methods, COALESCE(verify_logic,'or'),
	last_seen, created_at, updated_at`

func scanDevice(row pgx.Row) (models.Device, error) {
	var d models.Device
	err := row.Scan(
		&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status,
		&d.Model, &d.FirmwareVersion, &d.Location,
		&d.IPAddress, &d.MACAddress,
		&d.Timezone, &d.OpenRelayMs,
		&d.VerifyMethods, &d.VerifyLogic,
		&d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
	)
	return d, err
}

func scanDeviceRows(rows pgx.Rows) ([]models.Device, error) {
	var devices []models.Device
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status,
			&d.Model, &d.FirmwareVersion, &d.Location,
			&d.IPAddress, &d.MACAddress,
			&d.Timezone, &d.OpenRelayMs,
			&d.VerifyMethods, &d.VerifyLogic,
			&d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// ─── List Devices (company-scoped) ──────────────────────────────────────────

func (h *GatewayHandlers) ListDevices(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	query := `SELECT ` + deviceColumns + ` FROM dm3_devices.devices WHERE tenant_id = $1::uuid`
	args := []any{cid}
	argIdx := 2

	if s := r.URL.Query().Get("status"); s != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, s)
		argIdx++
	}
	if t := r.URL.Query().Get("type"); t != "" {
		query += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, t)
		argIdx++
	}

	query += " ORDER BY created_at DESC LIMIT 200"

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("ListDevices: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	devices, err := scanDeviceRows(rows)
	if err != nil {
		slog.Error("ListDevices: scan failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if devices == nil {
		devices = []models.Device{}
	}
	httputil.JSON(w, http.StatusOK, devices)
}

// ─── List Devices Global (system admin) ─────────────────────────────────────

func (h *GatewayHandlers) ListDevicesGlobal(w http.ResponseWriter, r *http.Request) {
	query := `SELECT d.id, d.tenant_id, d.device_id, COALESCE(d.name,''), d.type, d.status,
		COALESCE(d.model,''), COALESCE(d.firmware_version,''), COALESCE(d.location,''),
		d.ip_address, d.mac_address,
		COALESCE(d.timezone,'Asia/Ho_Chi_Minh'), COALESCE(d.open_relay_ms,3000),
		d.verify_methods, COALESCE(d.verify_logic,'or'),
		d.last_seen, d.created_at, d.updated_at,
		COALESCE(c.name,'') as company_name
	FROM dm3_devices.devices d LEFT JOIN dm3_auth.tenants c ON c.id = d.tenant_id WHERE 1=1`
	args := []any{}
	argIdx := 1

	if cid := r.URL.Query().Get("tenant_id"); cid != "" {
		query += fmt.Sprintf(" AND d.tenant_id = $%d::uuid", argIdx)
		args = append(args, cid)
		argIdx++
	}
	if s := r.URL.Query().Get("status"); s != "" {
		query += fmt.Sprintf(" AND d.status = $%d", argIdx)
		args = append(args, s)
		argIdx++
	}
	if t := r.URL.Query().Get("type"); t != "" {
		query += fmt.Sprintf(" AND d.type = $%d", argIdx)
		args = append(args, t)
		argIdx++
	}

	query += " ORDER BY d.created_at DESC LIMIT 200"

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("ListDevicesGlobal: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	type deviceWithCompany struct {
		models.Device
		CompanyName string `json:"company_name"`
	}
	var devices []deviceWithCompany
	for rows.Next() {
		var d deviceWithCompany
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status,
			&d.Model, &d.FirmwareVersion, &d.Location,
			&d.IPAddress, &d.MACAddress,
			&d.Timezone, &d.OpenRelayMs,
			&d.VerifyMethods, &d.VerifyLogic,
			&d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
			&d.CompanyName,
		); err != nil {
			slog.Error("ListDevicesGlobal: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		slog.Error("ListDevicesGlobal: rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if devices == nil {
		devices = []deviceWithCompany{}
	}
	httputil.JSON(w, http.StatusOK, devices)
}

// ─── Create Device ──────────────────────────────────────────────────────────

type createDeviceRequest struct {
	DeviceID string `json:"device_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Location string `json:"location"`
}

func (h *GatewayHandlers) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var req createDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DeviceID == "" || req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "device_id and type are required")
		return
	}
	if !models.IsValidDeviceType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "invalid device type: must be terminal, controller, camera, or sensor")
		return
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices (device_id, name, type, location, tenant_id)
		 VALUES ($1, $2, $3, $4, $5::uuid)
		 RETURNING `+deviceColumns,
		req.DeviceID, req.Name, req.Type, req.Location, cid,
	))
	if err != nil {
		if isUniqueViolation(err) {
			httputil.Error(w, http.StatusConflict, "device_id already exists")
			return
		}
		slog.Error("CreateDevice: insert failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	h.audit.LogFromRequest(r, "device.create", "device", d.ID, d.Name, "success", nil, d)
	httputil.JSON(w, http.StatusCreated, d)
}

// ─── Get Device ─────────────────────────────────────────────────────────────

func (h *GatewayHandlers) GetDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	query := `SELECT ` + deviceColumns + ` FROM dm3_devices.devices WHERE id = $1::uuid`
	args := []any{id}
	if cid != "" {
		query += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}
	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(), query, args...))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	httputil.JSON(w, http.StatusOK, d)
}

// ─── Update Device ──────────────────────────────────────────────────────────

type updateDeviceRequest struct {
	Name     *string `json:"name"`
	Location *string `json:"location"`
	Status   *string `json:"status"`
}

func (h *GatewayHandlers) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req updateDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status != nil && !models.IsValidDeviceStatus(*req.Status) {
		httputil.Error(w, http.StatusBadRequest, "invalid status: must be online, offline, or warning")
		return
	}

	query := `UPDATE dm3_devices.devices SET
			name = COALESCE($2, name),
			location = COALESCE($3, location),
			status = COALESCE($4, status),
			updated_at = now()
		 WHERE id = $1::uuid`
	args := []any{id, req.Name, req.Location, req.Status}
	if cid != "" {
		query += " AND tenant_id = $5::uuid"
		args = append(args, cid)
	}
	query += ` RETURNING ` + deviceColumns

	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(), query, args...))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	h.audit.LogFromRequest(r, "device.update", "device", d.ID, d.Name, "success", nil, d)
	httputil.JSON(w, http.StatusOK, d)
}

// ─── Delete Device ──────────────────────────────────────────────────────────

func (h *GatewayHandlers) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	query := `DELETE FROM dm3_devices.devices WHERE id = $1::uuid`
	args := []any{id}
	if cid != "" {
		query += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	h.audit.LogFromRequest(r, "device.delete", "device", id, "", "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ─── Send Command ───────────────────────────────────────────────────────────

type sendCommandRequest struct {
	Type string         `json:"type"`
	Data map[string]any `json:"data"`
}

func (h *GatewayHandlers) SendCommand(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req sendCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "command type is required")
		return
	}

	cmdQuery := `SELECT tenant_id, device_id FROM dm3_devices.devices WHERE id = $1::uuid`
	cmdArgs := []any{id}
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid != "" {
		cmdQuery += " AND tenant_id = $2::uuid"
		cmdArgs = append(cmdArgs, cid)
	}
	var tenantID, deviceID string
	if err := h.db.Pool.QueryRow(r.Context(), cmdQuery, cmdArgs...).Scan(&tenantID, &deviceID); err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cmd", tenantID, deviceID)
	payload, _ := json.Marshal(map[string]any{
		"type": req.Type,
		"data": req.Data,
	})

	if err := h.mqtt.Publish(r.Context(), topic, 2, payload); err != nil {
		slog.Error("SendCommand: mqtt publish failed", "error", err, "topic", topic)
		httputil.Error(w, http.StatusInternalServerError, "failed to send command")
		return
	}

	h.audit.LogFromRequest(r, "device.command", "device", id, deviceID, "success", nil, map[string]any{"command": req.Type})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "sent", "topic": topic})
}

// ─── Events ─────────────────────────────────────────────────────────────────

func (h *GatewayHandlers) GetDeviceEvents(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var deviceID string
	dq := `SELECT device_id FROM dm3_devices.devices WHERE id = $1::uuid`
	dqArgs := []any{deviceDBID}
	if cid != "" {
		dq += " AND tenant_id = $2::uuid"
		dqArgs = append(dqArgs, cid)
	}
	if err := h.db.Pool.QueryRow(r.Context(), dq, dqArgs...).Scan(&deviceID); err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	page, limit := parsePagination(r)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, device_id, event_type, COALESCE(user_id,''), COALESCE(user_name,''),
			COALESCE(method,''), COALESCE(door_id,''), COALESCE(direction,''), COALESCE(decision,''),
			COALESCE(reason,''), confidence, time
		 FROM dm3_access.access_events
		 WHERE device_id = $1 AND tenant_id = $2::uuid
		 ORDER BY time DESC LIMIT $3 OFFSET $4`,
		deviceID, cid, limit, (page-1)*limit)
	if err != nil {
		slog.Error("GetDeviceEvents: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	events := []map[string]any{}
	for rows.Next() {
		var e struct {
			ID, TenantID, DeviceID, EventType, UserID, UserName string
			Method, DoorID, Direction, Decision, Reason         string
			Confidence                                          float64
			Time                                                interface{}
		}
		if err := rows.Scan(&e.ID, &e.TenantID, &e.DeviceID, &e.EventType, &e.UserID, &e.UserName,
			&e.Method, &e.DoorID, &e.Direction, &e.Decision, &e.Reason, &e.Confidence, &e.Time); err != nil {
			continue
		}
		events = append(events, map[string]any{
			"id":         e.ID,
			"tenant_id":  e.TenantID,
			"device_id":  e.DeviceID,
			"event_type": e.EventType,
			"user_id":    e.UserID,
			"user_name":  e.UserName,
			"method":     e.Method,
			"door_id":    e.DoorID,
			"direction":  e.Direction,
			"decision":   e.Decision,
			"reason":     e.Reason,
			"confidence": e.Confidence,
			"time":       e.Time,
		})
	}
	httputil.JSON(w, http.StatusOK, events)
}

func (h *GatewayHandlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, device_id, event_type, COALESCE(user_id,''), COALESCE(user_name,''),
			COALESCE(method,''), COALESCE(door_id,''), COALESCE(direction,''), COALESCE(decision,''),
			COALESCE(reason,''), confidence, time
		 FROM dm3_access.access_events
		 WHERE tenant_id = $1::uuid
		 ORDER BY time DESC LIMIT $2 OFFSET $3`,
		cid, limit, (page-1)*limit)
	if err != nil {
		slog.Error("ListEvents: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	events := []map[string]any{}
	for rows.Next() {
		var e struct {
			ID, TenantID, DeviceID, EventType, UserID, UserName string
			Method, DoorID, Direction, Decision, Reason         string
			Confidence                                          float64
			Time                                                interface{}
		}
		if err := rows.Scan(&e.ID, &e.TenantID, &e.DeviceID, &e.EventType, &e.UserID, &e.UserName,
			&e.Method, &e.DoorID, &e.Direction, &e.Decision, &e.Reason, &e.Confidence, &e.Time); err != nil {
			continue
		}
		events = append(events, map[string]any{
			"id": e.ID, "tenant_id": e.TenantID, "device_id": e.DeviceID,
			"event_type": e.EventType, "user_id": e.UserID, "user_name": e.UserName,
			"method": e.Method, "door_id": e.DoorID, "direction": e.Direction,
			"decision": e.Decision, "reason": e.Reason, "confidence": e.Confidence,
			"time": e.Time,
		})
	}
	httputil.JSON(w, http.StatusOK, events)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 50
	if p := r.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	return page, limit
}

func isUniqueViolation(err error) bool {
	return err != nil && (fmt.Sprintf("%v", err) == "ERROR: duplicate key value violates unique constraint" ||
		len(fmt.Sprintf("%v", err)) > 0 && fmt.Sprintf("%v", err)[:5] == "ERROR" &&
			contains(fmt.Sprintf("%v", err), "duplicate key"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchSubstring(s, substr)
}

func searchSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
