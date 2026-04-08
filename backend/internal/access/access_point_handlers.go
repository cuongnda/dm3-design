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
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND ap.status = $%d", idx)
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
		SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id, ap.device_id,
		       ap.name, ap.description, ap.status, ap.state, ap.mode,
		       ap.anti_passback, ap.unlock_duration_ms, ap.last_event_at,
		       ap.created_at, ap.updated_at
		FROM dm3_access.access_points ap
		%s
		ORDER BY ap.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
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
		if err := rows.Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID, &ap.DeviceID,
			&ap.Name, &ap.Description, &ap.Status, &ap.State, &ap.Mode,
			&ap.AntiPassback, &ap.UnlockDurationMs, &ap.LastEventAt,
			&ap.CreatedAt, &ap.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
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
		`SELECT ap.id, ap.tenant_id, ap.zone_id, ap.access_time_id, ap.device_id,
		        ap.name, ap.description, ap.status, ap.state, ap.mode,
		        ap.anti_passback, ap.unlock_duration_ms, ap.last_event_at,
		        ap.created_at, ap.updated_at
		 FROM dm3_access.access_points ap
		 WHERE ap.id = $1::uuid AND ap.tenant_id = $2::uuid`,
		id, cid,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID, &ap.DeviceID,
		&ap.Name, &ap.Description, &ap.Status, &ap.State, &ap.Mode,
		&ap.AntiPassback, &ap.UnlockDurationMs, &ap.LastEventAt,
		&ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access point not found")
		return
	}
	httputil.JSON(w, http.StatusOK, ap)
}

type createAccessPointRequest struct {
	Name             string  `json:"name"`
	Description      *string `json:"description"`
	ZoneID           *string `json:"zone_id"`
	AccessTimeID     *string `json:"access_time_id"`
	DeviceID         *string `json:"device_id"`
	Mode             *string `json:"mode"`
	AntiPassback     *bool   `json:"anti_passback"`
	UnlockDurationMs *int    `json:"unlock_duration_ms"`
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
		`INSERT INTO dm3_access.access_points
		   (tenant_id, zone_id, access_time_id, device_id, name, description,
		    mode, anti_passback, unlock_duration_ms)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
		         COALESCE($7, 'normal'), COALESCE($8, false), COALESCE($9, 5000))
		 RETURNING id, tenant_id, zone_id, access_time_id, device_id,
		           name, description, status, state, mode,
		           anti_passback, unlock_duration_ms, last_event_at,
		           created_at, updated_at`,
		cid, req.ZoneID, req.AccessTimeID, req.DeviceID, req.Name, req.Description,
		req.Mode, req.AntiPassback, req.UnlockDurationMs,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID, &ap.DeviceID,
		&ap.Name, &ap.Description, &ap.Status, &ap.State, &ap.Mode,
		&ap.AntiPassback, &ap.UnlockDurationMs, &ap.LastEventAt,
		&ap.CreatedAt, &ap.UpdatedAt)
	if err != nil {
		slog.Error("create access point error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusCreated, ap)
}

type updateAccessPointRequest struct {
	Name             *string `json:"name"`
	Description      *string `json:"description"`
	ZoneID           *string `json:"zone_id"`
	AccessTimeID     *string `json:"access_time_id"`
	DeviceID         *string `json:"device_id"`
	Status           *string `json:"status"`
	State            *string `json:"state"`
	Mode             *string `json:"mode"`
	AntiPassback     *bool   `json:"anti_passback"`
	UnlockDurationMs *int    `json:"unlock_duration_ms"`
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
		 SET name             = COALESCE($2, name),
		     description      = COALESCE($3, description),
		     zone_id          = COALESCE($4::uuid, zone_id),
		     access_time_id   = COALESCE($5::uuid, access_time_id),
		     device_id        = COALESCE($6::uuid, device_id),
		     status           = COALESCE($7, status),
		     state            = COALESCE($8, state),
		     mode             = COALESCE($9, mode),
		     anti_passback    = COALESCE($10, anti_passback),
		     unlock_duration_ms = COALESCE($11, unlock_duration_ms),
		     updated_at       = now()
		 WHERE id = $1::uuid AND tenant_id = $12::uuid
		 RETURNING id, tenant_id, zone_id, access_time_id, device_id,
		           name, description, status, state, mode,
		           anti_passback, unlock_duration_ms, last_event_at,
		           created_at, updated_at`,
		id, req.Name, req.Description, req.ZoneID, req.AccessTimeID, req.DeviceID,
		req.Status, req.State, req.Mode, req.AntiPassback, req.UnlockDurationMs, cid,
	).Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID, &ap.DeviceID,
		&ap.Name, &ap.Description, &ap.Status, &ap.State, &ap.Mode,
		&ap.AntiPassback, &ap.UnlockDurationMs, &ap.LastEventAt,
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
		httputil.Error(w, http.StatusInternalServerError, "internal error")
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
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── Access Point -> Access Groups ──────────────────────────────────────────

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
			httputil.Error(w, http.StatusInternalServerError, "internal error")
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
		AccessGroupID string  `json:"access_group_id"`
		AccessTimeID  *string `json:"access_time_id"`
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
		`INSERT INTO dm3_access.access_group_access_points (tenant_id, access_group_id, access_point_id, access_time_id)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
		 ON CONFLICT (access_group_id, access_point_id) DO UPDATE
		   SET access_time_id = EXCLUDED.access_time_id
		 RETURNING id`,
		cid, req.AccessGroupID, apID, req.AccessTimeID,
	).Scan(&id)
	if err != nil {
		slog.Error("add access point group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
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
	w.WriteHeader(http.StatusNoContent)
}
