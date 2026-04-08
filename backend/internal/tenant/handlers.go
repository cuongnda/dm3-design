package tenant

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// TenantHandlers provides tenant/company management endpoints
type TenantHandlers struct {
	db *db.DB
}

// NewTenantHandlers creates a new tenant handlers instance
func NewTenantHandlers(database *db.DB) *TenantHandlers {
	return &TenantHandlers{db: database}
}

// GetCurrentTenant returns information about the current user's tenant
func (h *TenantHandlers) GetCurrentTenant(w http.ResponseWriter, r *http.Request) {
	info, err := TenantInfoFromContext(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, "no tenant context available")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"tenant": info,
	})
}

// ListTenants lists all tenants (system admin only)
func (h *TenantHandlers) ListTenants(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil || claims.Role != "system_admin" {
		writeError(w, http.StatusForbidden, "system admin access required")
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

	// Build query with optional filters
	qb := NewQueryBuilderOptional(r.Context(), `
		SELECT id, name, code, plan, status, max_devices, max_users, created_at, updated_at
		FROM dm3_auth.companies
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`)

	query, args := qb.Build()
	args = append([]interface{}{limit, offset}, args...)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch tenants")
		return
	}
	defer rows.Close()

	var tenants []map[string]interface{}
	for rows.Next() {
		var t TenantInfo
		var createdAt, updatedAt time.Time
		
		err := rows.Scan(
			&t.ID, &t.CompanyName, &t.CompanyCode, &t.Plan, &t.Status,
			&t.MaxDevices, &t.MaxUsers, &createdAt, &updatedAt,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to parse tenant data")
			return
		}

		tenants = append(tenants, map[string]interface{}{
			"id":           t.ID,
			"name":         t.CompanyName,
			"code":         t.CompanyCode,
			"plan":         t.Plan,
			"status":       t.Status,
			"max_devices":  t.MaxDevices,
			"max_users":    t.MaxUsers,
			"created_at":   createdAt,
			"updated_at":   updatedAt,
		})
	}

	// Count total for pagination
	var total int
	err = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_auth.companies").Scan(&total)
	if err != nil {
		total = 0
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"tenants": tenants,
		"pagination": map[string]interface{}{
			"page":  page,
			"limit": limit,
			"total": total,
		},
	})
}

// GetTenant gets a specific tenant by ID (system admin only)
func (h *TenantHandlers) GetTenant(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil || claims.Role != "system_admin" {
		writeError(w, http.StatusForbidden, "system admin access required")
		return
	}

	tenantID := chi.URLParam(r, "id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant ID required")
		return
	}

	info, err := loadTenantInfo(h.db, tenantID)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"tenant": info,
	})
}

// UpdateTenantStatus updates tenant status (system admin only)
func (h *TenantHandlers) UpdateTenantStatus(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil || claims.Role != "system_admin" {
		writeError(w, http.StatusForbidden, "system admin access required")
		return
	}

	tenantID := chi.URLParam(r, "id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant ID required")
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		"active":    true,
		"suspended": true,
		"inactive":  true,
	}
	if !validStatuses[req.Status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	// Update tenant status
	_, err := h.db.Pool.Exec(r.Context(),
		"UPDATE dm3_auth.companies SET status = $1, updated_at = NOW() WHERE id = $2::uuid",
		req.Status, tenantID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update tenant status")
		return
	}

	// Return updated tenant info
	info, err := loadTenantInfo(h.db, tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch updated tenant")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"tenant": info,
		"message": "tenant status updated successfully",
	})
}

// GetTenantStats returns usage statistics for the current tenant
func (h *TenantHandlers) GetTenantStats(w http.ResponseWriter, r *http.Request) {
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, "no tenant context available")
		return
	}

	// Get device count
	var deviceCount int
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_devices.devices WHERE tenant_id = $1::uuid",
		tenantID,
	).Scan(&deviceCount)
	if err != nil {
		deviceCount = 0
	}

	// Get user count
	var userCount int
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_auth.accounts WHERE tenant_id = $1::uuid",
		tenantID,
	).Scan(&userCount)
	if err != nil {
		userCount = 0
	}

	// Get person count
	var personCount int
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_identity.persons WHERE tenant_id = $1::uuid",
		tenantID,
	).Scan(&personCount)
	if err != nil {
		personCount = 0
	}

	// Get tenant info for limits
	info, err := TenantInfoFromContext(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, "no tenant info available")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id": tenantID,
		"usage": map[string]interface{}{
			"devices": map[string]interface{}{
				"current": deviceCount,
				"limit":   info.MaxDevices,
			},
			"users": map[string]interface{}{
				"current": userCount,
				"limit":   info.MaxUsers,
			},
			"persons": map[string]interface{}{
				"current": personCount,
				"limit":   -1, // No limit for persons
			},
		},
	})
}

// ValidateTenantLimits checks if the tenant can create new resources
func (h *TenantHandlers) ValidateTenantLimits(w http.ResponseWriter, r *http.Request) {
	resourceType := r.URL.Query().Get("resource")
	if resourceType == "" {
		writeError(w, http.StatusBadRequest, "resource parameter required")
		return
	}

	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, "no tenant context available")
		return
	}

	info, err := TenantInfoFromContext(r.Context())
	if err != nil {
		writeError(w, http.StatusBadRequest, "no tenant info available")
		return
	}

	canCreate := true
	var message string

	switch resourceType {
	case "device":
		var count int
		err = h.db.Pool.QueryRow(r.Context(),
			"SELECT COUNT(*) FROM dm3_devices.devices WHERE tenant_id = $1::uuid",
			tenantID,
		).Scan(&count)
		if err == nil && count >= info.MaxDevices {
			canCreate = false
			message = "device limit reached"
		}
	case "user":
		var count int
		err = h.db.Pool.QueryRow(r.Context(),
			"SELECT COUNT(*) FROM dm3_auth.accounts WHERE tenant_id = $1::uuid",
			tenantID,
		).Scan(&count)
		if err == nil && count >= info.MaxUsers {
			canCreate = false
			message = "user limit reached"
		}
	default:
		writeError(w, http.StatusBadRequest, "invalid resource type")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"can_create": canCreate,
		"message":    message,
	})
}