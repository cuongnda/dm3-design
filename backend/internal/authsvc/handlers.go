package authsvc

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// ─── Claims ──────────────────────────────────────────────────────────────────

type AccessClaims struct {
	Sub      string   `json:"sub"`
	TID      string   `json:"tid"`
	CID      string   `json:"cid,omitempty"` // company_id
	Email    string   `json:"email"`
	Name     string   `json:"name"`
	Roles    []string `json:"roles"`
	Role     string   `json:"role,omitempty"` // primary_manager, manager, operator, viewer, system_admin
	jwt.RegisteredClaims
}

// TempClaims is a short-lived token for company selection (step 2 of login).
type TempClaims struct {
	Sub     string `json:"sub"`
	TID     string `json:"tid"`
	Purpose string `json:"purpose"` // "company_select"
	jwt.RegisteredClaims
}

type DeviceClaims struct {
	Sub         string   `json:"sub"`
	TID         string   `json:"tid"`
	DID         string   `json:"did"`
	DType       string   `json:"dtype"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

// ─── Handlers ────────────────────────────────────────────────────────────────

type Handlers struct {
	db        *db.DB
	jwtSecret string
}

func NewHandlers(database *db.DB, jwtSecret string) *Handlers {
	return &Handlers{db: database, jwtSecret: jwtSecret}
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// ─── Two-step login types ────────────────────────────────────────────────────

type companyInfo struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Code    string  `json:"code"`
	LogoURL *string `json:"logo_url"`
	Role    string  `json:"role"`
}

type loginUserInfo struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role,omitempty"`
	CID   string `json:"company_id,omitempty"`
}

type loginStepResponse struct {
	Step           string         `json:"step"`                      // "select_company" or "complete"
	TemporaryToken string         `json:"temporary_token,omitempty"` // only for select_company
	AccessToken    string         `json:"access_token,omitempty"`
	RefreshToken   string         `json:"refresh_token,omitempty"`
	User           *loginUserInfo `json:"user,omitempty"`
	Companies      []companyInfo  `json:"companies,omitempty"`
}

type loginStep2Request struct {
	TemporaryToken string `json:"temporary_token"`
	CompanyID      string `json:"company_id"`
}

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.Email == "" || req.Password == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.email_password_required")
		return
	}

	var id, tenantID, email, name, passwordHash string
	var roles []string
	var status string
	var companyID *string
	var userRole *string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, email, name, password_hash, roles, status, company_id::text, role FROM dm3_auth.users WHERE email = $1`,
		req.Email,
	).Scan(&id, &tenantID, &email, &name, &passwordHash, &roles, &status, &companyID, &userRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}
	if status != "active" {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.account_not_active")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Update last_login
	_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_auth.users SET last_login = now() WHERE id = $1::uuid`, id)

	role := "viewer"
	if userRole != nil && *userRole != "" {
		role = *userRole
	}

	// System admin — no company, complete immediately
	if role == "system_admin" {
		accessToken, err := h.generateAccessToken(id, tenantID, email, name, roles, "", role)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, _ := h.createRefreshToken(r, id, tenantID)
		httputil.JSON(w, http.StatusOK, loginStepResponse{
			Step:         "complete",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         &loginUserInfo{ID: id, Name: name, Email: email, Role: role},
		})
		return
	}

	// Query user's companies from junction table
	companies := []companyInfo{}
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT c.id, c.name, c.code, c.logo_url, uc.role
		 FROM dm3_auth.user_companies uc
		 JOIN dm3_auth.companies c ON c.id = uc.company_id
		 WHERE uc.user_id = $1::uuid AND uc.status = 'active' AND c.status = 'active'
		 ORDER BY c.name`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ci companyInfo
			if err := rows.Scan(&ci.ID, &ci.Name, &ci.Code, &ci.LogoURL, &ci.Role); err == nil {
				companies = append(companies, ci)
			}
		}
	}

	// Fallback: if no junction table entries, use legacy company_id
	if len(companies) == 0 && companyID != nil {
		var ci companyInfo
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, name, code, logo_url FROM dm3_auth.companies WHERE id = $1::uuid AND status = 'active'`, *companyID,
		).Scan(&ci.ID, &ci.Name, &ci.Code, &ci.LogoURL)
		if err == nil {
			ci.Role = role
			companies = append(companies, ci)
		}
	}

	// Single company — auto-select, complete immediately
	if len(companies) == 1 {
		c := companies[0]
		accessToken, err := h.generateAccessToken(id, tenantID, email, name, roles, c.ID, c.Role)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, _ := h.createRefreshToken(r, id, tenantID)
		httputil.JSON(w, http.StatusOK, loginStepResponse{
			Step:         "complete",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         &loginUserInfo{ID: id, Name: name, Email: email, Role: c.Role, CID: c.ID},
		})
		return
	}

	// No companies at all
	if len(companies) == 0 {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_active_company")
		return
	}

	// Multiple companies — return temp token + company list
	tempToken, err := h.generateTempToken(id, tenantID)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}

	httputil.JSON(w, http.StatusOK, loginStepResponse{
		Step:           "select_company",
		TemporaryToken: tempToken,
		User:           &loginUserInfo{ID: id, Name: name, Email: email},
		Companies:      companies,
	})
}

