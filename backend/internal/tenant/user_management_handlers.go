package tenant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// UserManagementHandlers provides user management endpoints for company managers
type UserManagementHandlers struct {
	db *db.DB
}

// NewUserManagementHandlers creates new user management handlers
func NewUserManagementHandlers(database *db.DB) *UserManagementHandlers {
	return &UserManagementHandlers{
		db: database,
	}
}

// GetUsers lists users for current company with pagination and search
func (h *UserManagementHandlers) GetUsers(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	// Parse pagination
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Parse search and filters
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	status := r.URL.Query().Get("status")
	departmentID := r.URL.Query().Get("department_id")
	accessGroupID := r.URL.Query().Get("access_group_id")
	position := strings.TrimSpace(r.URL.Query().Get("position"))
	dateFrom := r.URL.Query().Get("date_from")
	dateTo := r.URL.Query().Get("date_to")
	sortBy := r.URL.Query().Get("sort_by")
	sortOrder := r.URL.Query().Get("sort_order")

	// Default sorting
	if sortBy == "" {
		sortBy = "full_name"
	}
	if sortOrder == "" {
		sortOrder = "ASC"
	}

	// Build query with filters
	query := `
		SELECT
			u.id as user_id,
			COALESCE(u.user_code, '') as user_code,
			COALESCE(u.emp_number, '') as emp_number,
			COALESCE(u.first_name, '') as first_name,
			COALESCE(u.last_name, '') as last_name,
			CONCAT(u.first_name, ' ', u.last_name) as full_name,
			COALESCE(u.email, '') as email,
			COALESCE(u.position, '') as position,
			COALESCE(u.status, 'active') as user_status,
			COALESCE(u.avatar, '') as avatar,
			COALESCE(u.phone, '') as phone,
			COALESCE(u.address, '') as address,
			COALESCE(d.name, '') as department_name,
			COALESCE(ag.name, '') as access_group_name,
			a.type as account_type,
			u.birth_day::text,
			u.effective_date::text,
			u.expired_date::text,
			COALESCE(u.is_master_card, false) as is_master_card
		FROM dm3_identity.users u
		LEFT JOIN dm3_auth.accounts a ON u.account_id = a.id
		LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
		LEFT JOIN LATERAL (
			SELECT string_agg(ag2.name, ', ' ORDER BY ag2.name) AS name
			FROM dm3_access.access_group_users agu2
			JOIN dm3_access.access_groups ag2 ON ag2.id = agu2.access_group_id
				AND (ag2.is_deleted = false OR ag2.is_deleted IS NULL)
			WHERE agu2.user_id = u.id
			  AND (agu2.effective_to IS NULL OR agu2.effective_to > now())
		) ag ON true
		WHERE u.tenant_id = $1::uuid
		AND (u.is_deleted = false OR u.is_deleted IS NULL)
	`
	
	args := []interface{}{companyID}
	argIndex := 2

	// Add search filter
	if search != "" {
		query += fmt.Sprintf(` AND (CONCAT(u.first_name, ' ', u.last_name) ILIKE $%d OR u.email ILIKE $%d OR u.user_code ILIKE $%d OR u.emp_number ILIKE $%d OR u.position ILIKE $%d OR u.phone ILIKE $%d)`, argIndex, argIndex, argIndex, argIndex, argIndex, argIndex)
		args = append(args, "%"+search+"%")
		argIndex++
	}

	// Add status filter
	if status != "" && status != "all" {
		query += fmt.Sprintf(` AND u.status = $%d`, argIndex)
		args = append(args, status)
		argIndex++
	}

	// Add department filter
	if departmentID != "" {
		query += fmt.Sprintf(` AND u.department_id = $%d::uuid`, argIndex)
		args = append(args, departmentID)
		argIndex++
	}

	// Add access group filter (via junction table)
	if accessGroupID != "" {
		query += fmt.Sprintf(` AND u.id IN (SELECT agu.user_id FROM dm3_access.access_group_users agu WHERE agu.access_group_id = $%d::uuid AND (agu.effective_to IS NULL OR agu.effective_to > now()))`, argIndex)
		args = append(args, accessGroupID)
		argIndex++
	}

	// Add position filter
	if position != "" {
		query += fmt.Sprintf(` AND u.position ILIKE $%d`, argIndex)
		args = append(args, "%"+position+"%")
		argIndex++
	}

	// Add date range filters
	if dateFrom != "" {
		query += fmt.Sprintf(` AND u.effective_date >= $%d::date`, argIndex)
		args = append(args, dateFrom)
		argIndex++
	}
	if dateTo != "" {
		query += fmt.Sprintf(` AND u.effective_date <= $%d::date`, argIndex)
		args = append(args, dateTo)
		argIndex++
	}

	// Count total for pagination (wrap the filter part)
	countQuery := `SELECT COUNT(*) FROM dm3_identity.users u WHERE u.tenant_id = $1::uuid AND (u.is_deleted = false OR u.is_deleted IS NULL)`
	countArgs := []interface{}{companyID}
	countArgIndex := 2
	if search != "" {
		countQuery += fmt.Sprintf(` AND (CONCAT(u.first_name, ' ', u.last_name) ILIKE $%d OR u.email ILIKE $%d OR u.user_code ILIKE $%d OR u.emp_number ILIKE $%d OR u.position ILIKE $%d OR u.phone ILIKE $%d)`, countArgIndex, countArgIndex, countArgIndex, countArgIndex, countArgIndex, countArgIndex)
		countArgs = append(countArgs, "%"+search+"%")
		countArgIndex++
	}
	if status != "" && status != "all" {
		countQuery += fmt.Sprintf(` AND u.status = $%d`, countArgIndex)
		countArgs = append(countArgs, status)
		countArgIndex++
	}
	if departmentID != "" {
		countQuery += fmt.Sprintf(` AND u.department_id = $%d::uuid`, countArgIndex)
		countArgs = append(countArgs, departmentID)
		countArgIndex++
	}
	if accessGroupID != "" {
		countQuery += fmt.Sprintf(` AND u.access_group_id = $%d::uuid`, countArgIndex)
		countArgs = append(countArgs, accessGroupID)
		countArgIndex++
	}
	if position != "" {
		countQuery += fmt.Sprintf(` AND u.position ILIKE $%d`, countArgIndex)
		countArgs = append(countArgs, "%"+position+"%")
		countArgIndex++
	}
	if dateFrom != "" {
		countQuery += fmt.Sprintf(` AND u.effective_date >= $%d::date`, countArgIndex)
		countArgs = append(countArgs, dateFrom)
		countArgIndex++
	}
	if dateTo != "" {
		countQuery += fmt.Sprintf(` AND u.effective_date <= $%d::date`, countArgIndex)
		countArgs = append(countArgs, dateTo)
		_ = countArgIndex
	}

	var total int
	err = h.db.Pool.QueryRow(r.Context(), countQuery, countArgs...).Scan(&total)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to count users")
		return
	}

	// Add sorting and pagination to main query
	// Validate sort fields for security
	validSortFields := map[string]bool{
		"full_name":          true,
		"email":              true,
		"user_code":          true,
		"emp_number":         true,
		"position":           true,
		"user_status":        true,
		"department_name":    true,
		"access_group_name":  true,
		"effective_date":     true,
	}
	
	if !validSortFields[sortBy] {
		sortBy = "full_name"
	}
	
	// Validate sort order
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}
	
	query += fmt.Sprintf(` ORDER BY %s %s LIMIT $%d OFFSET $%d`, sortBy, sortOrder, argIndex, argIndex+1)
	args = append(args, limit, offset)

	// Execute main query
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch users")
		return
	}
	defer rows.Close()

	var users []map[string]interface{}
	for rows.Next() {
		var user map[string]interface{}
		var userID, userCode, empNumber, firstName, lastName, fullName string
		var email, position, status, avatar, phone, address string
		var departmentName, accessGroupName string
		var accountType *int
		var birthDay, effectiveDate, expiredDate *string
		var isMasterCard bool

		err := rows.Scan(
			&userID, &userCode, &empNumber, &firstName, &lastName, &fullName,
			&email, &position, &status, &avatar, &phone, &address,
			&departmentName, &accessGroupName, &accountType,
			&birthDay, &effectiveDate, &expiredDate, &isMasterCard,
		)
		
		if err != nil {
			continue
		}

		user = map[string]interface{}{
			"id":               userID,
			"user_code":        userCode,
			"emp_number":       empNumber,
			"first_name":       firstName,
			"last_name":        lastName,
			"full_name":        fullName,
			"email":            email,
			"position":         position,
			"status":           status,
			"avatar":           avatar,
			"phone":            phone,
			"address":          address,
			"department_name":  departmentName,
			"access_group_name": accessGroupName,
			"account_type":     accountType,
			"birth_day":        birthDay,
			"effective_date":   effectiveDate,
			"expired_date":     expiredDate,
			"is_master_card":   isMasterCard,
		}

		users = append(users, user)
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
		"pagination": map[string]interface{}{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"total_pages": (total + limit - 1) / limit,
		},
		"filters": map[string]interface{}{
			"search":        search,
			"status":        status,
			"department_id": departmentID,
		},
	})
}

