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
	CompanyID           string  `json:"company_id" db:"company_id"`
	ParentID            *string `json:"parent_id" db:"parent_id"`
	Name                string  `json:"name" db:"name"`
	Number              string  `json:"number" db:"number"`
	DepartmentManagerID *string `json:"department_manager_id" db:"department_manager_id"`
	ManagerName         *string `json:"manager_name" db:"manager_name"`
	AccessGroupID       *string `json:"access_group_id" db:"access_group_id"`
	UserCount           int     `json:"user_count" db:"user_count"`
	CreatedBy           *string `json:"created_by" db:"created_by"`
	CreatedOn           string  `json:"created_on" db:"created_on"`
	UpdatedBy           *string `json:"updated_by" db:"updated_by"`
	UpdatedOn           string  `json:"updated_on" db:"updated_on"`
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
		"manager_name": "COALESCE(a.username, '')",
		"user_count":   "COALESCE(user_counts.count, 0)",
		"created_on":   "d.created_on",
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

	whereConditions = append(whereConditions, fmt.Sprintf("d.company_id = $%d", argIndex))
	args = append(args, companyID)
	argIndex++

	whereConditions = append(whereConditions, fmt.Sprintf("d.is_deleted = $%d", argIndex))
	args = append(args, false)
	argIndex++

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
		whereConditions = append(whereConditions, fmt.Sprintf("d.parent_id = $%d", argIndex))
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
		httputil.Error(w, http.StatusInternalServerError, "Failed to count departments")
		return
	}

	// Data query
	dataQuery := fmt.Sprintf(`
		SELECT 
			d.id, d.company_id, d.parent_id, d.name, d.number,
			d.department_manager_id, a.username as manager_name,
			d.access_group_id, 
			COALESCE(user_counts.count, 0) as user_count,
			d.created_by, d.created_on, d.updated_by, d.updated_on, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_auth.accounts a ON d.department_manager_id = a.id
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
		httputil.Error(w, http.StatusInternalServerError, "Failed to fetch departments")
		return
	}
	defer rows.Close()

	var departments []Department
	for rows.Next() {
		var dept Department
		err := rows.Scan(
			&dept.ID, &dept.CompanyID, &dept.ParentID, &dept.Name, &dept.Number,
			&dept.DepartmentManagerID, &dept.ManagerName, &dept.AccessGroupID,
			&dept.UserCount, &dept.CreatedBy, &dept.CreatedOn, &dept.UpdatedBy, &dept.UpdatedOn,
			&dept.IsDeleted,
		)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "Failed to scan department")
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
		"SELECT EXISTS(SELECT 1 FROM dm3_identity.departments WHERE company_id = $1 AND number = $2 AND is_deleted = false)", 
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
			company_id, parent_id, name, number, department_manager_id, access_group_id, created_on, updated_on
		) VALUES ($1, $2, $3, $4, $5, $6, now(), now())
		RETURNING id`,
		companyID, data.ParentID, data.Name, data.Number, data.DepartmentManagerID, data.AccessGroupID,
	).Scan(&departmentID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to create department")
		return
	}

	// Fetch created department
	var dept Department
	err = h.db.Pool.QueryRow(ctx, `
		SELECT 
			d.id, d.company_id, d.parent_id, d.name, d.number,
			d.department_manager_id, a.username as manager_name, d.access_group_id,
			0 as user_count, d.created_by, d.created_on, d.updated_by, d.updated_on, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_auth.accounts a ON d.department_manager_id = a.id
		WHERE d.id = $1`, departmentID).Scan(
		&dept.ID, &dept.CompanyID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName, &dept.AccessGroupID,
		&dept.UserCount, &dept.CreatedBy, &dept.CreatedOn, &dept.UpdatedBy, &dept.UpdatedOn,
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
			d.id, d.company_id, d.parent_id, d.name, d.number,
			d.department_manager_id, a.username as manager_name, d.access_group_id,
			COALESCE(user_counts.count, 0) as user_count,
			d.created_by, d.created_on, d.updated_by, d.updated_on, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_auth.accounts a ON d.department_manager_id = a.id
		LEFT JOIN (
			SELECT department_id, COUNT(*) as count
			FROM dm3_identity.users 
			WHERE department_id = $2 AND is_deleted = false
			GROUP BY department_id
		) user_counts ON d.id = user_counts.department_id
		WHERE d.id = $1 AND d.company_id = $3 AND d.is_deleted = false`,
		departmentID, departmentID, companyID).Scan(
		&dept.ID, &dept.CompanyID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName, &dept.AccessGroupID,
		&dept.UserCount, &dept.CreatedBy, &dept.CreatedOn, &dept.UpdatedBy, &dept.UpdatedOn,
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
		"SELECT EXISTS(SELECT 1 FROM dm3_identity.departments WHERE company_id = $1 AND number = $2 AND id != $3 AND is_deleted = false)", 
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
			department_manager_id = $4, access_group_id = $5, updated_on = now()
		WHERE id = $6 AND company_id = $7 AND is_deleted = false`,
		data.Name, data.Number, data.ParentID, data.DepartmentManagerID, data.AccessGroupID,
		departmentID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Failed to update department")
		return
	}

	// Fetch updated department
	var dept Department
	err = h.db.Pool.QueryRow(ctx, `
		SELECT 
			d.id, d.company_id, d.parent_id, d.name, d.number,
			d.department_manager_id, a.username as manager_name, d.access_group_id,
			COALESCE(user_counts.count, 0) as user_count,
			d.created_by, d.created_on, d.updated_by, d.updated_on, d.is_deleted
		FROM dm3_identity.departments d
		LEFT JOIN dm3_auth.accounts a ON d.department_manager_id = a.id
		LEFT JOIN (
			SELECT department_id, COUNT(*) as count
			FROM dm3_identity.users 
			WHERE department_id = $1 AND is_deleted = false
			GROUP BY department_id
		) user_counts ON d.id = user_counts.department_id
		WHERE d.id = $1 AND d.company_id = $2 AND d.is_deleted = false`,
		departmentID, companyID).Scan(
		&dept.ID, &dept.CompanyID, &dept.ParentID, &dept.Name, &dept.Number,
		&dept.DepartmentManagerID, &dept.ManagerName, &dept.AccessGroupID,
		&dept.UserCount, &dept.CreatedBy, &dept.CreatedOn, &dept.UpdatedBy, &dept.UpdatedOn,
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
		UPDATE dm3_identity.departments SET is_deleted = true, updated_on = now()
		WHERE id = $1 AND company_id = $2 AND is_deleted = false`,
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

// GetDepartmentUsers returns users belonging to a department
func (h *UserManagementHandlers) GetDepartmentUsers(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// AssignUsersToDepartment assigns users to a department
func (h *UserManagementHandlers) AssignUsersToDepartment(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// RemoveUserFromDepartment removes a user from a department
func (h *UserManagementHandlers) RemoveUserFromDepartment(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// ImportDepartments imports departments from file
func (h *UserManagementHandlers) ImportDepartments(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// ExportDepartments exports departments to file
func (h *UserManagementHandlers) ExportDepartments(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// GetManagers returns accounts with manager roles
func (h *UserManagementHandlers) GetManagers(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}

// GetAvailableUsersForDepartment returns users not yet assigned to any department
func (h *UserManagementHandlers) GetAvailableUsersForDepartment(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "not implemented")
}