package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

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
	Name          *string   `json:"name"`
	Location      *string   `json:"location"`
	Status        *string   `json:"status"`
	Model         *string   `json:"model"`
	OpenRelayMs   *int      `json:"open_relay_ms"`
	Timezone      *string   `json:"timezone"`
	VerifyMethods *[]string `json:"verify_methods"`
	VerifyLogic   *string   `json:"verify_logic"`
}

// updateDeviceSQL builds the UPDATE statement + args for a device row,
// optionally scoped to a tenant. When scopeTenantID is empty the update
// hits any row by id (used by the sysadmin global handler).
func updateDeviceSQL(id string, req updateDeviceRequest, scopeTenantID string) (string, []any) {
	query := `UPDATE dm3_devices.devices SET
			name = COALESCE($2, name),
			location = COALESCE($3, location),
			status = COALESCE($4, status),
			model = COALESCE($5, model),
			open_relay_ms = COALESCE($6, open_relay_ms),
			timezone = COALESCE($7, timezone),
			verify_methods = COALESCE($8, verify_methods),
			verify_logic = COALESCE($9, verify_logic),
			updated_at = now()
		 WHERE id = $1::uuid`
	args := []any{
		id,
		req.Name,
		req.Location,
		req.Status,
		req.Model,
		req.OpenRelayMs,
		req.Timezone,
		req.VerifyMethods,
		req.VerifyLogic,
	}
	if scopeTenantID != "" {
		query += " AND tenant_id = $10::uuid"
		args = append(args, scopeTenantID)
	}
	query += ` RETURNING ` + deviceColumns
	return query, args
}

func (h *GatewayHandlers) decodeUpdateDevice(w http.ResponseWriter, r *http.Request) (updateDeviceRequest, bool) {
	var req updateDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return req, false
	}
	if req.Status != nil && !models.IsValidDeviceStatus(*req.Status) {
		httputil.Error(w, http.StatusBadRequest, "invalid status: must be online, offline, or warning")
		return req, false
	}
	if req.VerifyLogic != nil && *req.VerifyLogic != "or" && *req.VerifyLogic != "and" {
		httputil.Error(w, http.StatusBadRequest, "invalid verify_logic: must be 'or' or 'and'")
		return req, false
	}
	return req, true
}

func (h *GatewayHandlers) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	req, ok := h.decodeUpdateDevice(w, r)
	if !ok {
		return
	}

	query, args := updateDeviceSQL(id, req, cid)
	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(), query, args...))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	h.audit.LogFromRequest(r, "device.update", "device", d.ID, d.Name, "success", nil, d)
	h.pushDeviceConfig(r.Context(), d)
	httputil.JSON(w, http.StatusOK, d)
}

// pushDeviceConfig publishes the current editable device settings to the
// device's MQTT cfg topic so running firmware applies the change without
// waiting for a full reconnect. Best-effort: errors are logged, not
// returned — the HTTP response for the update should still succeed even
// if the device is offline or MQTT is flaky.
func (h *GatewayHandlers) pushDeviceConfig(ctx context.Context, d models.Device) {
	if h.mqtt == nil || d.TenantID == "" || d.DeviceID == "" {
		return
	}

	// Flat payload matching the fields editable on the EditDevicePage.
	// Firmware authors map these to their local equivalents. See
	// docs/architecture/mqtt-protocol.md §7.2 for context — this is a
	// targeted settings push, not a cfg.full replacement.
	payload := map[string]any{
		"device_id":      d.DeviceID,
		"name":           d.Name,
		"location":       d.Location,
		"model":          d.Model,
		"open_relay_ms":  d.OpenRelayMs,
		"timezone":       d.Timezone,
		"verify_methods": d.VerifyMethods,
		"verify_logic":   d.VerifyLogic,
	}
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		slog.Error("pushDeviceConfig: marshal data", "error", err, "device_id", d.DeviceID)
		return
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.device_update",
		Data:    dataBytes,
	}
	envBytes, err := json.Marshal(envelope)
	if err != nil {
		slog.Error("pushDeviceConfig: marshal envelope", "error", err, "device_id", d.DeviceID)
		return
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", d.TenantID, d.DeviceID)
	if err := h.mqtt.Publish(ctx, topic, 2, envBytes); err != nil {
		slog.Error("pushDeviceConfig: mqtt publish failed",
			"error", err, "topic", topic, "device_id", d.DeviceID)
		return
	}
	slog.Info("pushDeviceConfig: sent",
		"device_id", d.DeviceID, "tenant_id", d.TenantID, "topic", topic)
}

// ─── Get / Update Device (system admin, cross-tenant) ───────────────────────

// GetDeviceGlobal handles GET /api/v1/gateway/system/devices/{id}
// — returns a device by id regardless of tenant. System admin only.
func (h *GatewayHandlers) GetDeviceGlobal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	query := `SELECT ` + deviceColumns + ` FROM dm3_devices.devices WHERE id = $1::uuid`
	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(), query, id))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	httputil.JSON(w, http.StatusOK, d)
}