// GetUser gets a specific user by ID
func (h *UserManagementHandlers) GetUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	// Get user from database directly
	row := h.db.Pool.QueryRow(r.Context(), `
		SELECT user_id, user_code, emp_number, first_name, last_name, full_name,
			   email, position, user_status, avatar, phone, address,
			   department_name, access_group_name, account_type,
			   birth_day, effective_date, expired_date, is_master_card,
			   tenant_id
		FROM dm3_identity.user_details
		WHERE user_id = $1::uuid
	`, userID)

	var user map[string]interface{}
	var userIDResult, userCode, empNumber, firstName, lastName, fullName string
	var email, position, status, avatar, phone, address string
	var departmentName, accessGroupName string
	var accountType *int
	var birthDay, effectiveDate, expiredDate *string
	var isMasterCard bool
	var tenantID string

	err := row.Scan(
		&userIDResult, &userCode, &empNumber, &firstName, &lastName, &fullName,
		&email, &position, &status, &avatar, &phone, &address,
		&departmentName, &accessGroupName, &accountType,
		&birthDay, &effectiveDate, &expiredDate, &isMasterCard,
		&tenantID,
	)

	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	// Verify user belongs to current tenant
	if err := ValidateResourceAccess(r.Context(), tenantID); err != nil {
		httputil.Error(w, http.StatusForbidden, "access denied")
		return
	}

	user = map[string]interface{}{
		"id":               userIDResult,
		"user_code":        userCode,
		"emp_number":       empNumber,
		"first_name":       firstName,
		"last_name":        lastName,
		"full_name":        fullName,
		"email":            email,
		"position":         position,
		"status":           status,
		"avatar":           avatar,
		"phone":            phone,
		"address":          address,
		"department_name":  departmentName,
		"access_group_name": accessGroupName,
		"account_type":     accountType,
		"birth_day":        birthDay,
		"effective_date":   effectiveDate,
		"expired_date":     expiredDate,
		"is_master_card":   isMasterCard,
		"tenant_id":        tenantID,
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"user": user,
	})
}

