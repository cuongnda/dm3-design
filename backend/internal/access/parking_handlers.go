package access

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
)

var vietnamesePlatePattern = regexp.MustCompile(`^[0-9]{2}[A-Z]{1,2}[0-9]?[- ]?[0-9]{3,5}(\.[0-9]{2})?$`)

type createParkingLotRequest struct {
	SiteID      *string        `json:"site_id"`
	Name        string         `json:"name"`
	Code        string         `json:"code"`
	Description *string        `json:"description"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
}

type createParkingZoneRequest struct {
	LotID        string           `json:"lot_id"`
	SiteID       *string          `json:"site_id"`
	Name         string           `json:"name"`
	Code         string           `json:"code"`
	Type         string           `json:"type"`
	Level        *string          `json:"level"`
	TotalSpaces  int              `json:"total_spaces"`
	VehicleTypes []string         `json:"vehicle_types"`
	EntryDevices []map[string]any `json:"entry_devices"`
	ExitDevices  []map[string]any `json:"exit_devices"`
	Status       string           `json:"status"`
	Metadata     map[string]any   `json:"metadata"`
}

type createParkingVehicleRequest struct {
	OwnerUserID        *string        `json:"owner_id"`
	PlateNumber        string         `json:"plate_number"`
	PlateImageRef      *string        `json:"plate_image_ref"`
	Type               string         `json:"type"`
	Category           string         `json:"category"`
	Brand              *string        `json:"brand"`
	Color              *string        `json:"color"`
	RegistrationStatus string         `json:"registration_status"`
	MonthlyPassID      *string        `json:"monthly_pass_id"`
	Metadata           map[string]any `json:"metadata"`
}

type createParkingFeeRuleRequest struct {
	SiteID      *string        `json:"site_id"`
	LotID       *string        `json:"lot_id"`
	ZoneID      *string        `json:"zone_id"`
	Name        string         `json:"name"`
	VehicleType string         `json:"vehicle_type"`
	RateType    string         `json:"rate_type"`
	Rates       map[string]any `json:"rates"`
	FreeMinutes int            `json:"free_minutes"`
	MaxDaily    *float64       `json:"max_daily"`
	AppliesTo   string         `json:"applies_to"`
	Priority    int            `json:"priority"`
	Enabled     *bool          `json:"enabled"`
}

type createParkingSessionRequest struct {
	LotID         string         `json:"lot_id"`
	ZoneID        string         `json:"zone_id"`
	PlateNumber   string         `json:"plate_number"`
	VehicleType   string         `json:"vehicle_type"`
	EntryDeviceID *string        `json:"entry_device_id"`
	PlateImageRef *string        `json:"plate_image_ref"`
	MatchedBy     string         `json:"matched_by"`
	Confidence    *float64       `json:"confidence"`
	Metadata      map[string]any `json:"metadata"`
}

type parkingExitRequest struct {
	ExitDeviceID  *string `json:"exit_device_id"`
	PlateImageRef *string `json:"plate_image_ref"`
	PlateNumber   *string `json:"plate_number"`
}

type parkingRecognitionRequest struct {
	LotID        string   `json:"lot_id"`
	ZoneID       string   `json:"zone_id"`
	Direction    string   `json:"direction"`
	PlateNumber  string   `json:"plate_number"`
	VehicleType  string   `json:"vehicle_type"`
	DeviceID     *string  `json:"device_id"`
	ImageRef     *string  `json:"image_ref"`
	Confidence   *float64 `json:"confidence"`
	OperatorNote *string  `json:"operator_note"`
}

type parkingPaymentRequest struct {
	Method    string  `json:"method"`
	Amount    float64 `json:"amount"`
	Reference *string `json:"reference"`
}

type createParkingPassRequest struct {
	SiteID     *string        `json:"site_id"`
	LotID      *string        `json:"lot_id"`
	ZoneID     string         `json:"zone_id"`
	VehicleID  string         `json:"vehicle_id"`
	UserID     *string        `json:"user_id"`
	PassType   string         `json:"pass_type"`
	ValidFrom  string         `json:"valid_from"`
	ValidUntil string         `json:"valid_until"`
	FeeAmount  float64        `json:"fee_amount"`
	Status     string         `json:"status"`
	AutoRenew  bool           `json:"auto_renew"`
	Metadata   map[string]any `json:"metadata"`
}

type barrierCommand struct {
	Action    string `json:"action"`
	SessionID string `json:"session_id"`
	Reason    string `json:"reason"`
}

func (h *AccessHandlers) ListParkingLots(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE l.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("site_id"); v != "" {
		where += fmt.Sprintf(" AND l.site_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND l.status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND (l.name ILIKE $%d OR l.code ILIKE $%d)", idx, idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	var total int64
	countQuery := "SELECT COUNT(*) FROM dm3_operate.parking_lots l " + where
	_ = h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`SELECT l.id, l.tenant_id, COALESCE(l.site_id::text, ''), l.name, l.code,
			l.description, l.status, l.metadata,
			COUNT(DISTINCT z.id) AS zone_count,
			COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') AS active_session_count,
			l.created_at, l.updated_at
		FROM dm3_operate.parking_lots l
		LEFT JOIN dm3_operate.parking_zones z ON z.lot_id = l.id
		LEFT JOIN dm3_operate.parking_sessions s ON s.lot_id = l.id
		%s
		GROUP BY l.id
		ORDER BY l.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list parking lots query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	lots := []models.ParkingLot{}
	for rows.Next() {
		var lot models.ParkingLot
		var siteID string
		if err := rows.Scan(&lot.ID, &lot.TenantID, &siteID, &lot.Name, &lot.Code,
			&lot.Description, &lot.Status, &lot.Metadata,
			&lot.ZoneCount, &lot.ActiveSessionCount,
			&lot.CreatedAt, &lot.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		lot.SiteID = nilIfEmpty(siteID)
		lots = append(lots, lot)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if lots == nil {
		lots = []models.ParkingLot{}
	}
	httputil.Paginated(w, lots, total, page, limit)
}

func (h *AccessHandlers) CreateParkingLot(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingLotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Code) == "" {
		httputil.Error(w, http.StatusBadRequest, "name and code are required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))

	var lot models.ParkingLot
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_lots
			(tenant_id, site_id, name, code, description, status, metadata)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
			RETURNING id, tenant_id, COALESCE(site_id::text, ''), name, code, description, status, metadata, created_at, updated_at`,
		cid, req.SiteID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Code), req.Description, req.Status, metadata,
	).Scan(&lot.ID, &lot.TenantID, &siteID, &lot.Name, &lot.Code, &lot.Description, &lot.Status, &lot.Metadata, &lot.CreatedAt, &lot.UpdatedAt)
	if err != nil {
		slog.Error("create parking lot error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	lot.SiteID = nilIfEmpty(siteID)
	h.audit.LogFromRequest(r, "parking.lot.create", "parking_lot", lot.ID, lot.Name, "success", nil, lot)
	httputil.JSON(w, http.StatusCreated, lot)
}

func (h *AccessHandlers) GetParkingLot(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var lot models.ParkingLot
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT l.id, l.tenant_id, COALESCE(l.site_id::text, ''), l.name, l.code,
			l.description, l.status, l.metadata,
			(SELECT COUNT(*) FROM dm3_operate.parking_zones z WHERE z.lot_id = l.id),
			(SELECT COUNT(*) FROM dm3_operate.parking_sessions s WHERE s.lot_id = l.id AND s.status = 'active'),
			l.created_at, l.updated_at
		FROM dm3_operate.parking_lots l
		WHERE l.id = $1::uuid AND l.tenant_id = $2::uuid`, id, cid,
	).Scan(&lot.ID, &lot.TenantID, &siteID, &lot.Name, &lot.Code, &lot.Description, &lot.Status, &lot.Metadata,
		&lot.ZoneCount, &lot.ActiveSessionCount, &lot.CreatedAt, &lot.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking lot not found")
		return
	}
	lot.SiteID = nilIfEmpty(siteID)
	httputil.JSON(w, http.StatusOK, lot)
}

func (h *AccessHandlers) ListParkingZones(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE z.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("lot_id"); v != "" {
		where += fmt.Sprintf(" AND z.lot_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND z.type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("vehicle_type"); v != "" {
		where += fmt.Sprintf(" AND $%d = ANY(z.allowed_vehicle_types)", idx)
		args = append(args, v)
		idx++
	}
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_operate.parking_zones z "+where, args...).Scan(&total)
	query := fmt.Sprintf(`SELECT z.id, z.tenant_id, z.lot_id, COALESCE(z.site_id::text, ''), z.name, z.code,
			z.type, z.level, z.total_spaces, z.allowed_vehicle_types, z.entry_devices, z.exit_devices,
			z.status, z.metadata,
			COUNT(s.id) FILTER (WHERE s.status = 'active') AS active_session_count,
			z.created_at, z.updated_at
		FROM dm3_operate.parking_zones z
		LEFT JOIN dm3_operate.parking_sessions s ON s.zone_id = z.id
		%s
		GROUP BY z.id
		ORDER BY z.name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	zones := []models.ParkingZone{}
	for rows.Next() {
		var z models.ParkingZone
		var siteID string
		if err := rows.Scan(&z.ID, &z.TenantID, &z.LotID, &siteID, &z.Name, &z.Code,
			&z.Type, &z.Level, &z.TotalSpaces, &z.AllowedVehicleTypes, &z.EntryDevices, &z.ExitDevices,
			&z.Status, &z.Metadata, &z.ActiveSessionCount, &z.CreatedAt, &z.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		z.SiteID = nilIfEmpty(siteID)
		zones = append(zones, z)
	}
	if zones == nil {
		zones = []models.ParkingZone{}
	}
	httputil.Paginated(w, zones, total, page, limit)
}

func (h *AccessHandlers) CreateParkingZone(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LotID == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Code) == "" {
		httputil.Error(w, http.StatusBadRequest, "lot_id, name and code are required")
		return
	}
	if !validParkingZoneType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "invalid parking zone type")
		return
	}
	for _, vt := range req.VehicleTypes {
		if !validParkingVehicleType(vt) {
			httputil.Error(w, http.StatusBadRequest, "invalid vehicle type in vehicle_types")
			return
		}
	}
	if req.Status == "" {
		req.Status = "active"
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))
	entryDevices, _ := json.Marshal(defaultSliceMap(req.EntryDevices))
	exitDevices, _ := json.Marshal(defaultSliceMap(req.ExitDevices))
	if req.TotalSpaces < 0 {
		httputil.Error(w, http.StatusBadRequest, "total_spaces must be >= 0")
		return
	}
	var zone models.ParkingZone
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_zones
			(tenant_id, lot_id, site_id, name, code, type, level, total_spaces, allowed_vehicle_types, entry_devices, exit_devices, status, metadata)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb)
			RETURNING id, tenant_id, lot_id, COALESCE(site_id::text, ''), name, code, type, level, total_spaces,
			allowed_vehicle_types, entry_devices, exit_devices, status, metadata, created_at, updated_at`,
		cid, req.LotID, req.SiteID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Code), req.Type, req.Level,
		req.TotalSpaces, req.VehicleTypes, entryDevices, exitDevices, req.Status, metadata,
	).Scan(&zone.ID, &zone.TenantID, &zone.LotID, &siteID, &zone.Name, &zone.Code, &zone.Type, &zone.Level,
		&zone.TotalSpaces, &zone.AllowedVehicleTypes, &zone.EntryDevices, &zone.ExitDevices, &zone.Status, &zone.Metadata,
		&zone.CreatedAt, &zone.UpdatedAt)
	if err != nil {
		slog.Error("create parking zone error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	zone.SiteID = nilIfEmpty(siteID)
	h.audit.LogFromRequest(r, "parking.zone.create", "parking_zone", zone.ID, zone.Name, "success", nil, zone)
	httputil.JSON(w, http.StatusCreated, zone)
}

func (h *AccessHandlers) GetParkingZone(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var zone models.ParkingZone
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT z.id, z.tenant_id, z.lot_id, COALESCE(z.site_id::text, ''), z.name, z.code,
			z.type, z.level, z.total_spaces, z.allowed_vehicle_types, z.entry_devices, z.exit_devices,
			z.status, z.metadata,
			(SELECT COUNT(*) FROM dm3_operate.parking_sessions s WHERE s.zone_id = z.id AND s.status = 'active'),
			z.created_at, z.updated_at
		FROM dm3_operate.parking_zones z
		WHERE z.id = $1::uuid AND z.tenant_id = $2::uuid`, id, cid,
	).Scan(&zone.ID, &zone.TenantID, &zone.LotID, &siteID, &zone.Name, &zone.Code, &zone.Type, &zone.Level,
		&zone.TotalSpaces, &zone.AllowedVehicleTypes, &zone.EntryDevices, &zone.ExitDevices, &zone.Status,
		&zone.Metadata, &zone.ActiveSessionCount, &zone.CreatedAt, &zone.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking zone not found")
		return
	}
	zone.SiteID = nilIfEmpty(siteID)
	httputil.JSON(w, http.StatusOK, zone)
}

func (h *AccessHandlers) ListParkingVehicles(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("plate_number"); v != "" {
		where += fmt.Sprintf(" AND normalized_plate = $%d", idx)
		args = append(args, normalizePlate(v))
		idx++
	}
	if v := r.URL.Query().Get("owner_id"); v != "" {
		where += fmt.Sprintf(" AND owner_user_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("registration_status"); v != "" {
		where += fmt.Sprintf(" AND registration_status = $%d", idx)
		args = append(args, v)
		idx++
	}
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_operate.parking_vehicles "+where, args...).Scan(&total)
	query := fmt.Sprintf(`SELECT id, tenant_id, COALESCE(owner_user_id::text,''), plate_number, normalized_plate,
			plate_image_ref, type, category, brand, color, registration_status, COALESCE(monthly_pass_id::text,''), COALESCE(active_pass_id::text,''), metadata,
			created_at, updated_at
		FROM dm3_operate.parking_vehicles %s
		ORDER BY updated_at DESC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	vehicles := []models.ParkingVehicle{}
	for rows.Next() {
		var v models.ParkingVehicle
		var ownerID, monthlyPassID, activePassID string
		if err := rows.Scan(&v.ID, &v.TenantID, &ownerID, &v.PlateNumber, &v.NormalizedPlate,
			&v.PlateImageRef, &v.Type, &v.Category, &v.Brand, &v.Color, &v.RegistrationStatus, &monthlyPassID, &activePassID,
			&v.Metadata, &v.CreatedAt, &v.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		v.OwnerUserID = nilIfEmpty(ownerID)
		v.MonthlyPassID = nilIfEmpty(monthlyPassID)
		v.ActivePassID = nilIfEmpty(activePassID)
		vehicles = append(vehicles, v)
	}
	if vehicles == nil {
		vehicles = []models.ParkingVehicle{}
	}
	httputil.Paginated(w, vehicles, total, page, limit)
}

func (h *AccessHandlers) CreateParkingVehicle(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.PlateNumber) == "" || !validParkingVehicleType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "plate_number and valid type are required")
		return
	}
	if req.Category == "" {
		req.Category = models.ParkingVehicleCategoryVisitor
	}
	if !validParkingVehicleCategory(req.Category) {
		httputil.Error(w, http.StatusBadRequest, "invalid vehicle category")
		return
	}
	if req.RegistrationStatus == "" {
		req.RegistrationStatus = defaultRegistrationStatus(req.Category)
	}
	if !validParkingRegistrationStatus(req.RegistrationStatus) {
		httputil.Error(w, http.StatusBadRequest, "invalid registration_status")
		return
	}
	normalized := normalizePlate(req.PlateNumber)
	if normalized == "" || !looksLikePlate(normalized) {
		httputil.Error(w, http.StatusBadRequest, "invalid plate_number")
		return
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))
	var vehicle models.ParkingVehicle
	var ownerID, monthlyPassID, activePassID string
	err := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_vehicles
			(tenant_id, owner_user_id, plate_number, normalized_plate, plate_image_ref, type, category, brand, color, registration_status, monthly_pass_id, active_pass_id, metadata)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12::uuid, $13::jsonb)
			RETURNING id, tenant_id, COALESCE(owner_user_id::text,''), plate_number, normalized_plate, plate_image_ref, type, category, brand, color, registration_status, COALESCE(monthly_pass_id::text,''), COALESCE(active_pass_id::text,''), metadata, created_at, updated_at`,
		cid, req.OwnerUserID, strings.TrimSpace(req.PlateNumber), normalized, req.PlateImageRef, req.Type, req.Category,
		req.Brand, req.Color, req.RegistrationStatus, req.MonthlyPassID, req.MonthlyPassID, metadata,
	).Scan(&vehicle.ID, &vehicle.TenantID, &ownerID, &vehicle.PlateNumber, &vehicle.NormalizedPlate, &vehicle.PlateImageRef,
		&vehicle.Type, &vehicle.Category, &vehicle.Brand, &vehicle.Color, &vehicle.RegistrationStatus, &monthlyPassID, &activePassID,
		&vehicle.Metadata, &vehicle.CreatedAt, &vehicle.UpdatedAt)
	if err != nil {
		slog.Error("create parking vehicle error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	vehicle.OwnerUserID = nilIfEmpty(ownerID)
	vehicle.MonthlyPassID = nilIfEmpty(monthlyPassID)
	vehicle.ActivePassID = nilIfEmpty(activePassID)
	h.audit.LogFromRequest(r, "parking.vehicle.create", "parking_vehicle", vehicle.ID, vehicle.PlateNumber, "success", nil, vehicle)
	httputil.JSON(w, http.StatusCreated, vehicle)
}

func (h *AccessHandlers) GetParkingVehicle(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var vehicle models.ParkingVehicle
	var ownerID, monthlyPassID, activePassID string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT id, tenant_id, COALESCE(owner_user_id::text,''), plate_number, normalized_plate,
			plate_image_ref, type, category, brand, color, registration_status, COALESCE(monthly_pass_id::text,''), COALESCE(active_pass_id::text,''), metadata,
			created_at, updated_at
		FROM dm3_operate.parking_vehicles
		WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&vehicle.ID, &vehicle.TenantID, &ownerID, &vehicle.PlateNumber, &vehicle.NormalizedPlate,
		&vehicle.PlateImageRef, &vehicle.Type, &vehicle.Category, &vehicle.Brand, &vehicle.Color, &vehicle.RegistrationStatus,
		&monthlyPassID, &activePassID, &vehicle.Metadata, &vehicle.CreatedAt, &vehicle.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking vehicle not found")
		return
	}
	vehicle.OwnerUserID = nilIfEmpty(ownerID)
	vehicle.MonthlyPassID = nilIfEmpty(monthlyPassID)
	vehicle.ActivePassID = nilIfEmpty(activePassID)
	httputil.JSON(w, http.StatusOK, vehicle)
}

func (h *AccessHandlers) ListParkingFeeRules(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("zone_id"); v != "" {
		where += fmt.Sprintf(" AND zone_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("vehicle_type"); v != "" {
		where += fmt.Sprintf(" AND vehicle_type = $%d", idx)
		args = append(args, v)
		idx++
	}
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_operate.parking_fee_rules "+where, args...).Scan(&total)
	query := fmt.Sprintf(`SELECT id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), COALESCE(zone_id::text,''),
			name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled, created_at, updated_at
		FROM dm3_operate.parking_fee_rules %s
		ORDER BY priority DESC, name ASC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	rules := []models.ParkingFeeRule{}
	for rows.Next() {
		var rule models.ParkingFeeRule
		var siteID, lotID, zoneID string
		if err := rows.Scan(&rule.ID, &rule.TenantID, &siteID, &lotID, &zoneID,
			&rule.Name, &rule.VehicleType, &rule.RateType, &rule.Rates, &rule.FreeMinutes, &rule.MaxDaily,
			&rule.AppliesTo, &rule.Priority, &rule.Enabled, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		rule.SiteID = nilIfEmpty(siteID)
		rule.LotID = nilIfEmpty(lotID)
		rule.ZoneID = nilIfEmpty(zoneID)
		rules = append(rules, rule)
	}
	if rules == nil {
		rules = []models.ParkingFeeRule{}
	}
	httputil.Paginated(w, rules, total, page, limit)
}

