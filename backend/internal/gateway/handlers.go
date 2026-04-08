package gateway

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

type Handlers struct {
	db   *db.DB
	mqtt *mqtt.Client
}

func NewHandlers(database *db.DB, mqttClient *mqtt.Client) *Handlers {
	return &Handlers{db: database, mqtt: mqttClient}
}

// ListDevices handles GET /api/v1/devices (company-scoped)
func (h *Handlers) ListDevices(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	query := `SELECT id, tenant_id, device_id, COALESCE(name,''), type, status, COALESCE(firmware_version,''), COALESCE(site_id,''), COALESCE(location,''), last_seen, created_at, updated_at FROM dm3_devices.devices WHERE tenant_id = $1::uuid`
	args := []any{cid}
	argIdx := 2

	// Exclude pending/provisioning for company view — only show provisioned devices
	query += " AND status NOT IN ('pending')"

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
	if s := r.URL.Query().Get("site_id"); s != "" {
		query += fmt.Sprintf(" AND site_id = $%d", argIdx)
		args = append(args, s)
		argIdx++
	}

	query += " ORDER BY created_at DESC LIMIT 200"

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	devices := []models.Device{}
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status, &d.FirmwareVersion, &d.SiteID, &d.Location, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		devices = append(devices, d)
	}
	httputil.JSON(w, http.StatusOK, devices)
}

// ListDevicesGlobal handles GET /api/v1/system/devices (system admin only, all companies)
func (h *Handlers) ListDevicesGlobal(w http.ResponseWriter, r *http.Request) {
	query := `SELECT d.id, d.tenant_id, d.device_id, COALESCE(d.name,''), d.type, d.status, COALESCE(d.firmware_version,''), COALESCE(d.site_id,''), COALESCE(d.location,''), d.last_seen, d.created_at, d.updated_at, COALESCE(c.name,'') as company_name
	FROM dm3_devices.devices d LEFT JOIN dm3_auth.companies c ON c.id = d.tenant_id WHERE 1=1`
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
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type deviceWithCompany struct {
		models.Device
		CompanyName string `json:"company_name"`
	}
	devices := []deviceWithCompany{}
	for rows.Next() {
		var d deviceWithCompany
		if err := rows.Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status, &d.FirmwareVersion, &d.SiteID, &d.Location, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt, &d.CompanyName); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		devices = append(devices, d)
	}
	httputil.JSON(w, http.StatusOK, devices)
}

type createDeviceRequest struct {
	DeviceID string `json:"device_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	SiteID   string `json:"site_id"`
	Location string `json:"location"`
}

// CreateDevice handles POST /api/v1/devices
func (h *Handlers) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var req createDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DeviceID == "" || req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "device_id and type are required")
		return
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		cid = "00000000-0000-0000-0000-000000000001"
	}

	var d models.Device
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices (device_id, name, type, site_id, location, tenant_id)
		 VALUES ($1, $2, $3, $4, $5, $6::uuid)
		 RETURNING id, tenant_id, device_id, COALESCE(name,''), type, status, COALESCE(firmware_version,''), COALESCE(site_id,''), COALESCE(location,''), last_seen, created_at, updated_at`,
		req.DeviceID, req.Name, req.Type, req.SiteID, req.Location, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status, &d.FirmwareVersion, &d.SiteID, &d.Location, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			httputil.Error(w, http.StatusConflict, "device_id already exists")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, d)
}

// GetDevice handles GET /api/v1/devices/{id}
func (h *Handlers) GetDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	query := `SELECT id, tenant_id, device_id, COALESCE(name,''), type, status, COALESCE(firmware_version,''), COALESCE(site_id,''), COALESCE(location,''), last_seen, created_at, updated_at
		 FROM dm3_devices.devices WHERE id = $1::uuid`
	args := []any{id}
	if cid != "" {
		query += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}
	var d models.Device
	err := h.db.Pool.QueryRow(r.Context(), query, args...
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status, &d.FirmwareVersion, &d.SiteID, &d.Location, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	httputil.JSON(w, http.StatusOK, d)
}

type updateDeviceRequest struct {
	Name     *string `json:"name"`
	SiteID   *string `json:"site_id"`
	Location *string `json:"location"`
	Status   *string `json:"status"`
}

// UpdateDevice handles PUT /api/v1/devices/{id}
func (h *Handlers) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req updateDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	query := `UPDATE dm3_devices.devices SET
			name = COALESCE($2, name),
			site_id = COALESCE($3, site_id),
			location = COALESCE($4, location),
			status = COALESCE($5, status),
			updated_at = now()
		 WHERE id = $1::uuid`
	args := []any{id, req.Name, req.SiteID, req.Location, req.Status}
	if cid != "" {
		query += " AND tenant_id = $6::uuid"
		args = append(args, cid)
	}
	query += ` RETURNING id, tenant_id, device_id, COALESCE(name,''), type, status, COALESCE(firmware_version,''), COALESCE(site_id,''), COALESCE(location,''), last_seen, created_at, updated_at`

	var d models.Device
	err := h.db.Pool.QueryRow(r.Context(), query, args...,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status, &d.FirmwareVersion, &d.SiteID, &d.Location, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	httputil.JSON(w, http.StatusOK, d)
}

// DeleteDevice handles DELETE /api/v1/devices/{id}
func (h *Handlers) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	query := `DELETE FROM dm3_devices.devices WHERE id = $1::uuid`
	args := []any{id}
	if cid != "" {
		query += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}

	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type sendCommandRequest struct {
	Type string         `json:"type"`
	Data map[string]any `json:"data"`
}