// CreateUser creates a new user
func (h *UserManagementHandlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if req.FirstName == "" || req.LastName == "" || req.Email == "" {
		httputil.Error(w, http.StatusBadRequest, "first_name, last_name, and email are required")
		return
	}

	// Set company ID from context
	req.TenantID = companyID

	// Apply date defaults
	if req.EffectiveDate == nil || *req.EffectiveDate == "" {
		today := time.Now().Format("2006-01-02")
		req.EffectiveDate = &today
	}
	if req.ExpiredDate == nil || *req.ExpiredDate == "" {
		far := "3000-01-01"
		req.ExpiredDate = &far
	}

	// Auto-generate sequential user code (per company, padded 6 digits like dmpw pattern)
	var maxCode int
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(user_code, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
		FROM dm3_identity.users
		WHERE tenant_id = $1::uuid AND status != 'deleted'
	`, companyID).Scan(&maxCode)
	userCode := fmt.Sprintf("%06d", maxCode+1)
	req.UserCode = &userCode

	// Create user only (following DMPW pattern - Users are business entities, not login accounts)
	var userID string
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.users (
			tenant_id, first_name, last_name, email,
			user_code, emp_number, position, phone, address,
			sex, birth_day, effective_date, expired_date, department_id, status, created_at, updated_at
		) VALUES (
			$1::uuid, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11, $12, $13, $14::uuid, 'active', NOW(), NOW()
		) RETURNING id
	`, companyID, req.FirstName, req.LastName, req.Email,
		req.UserCode, req.EmpNumber, req.Position, req.Phone, req.Address,
		req.Sex, req.BirthDay, req.EffectiveDate, req.ExpiredDate, req.DepartmentID).Scan(&userID)

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create user: %v", err))
		return
	}

	httputil.JSON(w, http.StatusCreated, map[string]interface{}{
		"user_id": userID,
		"message": "user created successfully (login accounts managed separately in System Admin)",
	})
}