func (h *AccessHandlers) CreateParkingFeeRule(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingFeeRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" || !validParkingVehicleType(req.VehicleType) || !validRateType(req.RateType) {
		httputil.Error(w, http.StatusBadRequest, "name, vehicle_type and rate_type are required")
		return
	}
	if req.AppliesTo == "" {
		req.AppliesTo = "all"
	}
	if !validAppliesTo(req.AppliesTo) {
		httputil.Error(w, http.StatusBadRequest, "invalid applies_to")
		return
	}
	rates, _ := json.Marshal(defaultMap(req.Rates))
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var rule models.ParkingFeeRule
	var siteID, lotID, zoneID string
	err := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_fee_rules
			(tenant_id, site_id, lot_id, zone_id, name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
			RETURNING id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), COALESCE(zone_id::text,''),
			name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled, created_at, updated_at`,
		cid, req.SiteID, req.LotID, req.ZoneID, strings.TrimSpace(req.Name), req.VehicleType, req.RateType, rates,
		req.FreeMinutes, req.MaxDaily, req.AppliesTo, req.Priority, enabled,
	).Scan(&rule.ID, &rule.TenantID, &siteID, &lotID, &zoneID, &rule.Name, &rule.VehicleType, &rule.RateType,
		&rule.Rates, &rule.FreeMinutes, &rule.MaxDaily, &rule.AppliesTo, &rule.Priority, &rule.Enabled, &rule.CreatedAt, &rule.UpdatedAt)
	if err != nil {
		slog.Error("create parking fee rule error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rule.SiteID = nilIfEmpty(siteID)
	rule.LotID = nilIfEmpty(lotID)
	rule.ZoneID = nilIfEmpty(zoneID)
	h.audit.LogFromRequest(r, "parking.fee_rule.create", "parking_fee_rule", rule.ID, rule.Name, "success", nil, rule)
	httputil.JSON(w, http.StatusCreated, rule)
}

func (h *AccessHandlers) ListParkingSessions(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	for _, f := range []struct{ q, col string }{{"lot_id", "lot_id"}, {"zone_id", "zone_id"}} {
		if v := r.URL.Query().Get(f.q); v != "" {
			where += fmt.Sprintf(" AND %s = $%d::uuid", f.col, idx)
			args = append(args, v)
			idx++
		}
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("plate_number"); v != "" {
		where += fmt.Sprintf(" AND normalized_plate = $%d", idx)
		args = append(args, normalizePlate(v))
		idx++
	}
	if v := r.URL.Query().Get("vehicle_type"); v != "" {
		where += fmt.Sprintf(" AND vehicle_type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if ts, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND entry_time >= $%d", idx)
			args = append(args, ts)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if ts, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND entry_time <= $%d", idx)
			args = append(args, ts)
			idx++
		}
	}
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_operate.parking_sessions "+where, args...).Scan(&total)
	query := fmt.Sprintf(sessionSelect+` %s ORDER BY entry_time DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	sessions := []models.ParkingSession{}
	for rows.Next() {
		s, err := scanParkingSession(rows)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		sessions = append(sessions, s)
	}
	if sessions == nil {
		sessions = []models.ParkingSession{}
	}
	httputil.Paginated(w, sessions, total, page, limit)
}

