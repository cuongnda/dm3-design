package access

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Access Points ────────────────────────────────────────────────────────────

func scanAccessPoint(row interface{ Scan(dest ...any) error }, ap *models.AccessPoint) error {
	return row.Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
		&ap.Name, &ap.Description, &ap.MapX, &ap.MapY, &ap.MapRotation,
		&ap.AccessDeviceCount, &ap.CreatedAt, &ap.UpdatedAt)
}

func (h *AccessHandlers) ListAccessPoints(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())

	where := "WHERE ap.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if v := r.URL.Query().Get("zone_id"); v != "" {
		where += fmt.Sprintf(" AND ap.zone_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND ap.name ILIKE $%d", idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_access.access_points ap "+where, countArgs...).Scan(&total)

	sortCol, sortDir := parseSorting(r, map[string]string{
		"name":                "ap.name",
		"zone_id":             "(SELECT name FROM dm3_access.zones WHERE id = ap.zone_id)",
		"access_device_count": "COUNT(DISTINCT apd.access_device_id)",
		"created_at":          "ap.created_at",
	}, "ap.name")
	query := fmt.Sprintf(`
		SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id,
		       ap.name, ap.description, ap.map_x, ap.map_y, ap.map_rotation,
		       COUNT(DISTINCT apd.access_device_id) AS access_device_count,
		       ap.created_at, ap.updated_at
		FROM dm3_access.access_points ap
		LEFT JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
		%s
		GROUP BY ap.id
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`, where, sortCol, sortDir, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list access points query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	aps := []models.AccessPoint{}
	for rows.Next() {
		var ap models.AccessPoint
		if err := scanAccessPoint(rows, &ap); err != nil {
			slog.Error("list access points scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		aps = append(aps, ap)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access points rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, aps, total, page, limit)
}

func (h *AccessHandlers) GetAccessPoint(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var ap models.AccessPoint
	err := scanAccessPoint(h.db.Pool.QueryRow(r.Context(),
		`SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id,
		        ap.name, ap.description, ap.map_x, ap.map_y, ap.map_rotation,
		        COUNT(DISTINCT apd.access_device_id) AS access_device_count,
		        ap.created_at, ap.updated_at
		 FROM dm3_access.access_points ap
		 LEFT JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
		 WHERE ap.id = $1::uuid AND ap.tenant_id = $2::uuid
		 GROUP BY ap.id`,
		id, cid,
	), &ap)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	httputil.JSON(w, http.StatusOK, ap)
}

type createAccessPointRequest struct {
	Name         string   `json:"name"`
	Description  *string  `json:"description"`
	ZoneID       *string  `json:"zone_id"`
	AccessTimeID *string  `json:"access_time_id"`
	MapX         *float64 `json:"map_x"`
	MapY         *float64 `json:"map_y"`
	MapRotation  *float64 `json:"map_rotation"`
}

func (h *AccessHandlers) CreateAccessPoint(w http.ResponseWriter, r *http.Request) {
	var req createAccessPointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	var ap models.AccessPoint
	err := scanAccessPoint(h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_points (tenant_id, zone_id, access_time_id, name, description, map_x, map_y, map_rotation)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
		 RETURNING id, tenant_id, zone_id, access_time_id, name, description, map_x, map_y, map_rotation, 0, created_at, updated_at`,
		cid, req.ZoneID, req.AccessTimeID, req.Name, req.Description, req.MapX, req.MapY, req.MapRotation,
	), &ap)
	if err != nil {
		slog.Error("create access point error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.point.create", "access_point", ap.ID, ap.Name, "success", nil, ap)
	httputil.JSON(w, http.StatusCreated, ap)
}

type updateAccessPointRequest struct {
	Name         *string  `json:"name"`
	Description  *string  `json:"description"`
	ZoneID       *string  `json:"zone_id"`
	AccessTimeID *string  `json:"access_time_id"`
	MapX         *float64 `json:"map_x"`
	MapY         *float64 `json:"map_y"`
	MapRotation  *float64 `json:"map_rotation"`
}

func (h *AccessHandlers) UpdateAccessPoint(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req updateAccessPointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var ap models.AccessPoint
	err := scanAccessPoint(h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.access_points
		 SET name           = COALESCE($2, name),
		     description    = COALESCE($3, description),
		     zone_id        = COALESCE($4::uuid, zone_id),
		     access_time_id = COALESCE($5::uuid, access_time_id),
		     map_x          = COALESCE($6, map_x),
		     map_y          = COALESCE($7, map_y),
		     map_rotation   = COALESCE($8, map_rotation),
		     updated_at     = now()
		 WHERE id = $1::uuid AND tenant_id = $9::uuid
		 RETURNING id, tenant_id, zone_id, access_time_id, name, description, map_x, map_y, map_rotation, 0, created_at, updated_at`,
		id, req.Name, req.Description, req.ZoneID, req.AccessTimeID, req.MapX, req.MapY, req.MapRotation, cid,
	), &ap)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	h.audit.LogFromRequest(r, "access.point.update", "access_point", ap.ID, ap.Name, "success", nil, ap)
	httputil.JSON(w, http.StatusOK, ap)
}

func (h *AccessHandlers) DeleteAccessPoint(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	h.audit.LogFromRequest(r, "access.point.delete", "access_point", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccessHandlers) BulkDeleteAccessPoints(w http.ResponseWriter, r *http.Request) {
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
	query := fmt.Sprintf(`DELETE FROM dm3_access.access_points WHERE tenant_id = $1::uuid AND id IN (%s)`, strings.Join(placeholders, ","))
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.point.bulk_delete", "access_point", "", "", "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── Access Point → Devices ───────────────────────────────────────────────────

// GET /access-points/:id/devices
func (h *AccessHandlers) ListAccessPointDevices(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid)`,
		apID, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT apd.id, apd.tenant_id, apd.access_point_id, apd.access_device_id, apd.role, apd.created_at
		 FROM dm3_access.access_point_devices apd
		 WHERE apd.access_point_id = $1::uuid
		 ORDER BY apd.created_at DESC`,
		apID,
	)
	if err != nil {
		slog.Error("list access point devices error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	result := []models.AccessPointDevice{}
	for rows.Next() {
		var item models.AccessPointDevice
		if err := rows.Scan(
			&item.ID, &item.TenantID, &item.AccessPointID, &item.AccessDeviceID, &item.Role, &item.CreatedAt,
		); err != nil {
			slog.Error("list access point devices scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access point devices rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": result, "total": len(result)})
}

// POST /access-points/:id/devices
func (h *AccessHandlers) AddAccessPointDevice(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req struct {
		AccessDeviceID string `json:"access_device_id"`
		Role           string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AccessDeviceID == "" {
		httputil.Error(w, http.StatusBadRequest, "access_device_id is required")
		return
	}
	if req.Role == "" {
		req.Role = "reader_in"
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_point_devices (tenant_id, access_point_id, access_device_id, role)
		 VALUES ($1::uuid, $2::uuid, $3, $4)
		 ON CONFLICT (access_point_id, access_device_id) DO UPDATE SET role = $4
		 RETURNING id`,
		cid, apID, req.AccessDeviceID, req.Role,
	).Scan(&id)
	if err != nil {
		slog.Error("add access point device error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.point.add_device", "access_point", apID, "", "success", nil, map[string]any{"access_device_id": req.AccessDeviceID})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DELETE /access-points/:id/devices/:deviceId
func (h *AccessHandlers) RemoveAccessPointDevice(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	deviceID := chi.URLParam(r, "deviceId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_point_devices
		 WHERE access_point_id = $1::uuid AND access_device_id = $2 AND tenant_id = $3::uuid`,
		apID, deviceID, cid,
	)
	if err != nil {
		slog.Error("remove access point device error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access device not in this access point")
		return
	}
	h.audit.LogFromRequest(r, "access.point.remove_device", "access_point", apID, "", "success", nil, map[string]any{"access_device_id": deviceID})
	w.WriteHeader(http.StatusNoContent)
}

// ─── Access Point → Access Groups ────────────────────────────────────────────

// GET /access-points/:id/access-groups
func (h *AccessHandlers) ListAccessPointGroups(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid)`,
		apID, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT ag.id, ag.tenant_id, ag.name,
		        COUNT(DISTINCT agu.user_id) AS user_count
		 FROM dm3_access.access_group_access_points agap
		 JOIN dm3_access.access_groups ag ON ag.id = agap.access_group_id
		 LEFT JOIN dm3_access.access_group_users agu ON agu.access_group_id = ag.id
		   AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 WHERE agap.access_point_id = $1::uuid
		 GROUP BY ag.id, ag.tenant_id, ag.name
		 ORDER BY ag.name ASC`,
		apID,
	)
	if err != nil {
		slog.Error("list access point groups error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	result := []models.AccessGroup{}
	for rows.Next() {
		var ag models.AccessGroup
		if err := rows.Scan(&ag.ID, &ag.TenantID, &ag.Name, &ag.UserCount); err != nil {
			slog.Error("list access point groups scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		result = append(result, ag)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access point groups rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": result, "total": len(result)})
}

// POST /access-points/:id/access-groups
func (h *AccessHandlers) AddAccessPointGroup(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req struct {
		AccessGroupID string `json:"access_group_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AccessGroupID == "" {
		httputil.Error(w, http.StatusBadRequest, "access_group_id is required")
		return
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_group_access_points (tenant_id, access_group_id, access_point_id)
		 VALUES ($1::uuid, $2::uuid, $3::uuid)
		 ON CONFLICT (access_group_id, access_point_id) DO NOTHING
		 RETURNING id`,
		cid, req.AccessGroupID, apID,
	).Scan(&id)
	if err != nil {
		slog.Error("add access point group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.point.add_group", "access_point", apID, "", "success", nil, map[string]any{"access_group_id": req.AccessGroupID})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DELETE /access-points/:id/access-groups/:groupId
func (h *AccessHandlers) RemoveAccessPointGroup(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	groupID := chi.URLParam(r, "groupId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_group_access_points
		 WHERE access_point_id = $1::uuid AND access_group_id = $2::uuid AND tenant_id = $3::uuid`,
		apID, groupID, cid,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access group not in this access point")
		return
	}
	h.audit.LogFromRequest(r, "access.point.remove_group", "access_point", apID, "", "success", nil, map[string]any{"access_group_id": groupID})
	w.WriteHeader(http.StatusNoContent)
}