func (h *Handlers) LoginStep2(w http.ResponseWriter, r *http.Request) {
	var req loginStep2Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.TemporaryToken == "" || req.CompanyID == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.temp_token_company_required")
		return
	}

	// Parse temp token
	token, err := jwt.ParseWithClaims(req.TemporaryToken, &TempClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_temp_token")
		return
	}
	tempClaims, ok := token.Claims.(*TempClaims)
	if !ok || !token.Valid || tempClaims.Purpose != "company_select" {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_temp_token")
		return
	}

	userID := tempClaims.Sub
	tenantID := tempClaims.TID

	// Verify user has access to this company
	var ucRole string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT uc.role FROM dm3_auth.user_companies uc
		 JOIN dm3_auth.companies c ON c.id = uc.company_id
		 WHERE uc.user_id = $1::uuid AND uc.company_id = $2::uuid AND uc.status = 'active' AND c.status = 'active'`,
		userID, req.CompanyID,
	).Scan(&ucRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_company_access")
		return
	}

	// Get user info
	var email, name string
	var roles []string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT email, name, roles FROM dm3_auth.users WHERE id = $1::uuid AND status = 'active'`, userID,
	).Scan(&email, &name, &roles)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.user_not_found")
		return
	}

	accessToken, err := h.generateAccessToken(userID, tenantID, email, name, roles, req.CompanyID, ucRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}
	refreshToken, _ := h.createRefreshToken(r, userID, tenantID)

	httputil.JSON(w, http.StatusOK, loginStepResponse{
		Step:         "complete",
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         &loginUserInfo{ID: userID, Name: name, Email: email, Role: ucRole, CID: req.CompanyID},
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Handlers) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	hash := hashToken(req.RefreshToken)

	var tokenID, userID, tenantID string
	var expiresAt time.Time
	var revoked bool
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, user_id, tenant_id, expires_at, revoked FROM dm3_auth.refresh_tokens WHERE token_hash = $1`,
		hash,
	).Scan(&tokenID, &userID, &tenantID, &expiresAt, &revoked)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_refresh_token")
		return
	}

	if revoked {
		// Replay detection: revoke all tokens for this user
		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE user_id = $1::uuid`, userID)
		slog.Warn("refresh token replay detected", "user_id", userID)
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.token_reuse_detected")
		return
	}

	if time.Now().After(expiresAt) {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.refresh_token_expired")
		return
	}

	// Revoke old token
	_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE id = $1::uuid`, tokenID)

	// Get user info
	var email, name string
	var roles []string
	var refreshCompanyID *string
	var refreshUserRole *string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT email, name, roles, company_id::text, role FROM dm3_auth.users WHERE id = $1::uuid AND status = 'active'`, userID,
	).Scan(&email, &name, &roles, &refreshCompanyID, &refreshUserRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.user_not_found")
		return
	}

	refreshCID := ""
	if refreshCompanyID != nil {
		refreshCID = *refreshCompanyID
	}
	refreshRole := "viewer"
	if refreshUserRole != nil && *refreshUserRole != "" {
		refreshRole = *refreshUserRole
	}

	accessToken, _ := h.generateAccessToken(userID, tenantID, email, name, roles, refreshCID, refreshRole)
	refreshToken, _ := h.createRefreshToken(r, userID, tenantID)

	httputil.JSON(w, http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		TokenType:    "Bearer",
	})
}