func (h *AccessHandlers) GetParkingSession(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	row := h.db.Pool.QueryRow(r.Context(), sessionSelect+` WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	s, err := scanParkingSession(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking session not found")
		return
	}
	httputil.JSON(w, http.StatusOK, s)
}

func (h *AccessHandlers) CreateParkingSession(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LotID == "" || req.ZoneID == "" || strings.TrimSpace(req.PlateNumber) == "" || !validParkingVehicleType(req.VehicleType) {
		httputil.Error(w, http.StatusBadRequest, "lot_id, zone_id, plate_number and valid vehicle_type are required")
		return
	}
	normalized := normalizePlate(req.PlateNumber)
	if !looksLikePlate(normalized) {
		httputil.Error(w, http.StatusBadRequest, "invalid plate_number")
		return
	}
	metadataMap := defaultMap(req.Metadata)
	metadata, _ := json.Marshal(metadataMap)
	vehicle, _ := h.lookupVehicleByPlate(r.Context(), cid, normalized)
	if vehicle.RegistrationStatus == "blacklisted" {
		httputil.Error(w, http.StatusForbidden, "blacklisted vehicle cannot enter")
		return
	}
	zoneHasCapacity, _ := h.zoneHasCapacity(r.Context(), cid, req.ZoneID)
	if !zoneHasCapacity {
		httputil.Error(w, http.StatusConflict, "parking zone is full")
		return
	}
	pass, _ := h.lookupActiveParkingPass(r.Context(), cid, vehicle.ID, req.ZoneID, time.Now().UTC())
	matchedBy := req.MatchedBy
	if matchedBy == "" {
		matchedBy = "manual"
	}
	decisionCode := "manual_review"
	decisionReason := "operator_created_session"
	if matchedBy == "anpr_auto" {
		decisionCode = "auto_allow"
		decisionReason = "recognized_plate_matched"
	}
	if pass.ID != "" {
		decisionCode = "resident_pass_allow"
		decisionReason = "active_pass_found"
	}
	integrationState, _ := json.Marshal(map[string]any{"barrier_command_sent": false, "plate_source": matchedBy, "decision_code": decisionCode, "decision_reason": decisionReason, "vehicle_matched": vehicle.ID != "", "pass_matched": pass.ID != ""})

	row := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_sessions
			(tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, vehicle_category, entry_device_id, entry_plate_image, status, fee_currency, monthly_pass_id, matched_by, recognition_confidence, decision_code, decision_reason, integration_state, metadata)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9::uuid, $10, 'active', 'VND', $11::uuid, $12, $13, $14, $15, $16::jsonb, $17::jsonb)
			RETURNING `+sessionSelectColumns,
		cid, req.LotID, req.ZoneID, emptyToNil(vehicle.ID), strings.TrimSpace(req.PlateNumber), normalized, req.VehicleType,
		emptyToNil(vehicle.Category), req.EntryDeviceID, req.PlateImageRef, emptyToNil(pass.ID), matchedBy, req.Confidence, decisionCode, decisionReason, integrationState, metadata)
	session, err := scanParkingSession(row)
	if err != nil {
		if strings.Contains(err.Error(), "uq_parking_active_session_per_plate") {
			httputil.Error(w, http.StatusConflict, "active parking session already exists for this plate")
			return
		}
		slog.Error("create parking session error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if req.EntryDeviceID != nil {
		if err := h.publishBarrierCommand(r.Context(), req.ZoneID, *req.EntryDeviceID, barrierCommand{Action: "open", SessionID: session.ID, Reason: decisionCode}); err == nil {
			session.IntegrationState = rawJSON(map[string]any{"barrier_command_sent": true, "entry_device_id": *req.EntryDeviceID, "decision_code": decisionCode, "decision_reason": decisionReason})
			_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_operate.parking_sessions SET integration_state = $2::jsonb WHERE id = $1::uuid`, session.ID, session.IntegrationState)
		}
	}
	h.publishParkingEvent(r.Context(), "parking.session.entry", map[string]any{"session_id": session.ID, "plate_number": session.PlateNumber, "zone_id": session.ZoneID})
	h.audit.LogFromRequest(r, "parking.session.entry", "parking_session", session.ID, session.PlateNumber, "success", nil, session)
	httputil.JSON(w, http.StatusCreated, session)
}

func (h *AccessHandlers) ExitParkingSession(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req parkingExitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	current, err := h.getParkingSession(r.Context(), cid, id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking session not found")
		return
	}
	if current.Status != models.ParkingSessionStatusActive {
		httputil.Error(w, http.StatusConflict, "parking session is not active")
		return
	}
	exitPlate := current.PlateNumber
	if req.PlateNumber != nil && strings.TrimSpace(*req.PlateNumber) != "" {
		exitPlate = strings.TrimSpace(*req.PlateNumber)
	}
	normalizedExit := normalizePlate(exitPlate)
	now := time.Now().UTC()
	feeAmount, feeRuleID, paymentStatus := h.calculateParkingFee(r.Context(), cid, current, now)
	status := models.ParkingSessionStatusCompleted
	if normalizedExit != current.NormalizedPlate {
		status = models.ParkingSessionStatusDisputed
	}
	integration := map[string]any{"barrier_command_sent": false}
	shouldOpenBarrier := status != models.ParkingSessionStatusDisputed && (paymentStatus == models.ParkingPaymentStatusPaid || paymentStatus == models.ParkingPaymentStatusWaived)
	if shouldOpenBarrier && req.ExitDeviceID != nil {
		if err := h.publishBarrierCommand(r.Context(), current.ZoneID, *req.ExitDeviceID, barrierCommand{Action: "open", SessionID: current.ID, Reason: "exit_granted"}); err == nil {
			integration["barrier_command_sent"] = true
			integration["exit_device_id"] = *req.ExitDeviceID
		}
	}
	integrationState, _ := json.Marshal(integration)
	decisionCode := "exit_pending_payment"
	decisionReason := "payment_required_before_barrier_open"
	if status == models.ParkingSessionStatusDisputed {
		decisionCode = "plate_mismatch"
		decisionReason = "exit_plate_does_not_match_entry"
	} else if shouldOpenBarrier {
		decisionCode = "exit_allow"
		decisionReason = "fee_settled_or_waived"
	}
	row := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_operate.parking_sessions SET
			exit_time = $2,
			exit_device_id = $3::uuid,
			exit_plate_image = $4,
			status = $5,
			fee_amount = $6,
			fee_rule_id = $7::uuid,
			payment_status = $8,
			decision_code = $9,
			decision_reason = $10,
			integration_state = $11::jsonb
		WHERE id = $1::uuid AND tenant_id = $12::uuid
		RETURNING `+sessionSelectColumns,
		id, now, req.ExitDeviceID, req.PlateImageRef, status, feeAmount, emptyToNil(feeRuleID), paymentStatus, decisionCode, decisionReason, integrationState, cid)
	updated, err := scanParkingSession(row)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	eventType := "parking.session.exit"
	if status == models.ParkingSessionStatusDisputed {
		eventType = "parking.session.disputed"
	}
	h.publishParkingEvent(r.Context(), eventType, map[string]any{"session_id": updated.ID, "plate_number": updated.PlateNumber, "fee_amount": feeAmount})
	h.audit.LogFromRequest(r, eventType, "parking_session", updated.ID, updated.PlateNumber, "success", current, updated)
	httputil.JSON(w, http.StatusOK, updated)
}

func (h *AccessHandlers) ProcessParkingPayment(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req parkingPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Method) == "" {
		httputil.Error(w, http.StatusBadRequest, "payment method is required")
		return
	}
	current, err := h.getParkingSession(r.Context(), cid, id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking session not found")
		return
	}
	if current.FeeAmount == nil {
		httputil.Error(w, http.StatusConflict, "parking fee has not been calculated yet")
		return
	}
	if req.Amount+0.1 < *current.FeeAmount {
		httputil.Error(w, http.StatusBadRequest, "payment amount is below required fee")
		return
	}
	integrationState := rawJSON(map[string]any{"payment_received": true, "barrier_command_sent": false, "payment_method": req.Method})
	var updated models.ParkingSession
	row := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_operate.parking_sessions SET
			payment_status = $2,
			payment_method = $3,
			payment_ref = $4,
			payment_time = $5,
			status = CASE WHEN status = 'active' THEN 'completed' ELSE status END,
			decision_code = 'payment_confirmed',
			decision_reason = 'payment_cleared_for_exit',
			integration_state = $6::jsonb
		WHERE id = $1::uuid AND tenant_id = $7::uuid
		RETURNING `+sessionSelectColumns,
		id, models.ParkingPaymentStatusPaid, req.Method, req.Reference, time.Now().UTC(), integrationState, cid)
	updated, err = scanParkingSession(row)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if updated.ExitDeviceID != nil {
		if err := h.publishBarrierCommand(r.Context(), updated.ZoneID, *updated.ExitDeviceID, barrierCommand{Action: "open", SessionID: updated.ID, Reason: "payment_confirmed"}); err == nil {
			updated.IntegrationState = rawJSON(map[string]any{"payment_received": true, "barrier_command_sent": true, "payment_method": req.Method, "exit_device_id": *updated.ExitDeviceID})
			_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_operate.parking_sessions SET integration_state = $2::jsonb WHERE id = $1::uuid`, updated.ID, updated.IntegrationState)
		}
	}
	h.publishParkingEvent(r.Context(), "parking.session.payment", map[string]any{"session_id": updated.ID, "amount": req.Amount, "method": req.Method})
	h.audit.LogFromRequest(r, "parking.session.payment", "parking_session", updated.ID, updated.PlateNumber, "success", current, updated)
	httputil.JSON(w, http.StatusOK, updated)
}

