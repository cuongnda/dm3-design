package access

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Access Groups ────────────────────────────────────────────────────────────

func (h *AccessHandlers) ListAccessGroups(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	where := "WHERE ag.is_deleted = false AND ag.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND ag.name ILIKE $%d", idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_access.access_groups ag "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT ag.id, ag.tenant_id, ag.parent_id, ag.access_time_id, ag.name, ag.is_default, ag.type,
		       COUNT(DISTINCT agap.access_point_id) AS access_point_count,
		       COUNT(DISTINCT agu.user_id) AS user_count,
		       ag.created_at, ag.updated_at
		FROM dm3_access.access_groups ag
		LEFT JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		LEFT JOIN dm3_access.access_group_users agu ON agu.access_group_id = ag.id
		    AND (agu.effective_to IS NULL OR agu.effective_to > now())
		%s
		GROUP BY ag.id
		ORDER BY ag.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list access groups query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	groups := []models.AccessGroup{}
	for rows.Next() {
		var g models.AccessGroup
		if err := rows.Scan(&g.ID, &g.TenantID, &g.ParentID, &g.AccessTimeID, &g.Name, &g.IsDefault, &g.Type,
			&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt); err != nil {
			slog.Error("list access groups scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access groups rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, groups, total, page, limit)
}

func (h *AccessHandlers) GetAccessGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var g models.AccessGroup
	var at models.AccessTime
	var atID, atName, atTz *string

	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT ag.id, ag.tenant_id, ag.parent_id, ag.access_time_id, ag.name, ag.is_default, ag.type,
		        COUNT(DISTINCT agap.access_point_id) AS access_point_count,
		        COUNT(DISTINCT agu.user_id) AS user_count,
		        ag.created_at, ag.updated_at,
		        agt.id, agt.name, agt.timezone
		 FROM dm3_access.access_groups ag
		 LEFT JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		 LEFT JOIN dm3_access.access_group_users agu ON agu.access_group_id = ag.id
		     AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 LEFT JOIN dm3_access.access_times agt ON agt.id = ag.access_time_id
		 WHERE ag.id = $1::uuid
		   AND ag.tenant_id = $2::uuid
		   AND ag.is_deleted = false
		 GROUP BY ag.id, agt.id`,
		id, cid,
	).Scan(&g.ID, &g.TenantID, &g.ParentID, &g.AccessTimeID, &g.Name, &g.IsDefault, &g.Type,
		&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt,
		&atID, &atName, &atTz)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}

	if atID != nil {
		at.ID = *atID
		at.TenantID = g.TenantID
		if atName != nil {
			at.Name = *atName
		}
		if atTz != nil {
			at.Timezone = *atTz
		}
		g.AccessTime = &at
	}

	httputil.JSON(w, http.StatusOK, g)
}

type createAccessGroupRequest struct {
	Name         string  `json:"name"`
	ParentID     *string `json:"parent_id"`
	AccessTimeID *string `json:"access_time_id"`
	IsDefault    bool    `json:"is_default"`
	Type         int     `json:"type"`
}

func (h *AccessHandlers) CreateAccessGroup(w http.ResponseWriter, r *http.Request) {
	var req createAccessGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Type == 0 {
		req.Type = 1
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	var g models.AccessGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_groups (tenant_id, parent_id, access_time_id, name, is_default, type)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
		 RETURNING id, tenant_id, parent_id, access_time_id, name, is_default, type, 0, 0, created_at, updated_at`,
		cid, req.ParentID, req.AccessTimeID, req.Name, req.IsDefault, req.Type,
	).Scan(&g.ID, &g.TenantID, &g.ParentID, &g.AccessTimeID, &g.Name, &g.IsDefault, &g.Type,
		&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		slog.Error("create access group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusCreated, g)
}

type updateAccessGroupRequest struct {
	Name         *string `json:"name"`
	ParentID     *string `json:"parent_id"`
	AccessTimeID *string `json:"access_time_id"`
	IsDefault    *bool   `json:"is_default"`
}

func (h *AccessHandlers) UpdateAccessGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req updateAccessGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var g models.AccessGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.access_groups
		 SET name           = COALESCE($2, name),
		     parent_id      = COALESCE($3::uuid, parent_id),
		     access_time_id = CASE WHEN $4::text = 'null' THEN NULL ELSE COALESCE($4::uuid, access_time_id) END,
		     is_default     = COALESCE($5, is_default),
		     updated_at     = now()
		 WHERE id = $1::uuid
		   AND tenant_id = $6::uuid
		   AND is_deleted = false
		 RETURNING id, tenant_id, parent_id, access_time_id, name, is_default, type, 0, 0, created_at, updated_at`,
		id, req.Name, req.ParentID, req.AccessTimeID, req.IsDefault, cid,
	).Scan(&g.ID, &g.TenantID, &g.ParentID, &g.AccessTimeID, &g.Name, &g.IsDefault, &g.Type,
		&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}
	httputil.JSON(w, http.StatusOK, g)
}

func (h *AccessHandlers) DeleteAccessGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	query := `UPDATE dm3_access.access_groups SET is_deleted = true, updated_at = now()
	          WHERE id = $1::uuid AND is_deleted = false AND tenant_id = $2::uuid`
	args := []any{id, cid}

	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccessHandlers) BulkDeleteAccessGroups(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
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
	query := fmt.Sprintf(`UPDATE dm3_access.access_groups SET is_deleted = true, updated_at = now() WHERE tenant_id = $1::uuid AND id IN (%s) AND is_deleted = false`, strings.Join(placeholders, ","))
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── Access Group → Access Points ────────────────────────────────────────────

// GET /access-groups/:id/access-points
func (h *AccessHandlers) ListAccessGroupAccessPoints(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_groups
		  WHERE id = $1::uuid AND is_deleted = false AND tenant_id = $2::uuid)`,
		groupID, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT agap.id, agap.tenant_id, agap.access_group_id, agap.access_point_id,
		        agap.access_time_id, agap.created_at,
		        ap.name, ap.description,
		        at.id, at.name, at.timezone
		 FROM dm3_access.access_group_access_points agap
		 JOIN dm3_access.access_points ap ON ap.id = agap.access_point_id
		 LEFT JOIN dm3_access.access_times at ON at.id = agap.access_time_id
		 WHERE agap.access_group_id = $1::uuid AND agap.tenant_id = $2::uuid
		 ORDER BY ap.name ASC`,
		groupID, cid,
	)
	if err != nil {
		slog.Error("list access group access points error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	result := []models.AccessGroupAccessPoint{}
	for rows.Next() {
		var item models.AccessGroupAccessPoint
		var ap models.AccessPoint
		var at models.AccessTime
		var atID, atName, atTz *string

		if err := rows.Scan(
			&item.ID, &item.TenantID, &item.AccessGroupID, &item.AccessPointID,
			&item.AccessTimeID, &item.CreatedAt,
			&ap.Name, &ap.Description,
			&atID, &atName, &atTz,
		); err != nil {
			slog.Error("list access group access points scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		ap.ID = item.AccessPointID
		item.AccessPoint = &ap

		if atID != nil {
			at.ID = *atID
			at.TenantID = item.TenantID
			if atName != nil {
				at.Name = *atName
			}
			if atTz != nil {
				at.Timezone = *atTz
			}
			item.AccessTime = &at
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access group access points rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": result, "total": len(result)})
}

// POST /access-groups/:id/access-points
func (h *AccessHandlers) AddAccessGroupAccessPoint(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req struct {
		AccessPointID string  `json:"access_point_id"`
		AccessTimeID  *string `json:"access_time_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AccessPointID == "" {
		httputil.Error(w, http.StatusBadRequest, "access_point_id is required")
		return
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.access_group_access_points
		    (tenant_id, access_group_id, access_point_id, access_time_id)
		 SELECT $1::uuid, $2::uuid, ap.id, $4::uuid
		 FROM dm3_access.access_points ap
		 WHERE ap.id = $3::uuid AND ap.tenant_id = $1::uuid
		 ON CONFLICT (access_group_id, access_point_id) DO UPDATE
		   SET access_time_id = EXCLUDED.access_time_id
		 RETURNING id`,
		cid, groupID, req.AccessPointID, req.AccessTimeID,
	).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "access point not found")
			return
		}
		slog.Error("add access group access point error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /access-groups/:id/users
func (h *AccessHandlers) ListAccessGroupUsers(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_groups
		  WHERE id = $1::uuid AND is_deleted = false AND tenant_id = $2::uuid)`,
		groupID, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}

	type userRow struct {
		ID            string  `json:"id"`
		FirstName     string  `json:"first_name"`
		LastName      string  `json:"last_name"`
		Email         *string `json:"email,omitempty"`
		Position      *string `json:"position,omitempty"`
		Status        string  `json:"status"`
		EffectiveFrom *string `json:"effective_from,omitempty"`
		EffectiveTo   *string `json:"effective_to,omitempty"`
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT u.id, u.first_name, u.last_name, u.email, u.position, u.status,
		        agu.effective_from::text, agu.effective_to::text
		 FROM dm3_access.access_group_users agu
		 JOIN dm3_identity.users u ON u.id = agu.user_id
		 WHERE agu.access_group_id = $1::uuid
		   AND agu.tenant_id = $2::uuid
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		   AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 ORDER BY u.last_name ASC, u.first_name ASC`,
		groupID, cid,
	)
	if err != nil {
		slog.Error("list access group users error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	users := []userRow{}
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Position, &u.Status,
			&u.EffectiveFrom, &u.EffectiveTo); err != nil {
			slog.Error("list access group users scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list access group users rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": users, "total": len(users)})
}

// POST /access-groups/:id/users  — assign users to this group
func (h *AccessHandlers) AssignUsersToGroup(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_access.access_groups
		  WHERE id = $1::uuid AND is_deleted = false AND tenant_id = $2::uuid)`,
		groupID, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_access.access_group_users (tenant_id, access_group_id, user_id)
		 SELECT u.tenant_id, $1::uuid, u.id
		 FROM dm3_identity.users u
		 WHERE u.id = ANY($2::uuid[])
		   AND u.tenant_id = $3::uuid
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 ON CONFLICT (access_group_id, user_id) DO NOTHING`,
		groupID, req.UserIDs, cid,
	)
	if err != nil {
		slog.Error("assign users to group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"assigned": tag.RowsAffected()})
}

// DELETE /access-groups/:id/users/:userId — remove user from group
func (h *AccessHandlers) RemoveUserFromGroup(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_group_users
		 WHERE access_group_id = $1::uuid AND user_id = $2::uuid AND tenant_id = $3::uuid`,
		groupID, userID, cid,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not in this group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /access-groups/:id/access-points/:apId
func (h *AccessHandlers) RemoveAccessGroupAccessPoint(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	apID := chi.URLParam(r, "apId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.access_group_access_points
		 WHERE access_group_id = $1::uuid AND access_point_id = $2::uuid AND tenant_id = $3::uuid`,
		groupID, apID, cid,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "access point not in this group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
