package access

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

	sortCol, sortDir := parseSorting(r, map[string]string{
		"name":               "ag.name",
		"created_at":         "ag.created_at",
		"access_point_count": "COUNT(DISTINCT agap.access_point_id)",
		"user_count":         "COUNT(DISTINCT u.id)",
	}, "ag.name")
	// user_count joins through dm3_identity.users with an is_deleted filter
	// so soft-deleted users (still present in agu) don't inflate the count.
	query := fmt.Sprintf(`
		SELECT ag.id, ag.tenant_id, ag.access_time_id, ag.name, ag.description, ag.is_default, ag.type,
		       COUNT(DISTINCT agap.access_point_id) AS access_point_count,
		       COUNT(DISTINCT u.id) AS user_count,
		       ag.created_at, ag.updated_at
		FROM dm3_access.access_groups ag
		LEFT JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		LEFT JOIN dm3_access.access_group_users agu ON agu.access_group_id = ag.id
		    AND (agu.effective_to IS NULL OR agu.effective_to > now())
		LEFT JOIN dm3_identity.users u ON u.id = agu.user_id
		    AND (u.is_deleted = false OR u.is_deleted IS NULL)
		%s
		GROUP BY ag.id
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`, where, sortCol, sortDir, idx, idx+1)
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
		if err := rows.Scan(&g.ID, &g.TenantID, &g.AccessTimeID, &g.Name, &g.Description, &g.IsDefault, &g.Type,
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
		`SELECT ag.id, ag.tenant_id, ag.access_time_id, ag.name, ag.description, ag.is_default, ag.type,
		        COUNT(DISTINCT agap.access_point_id) AS access_point_count,
		        COUNT(DISTINCT u.id) AS user_count,
		        ag.created_at, ag.updated_at,
		        agt.id, agt.name, agt.timezone
		 FROM dm3_access.access_groups ag
		 LEFT JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		 LEFT JOIN dm3_access.access_group_users agu ON agu.access_group_id = ag.id
		     AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 LEFT JOIN dm3_identity.users u ON u.id = agu.user_id
		     AND (u.is_deleted = false OR u.is_deleted IS NULL)
		 LEFT JOIN dm3_access.access_times agt ON agt.id = ag.access_time_id
		 WHERE ag.id = $1::uuid
		   AND ag.tenant_id = $2::uuid
		   AND ag.is_deleted = false
		 GROUP BY ag.id, agt.id`,
		id, cid,
	).Scan(&g.ID, &g.TenantID, &g.AccessTimeID, &g.Name, &g.Description, &g.IsDefault, &g.Type,
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
	Description  *string `json:"description"`
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
		`INSERT INTO dm3_access.access_groups (tenant_id, access_time_id, name, description, is_default, type)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
		 RETURNING id, tenant_id, access_time_id, name, description, is_default, type, 0, 0, created_at, updated_at`,
		cid, req.AccessTimeID, req.Name, req.Description, req.IsDefault, req.Type,
	).Scan(&g.ID, &g.TenantID, &g.AccessTimeID, &g.Name, &g.Description, &g.IsDefault, &g.Type,
		&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		slog.Error("create access group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.group.create", "access_group", g.ID, g.Name, "success", nil, g)
	h.publishAGEvent(r.Context(), cid, g.ID, "created")
	httputil.JSON(w, http.StatusCreated, g)
}