func (h *AccessHandlers) RecognizeParkingPlate(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req parkingRecognitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Direction != "entry" && req.Direction != "exit" {
		httputil.Error(w, http.StatusBadRequest, "direction must be entry or exit")
		return
	}
	normalized := normalizePlate(req.PlateNumber)
	if req.LotID == "" || req.ZoneID == "" || !looksLikePlate(normalized) || !validParkingVehicleType(req.VehicleType) {
		httputil.Error(w, http.StatusBadRequest, "lot_id, zone_id, valid plate_number and valid vehicle_type are required")
		return
	}
	vehicle, _ := h.lookupVehicleByPlate(r.Context(), cid, normalized)
	if vehicle.RegistrationStatus == "blacklisted" {
		httputil.JSON(w, http.StatusOK, map[string]any{"decision": "deny", "reason": "blacklisted_vehicle", "vehicle_matched": true, "barrier_open": false})
		return
	}
	confidence := 0.0
	if req.Confidence != nil {
		confidence = *req.Confidence
	}
	matchedBy := recognitionMatchMode(confidence)
	if req.Direction == "entry" {
		meta := map[string]any{"recognition_direction": req.Direction}
		if req.OperatorNote != nil {
			meta["operator_note"] = *req.OperatorNote
		}
		body := createParkingSessionRequest{LotID: req.LotID, ZoneID: req.ZoneID, PlateNumber: req.PlateNumber, VehicleType: req.VehicleType, EntryDeviceID: req.DeviceID, PlateImageRef: req.ImageRef, MatchedBy: matchedBy, Confidence: req.Confidence, Metadata: meta}
		payload, _ := json.Marshal(body)
		r.Body = io.NopCloser(strings.NewReader(string(payload)))
		h.CreateParkingSession(w, r)
		return
	}
	current, err := h.findActiveParkingSessionByPlate(r.Context(), cid, normalized)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "active parking session not found for this plate")
		return
	}
	body := parkingExitRequest{ExitDeviceID: req.DeviceID, PlateImageRef: req.ImageRef, PlateNumber: &req.PlateNumber}
	payload, _ := json.Marshal(body)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", current.ID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	r.Body = io.NopCloser(strings.NewReader(string(payload)))
	h.ExitParkingSession(w, r)
}

