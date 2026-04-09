package identity

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Vehicle CRUD ─────────────────────────────────────────────────────────────

const vehicleSelectCols = `
	v.id, v.tenant_id, v.user_id,
	v.plate_number, v.vehicle_type,
	COALESCE(v.brand,'')  AS brand,
	COALESCE(v.model,'')  AS model,
	COALESCE(v.color,'')  AS color,
	COALESCE(v.description,'') AS description,
	v.status,
	COALESCE(CONCAT(u.first_name,' ',u.last_name),'') AS owner_name,
	v.created_at, v.updated_at`

func (h *IdentityHandlers) ListVehicles(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	statusFilter := r.URL.Query().Get("status")
	vehicleType := r.URL.Query().Get("vehicle_type")
	sortBy := r.URL.Query().Get("sort_by")
	sortOrder := r.URL.Query().Get("sort_order")

	if sortBy == "" {
		sortBy = "plate_number"
	}
	validSort := map[string]bool{
		"plate_number": true, "vehicle_type": true, "brand": true,
		"color": true, "status": true, "owner_name": true, "created_at": true,
	}
	if !validSort[sortBy] {
		sortBy = "plate_number"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	where := `WHERE v.tenant_id = $1::uuid AND v.is_deleted = false`
	args := []interface{}{companyID}
	idx := 2

	if search != "" {
		where += fmt.Sprintf(` AND (v.plate_number ILIKE $%d OR v.brand ILIKE $%d OR v.model ILIKE $%d OR v.color ILIKE $%d OR CONCAT(u.first_name,' ',u.last_name) ILIKE $%d)`, idx, idx, idx, idx, idx)
		args = append(args, "%"+search+"%")
		idx++
	}
	if userID != "" {
		where += fmt.Sprintf(` AND v.user_id = $%d::uuid`, idx)
		args = append(args, userID)
		idx++
	}
	if statusFilter != "" && statusFilter != "all" {
		where += fmt.Sprintf(` AND v.status = $%d`, idx)
		args = append(args, statusFilter)
		idx++
	}
	if vehicleType != "" && vehicleType != "all" {
		where += fmt.Sprintf(` AND v.vehicle_type = $%d`, idx)
		args = append(args, vehicleType)
		idx++
	}

	// Count
	var total int
	countQ := `SELECT COUNT(*) FROM dm3_identity.vehicles v
		LEFT JOIN dm3_identity.users u ON v.user_id = u.id
		` + where
	if err := h.db.Pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to count vehicles")
		return
	}

	// Data
	dataQ := fmt.Sprintf(`SELECT %s
		FROM dm3_identity.vehicles v
		LEFT JOIN dm3_identity.users u ON v.user_id = u.id
		%s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`, vehicleSelectCols, where, sortBy, sortOrder, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), dataQ, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch vehicles")
		return
	}
	defer rows.Close()

	vehicles := []map[string]interface{}{}
	for rows.Next() {
		var id, tenantID, plateNumber, vType, brand, model, color, desc, status, ownerName string
		var userIDVal *string
		var createdAt, updatedAt interface{}

		if err := rows.Scan(&id, &tenantID, &userIDVal, &plateNumber, &vType,
			&brand, &model, &color, &desc, &status, &ownerName, &createdAt, &updatedAt); err != nil {
			continue
		}
		vehicles = append(vehicles, map[string]interface{}{
			"id":           id,
			"tenant_id":    tenantID,
			"user_id":      userIDVal,
			"plate_number": plateNumber,
			"vehicle_type": vType,
			"brand":        brand,
			"model":        model,
			"color":        color,
			"description":  desc,
			"status":       status,
			"owner_name":   ownerName,
			"created_at":   createdAt,
			"updated_at":   updatedAt,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"vehicles": vehicles,
		"pagination": map[string]interface{}{
			"page":        page,
			"limit":       limit,
			"total":       total,
			"total_pages": (total + limit - 1) / limit,
		},
	})
}