// UpdateDeviceGlobal handles PUT /api/v1/gateway/system/devices/{id}
// — updates any device regardless of tenant. System admin only.
func (h *GatewayHandlers) UpdateDeviceGlobal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	req, ok := h.decodeUpdateDevice(w, r)
	if !ok {
		return
	}

	query, args := updateDeviceSQL(id, req, "")
	d, err := scanDevice(h.db.Pool.QueryRow(r.Context(), query, args...))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	h.audit.LogFromRequest(r, "device.update", "device", d.ID, d.Name, "success", nil, d)
	h.pushDeviceConfig(r.Context(), d)
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
			slog.Error("GetDeviceEvents: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
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

	// dm3_access.access_events schema:
	//   id, tenant_id, time, access_point_id, door_id, user_id,
	//   user_name, credential_type, direction, decision, reason,
	//   confidence, photo_ref, temperature, decided_locally, metadata
	// There is no device_id, event_type, or method column — the Live
	// Events page should treat them as absent and fall back to display
	// defaults. user_id / door_id are uuids; we cast to text in the
	// SELECT so COALESCE to '' works.
	//
	// LEFT JOIN identity tables to enrich each row with the person's
	// department and primary active card. LIMIT 1 subquery picks the
	// oldest active card as the "primary" — good enough for a monitoring
	// display; a future refinement would look up the credential that
	// actually triggered the event if the consumer stores it.
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT ae.id::text, ae.tenant_id::text,
			COALESCE(ae.user_id::text,''),
			COALESCE(NULLIF(ae.user_name,''), TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))),
			COALESCE(u.user_code,''),
			COALESCE(u.avatar,''),
			COALESCE(ae.credential_type,''), COALESCE(ae.door_id::text,''),
			COALESCE(ae.direction,''), ae.decision,
			COALESCE(ae.reason,''), COALESCE(ae.confidence, 0), ae.time,
			COALESCE(dep.name,''),
			COALESCE(NULLIF(c.value,''), ae.metadata->>'credential_value', ''),
			COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(ae.metadata->'credential_values') AS value), '{}'),
			COALESCE(ae.metadata->'credentials', '[]'::jsonb),
			COALESCE(NULLIF(ad.device_id,''), regexp_replace(ae.metadata->>'device_id', '^device:', ''), ''),
			COALESCE(d.name,'')
		 FROM dm3_access.access_events ae
		 LEFT JOIN dm3_identity.users u ON u.id = ae.user_id
		 LEFT JOIN dm3_identity.departments dep ON dep.id = u.department_id
		 LEFT JOIN LATERAL (
			 SELECT value FROM dm3_identity.credentials
			 WHERE user_id = u.id AND type = 'card' AND status = 'active'
			 ORDER BY created_at ASC
			 LIMIT 1
		 ) c ON true
		 LEFT JOIN LATERAL (
			 SELECT apd.access_device_id AS device_id
			 FROM dm3_access.access_point_devices apd
			 WHERE apd.access_point_id = ae.access_point_id
			 ORDER BY apd.created_at ASC
			 LIMIT 1
		 ) ad ON true
		 LEFT JOIN dm3_devices.devices d
		   ON d.device_id = COALESCE(NULLIF(ad.device_id,''), regexp_replace(ae.metadata->>'device_id', '^device:', ''))
		  AND d.tenant_id = ae.tenant_id
		 WHERE ae.tenant_id = $1::uuid
		 ORDER BY ae.time DESC LIMIT $2 OFFSET $3`,
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
			ID, TenantID, UserID, UserName, UserCode, Avatar string
			CredentialType, DoorID, Direction, Decision      string
			Reason                                           string
			Confidence                                       float64
			Time                                             any
			Department, CardID, DeviceID, DeviceName         string
			CardIDs                                          []string
			CredentialsJSON                                  []byte
		}
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.UserID, &e.UserName, &e.UserCode, &e.Avatar,
			&e.CredentialType, &e.DoorID, &e.Direction, &e.Decision,
			&e.Reason, &e.Confidence, &e.Time,
			&e.Department, &e.CardID, &e.CardIDs, &e.CredentialsJSON, &e.DeviceID, &e.DeviceName,
		); err != nil {
			slog.Error("ListEvents: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		events = append(events, map[string]any{
			"id":              e.ID,
			"tenant_id":       e.TenantID,
			"device_id":       e.DeviceID,
			"device_name":     e.DeviceName,
			"user_id":         e.UserID,
			"user_name":       e.UserName,
			"user_code":       e.UserCode,
			"avatar":          e.Avatar,
			"credential_type": e.CredentialType,
			"door_id":         e.DoorID,
			"direction":       e.Direction,
			"decision":        e.Decision,
			"reason":          e.Reason,
			"confidence":      e.Confidence,
			"time":            e.Time,
			"department":      e.Department,
			"card_id":         e.CardID,
			"card_ids":        e.CardIDs,
			"credentials":     decodeCredentialsJSON(e.CredentialsJSON),
		})
	}
	httputil.JSON(w, http.StatusOK, events)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// decodeCredentialsJSON unmarshals the metadata->'credentials' jsonb column
// into a slice of {type, value} maps, suitable for direct JSON re-encoding
// to the API consumer. Returns an empty slice on any error / null / [].
func decodeCredentialsJSON(raw []byte) []map[string]string {
	if len(raw) == 0 {
		return []map[string]string{}
	}
	var arr []map[string]string
	if err := json.Unmarshal(raw, &arr); err != nil {
		return []map[string]string{}
	}
	return arr
}

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
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
