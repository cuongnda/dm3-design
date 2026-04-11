package parking

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ---- Lot update/delete ----

func (h *ParkingHandlers) UpdateParkingLot(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req createParkingLotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))

	var lot ParkingLot
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_lots
		SET site_id = $3::uuid, name = $4, code = $5, description = $6, status = $7, metadata = $8::jsonb, updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, COALESCE(site_id::text, ''), name, code, description, status, metadata, created_at, updated_at`,
		id, cid, req.SiteID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Code), req.Description, req.Status, metadata,
	).Scan(&lot.ID, &lot.TenantID, &siteID, &lot.Name, &lot.Code, &lot.Description, &lot.Status, &lot.Metadata, &lot.CreatedAt, &lot.UpdatedAt)
	if err != nil {
		slog.Error("update parking lot error", "error", err)
		httputil.Error(w, http.StatusNotFound, "parking lot not found")
		return
	}
	lot.SiteID = nilIfEmpty(siteID)
	h.audit.LogFromRequest(r, "parking.lot.update", "parking_lot", lot.ID, lot.Name, "success", nil, lot)
	httputil.JSON(w, http.StatusOK, lot)
}

func (h *ParkingHandlers) DeleteParkingLot(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	var activeSessions int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_parking.parking_sessions WHERE lot_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
		id, cid).Scan(&activeSessions)
	if activeSessions > 0 {
		httputil.Error(w, http.StatusConflict, "cannot delete lot with active sessions")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_parking.parking_lots WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "parking lot not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.lot.delete", "parking_lot", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Zone update/delete ----

func (h *ParkingHandlers) UpdateParkingZone(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req createParkingZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Type != "" && !validParkingZoneType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "invalid zone type")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}
	entryDevices, _ := json.Marshal(defaultSliceMap(req.EntryDevices))
	exitDevices, _ := json.Marshal(defaultSliceMap(req.ExitDevices))
	metadata, _ := json.Marshal(defaultMap(req.Metadata))

	var zone ParkingZone
	var siteID string
	err := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_zones
		SET site_id = $3::uuid, name = $4, code = $5, type = $6, level = $7, total_spaces = $8,
		    allowed_vehicle_types = $9, entry_devices = $10::jsonb, exit_devices = $11::jsonb, status = $12, metadata = $13::jsonb, updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, lot_id, COALESCE(site_id::text, ''), name, code, type, level, total_spaces,
		    allowed_vehicle_types, entry_devices, exit_devices, status, metadata, 0, created_at, updated_at`,
		id, cid, req.SiteID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Code), req.Type, req.Level,
		req.TotalSpaces, req.VehicleTypes, entryDevices, exitDevices, req.Status, metadata,
	).Scan(&zone.ID, &zone.TenantID, &zone.LotID, &siteID, &zone.Name, &zone.Code, &zone.Type, &zone.Level,
		&zone.TotalSpaces, &zone.AllowedVehicleTypes, &zone.EntryDevices, &zone.ExitDevices, &zone.Status,
		&zone.Metadata, &zone.ActiveSessionCount, &zone.CreatedAt, &zone.UpdatedAt)
	if err != nil {
		slog.Error("update parking zone error", "error", err)
		httputil.Error(w, http.StatusNotFound, "parking zone not found")
		return
	}
	zone.SiteID = nilIfEmpty(siteID)
	h.audit.LogFromRequest(r, "parking.zone.update", "parking_zone", zone.ID, zone.Name, "success", nil, zone)
	httputil.JSON(w, http.StatusOK, zone)
}