func (h *IdentityHandlers) GetVehicle(w http.ResponseWriter, r *http.Request) {
	vehicleID := chi.URLParam(r, "vehicleID")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	dataQ := fmt.Sprintf(`SELECT %s
		FROM dm3_identity.vehicles v
		LEFT JOIN dm3_identity.users u ON v.user_id = u.id
		WHERE v.id = $1::uuid AND v.tenant_id = $2::uuid AND v.is_deleted = false`,
		vehicleSelectCols)

	var id, tenantID, plateNumber, vType, brand, model, color, desc, status, ownerName string
	var userIDVal *string
	var createdAt, updatedAt interface{}

	err := h.db.Pool.QueryRow(r.Context(), dataQ, vehicleID, companyID).Scan(
		&id, &tenantID, &userIDVal, &plateNumber, &vType,
		&brand, &model, &color, &desc, &status, &ownerName, &createdAt, &updatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "vehicle not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"vehicle": map[string]interface{}{
			"id": id, "tenant_id": tenantID, "user_id": userIDVal,
			"plate_number": plateNumber, "vehicle_type": vType,
			"brand": brand, "model": model, "color": color,
			"description": desc, "status": status, "owner_name": ownerName,
			"created_at": createdAt, "updated_at": updatedAt,
		},
	})
}

