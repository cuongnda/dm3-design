package access

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	pathpkg "path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// publishEvent publishes a NATS event for access changes (fire-and-forget).
func (h *AccessHandlers) publishEvent(subject string, data any) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(data)
	if err != nil {
		slog.Warn("access publishEvent marshal error", "subject", subject, "error", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.nats.Publish(ctx, subject, b); err != nil {
		slog.Warn("access publishEvent nats error", "subject", subject, "error", err)
	}
}

// ─── Zones ───────────────────────────────────────────────────────────────────

// zoneSelectCols is the column list used across all zone queries.
const zoneSelectCols = `z.id, z.tenant_id, z.parent_id, z.name, z.type, z.description,
	z.timezone, z.latitude, z.longitude, z.address, z.floor, z.building,
	z.map_image_url, z.map_width, z.map_height`

const zoneReturningCols = `id, tenant_id, parent_id, name, type, description,
	timezone, latitude, longitude, address, floor, building,
	map_image_url, map_width, map_height`

// validZoneTypes mirrors the CHECK constraint on dm3_access.zones.type
// (migration 000019). Keep these in sync.
var validZoneTypes = map[string]bool{
	"site":     true,
	"building": true,
	"floor":    true,
	"room":     true,
	"zone":     true,
}

// scanZone scans all zone columns (including spatial fields) from a row.
func scanZone(row interface{ Scan(dest ...any) error }, z *models.Zone) error {
	return row.Scan(
		&z.ID, &z.TenantID, &z.ParentID, &z.Name, &z.Type, &z.Description,
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
	Type        *string  `json:"type"`
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
	zoneType := "zone"
	if req.Type != nil && *req.Type != "" {
		if !validZoneTypes[*req.Type] {
			httputil.Error(w, http.StatusBadRequest, "type must be one of: site, building, floor, room, zone")
			return
		}
		zoneType = *req.Type
	}

	cid := authsvc.CompanyIDFromContext(r.Context())
	var z models.Zone
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.zones
		   (tenant_id, parent_id, name, type, description, timezone, latitude, longitude,
		    address, floor, building, map_image_url, map_width, map_height)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 RETURNING id, tenant_id, parent_id, name, type, description,
		           timezone, latitude, longitude, address, floor, building,
		           map_image_url, map_width, map_height,
		           0, created_at, updated_at`,
		cid, req.ParentID, req.Name, zoneType, req.Description,
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
	go h.publishEvent("dm3.access."+cid+".zone.created", map[string]any{
		"zone_id":   z.ID,
		"tenant_id": z.TenantID,
		"name":      z.Name,
	})
	httputil.JSON(w, http.StatusCreated, z)
}

func (h *AccessHandlers) GetZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var z models.Zone
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		fmt.Sprintf(`SELECT %s,
		        COUNT(ap.id) AS access_point_count, z.created_at, z.updated_at
		 FROM dm3_access.zones z
		 LEFT JOIN dm3_access.access_points ap ON ap.zone_id = z.id
		 WHERE z.id = $1::uuid AND z.tenant_id = $2::uuid
		 GROUP BY z.id`, zoneSelectCols),
		id, cid,
	), &z)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}
	httputil.JSON(w, http.StatusOK, z)
}

type updateZoneRequest struct {
	Name        *string  `json:"name"`
	Type        *string  `json:"type"`
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

// zoneMapUpload carries a validated, in-memory map image ready to be written
// to object storage. Built by parseZoneMultipart when the request includes a
// `map` file part.
type zoneMapUpload struct {
	data        []byte
	contentType string
	ext         string
	width       int
	height      int
}

// parseZoneMultipart reads a multipart/form-data UpdateZone request. Fields
// map 1:1 to updateZoneRequest (JSON keys) and are only set when present in
// the form — an empty string means "clear to empty", an absent key means
// "leave untouched". The optional `map` file part is decoded + validated in
// the same way as UploadZoneMap.
func parseZoneMultipart(r *http.Request) (updateZoneRequest, *zoneMapUpload, error) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		return updateZoneRequest{}, nil, fmt.Errorf("file too large or invalid multipart")
	}
	form := r.MultipartForm
	var req updateZoneRequest
	strField := func(key string) *string {
		if vals, ok := form.Value[key]; ok && len(vals) > 0 {
			v := vals[0]
			return &v
		}
		return nil
	}
	floatField := func(key string) (*float64, error) {
		if vals, ok := form.Value[key]; ok && len(vals) > 0 && vals[0] != "" {
			f, err := parseFloatField(vals[0])
			if err != nil {
				return nil, fmt.Errorf("%s must be a number", key)
			}
			return &f, nil
		}
		return nil, nil
	}
	req.Name = strField("name")
	req.Type = strField("type")
	req.Description = strField("description")
	// parent_id is a UUID column — empty string would fail the ::uuid cast.
	// Treat "" as "don't touch"; a future dedicated flag can express "clear".
	if v := strField("parent_id"); v != nil && *v != "" {
		req.ParentID = v
	}
	req.Timezone = strField("timezone")
	req.Address = strField("address")
	req.Floor = strField("floor")
	req.Building = strField("building")
	if v, err := floatField("latitude"); err != nil {
		return updateZoneRequest{}, nil, err
	} else {
		req.Latitude = v
	}
	if v, err := floatField("longitude"); err != nil {
		return updateZoneRequest{}, nil, err
	} else {
		req.Longitude = v
	}

	files := form.File["map"]
	if len(files) == 0 {
		return req, nil, nil
	}
	header := files[0]
	file, err := header.Open()
	if err != nil {
		return updateZoneRequest{}, nil, fmt.Errorf("map field required")
	}
	defer file.Close()

	ext, ok := zoneMapExtension(header.Header.Get("Content-Type"), header.Filename)
	if !ok {
		return updateZoneRequest{}, nil, fmt.Errorf("map must be a PNG, JPEG, or GIF image")
	}

	data, err := io.ReadAll(io.LimitReader(file, 20<<20+1))
	if err != nil {
		return updateZoneRequest{}, nil, fmt.Errorf("failed to read uploaded file")
	}
	if len(data) == 0 {
		return updateZoneRequest{}, nil, fmt.Errorf("uploaded file is empty")
	}
	if len(data) > 20<<20 {
		return updateZoneRequest{}, nil, fmt.Errorf("file too large or invalid multipart")
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return updateZoneRequest{}, nil, fmt.Errorf("invalid image file")
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return updateZoneRequest{}, nil, fmt.Errorf("image dimensions are invalid")
	}
	if cfg.Width > 20000 || cfg.Height > 20000 {
		return updateZoneRequest{}, nil, fmt.Errorf("image dimensions exceed maximum (20000x20000)")
	}

	var safeContentType string
	switch format {
	case "png":
		ext = ".png"
		safeContentType = "image/png"
	case "jpeg":
		ext = ".jpg"
		safeContentType = "image/jpeg"
	case "gif":
		ext = ".gif"
		safeContentType = "image/gif"
	default:
		return updateZoneRequest{}, nil, fmt.Errorf("unsupported image format")
	}

	return req, &zoneMapUpload{
		data:        data,
		contentType: safeContentType,
		ext:         ext,
		width:       cfg.Width,
		height:      cfg.Height,
	}, nil
}

func parseFloatField(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}

func (h *AccessHandlers) UpdateZone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	// Accept both JSON and multipart so the frontend can send zone fields +
	// an optional map file in a single request. Multipart is detected via
	// Content-Type; anything else falls through to the original JSON path.
	var req updateZoneRequest
	var uploadedMap *zoneMapUpload
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		parsed, upload, err := parseZoneMultipart(r)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		req = parsed
		uploadedMap = upload
	} else if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If a new map file was attached, push it to object storage BEFORE the DB
	// update so map_image_url/width/height reflect the freshly-uploaded asset.
	if uploadedMap != nil {
		if h.objects == nil {
			httputil.Error(w, http.StatusInternalServerError, "object storage is not configured")
			return
		}
		objectKey := buildZoneMapObjectKey(cid, id, uploadedMap.ext)
		if err := h.objects.PutObject(r.Context(), objectKey, bytes.NewReader(uploadedMap.data), int64(len(uploadedMap.data)), uploadedMap.contentType); err != nil {
			slog.Error("zone map upload failed", "key", objectKey, "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to save uploaded file")
			return
		}
		publicPath := buildZoneMapPublicPath(objectKey)
		req.MapImageURL = &publicPath
		width, height := uploadedMap.width, uploadedMap.height
		req.MapWidth = &width
		req.MapHeight = &height
	}

	if req.Type != nil {
		if *req.Type == "" || !validZoneTypes[*req.Type] {
			httputil.Error(w, http.StatusBadRequest, "type must be one of: site, building, floor, room, zone")
			return
		}
	}

	var z models.Zone
	err := scanZone(h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.zones
		 SET name          = COALESCE($2, name),
		     type          = COALESCE($3, type),
		     description   = COALESCE($4, description),
		     parent_id     = COALESCE($5::uuid, parent_id),
		     timezone      = COALESCE($6, timezone),
		     latitude      = COALESCE($7, latitude),
		     longitude     = COALESCE($8, longitude),
		     address       = COALESCE($9, address),
		     floor         = COALESCE($10, floor),
		     building      = COALESCE($11, building),
		     map_image_url = COALESCE($12, map_image_url),
		     map_width     = COALESCE($13, map_width),
		     map_height    = COALESCE($14, map_height),
		     updated_at    = now()
		 WHERE id = $1::uuid AND ($15::uuid IS NULL OR tenant_id = $15::uuid)
		 RETURNING id, tenant_id, parent_id, name, type, description,
		           timezone, latitude, longitude, address, floor, building,
		           map_image_url, map_width, map_height,
		           0, created_at, updated_at`,
		id, req.Name, req.Type, req.Description, req.ParentID,
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
	go h.publishEvent("dm3.access."+cid+".zone.updated", map[string]any{
		"zone_id":   z.ID,
		"tenant_id": z.TenantID,
		"name":      z.Name,
	})
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
	go h.publishEvent("dm3.access."+cid+".zone.deleted", map[string]any{
		"zone_id":   id,
		"tenant_id": cid,
	})
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
		 RETURNING `+zoneReturningCols+`, 0, created_at, updated_at`,
		id, req.MapImageURL, req.MapWidth, req.MapHeight, cid,
	), &zone)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}

	h.audit.LogFromRequest(r, "access.zone.map.update", "zone", zone.ID, zone.Name, "success", nil, zone)
	httputil.JSON(w, http.StatusOK, zone)
}

func (h *AccessHandlers) UploadZoneMap(w http.ResponseWriter, r *http.Request) {
	zoneID := chi.URLParam(r, "id")
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
		zoneID, cid,
	), &zone)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "zone not found")
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil {
		httputil.Error(w, http.StatusBadRequest, "file too large or invalid multipart")
		return
	}

	file, header, err := r.FormFile("map")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "map field required")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	ext, ok := zoneMapExtension(contentType, header.Filename)
	if !ok {
		httputil.Error(w, http.StatusBadRequest, "map must be a PNG, JPEG, or GIF image")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, 20<<20+1))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to read uploaded file")
		return
	}
	if len(data) == 0 {
		httputil.Error(w, http.StatusBadRequest, "uploaded file is empty")
		return
	}
	if len(data) > 20<<20 {
		httputil.Error(w, http.StatusBadRequest, "file too large or invalid multipart")
		return
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid image file")
		return
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		httputil.Error(w, http.StatusBadRequest, "image dimensions are invalid")
		return
	}
	if cfg.Width > 20000 || cfg.Height > 20000 {
		httputil.Error(w, http.StatusBadRequest, "image dimensions exceed maximum (20000x20000)")
		return
	}

	// Derive content-type and extension strictly from decoded image format, not client header
	var safeContentType string
	switch format {
	case "png":
		ext = ".png"
		safeContentType = "image/png"
	case "jpeg":
		ext = ".jpg"
		safeContentType = "image/jpeg"
	case "gif":
		ext = ".gif"
		safeContentType = "image/gif"
	default:
		httputil.Error(w, http.StatusBadRequest, "unsupported image format")
		return
	}

	objectKey := buildZoneMapObjectKey(cid, zoneID, ext)
	if h.objects == nil {
		httputil.Error(w, http.StatusInternalServerError, "object storage is not configured")
		return
	}
	if err := h.objects.PutObject(r.Context(), objectKey, bytes.NewReader(data), int64(len(data)), safeContentType); err != nil {
		slog.Error("zone map upload failed", "key", objectKey, "size", len(data), "contentType", safeContentType, "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to save uploaded file")
		return
	}

	publicPath := buildZoneMapPublicPath(objectKey)
	previousObjectKey, hasPreviousObject := "", false
	if zone.MapImageURL != nil {
		previousObjectKey, hasPreviousObject = managedAssetObjectKey(*zone.MapImageURL)
	}
	err = scanZone(h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.zones
		 SET map_image_url = $2,
		     map_width     = $3,
		     map_height    = $4,
		     updated_at    = now()
		 WHERE id = $1::uuid AND tenant_id = $5::uuid
		 RETURNING `+zoneReturningCols+`, 0, created_at, updated_at`,
		zoneID, publicPath, cfg.Width, cfg.Height, cid,
	), &zone)
	if err != nil {
		if derr := h.objects.DeleteObject(r.Context(), objectKey); derr != nil {
			slog.Warn("failed to delete orphaned zone map after DB error", "key", objectKey, "error", derr)
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to update zone")
		return
	}
	if hasPreviousObject && previousObjectKey != objectKey {
		if err := h.objects.DeleteObject(r.Context(), previousObjectKey); err != nil {
			slog.Warn("failed to delete superseded zone map object", "key", previousObjectKey, "error", err)
		}
	}

	h.audit.LogFromRequest(r, "access.zone.map.upload", "zone", zone.ID, zone.Name, "success", nil, map[string]any{
		"map_image_url": publicPath,
		"map_width":     cfg.Width,
		"map_height":    cfg.Height,
		"content_type":  contentType,
	})
	httputil.JSON(w, http.StatusOK, zone)
}

func (h *AccessHandlers) ServeManagedAsset(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	objectKey, ok := managedAssetObjectKey(chi.URLParam(r, "*"))
	if !ok || h.objects == nil {
		httputil.Error(w, http.StatusNotFound, "asset not found")
		return
	}
	// Enforce tenant isolation: asset must belong to the caller's tenant
	if cid != "" && !strings.HasPrefix(objectKey, "tenants/"+cid+"/") {
		httputil.Error(w, http.StatusForbidden, "access denied")
		return
	}

	reader, info, err := h.objects.GetObject(r.Context(), objectKey)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, io.EOF) || strings.Contains(strings.ToLower(err.Error()), "not exist") || strings.Contains(strings.ToLower(err.Error()), "no such key") {
			status = http.StatusNotFound
		}
		httputil.Error(w, status, "asset not found")
		return
	}
	defer reader.Close()

	if info.ContentType != "" {
		w.Header().Set("Content-Type", info.ContentType)
	}
	if info.ETag != "" {
		w.Header().Set("ETag", info.ETag)
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	if info.Size > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size))
	}
	if _, err := io.Copy(w, reader); err != nil {
		slog.Warn("failed to stream managed asset", "key", objectKey, "error", err)
	}
}

