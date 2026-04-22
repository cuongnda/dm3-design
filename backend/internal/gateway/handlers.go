package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
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
	"github.com/duali/dm3-backend/pkg/objectstore"
)

type GatewayHandlers struct {
	db             *db.DB
	mqtt           *mqtt.Client
	audit          *audit.Logger
	mediaPresigner MediaPresigner             // optional; when set, cmd.snapshot embeds a presigned PUT URL
	assetPresigner objectstore.GetURLPresigner // optional; when set, ListEvents returns presigned photo_url
}

func NewGatewayHandlers(database *db.DB, mqttClient *mqtt.Client, auditLog *audit.Logger) *GatewayHandlers {
	return &GatewayHandlers{db: database, mqtt: mqttClient, audit: auditLog}
}

// WithMediaPresigner enables server-side presigning for `cmd.snapshot`. When
// set, SendCommand injects `upload_url` + `object_key` into the cmd payload
// so the device can PUT its capture directly to MinIO without a second
// round-trip. Optional: leaving it unset keeps the legacy base64-in-resp
// behavior, useful for dev environments without object storage.
func (h *GatewayHandlers) WithMediaPresigner(p MediaPresigner) *GatewayHandlers {
	h.mediaPresigner = p
	return h
}

// WithAssetPresigner lets ListEvents turn the `photo_ref` MinIO object key
// stored on each access_events row into a short-lived presigned GET URL.
// Without it, the monitor page falls back to assetUrl(photo_ref) which only
// works for legacy /photos/... avatar refs, not the per-event object keys
// kiosk/LPR devices upload under events/<tenant>/<device>/snapshot/....
func (h *GatewayHandlers) WithAssetPresigner(p objectstore.GetURLPresigner) *GatewayHandlers {
	h.assetPresigner = p
	return h
}

// ─── Shared scan helpers ────────────────────────────────────────────────────

// deviceColumns is the canonical SELECT column list for dm3_devices.devices.
const deviceColumns = `id, tenant_id, device_id, COALESCE(name,''), type, status,
	COALESCE(model,''), COALESCE(firmware_version,''), COALESCE(location,''),
	ip_address, mac_address,
	COALESCE(timezone,'Asia/Ho_Chi_Minh'), COALESCE(open_relay_ms,3000),
	verify_methods, COALESCE(verify_logic,'or'),
	door_state, last_seen, created_at, updated_at`

