package tenant

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// Department models
type Department struct {
	ID                  string  `json:"id" db:"id"`
	TenantID           string  `json:"tenant_id" db:"tenant_id"`
	ParentID            *string `json:"parent_id" db:"parent_id"`
	Name                string  `json:"name" db:"name"`
	Number              string  `json:"number" db:"number"`
	DepartmentManagerID *string `json:"department_manager_id" db:"department_manager_id"`
	ManagerName         *string `json:"manager_name" db:"manager_name"`
	AccessGroupID       *string `json:"access_group_id" db:"access_group_id"`
	UserCount           int     `json:"user_count" db:"user_count"`
	CreatedAt           string  `json:"created_at" db:"created_at"`
	UpdatedAt           string  `json:"updated_at" db:"updated_at"`
	IsDeleted           bool    `json:"is_deleted" db:"is_deleted"`
}

type DepartmentFormData struct {
	Name                string  `json:"name"`
	Number              string  `json:"number"`
	Description         *string `json:"description"`
	ParentID            *string `json:"parent_id"`
	DepartmentManagerID *string `json:"department_manager_id"`
	AccessGroupID       *string `json:"access_group_id"`
}

type DepartmentUser struct {
	ID             string  `json:"id" db:"id"`
	UserCode       string  `json:"user_code" db:"user_code"`
	FirstName      string  `json:"first_name" db:"first_name"`
	LastName       string  `json:"last_name" db:"last_name"`
	Email          string  `json:"email" db:"email"`
	Position       *string `json:"position" db:"position"`
	DepartmentID   *string `json:"department_id" db:"department_id"`
	DepartmentName *string `json:"department_name" db:"department_name"`
}

type DepartmentManager struct {
	ID       string  `json:"id" db:"id"`
	Username string  `json:"username" db:"username"`
	Name     *string `json:"name" db:"name"`
	Type     int     `json:"type" db:"type"`
}

type DepartmentImportData struct {
	Name                     string  `json:"name"`
	Number                   string  `json:"number"`
	Description              *string `json:"description"`
	ParentDepartmentNumber   *string `json:"parent_department_number"`
	ManagerUsername          *string `json:"manager_username"`
}

