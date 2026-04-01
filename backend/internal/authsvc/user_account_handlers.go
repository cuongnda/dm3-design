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
	ID          string             `json:"id"`
	Email       string             `json:"email"`
	Name        string             `json:"name"`
	Roles       []string           `json:"roles"`
	Role        string             `json:"role"` // primary_manager, manager, operator, viewer, system_admin
	Status      string             `json:"status"`
	LastLogin   *time.Time         `json:"last_login,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
	Companies   []userCompanyInfo  `json:"companies"`
}

type userCompanyInfo struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
	Role        string `json:"role"`
	Status      string `json:"status"`
}

type createUserAccountRequest struct {
	Email      string   `json:"email"`
	Name       string   `json:"name"`
	Role       string   `json:"role"` // primary_manager, manager, operator, viewer
	CompanyID  *string  `json:"company_id,omitempty"` // null for system_admin
	SendEmail  bool     `json:"send_email"` // whether to send welcome email
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

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	if search := r.URL.Query().Get("search"); search != "" {
		where += fmt.Sprintf(" AND (u.email ILIKE $%d OR u.name ILIKE $%d)", idx, idx)
		args = append(args, "%"+search+"%")
		idx++
	}

	if status := r.URL.Query().Get("status"); status != "" {
		where += fmt.Sprintf(" AND u.status = $%d", idx)
		args = append(args, status)
		idx++
	}

	if role := r.URL.Query().Get("role"); role != "" {
		where += fmt.Sprintf(" AND u.role = $%d", idx)
		args = append(args, role)
		idx++
	}

	if companyID := r.URL.Query().Get("company_id"); companyID != "" {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM dm3_auth.user_companies uc WHERE uc.user_id = u.id AND uc.company_id = $%d::uuid)", idx)
		args = append(args, companyID)
		idx++
	}

	// Get total count
	var total int64
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_auth.users u %s", where)
	if err := h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Get users
	query := fmt.Sprintf(`
		SELECT u.id, u.email, u.name, u.roles, u.role, u.status, u.last_login, u.created_at, u.updated_at
		FROM dm3_auth.users u
		%s
		ORDER BY u.created_at DESC
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
		var roles []byte
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := json.Unmarshal(roles, &u.Roles); err != nil {
			u.Roles = []string{}
		}
		users = append(users, u)
	}

	// Load company info for each user
	for i := range users {
		companyRows, err := h.db.Pool.Query(r.Context(), `
			SELECT uc.company_id, c.name, c.code, uc.role, uc.status
			FROM dm3_auth.user_companies uc
			JOIN dm3_auth.companies c ON c.id = uc.company_id
			WHERE uc.user_id = $1::uuid
			ORDER BY c.name`, users[i].ID)
		if err != nil {
			continue
		}

		for companyRows.Next() {
			var company userCompanyInfo
			if err := companyRows.Scan(&company.CompanyID, &company.CompanyName, &company.CompanyCode, &company.Role, &company.Status); err != nil {
				continue
			}
			users[i].Companies = append(users[i].Companies, company)
		}
		companyRows.Close()
	}

	httputil.Paginated(w, users, total, page, limit)
}

// ─── Get User Account ────────────────────────────────────────────────────────

func (h *Handlers) GetUserAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var u userAccountResponse
	var roles []byte
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, email, name, roles, role, status, last_login, created_at, updated_at
		FROM dm3_auth.users
		WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	if err := json.Unmarshal(roles, &u.Roles); err != nil {
		u.Roles = []string{}
	}

	// Load companies
	companyRows, err := h.db.Pool.Query(r.Context(), `
		SELECT uc.company_id, c.name, c.code, uc.role, uc.status
		FROM dm3_auth.user_companies uc
		JOIN dm3_auth.companies c ON c.id = uc.company_id
		WHERE uc.user_id = $1::uuid
		ORDER BY c.name`, u.ID)
	if err == nil {
		defer companyRows.Close()
		for companyRows.Next() {
			var company userCompanyInfo
			if err := companyRows.Scan(&company.CompanyID, &company.CompanyName, &company.CompanyCode, &company.Role, &company.Status); err == nil {
				u.Companies = append(u.Companies, company)
			}
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

	// Generate random password
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

	// Begin transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	// Create user
	var userID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.users (email, password_hash, name, roles, role, status)
		 VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
		req.Email, string(pwHash), req.Name, fmt.Sprintf(`["%s"]`, role), role,
	).Scan(&userID)
	if err != nil {
		slog.Error("create user account: user insert error", "error", err)
		httputil.Error(w, http.StatusConflict, "user with this email already exists")
		return
	}

	// Add to company if specified
	if req.CompanyID != nil && *req.CompanyID != "" {
		_, err = tx.Exec(r.Context(),
			`INSERT INTO dm3_auth.user_companies (user_id, company_id, role, status)
			 VALUES ($1::uuid, $2::uuid, $3, 'active')`,
			userID, *req.CompanyID, role,
		)
		if err != nil {
			slog.Error("create user account: company assignment error", "error", err)
			httputil.Error(w, http.StatusBadRequest, "failed to assign user to company")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "commit failed")
		return
	}

	// Fetch the created user
	var u userAccountResponse
	var roles []byte
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, email, name, roles, role, status, last_login, created_at, updated_at
		FROM dm3_auth.users
		WHERE id = $1::uuid`, userID,
	).Scan(&u.ID, &u.Email, &u.Name, &roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)

	if err := json.Unmarshal(roles, &u.Roles); err != nil {
		u.Roles = []string{}
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

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	// Update user
	_, err = tx.Exec(r.Context(), `
		UPDATE dm3_auth.users SET
			name = COALESCE($2, name),
			role = COALESCE($3, role),
			status = COALESCE($4, status),
			updated_at = now()
		WHERE id = $1::uuid`,
		id, req.Name, req.Role, req.Status,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Update company assignment if specified
	if req.CompanyID != nil {
		// Remove existing company assignments
		_, _ = tx.Exec(r.Context(),
			`DELETE FROM dm3_auth.user_companies WHERE user_id = $1::uuid`,
			id,
		)

		// Add new company assignment if not empty
		if *req.CompanyID != "" {
			role := "viewer"
			if req.Role != nil {
				role = *req.Role
			}
			_, err = tx.Exec(r.Context(),
				`INSERT INTO dm3_auth.user_companies (user_id, company_id, role, status)
				 VALUES ($1::uuid, $2::uuid, $3, 'active')`,
				id, *req.CompanyID, role,
			)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "failed to assign user to company")
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "commit failed")
		return
	}

	// Return updated user
	var u userAccountResponse
	var roles []byte
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, email, name, roles, role, status, last_login, created_at, updated_at
		FROM dm3_auth.users
		WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt, &u.UpdatedAt)

	if err := json.Unmarshal(roles, &u.Roles); err != nil {
		u.Roles = []string{}
	}

	httputil.JSON(w, http.StatusOK, u)
}

// ─── Delete User Account ─────────────────────────────────────────────────────

func (h *Handlers) DeleteUserAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Soft delete by setting status to inactive
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.users SET status = 'inactive', updated_at = now() WHERE id = $1::uuid AND role != 'system_admin'`,
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

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "inactive"})
}

// ─── Reset User Password ─────────────────────────────────────────────────────

func (h *Handlers) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Generate new password
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

	// Update password
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`,
		id, string(pwHash),
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"password": password,
		"message":  "Password reset successfully",
	})
}