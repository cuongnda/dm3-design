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

	query := fmt.Sprintf(`
		SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id,
		       ap.name, ap.description,
		       COUNT(DISTINCT apd.door_id) AS door_count,
		       ap.created_at, ap.updated_at
		FROM dm3_access.access_points ap
		LEFT JOIN dm3_access.access_point_doors apd ON apd.access_point_id = ap.id
		%s
		GROUP BY ap.id
		ORDER BY ap.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list access points query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	aps := []models.AccessPoint{}
	for rows.Next() {
		var ap models.AccessPoint
		if err := rows.Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
			&ap.Name, &ap.Description, &ap.DoorCount,
			&ap.CreatedAt, &ap.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		aps = append(aps, ap)
	}
	httputil.Paginated(w, aps, total, page, limit)
}

func (h *AccessHandlers) GetAccessPoint(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var ap models.AccessPoint
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id,
		        ap.name, ap.description,
		        COUNT(DISTINCT apd.door_id) AS door_count,
		        ap.created_at, ap.updated_at
		 FROM dm3_access.access_points ap
		 LEFT JOIN dm3_access.access_point_doors apd ON apd.access_point_id = ap.id
		 WHERE ap.id = $1::uuid AND ap.tenant_id = $2::uuid
		 GROUP BY ap.id`,
		id, cid,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
		&ap.Name, &ap.Description, &ap.DoorCount,
		&ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	httputil.JSON(w, http.StatusOK, ap)
}

type createAccessPointRequest struct {
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	ZoneID       *string `json:"zone_id"`
	AccessTimeID *string `json:"access_time_id"`
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
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_points (tenant_id, zone_id, access_time_id, name, description)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
		 RETURNING id, tenant_id, zone_id, access_time_id, name, description, 0, created_at, updated_at`,
		cid, req.ZoneID, req.AccessTimeID, req.Name, req.Description,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
		&ap.Name, &ap.Description, &ap.DoorCount,
		&ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		slog.Error("create access point error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, ap)
}

type updateAccessPointRequest struct {
	Name         *string `json:"name"`
	Description  *string `json:"description"`
	ZoneID       *string `json:"zone_id"`
	AccessTimeID *string `json:"access_time_id"`
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
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.access_points
		 SET name          = COALESCE($2, name),
		     description   = COALESCE($3, description),
		     zone_id       = COALESCE($4::uuid, zone_id),
		     access_time_id = COALESCE($5::uuid, access_time_id),
		     updated_at    = now()
		 WHERE id = $1::uuid AND tenant_id = $6::uuid
		 RETURNING id, tenant_id, zone_id, access_time_id, name, description, 0, created_at, updated_at`,
		id, req.Name, req.Description, req.ZoneID, req.AccessTimeID, cid,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
		&ap.Name, &ap.Description, &ap.DoorCount,
		&ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	httputil.JSON(w, http.StatusOK, ap)
}

func (h *AccessHandlers) DeleteAccessPoint(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
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
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── Access Point → Doors ─────────────────────────────────────────────────────

// GET /access-points/:id/doors
func (h *AccessHandlers) ListAccessPointDoors(w http.ResponseWriter, r *http.Request) {
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
		`SELECT apd.id, apd.tenant_id, apd.access_point_id, apd.door_id, apd.role, apd.created_at,
		        d.name, d.type, d.status, d.state
		 FROM dm3_access.access_point_doors apd
		 JOIN dm3_access.doors d ON d.id = apd.door_id
		 WHERE apd.access_point_id = $1::uuid
		 ORDER BY d.name ASC`,
		apID,
	)
	if err != nil {
		slog.Error("list access point doors error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := []models.AccessPointDoor{}
	for rows.Next() {
		var item models.AccessPointDoor
		var d models.Door
		if err := rows.Scan(
			&item.ID, &item.TenantID, &item.AccessPointID, &item.DoorID, &item.Role, &item.CreatedAt,
			&d.Name, &d.Type, &d.Status, &d.State,
		); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		d.ID = item.DoorID
		item.Door = &d
		result = append(result, item)
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": result, "total": len(result)})
}

// POST /access-points/:id/doors
func (h *AccessHandlers) AddAccessPointDoor(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req struct {
		DoorID string `json:"door_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DoorID == "" {
		httputil.Error(w, http.StatusBadRequest, "door_id is required")
		return
	}
	if req.Role == "" {
		req.Role = "controller"
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_point_doors (tenant_id, access_point_id, door_id, role)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
		 ON CONFLICT (access_point_id, door_id) DO NOTHING
		 RETURNING id`,
		cid, apID, req.DoorID, req.Role,
	).Scan(&id)
	if err != nil {
		slog.Error("add access point door error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
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
		        COUNT(DISTINCT u.id) AS user_count
		 FROM dm3_access.access_group_access_points agap
		 JOIN dm3_access.access_groups ag ON ag.id = agap.access_group_id
		 LEFT JOIN dm3_identity.users u ON u.access_group_id = ag.id
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 WHERE agap.access_point_id = $1::uuid
		 GROUP BY ag.id, ag.tenant_id, ag.name
		 ORDER BY ag.name ASC`,
		apID,
	)
	if err != nil {
		slog.Error("list access point groups error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := []models.AccessGroup{}
	for rows.Next() {
		var ag models.AccessGroup
		if err := rows.Scan(&ag.ID, &ag.TenantID, &ag.Name, &ag.UserCount); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		result = append(result, ag)
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
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DELETE /access-points/:id/access-groups/:groupId
func (h *AccessHandlers) RemoveAccessPointGroup(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	groupID := chi.URLParam(r, "groupId")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_group_access_points
		 WHERE access_point_id = $1::uuid AND access_group_id = $2::uuid`,
		apID, groupID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access group not in this access point")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /access-points/:id/doors/:doorId
func (h *AccessHandlers) RemoveAccessPointDoor(w http.ResponseWriter, r *http.Request) {
	apID := chi.URLParam(r, "id")
	doorID := chi.URLParam(r, "doorId")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_point_doors
		 WHERE access_point_id = $1::uuid AND door_id = $2::uuid`,
		apID, doorID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "door not in this access point")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