// ListDepartments handles GET /api/v1/departments
func (h *UserManagementHandlers) ListDepartments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, companyErr := CompanyIDFromContext(ctx)
	if companyErr != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	// Pagination
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	// Accept both page_size and limit
	pageSizeStr := r.URL.Query().Get("page_size")
	if pageSizeStr == "" {
		pageSizeStr = r.URL.Query().Get("limit")
	}
	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Filters
	search := r.URL.Query().Get("search")
	status := r.URL.Query().Get("status")
	manager := r.URL.Query().Get("manager")
	parentID := r.URL.Query().Get("parent_id")

	// Sort
	sortBy := r.URL.Query().Get("sort_by")
	sortOrder := r.URL.Query().Get("sort_order")
	validSortCols := map[string]string{
		"name":         "d.name",
		"number":       "d.number",
		"manager_name": "TRIM(COALESCE(mgr.first_name,'') || ' ' || COALESCE(mgr.last_name,''))",
		"user_count":   "COALESCE(user_counts.count, 0)",
		"created_at":   "d.created_at",
	}
	sortCol, ok := validSortCols[sortBy]
	if !ok {
		sortCol = "d.name"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	// Build query
	var whereConditions []string
	var args []interface{}
	argIndex := 1

	whereConditions = append(whereConditions, fmt.Sprintf("d.tenant_id = $%d::uuid", argIndex))
	args = append(args, companyID)
	argIndex++

	whereConditions = append(whereConditions, "d.is_deleted = false")

	if search != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("(d.name ILIKE $%d OR d.number ILIKE $%d)", argIndex, argIndex))
		args = append(args, "%"+search+"%")
		argIndex++
	}

	if status == "active" {
		// Add active condition if needed
	} else if status == "inactive" {
		// Add inactive condition if needed
	}

	if manager == "yes" {
		whereConditions = append(whereConditions, fmt.Sprintf("d.department_manager_id IS NOT NULL", ))
	} else if manager == "no" {
		whereConditions = append(whereConditions, fmt.Sprintf("d.department_manager_id IS NULL"))
	}

	if parentID != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("d.parent_id = $%d::uuid", argIndex))
		args = append(args, parentID)
		argIndex++
	}

	whereClause := "WHERE " + strings.Join(whereConditions, " AND ")

	// Count query
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM dm3_identity.departments d 
		%s`, whereClause)

	var total int
	err = h.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "count error: "+err.Error())
		return
	}

	// Data query
	dataQuery := fmt.Sprintf(`
		SELECT 
			d.id, d.tenant_id, d.parent_id, d.name, d.number,
			d.department_manager_id, TRIM(COALESCE(mgr.first_name,'') || ' ' || COALESCE(mgr.last_name,'')) as manager_name,
			COALESCE(user_counts.count, 0) as user_count,
			d.created_at::text, d.updated_at::text, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_identity.users mgr ON d.department_manager_id = mgr.id
		LEFT JOIN (
			SELECT department_id, COUNT(*) as count
			FROM dm3_identity.users
			WHERE department_id IS NOT NULL AND is_deleted = false
			GROUP BY department_id
		) user_counts ON d.id = user_counts.department_id
		%s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`, whereClause, sortCol, sortOrder, argIndex, argIndex+1)

	args = append(args, pageSize, offset)

	rows, err := h.db.Pool.Query(ctx, dataQuery, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "query error: "+err.Error())
		return
	}
	defer rows.Close()

	var departments []Department
	for rows.Next() {
		var dept Department
		err := rows.Scan(
			&dept.ID, &dept.TenantID, &dept.ParentID, &dept.Name, &dept.Number,
			&dept.DepartmentManagerID, &dept.ManagerName,
			&dept.UserCount, &dept.CreatedAt, &dept.UpdatedAt,
			&dept.IsDeleted,
		)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "scan error: "+err.Error())
			return
		}
		departments = append(departments, dept)
	}

	totalPages := (total + pageSize - 1) / pageSize

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"departments": departments,
		"pagination": map[string]interface{}{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// CreateDepartment handles POST /api/v1/departments
func (h *UserManagementHandlers) CreateDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, companyErr := CompanyIDFromContext(ctx)
	if companyErr != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var data DepartmentFormData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	// Validation
	if strings.TrimSpace(data.Name) == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.name_required")
		return
	}
	if strings.TrimSpace(data.Number) == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.number_required")
		return
	}

	// Check for duplicate number
	var exists bool
	err := h.db.Pool.QueryRow(ctx, 
		"SELECT EXISTS(SELECT 1 FROM dm3_identity.departments WHERE tenant_id = $1 AND number = $2 AND is_deleted = false)", 
		companyID, data.Number).Scan(&exists)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to check department number")
		return
	}
	if exists {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.number_exists")
		return
	}

	// Insert department
	var departmentID string
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.departments (
			tenant_id, parent_id, name, number, department_manager_id, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, now(), now())
		RETURNING id`,
		companyID, data.ParentID, data.Name, data.Number, data.DepartmentManagerID,
	).Scan(&departmentID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to create department")
		return
	}

	// Fetch created department
	var dept Department
	err = h.db.Pool.QueryRow(ctx, `
		SELECT 
			d.id, d.tenant_id, d.parent_id, d.name, d.number,
			d.department_manager_id, TRIM(COALESCE(mgr.first_name,'') || ' ' || COALESCE(mgr.last_name,'')) as manager_name,
			0 as user_count, d.created_at::text, d.updated_at::text, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_identity.users mgr ON d.department_manager_id = mgr.id
		WHERE d.id = $1`, departmentID).Scan(
		&dept.ID, &dept.TenantID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName,
		&dept.UserCount, &dept.CreatedAt, &dept.UpdatedAt,
		&dept.IsDeleted,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to fetch created department")
		return
	}

	httputil.JSON(w, http.StatusCreated, dept)
}

// GetDepartment handles GET /api/v1/departments/{id}
func (h *UserManagementHandlers) GetDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, companyErr := CompanyIDFromContext(ctx)
	if companyErr != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	var dept Department
	err := h.db.Pool.QueryRow(ctx, `
		SELECT 
			d.id, d.tenant_id, d.parent_id, d.name, d.number,
			d.department_manager_id, TRIM(COALESCE(mgr.first_name,'') || ' ' || COALESCE(mgr.last_name,'')) as manager_name,
			COALESCE(user_counts.count, 0) as user_count,
			d.created_at::text, d.updated_at::text, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_identity.users mgr ON d.department_manager_id = mgr.id
		LEFT JOIN (
			SELECT department_id, COUNT(*) as count
			FROM dm3_identity.users
			WHERE department_id = $2 AND is_deleted = false
			GROUP BY department_id
		) user_counts ON d.id = user_counts.department_id
		WHERE d.id = $1 AND d.tenant_id = $3 AND d.is_deleted = false`,
		departmentID, departmentID, companyID).Scan(
		&dept.ID, &dept.TenantID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName,
		&dept.UserCount, &dept.CreatedAt, &dept.UpdatedAt,
		&dept.IsDeleted,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Department not found")
		return
	}

	httputil.JSON(w, http.StatusOK, dept)
}