func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}
	// Revoke all refresh tokens for this user
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE user_id = $1::uuid`, claims.Sub)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}

	var user userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, company_id, email, name, roles, role, status, last_login, created_at,
		        preferred_language, timezone, session_timeout_minutes
		 FROM dm3_auth.users WHERE id = $1::uuid`,
		claims.Sub,
	).Scan(
		&user.ID, &user.TenantID, &user.CompanyID, &user.Email, &user.Name, &user.Roles, &user.Role,
		&user.Status, &user.LastLogin, &user.CreatedAt,
		&user.PreferredLanguage, &user.Timezone, &user.SessionTimeoutMinutes,
	)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}
	httputil.JSON(w, http.StatusOK, user)
}

type updateMeRequest struct {
	PreferredLanguage *string `json:"preferred_language,omitempty"`
	Timezone          *string `json:"timezone,omitempty"`
	SessionTimeoutMinutes *int `json:"session_timeout_minutes,omitempty"`
}

func (h *Handlers) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}

	var req updateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	// If no fields provided, just return current preferences.
	if req.PreferredLanguage == nil && req.Timezone == nil && req.SessionTimeoutMinutes == nil {
		h.Me(w, r)
		return
	}

	var lang *string
	if req.PreferredLanguage != nil {
		normalized := strings.ToLower(*req.PreferredLanguage)
		if idx := strings.Index(normalized, "-"); idx > 0 {
			normalized = normalized[:idx]
		}
		if normalized != "en" && normalized != "vi" {
			i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
			return
		}
		lang = &normalized
	}

	tz := req.Timezone
	if tz != nil && strings.TrimSpace(*tz) == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	timeout := req.SessionTimeoutMinutes
	if timeout != nil {
		if *timeout < 1 || *timeout > 10080 { // 1 minute .. 7 days
			i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
			return
		}
	}

	_, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.users
		 SET preferred_language = COALESCE($2::text, preferred_language),
		     timezone = COALESCE($3::text, timezone),
		     session_timeout_minutes = COALESCE($4::int, session_timeout_minutes),
		     updated_at = now()
		 WHERE id = $1::uuid`,
		claims.Sub, lang, tz, timeout,
	)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Return updated me
	h.Me(w, r)
}

// ─── Device Token ────────────────────────────────────────────────────────────

type deviceTokenRequest struct {
	DeviceID   string `json:"device_id"`
	DeviceType string `json:"device_type"`
}

type deviceTokenResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"`
}

func (h *Handlers) DeviceToken(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}

	var req deviceTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.DeviceID == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.device_id_required")
		return
	}
	if req.DeviceType == "" {
		req.DeviceType = "terminal"
	}

	// Verify device exists
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE device_id = $1)`, req.DeviceID,
	).Scan(&exists)
	if !exists {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "device.not_found")
		return
	}

	now := time.Now()
	dc := DeviceClaims{
		Sub:   fmt.Sprintf("device:%s", req.DeviceID),
		TID:   claims.TID,
		DID:   req.DeviceID,
		DType: req.DeviceType,
		Permissions: []string{
			fmt.Sprintf("dm3/devices/%s/telemetry", req.DeviceID),
			fmt.Sprintf("dm3/devices/%s/events", req.DeviceID),
			fmt.Sprintf("dm3/devices/%s/commands", req.DeviceID),
		},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "dm3-auth",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, dc)
	tokenStr, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}

	httputil.JSON(w, http.StatusOK, deviceTokenResponse{
		Token:     tokenStr,
		ExpiresIn: 86400,
	})
}

// ─── Users CRUD ──────────────────────────────────────────────────────────────

type userResponse struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	CompanyID *string    `json:"company_id,omitempty"`
	Email     string     `json:"email"`
	Name      *string    `json:"name"`
	Roles     []string   `json:"roles"`
	Role      *string    `json:"role,omitempty"`
	Status    string     `json:"status"`
	LastLogin *time.Time `json:"last_login"`
	CreatedAt time.Time  `json:"created_at"`
	PreferredLanguage *string `json:"preferred_language,omitempty"`
	Timezone          *string `json:"timezone,omitempty"`
	SessionTimeoutMinutes *int `json:"session_timeout_minutes,omitempty"`
}

func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_auth.users`).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, company_id, email, name, roles, role, status, last_login, created_at
		 FROM dm3_auth.users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	users := []userResponse{}
	for rows.Next() {
		var u userResponse
		if err := rows.Scan(&u.ID, &u.TenantID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, u)
	}
	httputil.Paginated(w, users, total, page, limit)
}

