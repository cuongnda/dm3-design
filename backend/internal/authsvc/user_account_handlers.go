package authsvc

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── User Account Models ─────────────────────────────────────────────────────

type userAccountResponse struct {
	ID        string            `json:"id"`
	CompanyID *string           `json:"company_id,omitempty"`
	Email     string            `json:"email"`
	Name      string            `json:"name"`
	Roles     []string          `json:"roles"`
	Role      string            `json:"role"` // primary_manager, manager, operator, viewer, system_admin
	Status    string            `json:"status"`
	LastLogin *time.Time        `json:"last_login,omitempty"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
	Companies []userCompanyInfo `json:"companies"`
}

type userCompanyInfo struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
	Role        string `json:"role"`
	Status      string `json:"status"`
}

type createUserAccountRequest struct {
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Role      string  `json:"role"`                // primary_manager, manager, operator, viewer
	CompanyID *string `json:"company_id,omitempty"` // null for system_admin
	SendEmail bool    `json:"send_email"`           // whether to send welcome email
}

type updateUserAccountRequest struct {
	Name      *string `json:"name,omitempty"`
	Role      *string `json:"role,omitempty"`
	Status    *string `json:"status,omitempty"`
	CompanyID *string `json:"company_id,omitempty"`
}

type createUserAccountResponse struct {
	User     userAccountResponse `json:"user"`
	Password string              `json:"password"`
}

// ─── List User Accounts ──────────────────────────────────────────────────────

func (h *Handlers) ListUserAccounts(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE status != 'deleted'"
	args := []any{}
	idx := 1

	if search := r.URL.Query().Get("search"); search != "" {
		where += fmt.Sprintf(" AND (email ILIKE $%d OR full_name ILIKE $%d OR first_name ILIKE $%d)", idx, idx, idx)
		args = append(args, "%"+search+"%")
		idx++
	}

	if status := r.URL.Query().Get("status"); status != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, status)
		idx++
	}

	if role := r.URL.Query().Get("role"); role != "" {
		where += fmt.Sprintf(" AND role = $%d", idx)
		args = append(args, role)
		idx++
	}

	if companyID := r.URL.Query().Get("company_id"); companyID != "" {
		where += fmt.Sprintf(" AND company_id = $%d::uuid", idx)
		args = append(args, companyID)
		idx++
	}

	// Get total count.
	var total int64
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_auth.accounts %s", where)
	if err := h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Get accounts.
	query := fmt.Sprintf(`
		SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		       last_login, created_at, updated_at
		FROM dm3_auth.accounts
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)

	args = append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var users []userAccountResponse
	for rows.Next() {
		var u userAccountResponse
		var name string
		if err := rows.Scan(&u.ID, &u.CompanyID, &u.Email, &name, &u.Roles, &u.Role,
			&u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		u.Name = name
		u.Companies = []userCompanyInfo{}
		if u.CompanyID != nil {
			ci, err := h.loadCompanyInfo(r, *u.CompanyID, u.Role)
			if err == nil {
				u.Companies = []userCompanyInfo{ci}
			}
		}
		users = append(users, u)
	}

	httputil.Paginated(w, users, total, page, limit)
}

// loadCompanyInfo fetches company details to build a userCompanyInfo.
func (h *Handlers) loadCompanyInfo(r *http.Request, companyID, role string) (userCompanyInfo, error) {
	var ci userCompanyInfo
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, name, code FROM dm3_auth.companies WHERE id = $1::uuid`, companyID,
	).Scan(&ci.CompanyID, &ci.CompanyName, &ci.CompanyCode)
	if err != nil {
		return ci, err
	}
	ci.Role = role
	ci.Status = "active"
	return ci, nil
}

// ─── Get User Account ────────────────────────────────────────────────────────

func (h *Handlers) GetUserAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var u userAccountResponse
	var name string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		       last_login, created_at, updated_at
		FROM dm3_auth.accounts
		WHERE id = $1::uuid AND status != 'deleted'`, id,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &name, &u.Roles, &u.Role,
		&u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	u.Name = name
	u.Companies = []userCompanyInfo{}
	if u.CompanyID != nil {
		ci, err := h.loadCompanyInfo(r, *u.CompanyID, u.Role)
		if err == nil {
			u.Companies = []userCompanyInfo{ci}
		}
	}

	httputil.JSON(w, http.StatusOK, u)
}