func (h *ParkingHandlers) DeleteParkingZone(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	var activeSessions int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_parking.parking_sessions WHERE zone_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
		id, cid).Scan(&activeSessions)
	if activeSessions > 0 {
		httputil.Error(w, http.StatusConflict, "cannot delete zone with active sessions")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_parking.parking_zones WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "parking zone not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.zone.delete", "parking_zone", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Vehicle update/delete ----

func (h *ParkingHandlers) UpdateParkingVehicle(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req createParkingVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type != "" && !validParkingVehicleType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "invalid vehicle type")
		return
	}
	if req.Category != "" && !validParkingVehicleCategory(req.Category) {
		httputil.Error(w, http.StatusBadRequest, "invalid vehicle category")
		return
	}
	if req.RegistrationStatus != "" && !validParkingRegistrationStatus(req.RegistrationStatus) {
		httputil.Error(w, http.StatusBadRequest, "invalid registration_status")
		return
	}
	metadata, _ := json.Marshal(defaultMap(req.Metadata))

	var vehicle ParkingVehicle
	var ownerID, monthlyPassID, activePassID string
	err := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_vehicles
		SET owner_user_id = $3::uuid, type = COALESCE(NULLIF($4,''), type), category = COALESCE(NULLIF($5,''), category),
		    brand = $6, color = $7, registration_status = COALESCE(NULLIF($8,''), registration_status),
		    metadata = $9::jsonb, updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, COALESCE(owner_user_id::text,''), plate_number, normalized_plate, plate_image_ref,
		    type, category, brand, color, registration_status, COALESCE(monthly_pass_id::text,''), COALESCE(active_pass_id::text,''),
		    metadata, created_at, updated_at`,
		id, cid, req.OwnerUserID, req.Type, req.Category, req.Brand, req.Color, req.RegistrationStatus, metadata,
	).Scan(&vehicle.ID, &vehicle.TenantID, &ownerID, &vehicle.PlateNumber, &vehicle.NormalizedPlate, &vehicle.PlateImageRef,
		&vehicle.Type, &vehicle.Category, &vehicle.Brand, &vehicle.Color, &vehicle.RegistrationStatus,
		&monthlyPassID, &activePassID, &vehicle.Metadata, &vehicle.CreatedAt, &vehicle.UpdatedAt)
	if err != nil {
		slog.Error("update parking vehicle error", "error", err)
		httputil.Error(w, http.StatusNotFound, "parking vehicle not found")
		return
	}
	vehicle.OwnerUserID = nilIfEmpty(ownerID)
	vehicle.MonthlyPassID = nilIfEmpty(monthlyPassID)
	vehicle.ActivePassID = nilIfEmpty(activePassID)
	h.audit.LogFromRequest(r, "parking.vehicle.update", "parking_vehicle", vehicle.ID, vehicle.PlateNumber, "success", nil, vehicle)
	httputil.JSON(w, http.StatusOK, vehicle)
}

func (h *ParkingHandlers) DeleteParkingVehicle(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	var activeSessions int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_parking.parking_sessions WHERE vehicle_id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
		id, cid).Scan(&activeSessions)
	if activeSessions > 0 {
		httputil.Error(w, http.StatusConflict, "cannot delete vehicle with active sessions")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_parking.parking_vehicles WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "parking vehicle not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.vehicle.delete", "parking_vehicle", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Fee rule update/delete ----

func (h *ParkingHandlers) UpdateParkingFeeRule(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")
	var req createParkingFeeRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.VehicleType != "" && !validParkingVehicleType(req.VehicleType) {
		httputil.Error(w, http.StatusBadRequest, "invalid vehicle_type")
		return
	}
	if req.RateType != "" && !validRateType(req.RateType) {
		httputil.Error(w, http.StatusBadRequest, "invalid rate_type")
		return
	}
	if req.AppliesTo != "" && !validAppliesTo(req.AppliesTo) {
		httputil.Error(w, http.StatusBadRequest, "invalid applies_to")
		return
	}
	rates, _ := json.Marshal(defaultMap(req.Rates))
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var rule ParkingFeeRule
	var siteID, lotID, zoneID string
	err := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_fee_rules
		SET site_id = $3::uuid, lot_id = $4::uuid, zone_id = $5::uuid, name = $6,
		    vehicle_type = COALESCE(NULLIF($7,''), vehicle_type), rate_type = COALESCE(NULLIF($8,''), rate_type),
		    rates = $9::jsonb, free_minutes = $10, max_daily = $11, applies_to = COALESCE(NULLIF($12,''), applies_to),
		    priority = $13, enabled = $14, updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), COALESCE(zone_id::text,''),
		    name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled, created_at, updated_at`,
		id, cid, req.SiteID, req.LotID, req.ZoneID, strings.TrimSpace(req.Name), req.VehicleType, req.RateType,
		rates, req.FreeMinutes, req.MaxDaily, req.AppliesTo, req.Priority, enabled,
	).Scan(&rule.ID, &rule.TenantID, &siteID, &lotID, &zoneID, &rule.Name, &rule.VehicleType, &rule.RateType,
		&rule.Rates, &rule.FreeMinutes, &rule.MaxDaily, &rule.AppliesTo, &rule.Priority, &rule.Enabled, &rule.CreatedAt, &rule.UpdatedAt)
	if err != nil {
		slog.Error("update parking fee rule error", "error", err)
		httputil.Error(w, http.StatusNotFound, "parking fee rule not found")
		return
	}
	rule.SiteID = nilIfEmpty(siteID)
	rule.LotID = nilIfEmpty(lotID)
	rule.ZoneID = nilIfEmpty(zoneID)
	h.audit.LogFromRequest(r, "parking.fee_rule.update", "parking_fee_rule", rule.ID, rule.Name, "success", nil, rule)
	httputil.JSON(w, http.StatusOK, rule)
}