// UpdateDepartment handles PUT /api/v1/departments/{id}  
func (h *UserManagementHandlers) UpdateDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, companyErr := CompanyIDFromContext(ctx)
	if companyErr != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	var data DepartmentFormData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	// Validation
	if strings.TrimSpace(data.Name) == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.name_required")
		return
	}
	if strings.TrimSpace(data.Number) == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.number_required")
		return
	}

	// Check for duplicate number (excluding current department)
	var exists bool
	err := h.db.Pool.QueryRow(ctx, 
		"SELECT EXISTS(SELECT 1 FROM dm3_identity.departments WHERE tenant_id = $1 AND number = $2 AND id != $3 AND is_deleted = false)", 
		companyID, data.Number, departmentID).Scan(&exists)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to check department number")
		return
	}
	if exists {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.number_exists")
		return
	}

	// Update department
	_, err = h.db.Pool.Exec(ctx, `
		UPDATE dm3_identity.departments SET
			name = $1, number = $2, parent_id = $3,
			department_manager_id = $4, updated_at = now()
		WHERE id = $5 AND tenant_id = $6 AND is_deleted = false`,
		data.Name, data.Number, data.ParentID, data.DepartmentManagerID,
		departmentID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to update department")
		return
	}

	// Fetch updated department
	var dept Department
	err = h.db.Pool.QueryRow(ctx, `
		SELECT 
			d.id, d.tenant_id, d.parent_id, d.name, d.number,
			d.department_manager_id, TRIM(COALESCE(mgr.first_name,'') || ' ' || COALESCE(mgr.last_name,'')) as manager_name,
			COALESCE(user_counts.count, 0) as user_count,
			d.created_at::text, d.updated_at::text, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_identity.users mgr ON d.department_manager_id = mgr.id
		LEFT JOIN (
			SELECT department_id, COUNT(*) as count
			FROM dm3_identity.users
			WHERE department_id = $1 AND is_deleted = false
			GROUP BY department_id
		) user_counts ON d.id = user_counts.department_id
		WHERE d.id = $1 AND d.tenant_id = $2 AND d.is_deleted = false`,
		departmentID, companyID).Scan(
		&dept.ID, &dept.TenantID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName,
		&dept.UserCount, &dept.CreatedAt, &dept.UpdatedAt,
		&dept.IsDeleted,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to fetch updated department")
		return
	}

	httputil.JSON(w, http.StatusOK, dept)
}

// DeleteDepartment handles DELETE /api/v1/departments/{id}
func (h *UserManagementHandlers) DeleteDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, companyErr := CompanyIDFromContext(ctx)
	if companyErr != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	// Check if department has users
	var userCount int
	err := h.db.Pool.QueryRow(ctx, 
		"SELECT COUNT(*) FROM dm3_identity.users WHERE department_id = $1 AND is_deleted = false", 
		departmentID).Scan(&userCount)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to check department users")
		return
	}
	if userCount > 0 {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.department_has_users")
		return
	}

	// Soft delete department
	result, err := h.db.Pool.Exec(ctx, `
		UPDATE dm3_identity.departments SET is_deleted = true, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
		departmentID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to delete department")
		return
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		httputil.Error(w, http.StatusNotFound, "Department not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Department deleted successfully"})
}

// BulkDeleteDepartments handles POST /api/v1/departments/bulk-delete
func (h *UserManagementHandlers) BulkDeleteDepartments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
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
	if len(req.IDs) > 100 {
		httputil.Error(w, http.StatusBadRequest, "maximum 100 departments can be deleted at once")
		return
	}

	// Check none of the departments have users assigned
	var blockedCount int
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT d.id) FROM dm3_identity.departments d
		 JOIN dm3_identity.users u ON u.department_id = d.id AND u.is_deleted = false
		 WHERE d.id = ANY($1::uuid[]) AND d.tenant_id = $2 AND d.is_deleted = false`,
		req.IDs, companyID).Scan(&blockedCount)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to validate departments")
		return
	}
	if blockedCount > 0 {
		httputil.Error(w, http.StatusBadRequest, fmt.Sprintf("%d department(s) still have users assigned and cannot be deleted", blockedCount))
		return
	}

	result, err := h.db.Pool.Exec(ctx,
		`UPDATE dm3_identity.departments SET is_deleted = true, updated_at = now()
		 WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_deleted = false`,
		req.IDs, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete departments")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message":       "Departments deleted successfully",
		"affected_rows": result.RowsAffected(),
	})
}

