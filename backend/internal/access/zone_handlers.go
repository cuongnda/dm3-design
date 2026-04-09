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

// zoneSelectCols is the column list used across all zone queries.
const zoneSelectCols = `z.id, z.tenant_id, z.parent_id, z.name, z.description,
	z.timezone, z.latitude, z.longitude, z.address, z.floor, z.building,
	z.map_image_url, z.map_width, z.map_height`

// scanZone scans all zone columns (including spatial fields) from a row.
func scanZone(row interface{ Scan(dest ...any) error }, z *models.Zone) error {
	return row.Scan(
		&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Description,
		&z.Timezone, &z.Latitude, &z.Longitude, &z.Address, &z.Floor, &z.Building,
		&z.MapImageURL, &z.MapWidth, &z.MapHeight,
		&z.AccessPointCount, &z.CreatedAt, &z.UpdatedAt,
	)
}

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
		"SELECT COUNT(*) FROM dm3_access.zones z "+where, countArgs...).Scan(&total)

	sortCol, sortDir := parseSorting(r, map[string]string{
		"name":               "z.name",
		"description":        "COALESCE(z.description, '')",
		"access_point_count": "COUNT(ap.id)",
		"created_at":         "z.created_at",
	}, "z.name")
	query := fmt.Sprintf(`
		SELECT %s,
		       COUNT(ap.id) AS access_point_count,
		       z.created_at, z.updated_at
		FROM dm3_access.zones z
		LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		%s
		GROUP BY z.id
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`, zoneSelectCols, where, sortCol, sortDir, idx, idx+1)
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
		if err := scanZone(rows, &z); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		zones = append(zones, z)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, zones, total, page, limit)
}

type createZoneRequest struct {
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	ParentID    *string  `json:"parent_id"`
	Timezone    *string  `json:"timezone"`
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	Address     *string  `json:"address"`
	Floor       *string  `json:"floor"`
	Building    *string  `json:"building"`
	MapImageURL *string  `json:"map_image_url"`
	MapWidth    *int     `json:"map_width"`
	MapHeight   *int     `json:"map_height"`
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
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.zones
		   (tenant_id, parent_id, name, description, timezone, latitude, longitude,
		    address, floor, building, map_image_url, map_width, map_height)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 RETURNING id, tenant_id, parent_id, name, description,
		           timezone, latitude, longitude, address, floor, building,
		           map_image_url, map_width, map_height,
		           0, created_at, updated_at`,
		cid, req.ParentID, req.Name, req.Description,
		req.Timezone, req.Latitude, req.Longitude,
		req.Address, req.Floor, req.Building,
		req.MapImageURL, req.MapWidth, req.MapHeight,
	), &z)
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
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		fmt.Sprintf(`SELECT %s,
		        COUNT(ap.id) AS access_point_count, z.created_at, z.updated_at
		 FROM dm3_access.zones z
		 LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		 WHERE z.id = $1::uuid AND ($2::uuid IS NULL OR z.tenant_id = $2::uuid)
		 GROUP BY z.id`, zoneSelectCols),
		id, nilIfEmpty(cid),
	), &z)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}
	httputil.JSON(w, http.StatusOK, z)
}

type updateZoneRequest struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	ParentID    *string  `json:"parent_id"`
	Timezone    *string  `json:"timezone"`
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	Address     *string  `json:"address"`
	Floor       *string  `json:"floor"`
	Building    *string  `json:"building"`
	MapImageURL *string  `json:"map_image_url"`
	MapWidth    *int     `json:"map_width"`
	MapHeight   *int     `json:"map_height"`
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
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.zones
		 SET name          = COALESCE($2, name),
		     description   = COALESCE($3, description),
		     parent_id     = COALESCE($4::uuid, parent_id),
		     timezone      = COALESCE($5, timezone),
		     latitude      = COALESCE($6, latitude),
		     longitude     = COALESCE($7, longitude),
		     address       = COALESCE($8, address),
		     floor         = COALESCE($9, floor),
		     building      = COALESCE($10, building),
		     map_image_url = COALESCE($11, map_image_url),
		     map_width     = COALESCE($12, map_width),
		     map_height    = COALESCE($13, map_height),
		     updated_at    = now()
		 WHERE id = $1::uuid AND ($14::uuid IS NULL OR tenant_id = $14::uuid)
		 RETURNING id, tenant_id, parent_id, name, description,
		           timezone, latitude, longitude, address, floor, building,
		           map_image_url, map_width, map_height,
		           0, created_at, updated_at`,
		id, req.Name, req.Description, req.ParentID,
		req.Timezone, req.Latitude, req.Longitude,
		req.Address, req.Floor, req.Building,
		req.MapImageURL, req.MapWidth, req.MapHeight,
		nilIfEmpty(cid),
	), &z)
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

// GET /zones/:id/doors — list access points in a zone (includes map placement)
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
		SELECT id, tenant_id, zone_id, access_time_id, name, description,
		       map_x, map_y, map_rotation,
		       created_at, updated_at
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
			&ap.Name, &ap.Description,
			&ap.MapX, &ap.MapY, &ap.MapRotation,
			&ap.CreatedAt, &ap.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		accessPoints = append(accessPoints, ap)
	}
	httputil.Paginated(w, accessPoints, total, page, limit)
}

func nilIfEmptyJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func (h *AccessHandlers) GetZoneMap(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var zone models.Zone
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`SELECT `+zoneSelectCols+`, COUNT(ap.id) AS access_point_count, z.created_at, z.updated_at
		 FROM dm3_access.zones z
		 LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		 WHERE z.id = $1::uuid AND z.tenant_id = $2::uuid
		 GROUP BY z.id`,
		id, cid,
	), &zone)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, zone_id, access_time_id, name, description, map_x, map_y, map_rotation, created_at, updated_at
		 FROM dm3_access.access_points
		 WHERE zone_id = $1::uuid AND tenant_id = $2::uuid
		 ORDER BY name ASC`,
		id, cid,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	points := []models.AccessPoint{}
	for rows.Next() {
		var ap models.AccessPoint
		if err := rows.Scan(&ap.ID, &ap.TenantID, &ap.ZoneID, &ap.AccessTimeID, &ap.Name, &ap.Description,
			&ap.MapX, &ap.MapY, &ap.MapRotation, &ap.CreatedAt, &ap.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		points = append(points, ap)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{"zone": zone, "access_points": points})
}

type updateZoneMapRequest struct {
	MapImageURL *string `json:"map_image_url"`
	MapWidth    *int    `json:"map_width"`
	MapHeight   *int    `json:"map_height"`
}

func (h *AccessHandlers) UpdateZoneMap(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req updateZoneMapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var zone models.Zone
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.zones
		 SET map_image_url = COALESCE($2, map_image_url),
		     map_width     = COALESCE($3, map_width),
		     map_height    = COALESCE($4, map_height),
		     updated_at    = now()
		 WHERE id = $1::uuid AND tenant_id = $5::uuid
		 RETURNING `+zoneSelectCols+`, 0, created_at, updated_at`,
		id, req.MapImageURL, req.MapWidth, req.MapHeight, cid,
	), &zone)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}

	h.audit.LogFromRequest(r, "access.zone.map.update", "zone", zone.ID, zone.Name, "success", nil, zone)
	httputil.JSON(w, http.StatusOK, zone)
}