// SendCommand handles POST /api/v1/devices/{id}/command
func (h *Handlers) SendCommand(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req sendCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "type is required")
		return
	}

	// Look up device to get tenant_id and device_id (company-scoped)
	cid := authsvc.CompanyIDFromContext(r.Context())
	var companyID, deviceID string
	cmdQuery := `SELECT tenant_id, device_id FROM dm3_devices.devices WHERE id = $1::uuid`
	cmdArgs := []any{id}
	if cid != "" {
		cmdQuery += " AND tenant_id = $2::uuid"
		cmdArgs = append(cmdArgs, cid)
	}
	err := h.db.Pool.QueryRow(r.Context(), cmdQuery, cmdArgs...).Scan(&companyID, &deviceID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	// Build MQTT command envelope
	dataBytes, _ := json.Marshal(req.Data)
	envelope := MQTTEnvelope{
		Version: 1,
		ID:      fmt.Sprintf("cmd-%d", time.Now().UnixMilli()),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    req.Type,
		Data:    dataBytes,
	}
	payload, _ := json.Marshal(envelope)

	topic := fmt.Sprintf("dm/%s/device/%s/cmd", companyID, deviceID)
	if err := h.mqtt.Publish(r.Context(), topic, 2, payload); err != nil {
		slog.Error("failed to publish command", "error", err, "topic", topic)
		httputil.Error(w, http.StatusInternalServerError, "failed to send command")
		return
	}

	slog.Info("command sent", "device", deviceID, "type", req.Type, "topic", topic)
	httputil.JSON(w, http.StatusAccepted, map[string]string{
		"message":    "command sent",
		"message_id": envelope.ID,
		"topic":      topic,
	})
}

// GetDeviceEvents handles GET /api/v1/devices/{id}/events
func (h *Handlers) GetDeviceEvents(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_access.access_events WHERE door_id = $1::uuid`, id).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, time, COALESCE(access_point_id::text,''), COALESCE(door_id::text,''), COALESCE(user_id::text,''), COALESCE(user_name,''), COALESCE(credential_type,''), COALESCE(direction,''), decision, COALESCE(reason,''), metadata
		 FROM dm3_access.access_events WHERE door_id = $1::uuid ORDER BY time DESC LIMIT $2 OFFSET $3`,
		id, limit, offset)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	events := []models.AccessEvent{}
	for rows.Next() {
		var e models.AccessEvent
		var apID, doorID, userID, userName, credType, direction, reason string
		if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &apID, &doorID, &userID, &userName, &credType, &direction, &e.Decision, &reason, &e.Metadata); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if apID != "" { e.AccessPointID = &apID }
		if doorID != "" { e.DoorID = &doorID }
		if userID != "" { e.UserID = &userID }
		if userName != "" { e.UserName = &userName }
		if credType != "" { e.CredentialType = &credType }
		if direction != "" { e.Direction = &direction }
		if reason != "" { e.Reason = &reason }
		events = append(events, e)
	}
	httputil.Paginated(w, events, total, page, limit)
}

// ListEvents handles GET /api/v1/events
func (h *Handlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	cid := authsvc.CompanyIDFromContext(r.Context())

	var total int64
	if cid != "" {
		h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE tenant_id = $1::uuid`, cid).Scan(&total)
	} else {
		h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events`).Scan(&total)
	}

	var evtQuery string
	var evtArgs []any
	if cid != "" {
		evtQuery = `SELECT id, tenant_id, time, COALESCE(access_point_id::text,''), COALESCE(door_id::text,''), COALESCE(user_id::text,''), COALESCE(user_name,''), COALESCE(credential_type,''), COALESCE(direction,''), decision, COALESCE(reason,''), metadata
		 FROM dm3_access.access_events WHERE tenant_id = $1::uuid ORDER BY time DESC LIMIT $2 OFFSET $3`
		evtArgs = []any{cid, limit, offset}
	} else {
		evtQuery = `SELECT id, tenant_id, time, COALESCE(access_point_id::text,''), COALESCE(door_id::text,''), COALESCE(user_id::text,''), COALESCE(user_name,''), COALESCE(credential_type,''), COALESCE(direction,''), decision, COALESCE(reason,''), metadata
		 FROM dm3_access.access_events ORDER BY time DESC LIMIT $1 OFFSET $2`
		evtArgs = []any{limit, offset}
	}

	rows, err := h.db.Pool.Query(r.Context(), evtQuery, evtArgs...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	events := []models.AccessEvent{}
	for rows.Next() {
		var e models.AccessEvent
		var apID, doorID, userID, userName, credType, direction, reason string
		if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &apID, &doorID, &userID, &userName, &credType, &direction, &e.Decision, &reason, &e.Metadata); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if apID != "" { e.AccessPointID = &apID }
		if doorID != "" { e.DoorID = &doorID }
		if userID != "" { e.UserID = &userID }
		if userName != "" { e.UserName = &userName }
		if credType != "" { e.CredentialType = &credType }
		if direction != "" { e.Direction = &direction }
		if reason != "" { e.Reason = &reason }
		events = append(events, e)
	}
	httputil.Paginated(w, events, total, page, limit)
}

func parsePagination(r *http.Request) (int, int) {
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

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "duplicate key") || contains(err.Error(), "unique constraint"))
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