// GetDepartmentUsers returns users belonging to a department
func (h *UserManagementHandlers) GetDepartmentUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	rows, err := h.db.Pool.Query(ctx, `
		SELECT u.id, COALESCE(u.user_code,''), u.first_name, u.last_name,
		       COALESCE(u.email,''), u.position, u.status
		FROM dm3_identity.users u
		WHERE u.tenant_id = $1::uuid AND u.department_id = $2::uuid
		  AND (u.is_deleted = false OR u.is_deleted IS NULL)
		ORDER BY u.first_name, u.last_name
	`, companyID, departmentID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch department users")
		return
	}
	defer rows.Close()

	type UserRow struct {
		ID        string  `json:"id"`
		UserCode  string  `json:"user_code"`
		FirstName string  `json:"first_name"`
		LastName  string  `json:"last_name"`
		Email     string  `json:"email"`
		Position  *string `json:"position"`
		Status    string  `json:"status"`
	}
	users := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.UserCode, &u.FirstName, &u.LastName, &u.Email, &u.Position, &u.Status); err != nil {
			continue
		}
		users = append(users, u)
	}
	httputil.JSON(w, http.StatusOK, map[string]interface{}{"users": users})
}

// AssignUsersToDepartment assigns users to a department
func (h *UserManagementHandlers) AssignUsersToDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	var body struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}

	for _, userID := range body.UserIDs {
		_, err := h.db.Pool.Exec(ctx, `
			UPDATE dm3_identity.users SET department_id = $1::uuid, updated_at = now()
			WHERE id = $2::uuid AND tenant_id = $3::uuid AND (is_deleted = false OR is_deleted IS NULL)
		`, departmentID, userID, companyID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "failed to assign user")
			return
		}
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "users assigned successfully"})
}

// RemoveUserFromDepartment removes a user from a department
func (h *UserManagementHandlers) RemoveUserFromDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")

	result, err := h.db.Pool.Exec(ctx, `
		UPDATE dm3_identity.users SET department_id = NULL, updated_at = now()
		WHERE id = $1::uuid AND department_id = $2::uuid AND tenant_id = $3::uuid
		  AND (is_deleted = false OR is_deleted IS NULL)
	`, userID, departmentID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to remove user")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found in department")
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "user removed from department"})
}

// ImportDepartments imports departments from file
func (h *UserManagementHandlers) ImportDepartments(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// ExportDepartments exports departments to file
func (h *UserManagementHandlers) ExportDepartments(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// GetManagers returns identity users for the manager dropdown
func (h *UserManagementHandlers) GetManagers(w http.ResponseWriter, r *http.Request) {
	companyID, err := CompanyIDFromContext(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, COALESCE(user_code,''), first_name, last_name
		FROM dm3_identity.users
		WHERE tenant_id = $1::uuid
		  AND (is_deleted = false OR is_deleted IS NULL)
		ORDER BY first_name, last_name
	`, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch managers")
		return
	}
	defer rows.Close()

	managers := []map[string]interface{}{}
	for rows.Next() {
		var id, userCode, firstName, lastName string
		if err := rows.Scan(&id, &userCode, &firstName, &lastName); err != nil {
			continue
		}
		managers = append(managers, map[string]interface{}{
			"id":       id,
			"username": userCode,
			"name":     strings.TrimSpace(firstName + " " + lastName),
			"type":     "user",
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{"managers": managers})
}

// GetAvailableUsersForDepartment returns users not in the given department
func (h *UserManagementHandlers) GetAvailableUsersForDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	departmentID := chi.URLParam(r, "id")

	rows, err := h.db.Pool.Query(ctx, `
		SELECT u.id, COALESCE(u.user_code,''), u.first_name, u.last_name,
		       COALESCE(u.email,''), u.position,
		       COALESCE(d.name,'') AS department_name, u.status
		FROM dm3_identity.users u
		LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
		WHERE u.tenant_id = $1::uuid
		  AND (u.department_id IS NULL OR u.department_id != $2::uuid)
		  AND (u.is_deleted = false OR u.is_deleted IS NULL)
		ORDER BY u.first_name, u.last_name
	`, companyID, departmentID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch available users")
		return
	}
	defer rows.Close()

	type UserRow struct {
		ID             string  `json:"id"`
		UserCode       string  `json:"user_code"`
		FirstName      string  `json:"first_name"`
		LastName       string  `json:"last_name"`
		Email          string  `json:"email"`
		Position       *string `json:"position"`
		DepartmentName string  `json:"department_name"`
		Status         string  `json:"status"`
	}
	users := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.UserCode, &u.FirstName, &u.LastName, &u.Email, &u.Position, &u.DepartmentName, &u.Status); err != nil {
			continue
		}
		users = append(users, u)
	}
	httputil.JSON(w, http.StatusOK, map[string]interface{}{"users": users})
}