func (h *AccessHandlers) ListParkingPasses(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2
	if v := r.URL.Query().Get("zone_id"); v != "" {
		where += fmt.Sprintf(" AND zone_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("vehicle_id"); v != "" {
		where += fmt.Sprintf(" AND vehicle_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_operate.parking_passes "+where, args...).Scan(&total)
	query := fmt.Sprintf(`SELECT id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), zone_id, vehicle_id, COALESCE(user_id::text,''), pass_type, valid_from, valid_until, fee_amount, status, auto_renew, metadata, created_at, updated_at FROM dm3_operate.parking_passes %s ORDER BY valid_until DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	passes := []models.ParkingPass{}
	for rows.Next() {
		p, err := scanParkingPass(rows)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		passes = append(passes, p)
	}
	if passes == nil {
		passes = []models.ParkingPass{}
	}
	httputil.Paginated(w, passes, total, page, limit)
}

func (h *AccessHandlers) CreateParkingPass(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	var req createParkingPassRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ZoneID == "" || req.VehicleID == "" || req.ValidFrom == "" || req.ValidUntil == "" {
		httputil.Error(w, http.StatusBadRequest, "zone_id, vehicle_id, valid_from and valid_until are required")
		return
	}
	if req.PassType == "" {
		req.PassType = "standard"
	}
	if req.Status == "" {
		req.Status = "active"
	}
	validFrom, err := time.Parse("2006-01-02", req.ValidFrom)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "valid_from must be YYYY-MM-DD")
		return
	}
	validUntil, err := time.Parse("2006-01-02", req.ValidUntil)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "valid_until must be YYYY-MM-DD")
		return
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))
	row := h.db.Pool.QueryRow(r.Context(), `INSERT INTO dm3_operate.parking_passes (tenant_id, site_id, lot_id, zone_id, vehicle_id, user_id, pass_type, valid_from, valid_until, fee_amount, status, auto_renew, metadata)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9, $10, $11, $12, $13::jsonb)
		RETURNING id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), zone_id, vehicle_id, COALESCE(user_id::text,''), pass_type, valid_from, valid_until, fee_amount, status, auto_renew, metadata, created_at, updated_at`, cid, req.SiteID, req.LotID, req.ZoneID, req.VehicleID, req.UserID, req.PassType, validFrom, validUntil, req.FeeAmount, req.Status, req.AutoRenew, metadata)
	pass, err := scanParkingPass(row)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_operate.parking_vehicles SET monthly_pass_id = $2::uuid, active_pass_id = $2::uuid WHERE id = $1::uuid AND tenant_id = $3::uuid`, req.VehicleID, pass.ID, cid)
	h.publishParkingEvent(r.Context(), "parking.pass.created", map[string]any{"pass_id": pass.ID, "vehicle_id": pass.VehicleID})
	h.audit.LogFromRequest(r, "parking.pass.created", "parking_pass", pass.ID, pass.VehicleID, "success", nil, pass)
	httputil.JSON(w, http.StatusCreated, pass)
}