type updateAccessGroupRequest struct {
	Name         *string `json:"name"`
	Description  *string `json:"description"`
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
		     description    = COALESCE($3, description),
		     access_time_id = CASE WHEN $4::text = 'null' THEN NULL ELSE COALESCE($4::uuid, access_time_id) END,
		     is_default     = COALESCE($5, is_default),
		     updated_at     = now()
		 WHERE id = $1::uuid
		   AND tenant_id = $6::uuid
		   AND is_deleted = false
		 RETURNING id, tenant_id, access_time_id, name, description, is_default, type, 0, 0, created_at, updated_at`,
		id, req.Name, req.Description, req.AccessTimeID, req.IsDefault, cid,
	).Scan(&g.ID, &g.TenantID, &g.AccessTimeID, &g.Name, &g.Description, &g.IsDefault, &g.Type,
		&g.AccessPointCount, &g.UserCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "access group not found")
		return
	}
	h.audit.LogFromRequest(r, "access.group.update", "access_group", g.ID, g.Name, "success", nil, g)
	h.publishAGEvent(r.Context(), cid, g.ID, "updated")
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
	h.audit.LogFromRequest(r, "access.group.delete", "access_group", id, "", "success", nil, nil)
	h.publishAGEvent(r.Context(), cid, id, "deleted")
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
	h.audit.LogFromRequest(r, "access.group.bulk_delete", "access_group", "", "", "success", nil, map[string]any{"ids": req.IDs})
	for _, id := range req.IDs {
		h.publishAGEvent(r.Context(), cid, id, "deleted")
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
		        agap.created_at,
		        ap.name, ap.description,
		        z.id, z.name
		 FROM dm3_access.access_group_access_points agap
		 JOIN dm3_access.access_points ap ON ap.id = agap.access_point_id
		 LEFT JOIN dm3_access.zones z ON z.id = ap.zone_id
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
		var zoneID, zoneName *string

		if err := rows.Scan(
			&item.ID, &item.TenantID, &item.AccessGroupID, &item.AccessPointID,
			&item.CreatedAt,
			&ap.Name, &ap.Description,
			&zoneID, &zoneName,
		); err != nil {
			slog.Error("list access group access points scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		ap.ID = item.AccessPointID
		if zoneID != nil {
			ap.ZoneID = zoneID
			ap.Zone = &models.Zone{ID: *zoneID, Name: *zoneName}
		}
		item.AccessPoint = &ap
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
		AccessPointID string `json:"access_point_id"`
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
		    (tenant_id, access_group_id, access_point_id)
		 SELECT $1::uuid, $2::uuid, ap.id
		 FROM dm3_access.access_points ap
		 WHERE ap.id = $3::uuid AND ap.tenant_id = $1::uuid
		 ON CONFLICT (access_group_id, access_point_id) DO NOTHING
		 RETURNING id`,
		cid, groupID, req.AccessPointID,
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
	h.audit.LogFromRequest(r, "access.group.add_access_point", "access_group", groupID, "", "success", nil, map[string]any{"access_point_id": req.AccessPointID})
	h.publishAGEvent(r.Context(), cid, groupID, "ap_added")
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
		ID             string  `json:"id"`
		FirstName      string  `json:"first_name"`
		LastName       string  `json:"last_name"`
		Email          *string `json:"email,omitempty"`
		Position       *string `json:"position,omitempty"`
		DepartmentID   *string `json:"department_id,omitempty"`
		DepartmentName *string `json:"department_name,omitempty"`
		Status         string  `json:"status"`
		EffectiveFrom  *string `json:"effective_from,omitempty"`
		EffectiveTo    *string `json:"effective_to,omitempty"`
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT u.id, u.first_name, u.last_name, u.email, u.position,
		        u.department_id::text, d.name AS department_name,
		        u.status,
		        agu.effective_from::text, agu.effective_to::text
		 FROM dm3_access.access_group_users agu
		 JOIN dm3_identity.users u ON u.id = agu.user_id
		 LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
		 WHERE agu.access_group_id = $1::uuid
		   AND agu.tenant_id = $2::uuid
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		   AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 ORDER BY d.name ASC NULLS LAST, u.last_name ASC, u.first_name ASC`,
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
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Position,
			&u.DepartmentID, &u.DepartmentName, &u.Status,
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

	type userAssignment struct {
		UserID        string     `json:"user_id"`
		EffectiveFrom *time.Time `json:"effective_from"`
		EffectiveTo   *time.Time `json:"effective_to"`
	}
	var assignments []userAssignment
	if err := json.NewDecoder(r.Body).Decode(&assignments); err != nil || len(assignments) == 0 {
		httputil.Error(w, http.StatusBadRequest, "array of user assignments required")
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

	now := time.Now()
	var assigned int64
	for _, a := range assignments {
		if a.UserID == "" {
			continue
		}
		effectiveFrom := now
		if a.EffectiveFrom != nil {
			effectiveFrom = *a.EffectiveFrom
		}
		tag, err := h.db.Pool.Exec(r.Context(),
			`INSERT INTO dm3_access.access_group_users (tenant_id, access_group_id, user_id, effective_from, effective_to)
			 SELECT u.tenant_id, $1::uuid, u.id, $3, $4
			 FROM dm3_identity.users u
			 WHERE u.id = $2::uuid
			   AND u.tenant_id = $5::uuid
			   AND (u.is_deleted = false OR u.is_deleted IS NULL)
			 ON CONFLICT (access_group_id, user_id) DO UPDATE
			   SET effective_from = EXCLUDED.effective_from,
			       effective_to   = EXCLUDED.effective_to`,
			groupID, a.UserID, effectiveFrom, a.EffectiveTo, cid,
		)
		if err != nil {
			slog.Error("assign user to group error", "error", err, "user_id", a.UserID)
			continue
		}
		assigned += tag.RowsAffected()
	}

	userIDs := make([]string, len(assignments))
	for i, a := range assignments {
		userIDs[i] = a.UserID
	}
	h.audit.LogFromRequest(r, "access.group.assign_users", "access_group", groupID, "", "success", nil, map[string]any{"user_ids": userIDs})
	h.publishAGEvent(r.Context(), cid, groupID, "user_added")
	httputil.JSON(w, http.StatusOK, map[string]any{"assigned": assigned})
}

// PUT /access-groups/:id/users/:userId — update membership dates
func (h *AccessHandlers) UpdateUserMembership(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req struct {
		EffectiveFrom *time.Time `json:"effective_from"`
		EffectiveTo   *time.Time `json:"effective_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_access.access_group_users
		 SET effective_from = COALESCE($3, effective_from),
		     effective_to   = $4
		 WHERE access_group_id = $1::uuid
		   AND user_id = $2::uuid
		   AND tenant_id = $5::uuid`,
		groupID, userID, req.EffectiveFrom, req.EffectiveTo, cid,
	)
	if err != nil {
		slog.Error("update user membership error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not in this group")
		return
	}
	h.audit.LogFromRequest(r, "access.group.update_user_membership", "access_group", groupID, "", "success", nil, map[string]any{"user_id": userID})
	h.publishAGEvent(r.Context(), cid, groupID, "user_added")
	w.WriteHeader(http.StatusNoContent)
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
	h.audit.LogFromRequest(r, "access.group.remove_user", "access_group", groupID, "", "success", nil, map[string]any{"user_id": userID})
	h.publishAGEvent(r.Context(), cid, groupID, "user_removed")
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
	h.audit.LogFromRequest(r, "access.group.remove_access_point", "access_group", groupID, "", "success", nil, map[string]any{"access_point_id": apID})
	h.publishAGEvent(r.Context(), cid, groupID, "ap_removed")
	w.WriteHeader(http.StatusNoContent)
}

// GET /access-groups/by-user/:userId — list all access groups a user belongs to.
// Counterpart of /access-groups/:id/users: the user-detail page needs the
// many-to-many *inverse* so it can render every group the user is in instead
// of silently collapsing to the first one returned by GetUser's LEFT JOIN.
func (h *AccessHandlers) ListUserAccessGroups(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	type groupRow struct {
		ID                string  `json:"id"`
		Name              string  `json:"name"`
		Description       *string `json:"description,omitempty"`
		IsDefault         bool    `json:"is_default"`
		AccessTimeID      *string `json:"access_time_id,omitempty"`
		AccessTimeName    *string `json:"access_time_name,omitempty"`
		AccessPointCount  int64   `json:"access_point_count"`
		EffectiveFrom     *string `json:"effective_from,omitempty"`
		EffectiveTo       *string `json:"effective_to,omitempty"`
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT ag.id, ag.name, ag.description, ag.is_default,
		        ag.access_time_id::text, at.name,
		        COALESCE((SELECT COUNT(*) FROM dm3_access.access_group_access_points agap
		                  WHERE agap.access_group_id = ag.id), 0) AS access_point_count,
		        agu.effective_from::text, agu.effective_to::text
		 FROM dm3_access.access_group_users agu
		 JOIN dm3_access.access_groups ag ON ag.id = agu.access_group_id
		 LEFT JOIN dm3_access.access_times at ON at.id = ag.access_time_id
		 WHERE agu.user_id = $1::uuid
		   AND agu.tenant_id = $2::uuid
		   AND ag.is_deleted = false
		   AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 ORDER BY ag.name ASC`,
		userID, cid,
	)
	if err != nil {
		slog.Error("list user access groups error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	groups := []groupRow{}
	for rows.Next() {
		var g groupRow
		if err := rows.Scan(&g.ID, &g.Name, &g.Description, &g.IsDefault,
			&g.AccessTimeID, &g.AccessTimeName, &g.AccessPointCount,
			&g.EffectiveFrom, &g.EffectiveTo); err != nil {
			slog.Error("list user access groups scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list user access groups rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": groups, "total": len(groups)})
}

// GET /access-groups/effective-access/:userId — resolved per-access-point access
// for a user, flattened across all groups they belong to. One row per
// (access_point × source group) pair. The frontend aggregates by access point
// to show "Main Gate ← via Engineers 24/7, via VIP Weekdays 08:00–18:00".
func (h *AccessHandlers) ListUserEffectiveAccess(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	type row struct {
		AccessPointID   string  `json:"access_point_id"`
		AccessPointName string  `json:"access_point_name"`
		ZoneID          *string `json:"zone_id,omitempty"`
		ZoneName        *string `json:"zone_name,omitempty"`
		AccessGroupID   string  `json:"access_group_id"`
		AccessGroupName string  `json:"access_group_name"`
		IsDefaultGroup  bool    `json:"is_default_group"`
		AccessTimeID    *string `json:"access_time_id,omitempty"`
		AccessTimeName  *string `json:"access_time_name,omitempty"`
		EffectiveFrom   *string `json:"effective_from,omitempty"`
		EffectiveTo     *string `json:"effective_to,omitempty"`
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT ap.id::text, ap.name,
		        ap.zone_id::text, z.name,
		        ag.id::text, ag.name, ag.is_default,
		        ag.access_time_id::text, at.name,
		        agu.effective_from::text, agu.effective_to::text
		 FROM dm3_access.access_group_users agu
		 JOIN dm3_access.access_groups ag ON ag.id = agu.access_group_id
		 JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		 JOIN dm3_access.access_points ap ON ap.id = agap.access_point_id
		 LEFT JOIN dm3_access.zones z ON z.id = ap.zone_id
		 LEFT JOIN dm3_access.access_times at ON at.id = ag.access_time_id
		 WHERE agu.user_id = $1::uuid
		   AND agu.tenant_id = $2::uuid
		   AND ag.is_deleted = false
		   AND (ap.is_deleted = false OR ap.is_deleted IS NULL)
		   AND (agu.effective_to IS NULL OR agu.effective_to > now())
		 ORDER BY z.name ASC NULLS LAST, ap.name ASC, ag.name ASC`,
		userID, cid,
	)
	if err != nil {
		slog.Error("list user effective access error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.AccessPointID, &r.AccessPointName,
			&r.ZoneID, &r.ZoneName,
			&r.AccessGroupID, &r.AccessGroupName, &r.IsDefaultGroup,
			&r.AccessTimeID, &r.AccessTimeName,
			&r.EffectiveFrom, &r.EffectiveTo); err != nil {
			slog.Error("list user effective access scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		slog.Error("list user effective access rows iteration error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": out, "total": len(out)})
}

// ─── NATS event publishing ────────────────────────────────────────────────────

// publishAGEvent fires a NATS notification for access group mutations.
// Subject: dm3.access.{tenant_id}.access_group.{action}
// Failures are logged but do not affect the HTTP response.
func (h *AccessHandlers) publishAGEvent(ctx context.Context, tenantID, accessGroupID, action string) {
	if h.nats == nil {
		return
	}
	subject := fmt.Sprintf("dm3.access.%s.access_group.%s", tenantID, action)
	payload, err := json.Marshal(map[string]string{
		"tenant_id":       tenantID,
		"access_group_id": accessGroupID,
		"action":          action,
	})
	if err != nil {
		slog.Warn("publishAGEvent: failed to marshal payload", "error", err)
		return
	}
	if err := h.nats.Publish(ctx, subject, payload); err != nil {
		slog.Warn("publishAGEvent: failed to publish", "subject", subject, "error", err)
	}
}