func scanDevice(row pgx.Row) (models.Device, error) {
	var d models.Device
	err := row.Scan(
		&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status,
		&d.Model, &d.FirmwareVersion, &d.Location,
		&d.IPAddress, &d.MACAddress,
		&d.Timezone, &d.OpenRelayMs,
		&d.VerifyMethods, &d.VerifyLogic,
		&d.DoorState, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
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
			&d.DoorState, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// ─── List Devices (company-scoped) ──────────────────────────────────────────

// ListDevices returns devices (door controllers, terminals, cameras) in the caller's tenant.
//
// @Summary      List devices
// @Description  Each row includes online status, firmware version, and a comma-separated list of the access points the device is bound to.
// @Tags         Devices
// @Produce      json
// @Param        status  query  string  false  "Filter by connection status"  Enums(online, offline, warning)
// @Param        type    query  string  false  "Filter by device type"        Enums(terminal, controller, camera, sensor)
// @Param        search  query  string  false  "Filter by device id, name, or location"
// @Success      200     {object}  map[string]interface{}  "Paginated list"
// @Failure      403     {object}  httputil.ErrorResponse
// @Router       /gateway/devices [get]
// @Security     BearerAuth
func (h *GatewayHandlers) ListDevices(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	// A device can be bound to multiple access points through
	// dm3_access.access_point_devices (access_device_id is TEXT holding
	// devices.id). We aggregate all linked access point names into a single
	// comma-separated string so the list endpoint stays a flat row.
	query := `SELECT d.id, d.tenant_id, d.device_id, COALESCE(d.name,''), d.type, d.status,
		COALESCE(d.model,''), COALESCE(d.firmware_version,''), COALESCE(d.location,''),
		d.ip_address, d.mac_address,
		COALESCE(d.timezone,'Asia/Ho_Chi_Minh'), COALESCE(d.open_relay_ms,3000),
		d.verify_methods, COALESCE(d.verify_logic,'or'),
		d.door_state, d.last_seen, d.created_at, d.updated_at,
		(SELECT STRING_AGG(ap.name, ', ' ORDER BY ap.name)
		 FROM dm3_access.access_point_devices apd
		 JOIN dm3_access.access_points ap ON ap.id = apd.access_point_id
		 WHERE apd.access_device_id = d.id::text AND apd.tenant_id = d.tenant_id) AS access_points
		FROM dm3_devices.devices d WHERE d.tenant_id = $1::uuid`
	args := []any{cid}
	argIdx := 2

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
		slog.Error("ListDevices: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	devices := []models.Device{}
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type, &d.Status,
			&d.Model, &d.FirmwareVersion, &d.Location,
			&d.IPAddress, &d.MACAddress,
			&d.Timezone, &d.OpenRelayMs,
			&d.VerifyMethods, &d.VerifyLogic,
			&d.DoorState, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
			&d.AccessPoints,
		); err != nil {
			slog.Error("ListDevices: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		slog.Error("ListDevices: rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
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
		d.door_state, d.last_seen, d.created_at, d.updated_at,
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
	if m := r.URL.Query().Get("model"); m != "" {
		query += fmt.Sprintf(" AND d.model = $%d", argIdx)
		args = append(args, m)
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
			&d.DoorState, &d.LastSeen, &d.CreatedAt, &d.UpdatedAt,
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

// CreateDevice registers a new device manually (non-provisioning path).
//
// @Summary      Create a device
// @Description  For production use, prefer the provisioning QR flow. This endpoint is a direct write for integrations that manage device inventory externally.
// @Tags         Devices
// @Accept       json
// @Produce      json
// @Param        body  body  map[string]interface{}  true  "Device fields: device_id (hardware id, required), name, type, model, location, firmware_version"
// @Success      201   {object}  map[string]interface{}
// @Failure      400   {object}  httputil.ErrorResponse
// @Failure      409   {object}  httputil.ErrorResponse  "device_id already registered"
// @Router       /gateway/devices [post]
// @Security     BearerAuth
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

// GetDevice returns a single device by id.
//
// @Summary      Get a device
// @Tags         Devices
// @Produce      json
// @Param        id   path  string  true  "Device ID (UUID)"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  httputil.ErrorResponse
// @Router       /gateway/devices/{id} [get]
// @Security     BearerAuth
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
	// Attach the device's current access-point binding (first one if
	// multiple) so the edit page can preselect it in the AP dropdown.
	if apID, apErr := fetchDeviceAccessPointID(r.Context(), h.db, d.ID, d.TenantID); apErr == nil && apID != "" {
		ap := apID
		d.AccessPointID = &ap
	}
	httputil.JSON(w, http.StatusOK, d)
}

// fetchDeviceAccessPointID returns the first access-point UUID bound to the
// device, or "" when there is no binding. A device can technically appear in
// multiple access points (in/out readers on a door), so picking the first is
// a UI convenience — the full set is still managed from the Access Points
// page. Errors other than "no rows" bubble up.
func fetchDeviceAccessPointID(ctx context.Context, database *db.DB, deviceID, tenantID string) (string, error) {
	var apID string
	err := database.Pool.QueryRow(ctx,
		`SELECT access_point_id::text
		 FROM dm3_access.access_point_devices
		 WHERE access_device_id = $1 AND tenant_id = $2::uuid
		 ORDER BY created_at ASC
		 LIMIT 1`,
		deviceID, tenantID,
	).Scan(&apID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return apID, err
}

// applyDeviceAccessPointBinding replaces all existing bindings for the given
// device with a single binding to newAPID. When newAPID is empty the device
// is simply detached from every access point. Scoped to tenantID so a
// system-admin edit still can't leak bindings across tenants.
func applyDeviceAccessPointBinding(ctx context.Context, database *db.DB, deviceID, tenantID, newAPID string) error {
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`DELETE FROM dm3_access.access_point_devices
		 WHERE access_device_id = $1 AND tenant_id = $2::uuid`,
		deviceID, tenantID,
	); err != nil {
		return fmt.Errorf("clear bindings: %w", err)
	}
	if newAPID != "" {
		if _, err := tx.Exec(ctx,
			`INSERT INTO dm3_access.access_point_devices
			   (tenant_id, access_point_id, access_device_id, role)
			 VALUES ($2::uuid, $3::uuid, $1, 'reader_in')
			 ON CONFLICT (access_point_id, access_device_id) DO NOTHING`,
			deviceID, tenantID, newAPID,
		); err != nil {
			return fmt.Errorf("insert binding: %w", err)
		}
	}
	return tx.Commit(ctx)
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
	// AccessPointID, when non-nil, replaces the device's access-point
	// bindings with the single UUID supplied. An empty string detaches the
	// device from every access point. A nil pointer leaves bindings alone.
	AccessPointID *string `json:"access_point_id"`
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

// UpdateDevice updates a device by id.
//
// @Summary      Update a device
// @Description  Partial update. Changes to verify_methods or open_relay_ms take effect after the next config sync cycle.
// @Tags         Devices
// @Accept       json
// @Produce      json
// @Param        id    path   string                  true  "Device ID (UUID)"
// @Param        body  body   map[string]interface{}  true  "Device fields to update"
// @Success      200   {object}  map[string]interface{}
// @Failure      404   {object}  httputil.ErrorResponse
// @Router       /gateway/devices/{id} [put]
// @Security     BearerAuth
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
	if req.AccessPointID != nil {
		if err := applyDeviceAccessPointBinding(r.Context(), h.db, d.ID, d.TenantID, *req.AccessPointID); err != nil {
			slog.Error("UpdateDevice: apply access point binding failed", "error", err, "device_id", d.ID)
			httputil.Error(w, http.StatusInternalServerError, "failed to update access point binding")
			return
		}
		ap := *req.AccessPointID
		if ap != "" {
			d.AccessPointID = &ap
		} else {
			d.AccessPointID = nil
		}
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
	h.pushDeviceConfigJob(ctx, d, nil)
}

// pushDeviceConfigJob is the same push but tagged with a SyncJobContext so
// the manual transmit flow can track index/total and progress.
func (h *GatewayHandlers) pushDeviceConfigJob(ctx context.Context, d models.Device, jobCtx *SyncJobContext) {
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
	if jobCtx != nil {
		envelope.JobID = jobCtx.JobID
		envelope.Index = 1
		envelope.Total = 1
		jobCtx.Registry.SetTypeTotal(jobCtx.JobID, jobCtx.Type, 1)
	}
	envBytes, err := json.Marshal(envelope)
	if err != nil {
		slog.Error("pushDeviceConfig: marshal envelope", "error", err, "device_id", d.DeviceID)
		return
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", d.TenantID, d.DeviceID)
	// Retain=true so the broker keeps the latest cfg.device_update per
	// device-cfg topic. Without retain, a change applied while the device
	// is offline gets silently dropped — the device never sees it even
	// after reconnecting. This is how the reported timezone-change-not-
	// reaching-device bug manifested: admin edits while the terminal is
	// briefly offline → MQTT fan-out finds no subscribers → message is
	// gone → terminal comes back and keeps using the old timezone until
	// the next edit (or manual "Transmit data"). One subscriber per cfg
	// topic (the device itself) means retained has no fan-out concern.
	if err := h.mqtt.PublishRetained(ctx, topic, 2, envBytes); err != nil {
		slog.Error("pushDeviceConfig: mqtt publish failed",
			"error", err, "topic", topic, "device_id", d.DeviceID)
		return
	}
	if jobCtx != nil {
		jobCtx.Registry.IncrementPublished(jobCtx.JobID, jobCtx.Type)
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
	if apID, apErr := fetchDeviceAccessPointID(r.Context(), h.db, d.ID, d.TenantID); apErr == nil && apID != "" {
		ap := apID
		d.AccessPointID = &ap
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
	if req.AccessPointID != nil {
		if err := applyDeviceAccessPointBinding(r.Context(), h.db, d.ID, d.TenantID, *req.AccessPointID); err != nil {
			slog.Error("UpdateDeviceGlobal: apply access point binding failed", "error", err, "device_id", d.ID)
			httputil.Error(w, http.StatusInternalServerError, "failed to update access point binding")
			return
		}
		ap := *req.AccessPointID
		if ap != "" {
			d.AccessPointID = &ap
		} else {
			d.AccessPointID = nil
		}
	}
	h.audit.LogFromRequest(r, "device.update", "device", d.ID, d.Name, "success", nil, d)
	h.pushDeviceConfig(r.Context(), d)
	httputil.JSON(w, http.StatusOK, d)
}

// ─── Delete Device ──────────────────────────────────────────────────────────

// DeleteDevice removes a device by id.
//
// @Summary      Delete a device
// @Description  Permanently removes the device. Any offline cached credentials on the device remain until it syncs and discovers it has been revoked.
// @Tags         Devices
// @Produce      json
// @Param        id   path   string  true  "Device ID (UUID)"
// @Success      200  {object}  map[string]string  "status: deleted"
// @Failure      404  {object}  httputil.ErrorResponse
// @Router       /gateway/devices/{id} [delete]
// @Security     BearerAuth
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

	// For cmd.snapshot, presign a PUT URL up front and embed it in the payload
	// so the device can stream its capture straight to MinIO. See
	// docs/architecture/mqtt-protocol.md §6.4 + §15.5. If presigning isn't
	// configured (no object storage in this env) we fall through and ship the
	// command without an URL — devices that haven't been updated still respond
	// the legacy way.
	data := req.Data
	if req.Type == "cmd.snapshot" && h.mediaPresigner != nil {
		uploadURL, objectKey, expiresAt, perr := IssueSnapshotPutURL(
			r.Context(), h.mediaPresigner, tenantID, deviceID, 5*time.Minute,
		)
		if perr != nil {
			slog.Warn("SendCommand: snapshot presign failed; sending without upload_url",
				"device_id", deviceID, "error", perr)
		} else {
			if data == nil {
				data = map[string]any{}
			}
			data["upload_url"] = uploadURL
			data["object_key"] = objectKey
			data["upload_expires_at"] = expiresAt.UTC().Format(time.RFC3339)
		}
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cmd", tenantID, deviceID)
	payload, _ := json.Marshal(map[string]any{
		"type": req.Type,
		"data": data,
	})

	if err := h.mqtt.Publish(r.Context(), topic, 2, payload); err != nil {
		slog.Error("SendCommand: mqtt publish failed", "error", err, "topic", topic)
		httputil.Error(w, http.StatusInternalServerError, "failed to send command")
		return
	}

	h.audit.LogFromRequest(r, "device.command", "device", id, deviceID, "success", nil, map[string]any{"command": req.Type})

	actorID, actorEmail := audit.ActorFromContext(r.Context())
	go InsertDeviceEvent(context.Background(), h.db.Pool, DeviceEvent{
		TenantID:    tenantID,
		DeviceID:    deviceID,
		EventType:   "command",
		Description: fmt.Sprintf("Command sent: %s", req.Type),
		ActorID:     strPtr(actorID),
		ActorEmail:  strPtr(actorEmail),
		Metadata:    map[string]any{"command": req.Type},
	})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "sent", "topic": topic})
}

// ─── Remote Door Control ────────────────────────────────────────────────────
//
// Fans out a `cmd.door` MQTT command (as defined in docs/architecture/mqtt-protocol.md §6.1)
// to every device bound to the given access point. Used by the console's
// "Remote unlock" action. Rejects the whole request if any bound device is
// offline so an operator never gets a half-unlocked door.

type doorCommandRequest struct {
	Action     string `json:"action"`      // unlock | lock | hold_open | hold_close | release
	DurationMS *int   `json:"duration_ms"` // for unlock / hold_open; ignored for hold_close (indefinite)
	Reason     string `json:"reason"`      // free-form, e.g. "remote_command"
}

type doorCommandDispatchedDevice struct {
	ID       string `json:"id"`        // devices.id (UUID)
	DeviceID string `json:"device_id"` // devices.device_id (human id)
	Name     string `json:"name"`
}

type doorCommandOfflineDevice struct {
	ID       string `json:"id"`
	DeviceID string `json:"device_id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
}

// doorCommandResult is the per-access-point outcome in a bulk response, and
// also drives the single-AP path for consistency. `status` is one of:
//
//	ok         — MQTT command published to every bound device
//	no_devices — AP has no bound devices (treated as skip, not error)
//	offline    — one or more bound devices is not online; nothing published
//	failed     — DB or MQTT publish error while dispatching
type doorCommandResult struct {
	AccessPointID  string                        `json:"access_point_id"`
	Status         string                        `json:"status"`
	Devices        []doorCommandDispatchedDevice `json:"devices,omitempty"`
	OfflineDevices []doorCommandOfflineDevice    `json:"offline_devices,omitempty"`
	Error          string                        `json:"error,omitempty"`
}

// validateDoorAction returns ("", true) on success or an error message + false.
func validateDoorAction(req doorCommandRequest) (string, bool) {
	switch req.Action {
	case "unlock", "lock", "hold_open", "hold_close", "release":
	default:
		return "action must be one of: unlock, lock, hold_open, hold_close, release", false
	}
	if (req.Action == "unlock" || req.Action == "hold_open") && req.DurationMS != nil && *req.DurationMS <= 0 {
		return "duration_ms must be positive", false
	}
	return "", true
}

// dispatchDoorCommand runs the full per-AP flow (device lookup → online check
// → MQTT publish → audit). Returns a structured result; the caller decides how
// to map it to an HTTP status. Never returns an error — every failure becomes
// a `Status` value so bulk callers can aggregate cleanly.
func (h *GatewayHandlers) dispatchDoorCommand(
	ctx context.Context,
	tenantID, operatorID, accessPointID string,
	req doorCommandRequest,
	reason string,
	auditor func(accessPointID string, result doorCommandResult),
) doorCommandResult {
	result := doorCommandResult{AccessPointID: accessPointID}

	rows, err := h.db.Pool.Query(ctx, `
		SELECT d.id::text, d.device_id, COALESCE(d.name, ''), COALESCE(d.status, 'offline'), COALESCE(d.open_relay_ms, 3000)
		FROM dm3_access.access_point_devices apd
		JOIN dm3_devices.devices d ON d.id::text = apd.access_device_id
		WHERE apd.access_point_id = $1::uuid
		  AND apd.tenant_id = $2::uuid
		  AND d.tenant_id = $2::uuid
	`, accessPointID, tenantID)
	if err != nil {
		slog.Error("dispatchDoorCommand: query bound devices", "error", err, "access_point_id", accessPointID)
		result.Status = "failed"
		result.Error = "failed to query bound devices"
		if auditor != nil {
			auditor(accessPointID, result)
		}
		return result
	}
	defer rows.Close()

	type boundDevice struct {
		ID, DeviceID, Name, Status string
		OpenRelayMS                int
	}
	var bound []boundDevice
	for rows.Next() {
		var b boundDevice
		if err := rows.Scan(&b.ID, &b.DeviceID, &b.Name, &b.Status, &b.OpenRelayMS); err != nil {
			result.Status = "failed"
			result.Error = "failed to scan bound devices"
			if auditor != nil {
				auditor(accessPointID, result)
			}
			return result
		}
		bound = append(bound, b)
	}
	if len(bound) == 0 {
		result.Status = "no_devices"
		if auditor != nil {
			auditor(accessPointID, result)
		}
		return result
	}

	// Reject the command outright if any bound device is offline.
	var offline []doorCommandOfflineDevice
	for _, b := range bound {
		if b.Status != "online" {
			offline = append(offline, doorCommandOfflineDevice{
				ID: b.ID, DeviceID: b.DeviceID, Name: b.Name, Status: b.Status,
			})
		}
	}
	if len(offline) > 0 {
		result.Status = "offline"
		result.OfflineDevices = offline
		if auditor != nil {
			auditor(accessPointID, result)
		}
		return result
	}

	dispatched := make([]doorCommandDispatchedDevice, 0, len(bound))
	for _, b := range bound {
		data := map[string]any{
			"action":      req.Action,
			"door_id":     accessPointID,
			"reason":      reason,
			"operator_id": operatorID,
		}
		if req.Action == "unlock" || req.Action == "hold_open" {
			if req.DurationMS != nil {
				data["duration_ms"] = *req.DurationMS
			} else {
				data["duration_ms"] = b.OpenRelayMS
			}
		}
		payload, err := json.Marshal(map[string]any{
			"type": "cmd.door",
			"data": data,
		})
		if err != nil {
			result.Status = "failed"
			result.Error = "failed to marshal payload"
			if auditor != nil {
				auditor(accessPointID, result)
			}
			return result
		}
		topic := fmt.Sprintf("dm/%s/device/%s/cmd", tenantID, b.DeviceID)
		if err := h.mqtt.Publish(ctx, topic, 2, payload); err != nil {
			slog.Error("dispatchDoorCommand: mqtt publish failed", "error", err, "topic", topic, "device", b.DeviceID)
			result.Status = "failed"
			result.Error = "mqtt publish failed"
			if auditor != nil {
				auditor(accessPointID, result)
			}
			return result
		}
		dispatched = append(dispatched, doorCommandDispatchedDevice{
			ID: b.ID, DeviceID: b.DeviceID, Name: b.Name,
		})
	}

	result.Status = "ok"
	result.Devices = dispatched

	// Update door_state on dispatched devices based on the action.
	var newState string
	switch req.Action {
	case "unlock":
		newState = "open"
	case "lock":
		newState = "closed"
	case "hold_open":
		newState = "held_open"
	case "hold_close":
		newState = "held_close"
	case "release":
		newState = "closed"
	}
	if newState != "" {
		for _, d := range dispatched {
			_, _ = h.db.Pool.Exec(ctx,
				`UPDATE dm3_devices.devices SET door_state = $1, updated_at = now()
				  WHERE device_id = $2 AND tenant_id = $3::uuid`,
				newState, d.DeviceID, tenantID)
		}
	}

	if auditor != nil {
		auditor(accessPointID, result)
	}
	return result
}

func (h *GatewayHandlers) SendDoorCommand(w http.ResponseWriter, r *http.Request) {
	accessPointID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req doorCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg, ok := validateDoorAction(req); !ok {
		httputil.Error(w, http.StatusBadRequest, msg)
		return
	}

	var operatorID string
	if claims := authsvc.ClaimsFromContext(r.Context()); claims != nil {
		operatorID = claims.Sub
	}
	reason := req.Reason
	if reason == "" {
		reason = "remote_command"
	}

	auditor := func(apID string, res doorCommandResult) {
		h.audit.LogFromRequest(r, "access.door.command", "access_point", apID, "", res.Status, nil, map[string]any{
			"action":      req.Action,
			"duration_ms": req.DurationMS,
			"reason":      reason,
			"result":      res,
		})
	}

	result := h.dispatchDoorCommand(r.Context(), cid, operatorID, accessPointID, req, reason, auditor)

	// Record device history for each device that received the command.
	if result.Status == "ok" {
		actorID, actorEmail := audit.ActorFromContext(r.Context())
		for _, dev := range result.Devices {
			go InsertDeviceEvent(context.Background(), h.db.Pool, DeviceEvent{
				TenantID:    cid,
				DeviceID:    dev.DeviceID,
				EventType:   "door_command",
				Description: fmt.Sprintf("Door %s command", req.Action),
				ActorID:     strPtr(actorID),
				ActorEmail:  strPtr(actorEmail),
				Metadata:    map[string]any{"action": req.Action, "duration_ms": req.DurationMS, "reason": reason},
			})
		}
	}

	// Preserve the original single-AP error contract: 404 for no devices, 409
	// for offline, 500 for failure, 202 for dispatched.
	switch result.Status {
	case "ok":
		httputil.JSON(w, http.StatusAccepted, map[string]any{
			"status":  "dispatched",
			"action":  req.Action,
			"devices": result.Devices,
		})
	case "no_devices":
		httputil.Error(w, http.StatusNotFound, "access point has no bound devices")
	case "offline":
		httputil.JSON(w, http.StatusConflict, map[string]any{
			"error":           "Some bound devices are offline",
			"offline_devices": result.OfflineDevices,
		})
	default:
		httputil.Error(w, http.StatusInternalServerError, "failed to publish door command")
	}
}

// BulkDoorCommand runs the same per-AP flow across a list of access points and
// returns a structured per-AP result set. Always 200 unless the request itself
// is invalid — individual AP failures are surfaced in the body so the caller
// can show a per-row outcome without the all-or-nothing of HTTP status codes.

type bulkDoorCommandRequest struct {
	AccessPointIDs []string `json:"access_point_ids"`
	Action         string   `json:"action"`
	DurationMS     *int     `json:"duration_ms"`
	Reason         string   `json:"reason"`
}

func (h *GatewayHandlers) BulkDoorCommand(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req bulkDoorCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.AccessPointIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "access_point_ids must not be empty")
		return
	}
	if len(req.AccessPointIDs) > 200 {
		httputil.Error(w, http.StatusBadRequest, "access_point_ids cannot exceed 200 per request")
		return
	}
	inner := doorCommandRequest{Action: req.Action, DurationMS: req.DurationMS, Reason: req.Reason}
	if msg, ok := validateDoorAction(inner); !ok {
		httputil.Error(w, http.StatusBadRequest, msg)
		return
	}

	var operatorID string
	if claims := authsvc.ClaimsFromContext(r.Context()); claims != nil {
		operatorID = claims.Sub
	}
	reason := req.Reason
	if reason == "" {
		reason = "remote_command"
	}

	results := make([]doorCommandResult, 0, len(req.AccessPointIDs))
	summary := map[string]int{"ok": 0, "no_devices": 0, "offline": 0, "failed": 0}
	for _, apID := range req.AccessPointIDs {
		res := h.dispatchDoorCommand(r.Context(), cid, operatorID, apID, inner, reason, nil)
		results = append(results, res)
		summary[res.Status]++
	}

	// Record device history for each successfully dispatched device.
	actorID, actorEmail := audit.ActorFromContext(r.Context())
	for _, res := range results {
		if res.Status != "ok" {
			continue
		}
		for _, dev := range res.Devices {
			go InsertDeviceEvent(context.Background(), h.db.Pool, DeviceEvent{
				TenantID:    cid,
				DeviceID:    dev.DeviceID,
				EventType:   "door_command",
				Description: fmt.Sprintf("Door %s command (bulk)", req.Action),
				ActorID:     strPtr(actorID),
				ActorEmail:  strPtr(actorEmail),
				Metadata:    map[string]any{"action": req.Action, "duration_ms": req.DurationMS, "reason": reason},
			})
		}
	}

	// One audit entry for the whole batch — avoids flooding the audit log with
	// N rows per bulk action while still capturing enough to reproduce the op.
	h.audit.LogFromRequest(r, "access.door.bulk_command", "access_point", "", "", "success", nil, map[string]any{
		"action":      req.Action,
		"duration_ms": req.DurationMS,
		"reason":      reason,
		"summary":     summary,
		"results":     results,
	})

	httputil.JSON(w, http.StatusOK, map[string]any{
		"action":  req.Action,
		"summary": summary,
		"results": results,
	})
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
		`SELECT id, tenant_id, device_id, event_type,
			COALESCE(description,''), COALESCE(actor_id::text,''), COALESCE(actor_email,''),
			COALESCE(metadata,'{}'), time
		 FROM dm3_devices.device_events
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
			ID, TenantID, DeviceID, EventType string
			Description, ActorID, ActorEmail   string
			Metadata                           []byte
			Time                               interface{}
		}
		if err := rows.Scan(&e.ID, &e.TenantID, &e.DeviceID, &e.EventType,
			&e.Description, &e.ActorID, &e.ActorEmail, &e.Metadata, &e.Time); err != nil {
			slog.Error("GetDeviceEvents: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		events = append(events, map[string]any{
			"id":          e.ID,
			"tenant_id":   e.TenantID,
			"device_id":   e.DeviceID,
			"event_type":  e.EventType,
			"description": e.Description,
			"actor_id":    e.ActorID,
			"actor_email": e.ActorEmail,
			"time":        e.Time,
		})
	}
	httputil.JSON(w, http.StatusOK, events)
}

// GetDeviceHistory returns lifecycle events (on/off, commands, syncs, errors)
// from dm3_devices.device_events for a single device.
func (h *GatewayHandlers) GetDeviceHistory(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	// Look up device_id and tenant_id from the device row.
	// System admins don't have a company context, so we resolve tenant from the device.
	var deviceID, tenantID string
	dq := `SELECT device_id, tenant_id FROM dm3_devices.devices WHERE id = $1::uuid`
	dqArgs := []any{deviceDBID}
	if cid != "" {
		dq += " AND tenant_id = $2::uuid"
		dqArgs = append(dqArgs, cid)
	}
	if err := h.db.Pool.QueryRow(r.Context(), dq, dqArgs...).Scan(&deviceID, &tenantID); err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	page, limit := parsePagination(r)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, time, device_id, event_type, description,
		        COALESCE(actor_id::text,''), COALESCE(actor_email,''), metadata
		   FROM dm3_devices.device_events
		  WHERE device_id = $1 AND tenant_id = $2::uuid
		  ORDER BY time DESC LIMIT $3 OFFSET $4`,
		deviceID, tenantID, limit, (page-1)*limit)
	if err != nil {
		slog.Error("GetDeviceHistory: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	var countTotal int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT count(*) FROM dm3_devices.device_events WHERE device_id = $1 AND tenant_id = $2::uuid`,
		deviceID, tenantID).Scan(&countTotal)

	events := []map[string]any{}
	for rows.Next() {
		var (
			id, tenantID, devID, eventType, description string
			actorID, actorEmail                         string
			ts                                          time.Time
			metadata                                    json.RawMessage
		)
		if err := rows.Scan(&id, &tenantID, &ts, &devID, &eventType, &description,
			&actorID, &actorEmail, &metadata); err != nil {
			slog.Error("GetDeviceHistory: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		events = append(events, map[string]any{
			"id":          id,
			"time":        ts,
			"device_id":   devID,
			"event_type":  eventType,
			"description": description,
			"actor_id":    actorID,
			"actor_email": actorEmail,
			"metadata":    json.RawMessage(metadata),
		})
	}
	httputil.JSON(w, http.StatusOK, map[string]any{
		"data":  events,
		"total": countTotal,
		"page":  page,
		"limit": limit,
	})
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
	// Device resolution (2026-04 fix):
	//
	// access_point_devices.access_device_id stores the UUID of
	// dm3_devices.devices.id as TEXT (see internal/access/access_point_handlers.go
	// and internal/access/nats_consumer.go — both join d.id::text = apd.access_device_id).
	// The previous version here joined d.device_id against apd.access_device_id,
	// comparing a human literal ("840100") against a UUID — never matched,
	// so d.name came back empty and the raw UUID was returned as device_id.
	//
	// Resolution order, authoritative first:
	//
	//  1. d_pub — publisher resolved from ae.metadata->>'device_id', which
	//     the NATS consumer sets from the MQTT envelope's evt.Src. This is
	//     the device that ACTUALLY published the event, so it's the true
	//     source of truth for the monitoring column.
	//
	//  2. d_link — first device bound to the event's access point via
	//     access_point_devices. Used only when the event has no publisher
	//     metadata (e.g. parking-svc ingests that don't come from MQTT).
	//     An access point may have multiple readers; the earliest linked
	//     device wins here, which is a best-effort display choice.
	//
	//  3. Raw metadata string, echoed unresolved when no devices row exists.
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
			COALESCE(
				NULLIF(d_pub.device_id, ''),
				NULLIF(d_link.device_id, ''),
				regexp_replace(ae.metadata->>'device_id', '^device:', ''),
				''
			),
			COALESCE(d_pub.name, d_link.name, ''),
			COALESCE(ae.photo_ref,'')
		 FROM dm3_access.access_events ae
		 LEFT JOIN dm3_identity.users u ON u.id = ae.user_id
		 LEFT JOIN dm3_identity.departments dep ON dep.id = u.department_id
		 LEFT JOIN LATERAL (
			 SELECT value FROM dm3_identity.credentials
			 WHERE user_id = u.id AND type = 'card' AND status = 'active'
			 ORDER BY created_at ASC
			 LIMIT 1
		 ) c ON true
		 LEFT JOIN dm3_devices.devices d_pub
		   ON d_pub.tenant_id = ae.tenant_id
		  AND d_pub.device_id = regexp_replace(ae.metadata->>'device_id', '^device:', '')
		  AND ae.metadata ? 'device_id'
		 LEFT JOIN LATERAL (
			 SELECT d.device_id, d.name
			 FROM dm3_access.access_point_devices apd
			 JOIN dm3_devices.devices d ON d.id::text = apd.access_device_id
			 WHERE apd.access_point_id = ae.access_point_id
			   AND d.tenant_id = ae.tenant_id
			 ORDER BY apd.created_at ASC
			 LIMIT 1
		 ) d_link ON true
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
			PhotoRef                                         string
			CardIDs                                          []string
			CredentialsJSON                                  []byte
		}
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.UserID, &e.UserName, &e.UserCode, &e.Avatar,
			&e.CredentialType, &e.DoorID, &e.Direction, &e.Decision,
			&e.Reason, &e.Confidence, &e.Time,
			&e.Department, &e.CardID, &e.CardIDs, &e.CredentialsJSON, &e.DeviceID, &e.DeviceName,
			&e.PhotoRef,
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
			"photo_ref":       e.PhotoRef,
			"photo_url":       presignEventPhoto(r.Context(), h.assetPresigner, e.PhotoRef),
		})
	}
	httputil.JSON(w, http.StatusOK, events)
}

// presignEventPhoto returns a 5-minute presigned GET URL when photoRef is
// a MinIO object key uploaded via the device media-url flow (see
// docs/architecture/mqtt-protocol.md §15). Returns empty string for legacy
// /photos/... refs, empty input, or when no presigner is wired. On presign
// error, logs and returns empty so the frontend can fall back to
// assetUrl(photo_ref). This mirrors access-svc's presignPhotoIfMinIOKey;
// duplicated here because gateway and access-svc can't share private helpers.
func presignEventPhoto(ctx context.Context, presigner objectstore.GetURLPresigner, photoRef string) string {
	if photoRef == "" || presigner == nil {
		return ""
	}
	if !strings.HasPrefix(photoRef, "events/") {
		return ""
	}
	u, err := presigner.PresignedGetURL(ctx, photoRef, 5*time.Minute)
	if err != nil {
		slog.Warn("gateway ListEvents: presign photo failed", "key", photoRef, "error", err)
		return ""
	}
	return u.String()
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