// ─── Create User Account ─────────────────────────────────────────────────────

func (h *Handlers) CreateUserAccount(w http.ResponseWriter, r *http.Request) {
	var req createUserAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "email and name are required")
		return
	}

	// Generate random password.
	pwBytes := make([]byte, 8)
	if _, err := rand.Read(pwBytes); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate password")
		return
	}
	password := hex.EncodeToString(pwBytes)

	pwHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "password hashing failed")
		return
	}

	role := req.Role
	if role == "" {
		role = "viewer"
	}

	var userID string
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.accounts (email, password_hash, first_name, role, company_id, status)
		 VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
		req.Email, string(pwHash), req.Name, role, req.CompanyID,
	).Scan(&userID)
	if err != nil {
		slog.Error("create user account: insert error", "error", err)
		httputil.Error(w, http.StatusConflict, "user with this email already exists in this company")
		return
	}

	// Fetch the created account.
	var u userAccountResponse
	var name string
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		       last_login, created_at, updated_at
		FROM dm3_auth.accounts
		WHERE id = $1::uuid`, userID,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &name, &u.Roles, &u.Role,
		&u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)
	u.Name = name
	u.Companies = []userCompanyInfo{}
	if u.CompanyID != nil {
		ci, err := h.loadCompanyInfo(r, *u.CompanyID, u.Role)
		if err == nil {
			u.Companies = []userCompanyInfo{ci}
		}
	}

	httputil.JSON(w, http.StatusCreated, createUserAccountResponse{
		User:     u,
		Password: password,
	})
}

// ─── Update User Account ─────────────────────────────────────────────────────

func (h *Handlers) UpdateUserAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req updateUserAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Update core fields on the account.
	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_auth.accounts SET
			first_name  = COALESCE($2, first_name),
			role        = COALESCE($3, role),
			status      = COALESCE($4, status),
			company_id  = COALESCE($5::uuid, company_id),
			updated_at  = now()
		WHERE id = $1::uuid AND status != 'deleted'`,
		id, req.Name, req.Role, req.Status, req.CompanyID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Return updated account.
	var u userAccountResponse
	var name string
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		       last_login, created_at, updated_at
		FROM dm3_auth.accounts
		WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &name, &u.Roles, &u.Role,
		&u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)
	u.Name = name
	u.Companies = []userCompanyInfo{}
	if u.CompanyID != nil {
		ci, err := h.loadCompanyInfo(r, *u.CompanyID, u.Role)
		if err == nil {
			u.Companies = []userCompanyInfo{ci}
		}
	}

	httputil.JSON(w, http.StatusOK, u)
}

// ─── Delete User Account ─────────────────────────────────────────────────────

func (h *Handlers) DeleteUserAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Soft delete: set status to 'deleted'. Protect system_admin accounts.
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'deleted', updated_at = now()
		 WHERE id = $1::uuid AND role != 'system_admin' AND status != 'deleted'`,
		id,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found or cannot delete system admin")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ─── Company Helpers (stubs replacing user_companies junction table) ─────────

// AddUserToCompany is not applicable in the new accounts model (one row per
// email+company). Creating a new account for the same email in another company
// is done via CreateUserAccount. This endpoint returns a helpful error.
func (h *Handlers) AddUserToCompany(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusGone,
		"multi-company assignment via user_companies is removed; create a new account per company instead")
}

// RemoveUserFromCompany soft-deletes the account that links a user to a company.
func (h *Handlers) RemoveUserFromCompany(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := chi.URLParam(r, "companyId")

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'deleted', updated_at = now()
		 WHERE id = $1::uuid AND company_id = $2::uuid AND role != 'system_admin' AND status != 'deleted'`,
		userID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to remove user from company")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found in this company")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"message":    "user removed from company successfully",
		"user_id":    userID,
		"company_id": companyID,
	})
}