// UpdateUser updates an existing user
func (h *UserManagementHandlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}

	// Build dynamic update query
	setParts := []string{}
	args := []interface{}{userID, tenantID}
	argIndex := 3

	if req.FirstName != nil {
		setParts = append(setParts, fmt.Sprintf("first_name = $%d", argIndex))
		args = append(args, *req.FirstName)
		argIndex++
	}
	if req.LastName != nil {
		setParts = append(setParts, fmt.Sprintf("last_name = $%d", argIndex))
		args = append(args, *req.LastName)
		argIndex++
	}
	if req.Email != nil {
		setParts = append(setParts, fmt.Sprintf("email = $%d", argIndex))
		args = append(args, *req.Email)
		argIndex++
	}
	if req.Position != nil {
		setParts = append(setParts, fmt.Sprintf("position = $%d", argIndex))
		args = append(args, *req.Position)
		argIndex++
	}
	if req.Phone != nil {
		setParts = append(setParts, fmt.Sprintf("phone = $%d", argIndex))
		args = append(args, *req.Phone)
		argIndex++
	}
	if req.Address != nil {
		setParts = append(setParts, fmt.Sprintf("address = $%d", argIndex))
		args = append(args, *req.Address)
		argIndex++
	}
	if req.EmpNumber != nil {
		setParts = append(setParts, fmt.Sprintf("emp_number = $%d", argIndex))
		args = append(args, *req.EmpNumber)
		argIndex++
	}
	if req.Sex != nil {
		setParts = append(setParts, fmt.Sprintf("sex = $%d", argIndex))
		args = append(args, *req.Sex)
		argIndex++
	}
	if req.BirthDay != nil {
		if *req.BirthDay == "" {
			setParts = append(setParts, "birth_day = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("birth_day = $%d", argIndex))
			args = append(args, *req.BirthDay)
			argIndex++
		}
	}
	if req.EffectiveDate != nil {
		setParts = append(setParts, fmt.Sprintf("effective_date = $%d", argIndex))
		args = append(args, *req.EffectiveDate)
		argIndex++
	}
	if req.ExpiredDate != nil {
		setParts = append(setParts, fmt.Sprintf("expired_date = $%d", argIndex))
		args = append(args, *req.ExpiredDate)
		argIndex++
	}
	if req.Status != nil {
		setParts = append(setParts, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, *req.Status)
		argIndex++
	}
	if req.DepartmentID != nil {
		if *req.DepartmentID == "" {
			setParts = append(setParts, "department_id = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("department_id = $%d::uuid", argIndex))
			args = append(args, *req.DepartmentID)
			argIndex++
		}
	}

	if len(setParts) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no fields to update")
		return
	}

	// Add updated timestamp
	setParts = append(setParts, "updated_at = NOW()")

	query := fmt.Sprintf(`
		UPDATE dm3_identity.users 
		SET %s
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, strings.Join(setParts, ", "))

	result, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": "user updated successfully",
	})
}

// DeleteUser soft deletes a user
func (h *UserManagementHandlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}

	// Soft delete user
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users 
		SET is_deleted = true, status = 'deleted', updated_on = NOW()
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND is_deleted = false
	`, userID, tenantID)

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete user")
		return
	}

	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": "user deleted successfully",
	})
}