func buildZoneMapObjectKey(companyID, zoneID, ext string) string {
	return fmt.Sprintf("tenants/%s/access/zones/%s/map%s", companyID, zoneID, ext)
}

func buildZoneMapPublicPath(objectKey string) string {
	return "/assets/" + objectKey
}

func managedAssetObjectKey(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "/assets/")
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "" {
		return "", false
	}
	for _, segment := range strings.Split(trimmed, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", false
		}
	}
	cleaned := pathpkg.Clean("/" + trimmed)
	if cleaned == "/" || cleaned == "." {
		return "", false
	}
	return strings.TrimPrefix(cleaned, "/"), true
}

func contentTypeForExt(ext, fallback string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	default:
		return fallback
	}
}

func zoneMapExtension(contentType, filename string) (string, bool) {
	switch strings.ToLower(contentType) {
	case "image/png":
		return ".png", true
	case "image/jpeg", "image/jpg":
		return ".jpg", true
	case "image/gif":
		return ".gif", true
	}

	switch strings.ToLower(filepath.Ext(filename)) {
	case ".png", ".jpg", ".jpeg", ".gif":
		ext := strings.ToLower(filepath.Ext(filename))
		if ext == ".jpeg" {
			ext = ".jpg"
		}
		return ext, true
	default:
		return "", false
	}
}