func (h *IdentityHandlers) CreateVehicle(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req struct {
		PlateNumber string  `json:"plate_number"`
		VehicleType string  `json:"vehicle_type"`
		Brand       *string `json:"brand"`
		Model       *string `json:"model"`
		Color       *string `json:"color"`
		Description *string `json:"description"`
		UserID      *string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PlateNumber == "" {
		httputil.Error(w, http.StatusBadRequest, "plate_number is required")
		return
	}
	if req.VehicleType == "" {
		req.VehicleType = "car"
	}
	validTypes := map[string]bool{"car": true, "motorbike": true, "bicycle": true, "truck": true, "other": true}
	if !validTypes[req.VehicleType] {
		httputil.Error(w, http.StatusBadRequest, "vehicle_type must be one of: car, motorbike, bicycle, truck, other")
		return
	}

	// Normalize user_id
	var userID *string
	if req.UserID != nil && *req.UserID != "" {
		userID = req.UserID
	}

	var vehicleID string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.vehicles (tenant_id, user_id, plate_number, vehicle_type, brand, model, color, description)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`, companyID, userID, strings.TrimSpace(req.PlateNumber), req.VehicleType,
		req.Brand, req.Model, req.Color, req.Description,
	).Scan(&vehicleID)
	if err != nil {
		if strings.Contains(err.Error(), "uq_vehicle_plate_tenant") {
			httputil.Error(w, http.StatusConflict, "plate number already exists")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create vehicle: %v", err))
		return
	}

	h.audit.LogFromRequest(r, "identity.vehicle.create", "vehicle", vehicleID, req.PlateNumber, "success", nil, map[string]any{
		"plate_number": req.PlateNumber, "vehicle_type": req.VehicleType,
	})
	httputil.JSON(w, http.StatusCreated, map[string]interface{}{
		"id":      vehicleID,
		"message": "vehicle created successfully",
	})
}

func (h *IdentityHandlers) UpdateVehicle(w http.ResponseWriter, r *http.Request) {
	vehicleID := chi.URLParam(r, "vehicleID")
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req struct {
		PlateNumber *string `json:"plate_number"`
		VehicleType *string `json:"vehicle_type"`
		Brand       *string `json:"brand"`
		Model       *string `json:"model"`
		Color       *string `json:"color"`
		Description *string `json:"description"`
		UserID      *string `json:"user_id"`
		Status      *string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	setParts := []string{}
	args := []interface{}{vehicleID, companyID}
	idx := 3

	if req.PlateNumber != nil {
		setParts = append(setParts, fmt.Sprintf("plate_number = $%d", idx))
		args = append(args, strings.TrimSpace(*req.PlateNumber))
		idx++
	}
	if req.VehicleType != nil {
		setParts = append(setParts, fmt.Sprintf("vehicle_type = $%d", idx))
		args = append(args, *req.VehicleType)
		idx++
	}
	if req.Brand != nil {
		setParts = append(setParts, fmt.Sprintf("brand = $%d", idx))
		args = append(args, *req.Brand)
		idx++
	}
	if req.Model != nil {
		setParts = append(setParts, fmt.Sprintf("model = $%d", idx))
		args = append(args, *req.Model)
		idx++
	}
	if req.Color != nil {
		setParts = append(setParts, fmt.Sprintf("color = $%d", idx))
		args = append(args, *req.Color)
		idx++
	}
	if req.Description != nil {
		setParts = append(setParts, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.UserID != nil {
		if *req.UserID == "" {
			setParts = append(setParts, "user_id = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("user_id = $%d::uuid", idx))
			args = append(args, *req.UserID)
			idx++
		}
	}
	if req.Status != nil {
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}

	if len(setParts) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no fields to update")
		return
	}
	setParts = append(setParts, "updated_at = NOW()")

	q := fmt.Sprintf(`UPDATE dm3_identity.vehicles SET %s
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND is_deleted = false`,
		strings.Join(setParts, ", "))

	result, err := h.db.Pool.Exec(r.Context(), q, args...)
	if err != nil {
		if strings.Contains(err.Error(), "uq_vehicle_plate_tenant") {
			httputil.Error(w, http.StatusConflict, "plate number already exists")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to update vehicle")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "vehicle not found")
		return
	}

	h.audit.LogFromRequest(r, "identity.vehicle.update", "vehicle", vehicleID, vehicleID, "success", nil, req)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "vehicle updated successfully"})
}

func (h *IdentityHandlers) DeleteVehicle(w http.ResponseWriter, r *http.Request) {
	vehicleID := chi.URLParam(r, "vehicleID")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.vehicles SET is_deleted = true, status = 'inactive', updated_at = NOW()
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND is_deleted = false
	`, vehicleID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete vehicle")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "vehicle not found")
		return
	}

	h.audit.LogFromRequest(r, "identity.vehicle.delete", "vehicle", vehicleID, vehicleID, "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "vehicle deleted successfully"})
}

func (h *IdentityHandlers) BulkDeleteVehicles(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
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
	args := []interface{}{companyID}
	for i, id := range req.IDs {
		placeholders[i] = fmt.Sprintf("$%d::uuid", i+2)
		args = append(args, id)
	}

	_, err := h.db.Pool.Exec(r.Context(), fmt.Sprintf(`
		UPDATE dm3_identity.vehicles SET is_deleted = true, status = 'inactive', updated_at = NOW()
		WHERE tenant_id = $1::uuid AND id IN (%s) AND is_deleted = false
	`, strings.Join(placeholders, ",")), args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete vehicles")
		return
	}

	h.audit.LogFromRequest(r, "identity.vehicle.bulk_delete", "vehicle", "", fmt.Sprintf("%d vehicles", len(req.IDs)), "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]interface{}{"deleted": len(req.IDs)})
}

// ─── User-scoped vehicle list ─────────────────────────────────────────────────

func (h *IdentityHandlers) ListUserVehicles(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	rows, err := h.db.Pool.Query(r.Context(), fmt.Sprintf(`
		SELECT %s
		FROM dm3_identity.vehicles v
		LEFT JOIN dm3_identity.users u ON v.user_id = u.id
		WHERE v.user_id = $1::uuid AND v.tenant_id = $2::uuid AND v.is_deleted = false
		ORDER BY v.plate_number
	`, vehicleSelectCols), userID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch vehicles")
		return
	}
	defer rows.Close()

	vehicles := []map[string]interface{}{}
	for rows.Next() {
		var id, tenantID, plateNumber, vType, brand, model, color, desc, status, ownerName string
		var uid *string
		var createdAt, updatedAt interface{}
		if err := rows.Scan(&id, &tenantID, &uid, &plateNumber, &vType,
			&brand, &model, &color, &desc, &status, &ownerName, &createdAt, &updatedAt); err != nil {
			continue
		}
		vehicles = append(vehicles, map[string]interface{}{
			"id": id, "tenant_id": tenantID, "user_id": uid,
			"plate_number": plateNumber, "vehicle_type": vType,
			"brand": brand, "model": model, "color": color,
			"description": desc, "status": status, "owner_name": ownerName,
			"created_at": createdAt, "updated_at": updatedAt,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{"vehicles": vehicles})
}