// GetDepartments returns available departments for user assignment
func (h *UserManagementHandlers) GetDepartments(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	query := `
		SELECT id, name, number, department_manager_id
		FROM dm3_identity.departments
		WHERE tenant_id = $1::uuid AND is_deleted = false
		ORDER BY name
	`

	rows, err := h.db.Pool.Query(r.Context(), query, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch departments")
		return
	}
	defer rows.Close()

	var departments []map[string]interface{}
	for rows.Next() {
		var id, name, number string
		var managerID *string

		err := rows.Scan(&id, &name, &number, &managerID)
		if err != nil {
			continue
		}

		departments = append(departments, map[string]interface{}{
			"id":         id,
			"name":       name,
			"number":     number,
			"manager_id": managerID,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"departments": departments,
	})
}

// GetAccessGroups returns available access groups for user assignment
func (h *UserManagementHandlers) GetAccessGroups(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	query := `
		SELECT id, name, is_default, type
		FROM dm3_access.access_groups
		WHERE tenant_id = $1::uuid AND is_deleted = false
		ORDER BY name
	`

	rows, err := h.db.Pool.Query(r.Context(), query, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch access groups")
		return
	}
	defer rows.Close()

	var accessGroups []map[string]interface{}
	for rows.Next() {
		var id, name string
		var isDefault bool
		var groupType int

		err := rows.Scan(&id, &name, &isDefault, &groupType)
		if err != nil {
			continue
		}

		accessGroups = append(accessGroups, map[string]interface{}{
			"id":         id,
			"name":       name,
			"is_default": isDefault,
			"type":       groupType,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"access_groups": accessGroups,
	})
}

// Request/Response types
type CreateUserRequest struct {
	TenantID      string  `json:"-"`
	FirstName     string  `json:"first_name"`
	LastName      string  `json:"last_name"`
	Email         string  `json:"email"`
	UserCode      *string `json:"user_code"`
	EmpNumber     *string `json:"emp_number"`
	Position      *string `json:"position"`
	Phone         *string `json:"phone"`
	Address       *string `json:"address"`
	Sex           *bool   `json:"sex"`
	BirthDay      *string `json:"birth_day"`
	EffectiveDate *string `json:"effective_date"`
	ExpiredDate   *string `json:"expired_date"`
	DepartmentID  *string `json:"department_id"`
}

type UpdateUserRequest struct {
	FirstName     *string `json:"first_name"`
	LastName      *string `json:"last_name"`
	Email         *string `json:"email"`
	Position      *string `json:"position"`
	Phone         *string `json:"phone"`
	Address       *string `json:"address"`
	EmpNumber     *string `json:"emp_number"`
	Sex           *bool   `json:"sex"`
	BirthDay      *string `json:"birth_day"`
	EffectiveDate *string `json:"effective_date"`
	ExpiredDate   *string `json:"expired_date"`
	Status        *string `json:"status"`
	DepartmentID  *string `json:"department_id"`
}

// BulkOperationRequest represents a bulk operation request
type BulkOperationRequest struct {
	UserIDs []string `json:"user_ids"`
	Reason  string   `json:"reason,omitempty"`
}

// BulkOperationResponse represents a bulk operation response
type BulkOperationResponse struct {
	Success      bool                     `json:"success"`
	Message      string                   `json:"message"`
	ProcessedIDs []string                 `json:"processed_ids"`
	FailedIDs    []string                 `json:"failed_ids,omitempty"`
	Errors       []map[string]interface{} `json:"errors,omitempty"`
	AffectedRows int64                    `json:"affected_rows"`
}

// BulkDeleteUsers soft deletes multiple users with validation
func (h *UserManagementHandlers) BulkDeleteUsers(w http.ResponseWriter, r *http.Request) {
	var req BulkOperationRequest
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	
	if len(req.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}

	if len(req.UserIDs) > 100 {
		httputil.Error(w, http.StatusBadRequest, "maximum 100 users can be deleted at once")
		return
	}
	
	// Get tenant and company ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}

	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	// Validate users belong to current company and can be deleted
	validationQuery := `
		SELECT u.id, u.full_name, ca.account_id 
		FROM dm3_identity.users u
		LEFT JOIN dm3_identity.company_accounts ca ON u.account_id = ca.account_id AND ca.tenant_id = u.tenant_id
		WHERE u.id = ANY($1::uuid[]) 
		  AND u.tenant_id = $2::uuid 
		  AND u.tenant_id = $3::uuid
		  AND u.is_deleted = false
	`
	
	rows, err := h.db.Pool.Query(r.Context(), validationQuery, req.UserIDs, tenantID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to validate users")
		return
	}
	defer rows.Close()

	validUserIDs := []string{}
	userNames := map[string]string{}
	protectedUsers := []string{}

	for rows.Next() {
		var userID, fullName string
		var accountID *string
		
		if err := rows.Scan(&userID, &fullName, &accountID); err != nil {
			continue
		}

		userNames[userID] = fullName

		// Check if user is protected (has system_admin or primary_manager account)
		if accountID != nil {
			var accountType int
			err := h.db.Pool.QueryRow(r.Context(), 
				`SELECT account_type FROM dm3_identity.company_accounts WHERE account_id = $1::uuid AND tenant_id = $2::uuid`,
				*accountID, companyID).Scan(&accountType)
			
			if err == nil && (accountType >= 4) { // primary_manager or system_admin
				protectedUsers = append(protectedUsers, fullName)
				continue
			}
		}

		validUserIDs = append(validUserIDs, userID)
	}

	if len(protectedUsers) > 0 {
		httputil.Error(w, http.StatusForbidden, 
			fmt.Sprintf("cannot delete protected users: %s", strings.Join(protectedUsers, ", ")))
		return
	}

	if len(validUserIDs) == 0 {
		httputil.Error(w, http.StatusNotFound, "no valid users found to delete")
		return
	}
	
	// Perform bulk deletion
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users 
		SET is_deleted = true, status = 'deleted', updated_on = NOW(),
		    deletion_reason = COALESCE($3, 'Bulk deletion'),
		    deleted_by = $4
		WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid AND is_deleted = false
	`, validUserIDs, tenantID, req.Reason, getUserIDFromContext(r.Context()))
	
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete users")
		return
	}
	
	response := BulkOperationResponse{
		Success:      true,
		Message:      fmt.Sprintf("Successfully deleted %d users", result.RowsAffected()),
		ProcessedIDs: validUserIDs,
		AffectedRows: result.RowsAffected(),
	}

	httputil.JSON(w, http.StatusOK, response)
}

// BulkUpdateDepartment updates department for multiple users
func (h *UserManagementHandlers) BulkUpdateDepartment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserIDs      []string `json:"user_ids"`
		DepartmentID string   `json:"department_id"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	
	if len(req.UserIDs) == 0 || req.DepartmentID == "" {
		httputil.Error(w, http.StatusBadRequest, "user_ids and department_id required")
		return
	}
	
	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}
	
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users 
		SET department_id = $1::uuid, updated_on = NOW()
		WHERE id = ANY($2::uuid[]) AND tenant_id = $3::uuid AND is_deleted = false
	`, req.DepartmentID, req.UserIDs, tenantID)
	
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update users")
		return
	}
	
	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("updated %d users", result.RowsAffected()),
		"updated_count": result.RowsAffected(),
	})
}

// BulkUpdateAccessGroup assigns multiple users to an access group via the junction table
func (h *UserManagementHandlers) BulkUpdateAccessGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserIDs       []string `json:"user_ids"`
		AccessGroupID string   `json:"access_group_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.UserIDs) == 0 || req.AccessGroupID == "" {
		httputil.Error(w, http.StatusBadRequest, "user_ids and access_group_id required")
		return
	}

	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(), `
		INSERT INTO dm3_access.access_group_users (tenant_id, access_group_id, user_id)
		SELECT u.tenant_id, $1::uuid, u.id
		FROM dm3_identity.users u
		WHERE u.id = ANY($2::uuid[])
		  AND u.tenant_id = $3::uuid
		  AND (u.is_deleted = false OR u.is_deleted IS NULL)
		ON CONFLICT (access_group_id, user_id) DO NOTHING
	`, req.AccessGroupID, req.UserIDs, tenantID)

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to assign users")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("assigned %d users", result.RowsAffected()),
		"assigned_count": result.RowsAffected(),
	})
}