func scanParkingPass(row interface{ Scan(dest ...any) error }) (models.ParkingPass, error) {
	var p models.ParkingPass
	var siteID, lotID, userID string
	err := row.Scan(&p.ID, &p.TenantID, &siteID, &lotID, &p.ZoneID, &p.VehicleID, &userID, &p.PassType, &p.ValidFrom, &p.ValidUntil, &p.FeeAmount, &p.Status, &p.AutoRenew, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	p.SiteID = nilIfEmpty(siteID)
	p.LotID = nilIfEmpty(lotID)
	p.UserID = nilIfEmpty(userID)
	return p, nil
}

const sessionSelectColumns = `id, tenant_id, lot_id, zone_id, COALESCE(vehicle_id::text,''), plate_number, normalized_plate, vehicle_type,
	COALESCE(vehicle_category,''), entry_time, exit_time, COALESCE(entry_device_id::text,''), COALESCE(exit_device_id::text,''),
	entry_plate_image, exit_plate_image, status, fee_amount, fee_currency, COALESCE(fee_rule_id::text,''),
	COALESCE(payment_status,''), payment_method, payment_ref, payment_time, COALESCE(monthly_pass_id::text,''), matched_by, recognition_confidence,
	COALESCE(decision_code,''), COALESCE(decision_reason,''), integration_state, metadata, created_at, updated_at`

const sessionSelect = `SELECT ` + sessionSelectColumns + `
	FROM dm3_operate.parking_sessions`

func scanParkingSession(row interface{ Scan(dest ...any) error }) (models.ParkingSession, error) {
	var s models.ParkingSession
	var vehicleID, category, entryDeviceID, exitDeviceID, feeRuleID, paymentStatus, monthlyPassID, decisionCode, decisionReason string
	err := row.Scan(&s.ID, &s.TenantID, &s.LotID, &s.ZoneID, &vehicleID, &s.PlateNumber, &s.NormalizedPlate, &s.VehicleType,
		&category, &s.EntryTime, &s.ExitTime, &entryDeviceID, &exitDeviceID, &s.EntryPlateImage, &s.ExitPlateImage,
		&s.Status, &s.FeeAmount, &s.FeeCurrency, &feeRuleID, &paymentStatus, &s.PaymentMethod, &s.PaymentRef, &s.PaymentTime,
		&monthlyPassID, &s.MatchedBy, &s.RecognitionConfidence, &decisionCode, &decisionReason, &s.IntegrationState, &s.Metadata, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return s, err
	}
	s.VehicleID = nilIfEmpty(vehicleID)
	s.VehicleCategory = nilIfEmpty(category)
	s.EntryDeviceID = nilIfEmpty(entryDeviceID)
	s.ExitDeviceID = nilIfEmpty(exitDeviceID)
	s.FeeRuleID = nilIfEmpty(feeRuleID)
	s.PaymentStatus = nilIfEmpty(paymentStatus)
	s.MonthlyPassID = nilIfEmpty(monthlyPassID)
	s.DecisionCode = nilIfEmpty(decisionCode)
	s.DecisionReason = nilIfEmpty(decisionReason)
	if s.ExitTime != nil {
		duration := int64(s.ExitTime.Sub(s.EntryTime).Minutes())
		if duration < 0 {
			duration = 0
		}
		s.DurationMinutes = &duration
	}
	return s, nil
}

func (h *AccessHandlers) getParkingSession(ctx context.Context, cid, id string) (models.ParkingSession, error) {
	row := h.db.Pool.QueryRow(ctx, sessionSelect+` WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	return scanParkingSession(row)
}

func (h *AccessHandlers) lookupVehicleByPlate(ctx context.Context, cid, normalizedPlate string) (models.ParkingVehicle, error) {
	var v models.ParkingVehicle
	var ownerID, monthlyPassID, activePassID string
	err := h.db.Pool.QueryRow(ctx, `SELECT id, tenant_id, COALESCE(owner_user_id::text,''), plate_number, normalized_plate,
			plate_image_ref, type, category, brand, color, registration_status, COALESCE(monthly_pass_id::text,''), COALESCE(active_pass_id::text,''), metadata, created_at, updated_at
		FROM dm3_operate.parking_vehicles WHERE tenant_id = $1::uuid AND normalized_plate = $2`, cid, normalizedPlate,
	).Scan(&v.ID, &v.TenantID, &ownerID, &v.PlateNumber, &v.NormalizedPlate, &v.PlateImageRef, &v.Type, &v.Category,
		&v.Brand, &v.Color, &v.RegistrationStatus, &monthlyPassID, &activePassID, &v.Metadata, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return models.ParkingVehicle{}, nil
		}
		return models.ParkingVehicle{}, err
	}
	v.OwnerUserID = nilIfEmpty(ownerID)
	v.MonthlyPassID = nilIfEmpty(monthlyPassID)
	v.ActivePassID = nilIfEmpty(activePassID)
	return v, nil
}

func (h *AccessHandlers) lookupActiveParkingPass(ctx context.Context, cid, vehicleID, zoneID string, now time.Time) (models.ParkingPass, error) {
	if vehicleID == "" {
		return models.ParkingPass{}, nil
	}
	row := h.db.Pool.QueryRow(ctx, `SELECT id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), zone_id, vehicle_id, COALESCE(user_id::text,''), pass_type, valid_from, valid_until, fee_amount, status, auto_renew, metadata, created_at, updated_at
		FROM dm3_operate.parking_passes
		WHERE tenant_id = $1::uuid AND vehicle_id = $2::uuid AND zone_id = $3::uuid AND status = 'active' AND valid_from <= $4::date AND valid_until >= $4::date
		ORDER BY valid_until DESC LIMIT 1`, cid, vehicleID, zoneID, now)
	pass, err := scanParkingPass(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return models.ParkingPass{}, nil
		}
		return models.ParkingPass{}, err
	}
	return pass, nil
}

func (h *AccessHandlers) findActiveParkingSessionByPlate(ctx context.Context, cid, normalizedPlate string) (models.ParkingSession, error) {
	row := h.db.Pool.QueryRow(ctx, sessionSelect+` WHERE tenant_id = $1::uuid AND normalized_plate = $2 AND status = 'active' ORDER BY entry_time DESC LIMIT 1`, cid, normalizedPlate)
	return scanParkingSession(row)
}

func (h *AccessHandlers) zoneHasCapacity(ctx context.Context, cid, zoneID string) (bool, error) {
	var totalSpaces, activeSessions int
	err := h.db.Pool.QueryRow(ctx, `SELECT z.total_spaces, COUNT(s.id) FILTER (WHERE s.status = 'active')
		FROM dm3_operate.parking_zones z
		LEFT JOIN dm3_operate.parking_sessions s ON s.zone_id = z.id
		WHERE z.tenant_id = $1::uuid AND z.id = $2::uuid
		GROUP BY z.id`, cid, zoneID).Scan(&totalSpaces, &activeSessions)
	if err != nil {
		if err == pgx.ErrNoRows {
			return true, nil
		}
		return false, err
	}
	return activeSessions < totalSpaces || totalSpaces == 0, nil
}

func (h *AccessHandlers) calculateParkingFee(ctx context.Context, cid string, session models.ParkingSession, exitAt time.Time) (float64, string, string) {
	vehicleCategory := sessionCategory(session)
	rule, err := h.findApplicableParkingFeeRule(ctx, cid, session.ZoneID, session.LotID, session.VehicleType, vehicleCategory)
	if err != nil || rule.ID == "" {
		if session.MonthlyPassID != nil {
			return 0, "", models.ParkingPaymentStatusPaid
		}
		return 0, "", models.ParkingPaymentStatusWaived
	}
	durationMinutes := int(math.Max(0, exitAt.Sub(session.EntryTime).Minutes()))
	amount := calculateFee(rule, durationMinutes)
	paymentStatus := models.ParkingPaymentStatusPending
	if amount <= 0 || session.MonthlyPassID != nil {
		paymentStatus = models.ParkingPaymentStatusWaived
	}
	return amount, rule.ID, paymentStatus
}

func (h *AccessHandlers) findApplicableParkingFeeRule(ctx context.Context, cid, zoneID, lotID, vehicleType, category string) (models.ParkingFeeRule, error) {
	rows, err := h.db.Pool.Query(ctx, `SELECT id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), COALESCE(zone_id::text,''),
			name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled, created_at, updated_at
		FROM dm3_operate.parking_fee_rules
		WHERE tenant_id = $1::uuid AND enabled = true AND vehicle_type = $2
		AND (zone_id IS NULL OR zone_id = $3::uuid)
		AND (lot_id IS NULL OR lot_id = $4::uuid)
		ORDER BY priority DESC, zone_id DESC NULLS LAST, lot_id DESC NULLS LAST`, cid, vehicleType, zoneID, lotID)
	if err != nil {
		return models.ParkingFeeRule{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var rule models.ParkingFeeRule
		var siteID, ridLot, ridZone string
		if err := rows.Scan(&rule.ID, &rule.TenantID, &siteID, &ridLot, &ridZone, &rule.Name, &rule.VehicleType,
			&rule.RateType, &rule.Rates, &rule.FreeMinutes, &rule.MaxDaily, &rule.AppliesTo, &rule.Priority, &rule.Enabled,
			&rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return models.ParkingFeeRule{}, err
		}
		rule.SiteID = nilIfEmpty(siteID)
		rule.LotID = nilIfEmpty(ridLot)
		rule.ZoneID = nilIfEmpty(ridZone)
		if rule.AppliesTo == "all" || rule.AppliesTo == category || (rule.AppliesTo == "registered" && category == models.ParkingVehicleCategoryResident) {
			return rule, nil
		}
	}
	return models.ParkingFeeRule{}, rows.Err()
}

func calculateFee(rule models.ParkingFeeRule, durationMinutes int) float64 {
	billableMinutes := durationMinutes - rule.FreeMinutes
	if billableMinutes < 0 {
		billableMinutes = 0
	}
	var rates map[string]any
	_ = json.Unmarshal(rule.Rates, &rates)
	var amount float64
	switch rule.RateType {
	case "flat":
		amount = toFloat(rates["amount"])
	case "hourly":
		hourly := toFloat(rates["hourly_rate"])
		if hourly <= 0 {
			hourly = toFloat(rates["amount"])
		}
		amount = hourly * math.Ceil(float64(billableMinutes)/60)
	case "daily":
		daily := toFloat(rates["daily_rate"])
		if daily <= 0 {
			daily = toFloat(rates["amount"])
		}
		amount = daily * math.Ceil(float64(billableMinutes)/(24*60))
	case "tiered":
		amount = calculateTieredFee(rates, billableMinutes)
	}
	if rule.MaxDaily != nil && *rule.MaxDaily > 0 {
		days := math.Max(1, math.Ceil(float64(billableMinutes)/(24*60)))
		cap := *rule.MaxDaily * days
		if amount > cap {
			amount = cap
		}
	}
	return math.Round(amount/1000) * 1000
}

func calculateTieredFee(rates map[string]any, billableMinutes int) float64 {
	rawTiers, ok := rates["tiers"].([]any)
	if !ok {
		return 0
	}
	remaining := billableMinutes
	var total float64
	for _, rawTier := range rawTiers {
		tier, ok := rawTier.(map[string]any)
		if !ok {
			continue
		}
		upTo := int(toFloat(tier["up_to_minutes"]))
		flatAmount := toFloat(tier["flat_amount"])
		perHour := toFloat(tier["per_hour"])
		if upTo <= 0 {
			if flatAmount > 0 {
				total += flatAmount
			}
			if perHour > 0 {
				total += perHour * math.Ceil(float64(remaining)/60)
			}
			remaining = 0
			break
		}
		consumed := minInt(remaining, upTo)
		if flatAmount > 0 {
			total += flatAmount
		} else if perHour > 0 {
			total += perHour * math.Ceil(float64(consumed)/60)
		}
		remaining -= consumed
		if remaining <= 0 {
			break
		}
	}
	return total
}

func (h *AccessHandlers) publishParkingEvent(ctx context.Context, eventType string, payload any) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if err := h.nats.Publish(ctx, "dm3.operate.parking."+eventType, b); err != nil {
		slog.Warn("parking event publish failed", "event", eventType, "error", err)
	}
}

func (h *AccessHandlers) publishBarrierCommand(ctx context.Context, zoneID, deviceID string, cmd barrierCommand) error {
	if h.nats == nil {
		return nil
	}
	b, err := json.Marshal(cmd)
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("dm3.operate.parking.barrier.%s.%s.cmd", zoneID, deviceID)
	return h.nats.Publish(ctx, subject, b)
}

func normalizePlate(input string) string {
	clean := strings.ToUpper(strings.TrimSpace(input))
	clean = strings.ReplaceAll(clean, " ", "")
	clean = strings.ReplaceAll(clean, ".", "")
	clean = strings.ReplaceAll(clean, "-", "")
	return clean
}

func looksLikePlate(normalized string) bool {
	if normalized == "" {
		return false
	}
	return vietnamesePlatePattern.MatchString(normalized)
}

func validParkingVehicleType(v string) bool {
	switch v {
	case models.ParkingVehicleTypeCar, models.ParkingVehicleTypeMotorbike, models.ParkingVehicleTypeBicycle, models.ParkingVehicleTypeTruck:
		return true
	default:
		return false
	}
}

func validParkingVehicleCategory(v string) bool {
	switch v {
	case models.ParkingVehicleCategoryResident, models.ParkingVehicleCategoryVisitor, models.ParkingVehicleCategoryTemporary:
		return true
	default:
		return false
	}
}

func validParkingRegistrationStatus(v string) bool {
	switch v {
	case "registered", "visitor", "temporary", "blacklisted":
		return true
	default:
		return false
	}
}

func validParkingZoneType(v string) bool {
	switch v {
	case "underground", "surface", "multi_story", "rooftop":
		return true
	default:
		return false
	}
}

func validRateType(v string) bool {
	switch v {
	case "hourly", "daily", "flat", "tiered":
		return true
	default:
		return false
	}
}

func validAppliesTo(v string) bool {
	switch v {
	case "all", "visitor", "registered", "resident", "temporary":
		return true
	default:
		return false
	}
}

func recognitionMatchMode(confidence float64) string {
	if confidence >= 0.85 {
		return "anpr_auto"
	}
	if confidence >= 0.70 {
		return "anpr_review"
	}
	return "manual_override"
}

func barrierDecisionCode(zoneHasCapacity, vehicleMatched, isBlacklisted, hasPass bool) (string, string) {
	if !zoneHasCapacity {
		return "entry_denied_capacity", "zone_full_or_no_capacity"
	}
	if isBlacklisted {
		return "entry_denied_blacklist", "vehicle_blacklisted"
	}
	if hasPass {
		return "resident_pass_allow", "active_pass_found"
	}
	if vehicleMatched {
		return "auto_allow", "registered_vehicle_matched"
	}
	return "visitor_allow", "visitor_ticket_required"
}

func defaultRegistrationStatus(category string) string {
	switch category {
	case models.ParkingVehicleCategoryResident:
		return "registered"
	case models.ParkingVehicleCategoryTemporary:
		return "temporary"
	default:
		return "visitor"
	}
}

func defaultMap(v map[string]any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	return v
}

func defaultSliceMap(v []map[string]any) []map[string]any {
	if v == nil {
		return []map[string]any{}
	}
	return v
}

func emptyToNil(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func rawJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case json.Number:
		f, _ := x.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	default:
		return 0
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func sessionCategory(session models.ParkingSession) string {
	if session.VehicleCategory != nil && *session.VehicleCategory != "" {
		return *session.VehicleCategory
	}
	return models.ParkingVehicleCategoryVisitor
}