// UpdateUserCompanyRole updates the role of an account scoped to a specific company.
func (h *Handlers) UpdateUserCompanyRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := chi.URLParam(r, "companyId")

	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	validRoles := map[string]bool{
		"primary_manager": true,
		"manager":         true,
		"operator":        true,
		"viewer":          true,
	}
	if !validRoles[req.Role] {
		httputil.Error(w, http.StatusBadRequest, "invalid role")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET role = $3, updated_at = now()
		 WHERE id = $1::uuid AND company_id = $2::uuid AND status != 'deleted'`,
		userID, companyID, req.Role)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update role")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found in this company")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"message":    "role updated successfully",
		"user_id":    userID,
		"company_id": companyID,
		"new_role":   req.Role,
	})
}

// GetAvailableCompanies returns companies that the given account is NOT already assigned to.
func (h *Handlers) GetAvailableCompanies(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	// Find the email of this account so we can exclude all companies it already has.
	var email string
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT email FROM dm3_auth.accounts WHERE id = $1::uuid AND status != 'deleted'`, userID,
	).Scan(&email); err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT c.id, c.name, c.code, c.status
		FROM dm3_auth.companies c
		WHERE c.status = 'active'
		  AND c.id NOT IN (
		    SELECT a.company_id
		    FROM dm3_auth.accounts a
		    WHERE a.email = $1 AND a.company_id IS NOT NULL AND a.status != 'deleted'
		  )
		ORDER BY c.name`, email)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch available companies")
		return
	}
	defer rows.Close()

	type availableCompany struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Code   string `json:"code"`
		Status string `json:"status"`
	}

	var companies []availableCompany
	for rows.Next() {
		var company availableCompany
		if err := rows.Scan(&company.ID, &company.Name, &company.Code, &company.Status); err != nil {
			continue
		}
		companies = append(companies, company)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"companies": companies,
	})
}

// GetUserCompanyMatrix returns a detailed view of a user's roles across companies.
// In the new model each email+company pair is a separate account row.
func (h *Handlers) GetUserCompanyMatrix(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	// Get base account info.
	var userName, userEmail string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(full_name, email), email FROM dm3_auth.accounts WHERE id = $1::uuid AND status != 'deleted'`,
		userID).Scan(&userName, &userEmail)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	// Find all accounts sharing this email.
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT a.company_id::text, c.name, c.code, a.role, a.status, a.created_at, a.updated_at
		FROM dm3_auth.accounts a
		JOIN dm3_auth.companies c ON c.id = a.company_id
		WHERE a.email = $1 AND a.company_id IS NOT NULL AND a.status != 'deleted'
		ORDER BY c.name`, userEmail)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch company assignments")
		return
	}
	defer rows.Close()

	type companyAssignment struct {
		CompanyID   string    `json:"company_id"`
		CompanyName string    `json:"company_name"`
		CompanyCode string    `json:"company_code"`
		Role        string    `json:"role"`
		Status      string    `json:"status"`
		AssignedAt  time.Time `json:"assigned_at"`
		UpdatedAt   time.Time `json:"updated_at"`
	}

	var assignments []companyAssignment
	for rows.Next() {
		var a companyAssignment
		if err := rows.Scan(&a.CompanyID, &a.CompanyName, &a.CompanyCode,
			&a.Role, &a.Status, &a.AssignedAt, &a.UpdatedAt); err != nil {
			continue
		}
		assignments = append(assignments, a)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"user_id":     userID,
		"user_name":   userName,
		"user_email":  userEmail,
		"assignments": assignments,
	})
}