// BulkApproveUsers approves multiple pending users
func (h *UserManagementHandlers) BulkApproveUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserIDs []string `json:"user_ids"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	
	if len(req.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}
	
	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}
	
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users 
		SET status = 'active', updated_on = NOW()
		WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid AND status = 'pending' AND is_deleted = false
	`, req.UserIDs, tenantID)
	
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to approve users")
		return
	}
	
	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("approved %d users", result.RowsAffected()),
		"approved_count": result.RowsAffected(),
	})
}

// BulkSuspendUsers suspends multiple users
func (h *UserManagementHandlers) BulkSuspendUsers(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserIDs []string `json:"user_ids"`
		Reason  string   `json:"reason"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	
	if len(req.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}
	
	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}
	
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users 
		SET status = 'suspended', updated_on = NOW()
		WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid AND status != 'suspended' AND is_deleted = false
	`, req.UserIDs, tenantID)
	
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to suspend users")
		return
	}
	
	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("suspended %d users", result.RowsAffected()),
		"suspended_count": result.RowsAffected(),
	})
}

// Placeholder methods for import/export and other features
func (h *UserManagementHandlers) ImportUsers(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Import functionality not yet implemented",
	})
}

func (h *UserManagementHandlers) ExportUsers(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Export functionality not yet implemented", 
	})
}