func (h *ParkingHandlers) DeleteParkingFeeRule(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_parking.parking_fee_rules WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "parking fee rule not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.fee_rule.delete", "parking_fee_rule", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Pass update/delete ----

func (h *ParkingHandlers) UpdateParkingPass(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	var req struct {
		ValidFrom  *string `json:"valid_from"`
		ValidUntil *string `json:"valid_until"`
		Status     *string `json:"status"`
		AutoRenew  *bool   `json:"auto_renew"`
		FeeAmount  *float64 `json:"fee_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	row := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_passes
		SET valid_from = COALESCE($3::timestamptz, valid_from),
		    valid_until = COALESCE($4::timestamptz, valid_until),
		    status = COALESCE(NULLIF($5,''), status),
		    auto_renew = COALESCE($6, auto_renew),
		    fee_amount = COALESCE($7, fee_amount),
		    updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, COALESCE(site_id::text,''), COALESCE(lot_id::text,''), zone_id, vehicle_id,
		    COALESCE(user_id::text,''), pass_type, valid_from, valid_until, fee_amount, status, auto_renew, metadata, created_at, updated_at`,
		id, cid, req.ValidFrom, req.ValidUntil, stringOrEmpty(req.Status), req.AutoRenew, req.FeeAmount)
	pass, err := scanParkingPass(row)
	if err != nil {
		slog.Error("update parking pass error", "error", err)
		httputil.Error(w, http.StatusNotFound, "parking pass not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.pass.update", "parking_pass", pass.ID, pass.VehicleID, "success", nil, pass)
	httputil.JSON(w, http.StatusOK, pass)
}

func (h *ParkingHandlers) DeleteParkingPass(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_parking.parking_passes WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "parking pass not found")
		return
	}
	h.audit.LogFromRequest(r, "parking.pass.delete", "parking_pass", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---- Session void ----

func (h *ParkingHandlers) VoidParkingSession(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := chi.URLParam(r, "id")

	row := h.db.Pool.QueryRow(r.Context(),
		sessionSelect+` WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	session, err := scanParkingSession(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "parking session not found")
		return
	}
	if session.Status == ParkingSessionStatusVoided {
		httputil.Error(w, http.StatusConflict, "session already voided")
		return
	}

	row = h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_sessions
		SET status = 'void', updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING `+sessionSelectColumns, id, cid)
	voided, err := scanParkingSession(row)
	if err != nil {
		slog.Error("void parking session error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "parking.session.void", "parking_session", voided.ID, voided.PlateNumber, "success", session, voided)
	httputil.JSON(w, http.StatusOK, voided)
}

// ---- Helpers ----

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
