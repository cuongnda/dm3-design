package authsvc

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Company Models ──────────────────────────────────────────────────────────

type companyResponse struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Code       string    `json:"code"`
	Plan       string    `json:"plan"`
	Status     string    `json:"status"`
	LogoURL    *string   `json:"logo_url,omitempty"`
	Address    *string   `json:"address,omitempty"`
	Phone      *string   `json:"phone,omitempty"`
	Email      *string   `json:"email,omitempty"`
	MaxDevices int       `json:"max_devices"`
	MaxUsers   int       `json:"max_users"`
	UserCount   int64     `json:"user_count"`
	DeviceCount int64     `json:"device_count"`
	DoorCount   int64     `json:"door_count"`
	EventCount  int64     `json:"event_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type createCompanyRequest struct {
	Name       string  `json:"name"`
	Code       string  `json:"code"`
	Email      string  `json:"email"` // primary manager email
	Plan       string  `json:"plan,omitempty"`
	MaxDevices *int    `json:"max_devices,omitempty"`
	MaxUsers   *int    `json:"max_users,omitempty"`
	Address    *string `json:"address,omitempty"`
	Phone      *string `json:"phone,omitempty"`
}

type updateCompanyRequest struct {
	Name       *string `json:"name,omitempty"`
	Plan       *string `json:"plan,omitempty"`
	Status     *string `json:"status,omitempty"`
	LogoURL    *string `json:"logo_url,omitempty"`
	Address    *string `json:"address,omitempty"`
	Phone      *string `json:"phone,omitempty"`
	Email      *string `json:"email,omitempty"`
	MaxDevices *int    `json:"max_devices,omitempty"`
	MaxUsers   *int    `json:"max_users,omitempty"`
}

type createCompanyResponse struct {
	Company  companyResponse `json:"company"`
	Admin    adminInfo       `json:"admin"`
}

type adminInfo struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// ─── List Companies ──────────────────────────────────────────────────────────

// ListCompanies returns a paginated list of all tenants (system admin only).
//
// @Summary      List companies
// @Description  System admin only. Each company is a tenant; the list controls who can log into the platform.
// @Tags         Companies
// @Produce      json
// @Param        page    query  int     false  "Page number"  default(1)
// @Param        limit   query  int     false  "Page size"    default(50)
// @Param        search  query  string  false  "Partial match on name or code"
// @Success      200  {object}  map[string]interface{}  "Paginated list"
// @Failure      403  {object}  httputil.ErrorResponse  "Not a system admin"
// @Router       /auth/system/companies [get]
// @Security     BearerAuth
func (h *AuthHandlers) ListCompanies(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_auth.tenants`).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT c.id, c.name, c.code, c.plan, c.status, c.logo_url, c.address, c.phone, c.email,
		 c.max_devices, c.max_users, c.created_at, c.updated_at,
		 (SELECT COUNT(*) FROM dm3_auth.accounts u WHERE u.tenant_id = c.id),
		 (SELECT COUNT(*) FROM dm3_devices.devices d WHERE d.tenant_id = c.id)
		 FROM dm3_auth.tenants c ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	companies := []companyResponse{}
	for rows.Next() {
		var c companyResponse
		if err := rows.Scan(&c.ID, &c.Name, &c.Code, &c.Plan, &c.Status, &c.LogoURL, &c.Address, &c.Phone, &c.Email,
			&c.MaxDevices, &c.MaxUsers, &c.CreatedAt, &c.UpdatedAt, &c.UserCount, &c.DeviceCount); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		companies = append(companies, c)
	}
	httputil.Paginated(w, companies, total, page, limit)
}

// ─── Create Company ──────────────────────────────────────────────────────────

