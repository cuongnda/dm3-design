package access

import (
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
		config_version, user_db_version, rules_version, metadata, created_at, updated_at
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
			&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Metadata,
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
		 config_version, user_db_version, rules_version, metadata, created_at, updated_at`,
		req.Name, req.Type, req.DeviceID, unlockMs, antiPassback, emergencyUnlock, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Metadata,
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
		 config_version, user_db_version, rules_version, metadata, created_at, updated_at`,
		id, req.Name, req.Status, req.State, req.Mode, req.DeviceID, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Metadata,
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

	query := fmt.Sprintf(`SELECT id, tenant_id, time, COALESCE(access_point_id::text,''),
		COALESCE(user_id::text,''), COALESCE(user_name,''), COALESCE(credential_type,''),
		COALESCE(direction,''), decision, COALESCE(reason,''), confidence, COALESCE(photo_ref,''), metadata
		FROM dm3_access.access_events %s ORDER BY time DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list events query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	events := []eventResponse{}
	for rows.Next() {
		var e eventResponse
		if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &e.AccessPointID,
			&e.UserID, &e.UserName, &e.CredentialType, &e.Direction, &e.Decision,
			&e.Reason, &e.Confidence, &e.PhotoRef, &e.Metadata); err != nil {
			slog.Error("list events scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list events rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, events, total, page, limit)
}

type eventResponse struct {
	ID             string         `json:"id"`
	TenantID       string         `json:"tenant_id"`
	Time           time.Time      `json:"time"`
	AccessPointID  string         `json:"access_point_id,omitempty"`
	UserID         string         `json:"user_id,omitempty"`
	UserName       string         `json:"user_name,omitempty"`
	CredentialType string         `json:"credential_type,omitempty"`
	Direction      string         `json:"direction,omitempty"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason,omitempty"`
	Confidence     *float64       `json:"confidence,omitempty"`
	PhotoRef       string         `json:"photo_ref,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

func (h *AccessHandlers) GetStats(w http.ResponseWriter, r *http.Request) {
	var stats models.DashboardStats
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_devices WHERE tenant_id = $1::uuid`, cid).Scan(&stats.AccessDevicesTotal)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_devices WHERE status='online' AND tenant_id = $1::uuid`, cid).Scan(&stats.AccessDevicesOnline)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_devices WHERE status='offline' AND tenant_id = $1::uuid`, cid).Scan(&stats.AccessDevicesOffline)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_devices WHERE status='warning' AND tenant_id = $1::uuid`, cid).Scan(&stats.AccessDevicesWarning)

	today := time.Now().Truncate(24 * time.Hour)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND tenant_id = $2::uuid`, today, cid).Scan(&stats.EventsToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='granted' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.GrantedToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='denied' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.DeniedToday)

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
		 config_version, user_db_version, rules_version, metadata, created_at, updated_at
		 FROM dm3_access.access_devices WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&d.ID, &d.TenantID, &d.DeviceID, &d.Name, &d.Type,
		&d.Status, &d.State, &d.Mode, &d.UnlockDurationMs, &d.AntiPassback, &d.EmergencyUnlock,
		&d.FirmwareVersion, &d.IPAddress, &d.LastEventAt, &d.LastHeartbeatAt,
		&d.ConfigVersion, &d.UserDBVersion, &d.RulesVersion, &d.Metadata,
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
