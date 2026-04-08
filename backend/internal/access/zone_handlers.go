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

// ─── Zones ───────────────────────────────────────────────────────────────────

func (h *AccessHandlers) ListZones(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	where := "WHERE z.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if v := r.URL.Query().Get("parent_id"); v != "" {
		where += fmt.Sprintf(" AND z.parent_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND z.name ILIKE $%d", idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_access.zones "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT z.id, z.tenant_id, z.parent_id, z.name, z.description,
		       COUNT(ap.id) AS access_point_count,
		       z.created_at, z.updated_at
		FROM dm3_access.zones z
		LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		%s
		GROUP BY z.id
		ORDER BY z.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list zones query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	zones := []models.Zone{}
	for rows.Next() {
		var z models.Zone
		if err := rows.Scan(&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Description,
			&z.AccessPointCount, &z.CreatedAt, &z.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		zones = append(zones, z)
	}
	httputil.Paginated(w, zones, total, page, limit)
}

type createZoneRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	ParentID    *string `json:"parent_id"`
}

func (h *AccessHandlers) CreateZone(w http.ResponseWriter, r *http.Request) {
	var req createZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	var z models.Zone
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.zones (tenant_id, parent_id, name, description)
		 VALUES ($1::uuid, $2::uuid, $3, $4)
		 RETURNING id, tenant_id, parent_id, name, description, 0, created_at, updated_at`,
		cid, req.ParentID, req.Name, req.Description,
	).Scan(&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Description,
		&z.AccessPointCount, &z.CreatedAt, &z.UpdatedAt)
	if err != nil {
		slog.Error("create zone error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.zone.create", "zone", z.ID, z.Name, "success", nil, z)
	httputil.JSON(w, http.StatusCreated, z)
}

func (h *AccessHandlers) GetZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var z models.Zone
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT z.id, z.tenant_id, z.parent_id, z.name, z.description,
		        COUNT(ap.id) AS access_point_count, z.created_at, z.updated_at
		 FROM dm3_access.zones z
		 LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		 WHERE z.id = $1::uuid AND ($2::uuid IS NULL OR z.tenant_id = $2::uuid)
		 GROUP BY z.id`,
		id, nilIfEmpty(cid),
	).Scan(&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Description,
		&z.AccessPointCount, &z.CreatedAt, &z.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}
	httputil.JSON(w, http.StatusOK, z)
}

type updateZoneRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	ParentID    *string `json:"parent_id"`
}

func (h *AccessHandlers) UpdateZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req updateZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var z models.Zone
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.zones
		 SET name        = COALESCE($2, name),
		     description = COALESCE($3, description),
		     parent_id   = COALESCE($4::uuid, parent_id),
		     updated_at  = now()
		 WHERE id = $1::uuid AND ($5::uuid IS NULL OR tenant_id = $5::uuid)
		 RETURNING id, tenant_id, parent_id, name, description, 0, created_at, updated_at`,
		id, req.Name, req.Description, req.ParentID, nilIfEmpty(cid),
	).Scan(&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Description,
		&z.AccessPointCount, &z.CreatedAt, &z.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}
	h.audit.LogFromRequest(r, "access.zone.update", "zone", z.ID, z.Name, "success", nil, z)
	httputil.JSON(w, http.StatusOK, z)
}

func (h *AccessHandlers) DeleteZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	query := `DELETE FROM dm3_access.zones WHERE id = $1::uuid AND tenant_id = $2::uuid`
	args := []any{id, cid}
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}
	h.audit.LogFromRequest(r, "access.zone.delete", "zone", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccessHandlers) BulkDeleteZones(w http.ResponseWriter, r *http.Request) {
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

	query := fmt.Sprintf(
		`DELETE FROM dm3_access.zones WHERE tenant_id = $1::uuid AND id IN (%s)`,
		strings.Join(placeholders, ","),
	)
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "access.zone.bulk_delete", "zone", "", "", "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// GET /zones/:id/doors — list access points in a zone
func (h *AccessHandlers) ListZoneDoors(w http.ResponseWriter, r *http.Request) {
	zoneID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	where := "WHERE zone_id = $1::uuid AND tenant_id = $2::uuid"
	args := []any{zoneID, cid}
	idx := 3
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND name ILIKE $%d", idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_access.access_points "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, tenant_id, zone_id, access_time_id, name, description, created_at, updated_at
		FROM dm3_access.access_points %s
		ORDER BY name ASC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list zone access points error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	accessPoints := []models.AccessPoint{}
	for rows.Next() {
		var ap models.AccessPoint
		if err := rows.Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID,
			&ap.Name, &ap.Description, &ap.CreatedAt, &ap.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		accessPoints = append(accessPoints, ap)
	}
	httputil.Paginated(w, accessPoints, total, page, limit)
}