// CreateCompany provisions a new tenant (system admin only).
//
// @Summary      Create a company
// @Description  System admin only. Creates a new tenant with its plugin config, seeds the tenant's dm3_* schema defaults, and optionally invites an initial admin user.
// @Tags         Companies
// @Accept       json
// @Produce      json
// @Param        body  body   map[string]interface{}  true  "Company payload (name, code, plugins[], admin email, etc.)"
// @Success      201  {object}  map[string]interface{}
// @Failure      400  {object}  httputil.ErrorResponse
// @Failure      403  {object}  httputil.ErrorResponse
// @Router       /auth/system/companies [post]
// @Security     BearerAuth
func (h *AuthHandlers) CreateCompany(w http.ResponseWriter, r *http.Request) {
	var req createCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Code == "" || req.Email == "" {
		httputil.Error(w, http.StatusBadRequest, "name, code, and email are required")
		return
	}

	plan := "starter"
	if req.Plan != "" {
		plan = req.Plan
	}

	// Generate random password for primary manager
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

	// Begin transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Create company
	var company companyResponse
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.tenants (name, code, plan, email, address, phone, max_devices, max_users)
		 VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 50), COALESCE($8, 20))
		 RETURNING id, name, code, plan, status, logo_url, address, phone, email, max_devices, max_users, created_at, updated_at`,
		req.Name, req.Code, plan, req.Email, req.Address, req.Phone, req.MaxDevices, req.MaxUsers,
	).Scan(&company.ID, &company.Name, &company.Code, &company.Plan, &company.Status,
		&company.LogoURL, &company.Address, &company.Phone, &company.Email,
		&company.MaxDevices, &company.MaxUsers, &company.CreatedAt, &company.UpdatedAt)
	if err != nil {
		slog.Error("create company error", "error", err)
		httputil.Error(w, http.StatusConflict, "company code already exists or invalid data")
		return
	}

	// 2. Create primary manager user
	_, err = tx.Exec(r.Context(),
		`INSERT INTO dm3_auth.accounts (email, password_hash, full_name, tenant_id, role, status)
		 VALUES ($1, $2, $3, $4::uuid, $5, 'active')`,
		req.Email, string(pwHash), req.Name+" Admin", company.ID, "primary_manager",
	)
	if err != nil {
		slog.Error("create primary manager error", "error", err)
		httputil.Error(w, http.StatusConflict, "user with this email already exists")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "commit failed")
		return
	}

	h.audit.LogFromRequest(r, "company.create", "company", company.ID, company.Name, "success", nil, map[string]any{
		"name": company.Name,
		"code": company.Code,
		"plan": company.Plan,
	})
	httputil.JSON(w, http.StatusCreated, createCompanyResponse{
		Company: company,
		Admin: adminInfo{
			Email:    req.Email,
			Password: password,
			Role:     "primary_manager",
		},
	})
}

// ─── Get Company ─────────────────────────────────────────────────────────────

// GetCompany returns a single company by id (system admin only).
//
// @Summary      Get a company
// @Tags         Companies
// @Produce      json
// @Param        id   path   string  true  "Company UUID"
// @Success      200  {object}  map[string]interface{}
// @Failure      403  {object}  httputil.ErrorResponse
// @Failure      404  {object}  httputil.ErrorResponse
// @Router       /auth/system/companies/{id} [get]
// @Security     BearerAuth
func (h *AuthHandlers) GetCompany(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var c companyResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT c.id, c.name, c.code, c.plan, c.status, c.logo_url, c.address, c.phone, c.email,
		 c.max_devices, c.max_users, c.created_at, c.updated_at,
		 (SELECT COUNT(*) FROM dm3_auth.accounts u WHERE u.tenant_id = c.id),
		 (SELECT COUNT(*) FROM dm3_devices.devices d WHERE d.tenant_id = c.id),
		 (SELECT COUNT(*) FROM dm3_access.access_points dr WHERE dr.tenant_id = c.id),
		 (SELECT COUNT(*) FROM dm3_access.access_events e WHERE e.tenant_id = c.id)
		 FROM dm3_auth.tenants c WHERE c.id = $1::uuid`, id,
	).Scan(&c.ID, &c.Name, &c.Code, &c.Plan, &c.Status, &c.LogoURL, &c.Address, &c.Phone, &c.Email,
		&c.MaxDevices, &c.MaxUsers, &c.CreatedAt, &c.UpdatedAt,
		&c.UserCount, &c.DeviceCount, &c.DoorCount, &c.EventCount)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "company not found")
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

// ─── Update Company ──────────────────────────────────────────────────────────

// UpdateCompany updates a company by id (system admin only).
//
// @Summary      Update a company
// @Description  Plugin toggles apply on the next user login for that tenant — existing sessions keep their old plugin set until their access token is refreshed.
// @Tags         Companies
// @Accept       json
// @Produce      json
// @Param        id    path   string                  true  "Company UUID"
// @Param        body  body   map[string]interface{}  true  "Fields to update"
// @Success      200  {object}  map[string]interface{}
// @Failure      403  {object}  httputil.ErrorResponse
// @Failure      404  {object}  httputil.ErrorResponse
// @Router       /auth/system/companies/{id} [put]
// @Security     BearerAuth
func (h *AuthHandlers) UpdateCompany(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var c companyResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_auth.tenants SET
			name = COALESCE($2, name),
			plan = COALESCE($3, plan),
			status = COALESCE($4, status),
			logo_url = COALESCE($5, logo_url),
			address = COALESCE($6, address),
			phone = COALESCE($7, phone),
			email = COALESCE($8, email),
			max_devices = COALESCE($9, max_devices),
			max_users = COALESCE($10, max_users),
			updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id, name, code, plan, status, logo_url, address, phone, email, max_devices, max_users, created_at, updated_at`,
		id, req.Name, req.Plan, req.Status, req.LogoURL, req.Address, req.Phone, req.Email, req.MaxDevices, req.MaxUsers,
	).Scan(&c.ID, &c.Name, &c.Code, &c.Plan, &c.Status, &c.LogoURL, &c.Address, &c.Phone, &c.Email,
		&c.MaxDevices, &c.MaxUsers, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "company not found")
		return
	}
	h.audit.LogFromRequest(r, "company.update", "company", c.ID, c.Name, "success", nil, req)
	httputil.JSON(w, http.StatusOK, c)
}

// ─── Delete Company (soft) ───────────────────────────────────────────────────

// DeleteCompany soft-deletes a company by flipping its status to suspended (system admin only).
//
// @Summary      Soft-delete a company
// @Description  System admin only. Marks the tenant as suspended; existing sessions stay valid until their JWT expires but new logins are blocked.
// @Tags         Companies
// @Produce      json
// @Param        id   path   string  true  "Company UUID"
// @Success      204  "No Content"
// @Failure      403  {object}  httputil.ErrorResponse
// @Failure      404  {object}  httputil.ErrorResponse  "Not found or already suspended"
// @Router       /auth/system/companies/{id} [delete]
// @Security     BearerAuth
func (h *AuthHandlers) DeleteCompany(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.tenants SET status = 'suspended', updated_at = now() WHERE id = $1::uuid AND status != 'suspended'`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "company not found or already suspended")
		return
	}
	h.audit.LogFromRequest(r, "company.delete", "company", id, id, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}