func (h *UserManagementHandlers) DownloadTemplate(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Template download not yet implemented",
	})
}

func (h *UserManagementHandlers) GetUserAccessHistory(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Access history not yet implemented",
	})
}

func (h *UserManagementHandlers) GetUserCards(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "User cards not yet implemented",
	})
}

func (h *UserManagementHandlers) AssignCard(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Card assignment not yet implemented",
	})
}

func (h *UserManagementHandlers) RevokeCard(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusNotImplemented, map[string]string{
		"message": "Card revocation not yet implemented",
	})
}

// ChangeUserPassword changes password for a user account
func (h *UserManagementHandlers) ChangeUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	var req struct {
		NewPassword string `json:"new_password"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.NewPassword == "" {
		httputil.Error(w, http.StatusBadRequest, "new_password is required")
		return
	}

	if len(req.NewPassword) < 6 {
		httputil.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	// Get tenant ID for validation
	tenantID, err := TenantIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "tenant context required")
		return
	}

	// Hash the new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	// Update password in accounts table (find account by user ID)
	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_auth.accounts 
		SET password_hash = $1, updated_on = NOW()
		WHERE id = (
			SELECT account_id 
			FROM dm3_identity.users 
			WHERE id = $2::uuid 
			AND tenant_id = $3::uuid 
			AND account_id IS NOT NULL
			AND is_deleted = false
		)
	`, string(hashedPassword), userID, tenantID)

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found or user does not have an account")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": "password updated successfully",
	})
}

// getUserTypeFromRole converts role string to account type number
func getUserTypeFromRole(role string) int {
	switch role {
	case "system_admin":
		return 5
	case "primary_manager":
		return 4
	case "manager":
		return 2
	case "operator":
		return 1
	default:
		return 1 // Default to operator
	}
}

// getUserIDFromContext extracts user ID from JWT context
func getUserIDFromContext(ctx context.Context) *string {
	// This would extract from JWT claims - simplified for now
	if userID := ctx.Value("user_id"); userID != nil {
		if id, ok := userID.(string); ok {
			return &id
		}
	}
	return nil
}

// GetFilterOptions returns filter options for user search
func (h *UserManagementHandlers) GetFilterOptions(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	// Get departments
	departments := []map[string]interface{}{}
	deptRows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, name, number 
		FROM dm3_identity.departments 
		WHERE tenant_id = $1::uuid 
		ORDER BY name ASC
	`, companyID)
	if err == nil {
		defer deptRows.Close()
		for deptRows.Next() {
			var id, name, number string
			if err := deptRows.Scan(&id, &name, &number); err == nil {
				departments = append(departments, map[string]interface{}{
					"id": id,
					"name": name,
					"number": number,
				})
			}
		}
	}

	// Get access groups
	accessGroups := []map[string]interface{}{}
	agRows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, name, is_default, type 
		FROM dm3_access.access_groups 
		WHERE tenant_id = $1::uuid 
		ORDER BY name ASC
	`, companyID)
	if err == nil {
		defer agRows.Close()
		for agRows.Next() {
			var id, name string
			var isDefault bool
			var groupType int
			if err := agRows.Scan(&id, &name, &isDefault, &groupType); err == nil {
				accessGroups = append(accessGroups, map[string]interface{}{
					"id": id,
					"name": name,
					"is_default": isDefault,
					"type": groupType,
				})
			}
		}
	}

	// Get unique positions
	positions := []string{}
	posRows, err := h.db.Pool.Query(r.Context(), `
		SELECT DISTINCT position 
		FROM dm3_identity.users 
		WHERE tenant_id = $1::uuid AND position != '' AND position IS NOT NULL
		ORDER BY position ASC
	`, companyID)
	if err == nil {
		defer posRows.Close()
		for posRows.Next() {
			var position string
			if err := posRows.Scan(&position); err == nil {
				positions = append(positions, position)
			}
		}
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"departments": departments,
		"access_groups": accessGroups,
		"positions": positions,
	})
}