type createUserRequest struct {
	Email    string   `json:"email"`
	Password string   `json:"password"`
	Name     string   `json:"name"`
	Roles    []string `json:"roles"`
}

func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.Email == "" || req.Password == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.email_password_required")
		return
	}
	if len(req.Roles) == 0 {
		req.Roles = []string{"viewer"}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.password_hashing_failed")
		return
	}

	var u userResponse
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.users (email, password_hash, name, roles)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, tenant_id, company_id, email, name, roles, role, status, last_login, created_at`,
		req.Email, string(hash), req.Name, req.Roles,
	).Scan(&u.ID, &u.TenantID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		slog.Error("create user", "error", err)
		i18n.ErrorResponse(w, r, http.StatusConflict, "user.already_exists")
		return
	}
	httputil.JSON(w, http.StatusCreated, u)
}

func (h *Handlers) GetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var u userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, company_id, email, name, roles, role, status, last_login, created_at
		 FROM dm3_auth.users WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.TenantID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	httputil.JSON(w, http.StatusOK, u)
}

type updateUserRequest struct {
	Name   *string  `json:"name"`
	Roles  []string `json:"roles"`
	Status *string  `json:"status"`
}

func (h *Handlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var u userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_auth.users SET
			name = COALESCE($2, name),
			roles = COALESCE($3, roles),
			status = COALESCE($4, status),
			updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id, tenant_id, company_id, email, name, roles, role, status, last_login, created_at`,
		id, req.Name, req.Roles, req.Status,
	).Scan(&u.ID, &u.TenantID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	httputil.JSON(w, http.StatusOK, u)
}

func (h *Handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_auth.users WHERE id = $1::uuid`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type changePasswordRequest struct {
	Password string `json:"password"`
}

func (h *Handlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.Password == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.password_required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.password_hashing_failed")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`, id, string(hash))
	if err != nil || tag.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}

	// Revoke all refresh tokens
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE user_id = $1::uuid`, id)

	w.WriteHeader(http.StatusNoContent)
}

// ─── Roles ───────────────────────────────────────────────────────────────────

type roleInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

func (h *Handlers) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles := []roleInfo{
		{Name: "admin", Description: "Full system access", Permissions: []string{"users:read", "users:write", "users:delete", "devices:read", "devices:write", "access:read", "access:write", "identity:read", "identity:write"}},
		{Name: "operator", Description: "Operational access", Permissions: []string{"devices:read", "devices:write", "access:read", "access:write", "identity:read"}},
		{Name: "viewer", Description: "Read-only access", Permissions: []string{"devices:read", "access:read", "identity:read"}},
	}
	httputil.JSON(w, http.StatusOK, roles)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *Handlers) generateTempToken(userID, tenantID string) (string, error) {
	now := time.Now()
	claims := TempClaims{
		Sub:     userID,
		TID:     tenantID,
		Purpose: "company_select",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "dm3-auth",
			Subject:   userID,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

func (h *Handlers) generateAccessToken(userID, tenantID, email, name string, roles []string, companyID, role string) (string, error) {
	now := time.Now()
	claims := AccessClaims{
		Sub:   userID,
		TID:   tenantID,
		CID:   companyID,
		Email: email,
		Name:  name,
		Roles: roles,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "dm3-auth",
			Subject:   userID,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

func (h *Handlers) createRefreshToken(r *http.Request, userID, tenantID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	tokenStr := hex.EncodeToString(raw)
	hash := hashToken(tokenStr)

	_, err := h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_auth.refresh_tokens (user_id, tenant_id, token_hash, expires_at)
		 VALUES ($1::uuid, $2::uuid, $3, $4)`,
		userID, tenantID, hash, time.Now().Add(7*24*time.Hour))
	if err != nil {
		return "", err
	}
	return tokenStr, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return page, limit
}
