package authsvc

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	mathrand "math/rand"
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
	TID      string   `json:"tid,omitempty"` // tenant_id
	CID      string   `json:"cid,omitempty"` // company_id
	Email    string   `json:"email"`
	Name     string   `json:"name"`
	Roles    []string `json:"roles"`
	Role     string   `json:"role,omitempty"` // primary_manager, manager, operator, viewer, system_admin
	jwt.RegisteredClaims
}

// TempClaims is a short-lived token for company selection (step 2 of login).
type TempClaims struct {
	Sub     string `json:"sub"`   // first account id found (unused in step 2)
	Email   string `json:"email"` // user email for step 2 lookup
	CID     string `json:"cid"`
	Purpose string `json:"purpose"` // "company_select"
	jwt.RegisteredClaims
}

type DeviceClaims struct {
	Sub         string   `json:"sub"`
	CID         string   `json:"cid"`
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

// accountForLogin holds data scanned from dm3_auth.accounts during login.
type accountForLogin struct {
	id           string
	companyID    *string
	email        string
	fullName     string
	passwordHash string
	roles        []string
	status       string
	role         string
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

	// Fetch all accounts matching this email (one per company).
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, company_id::text, email, COALESCE(full_name, email), password_hash, ARRAY[role], status, role
		 FROM dm3_auth.accounts
		 WHERE email = $1 AND status != 'deleted'
		 ORDER BY company_id NULLS FIRST`,
		req.Email,
	)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}
	defer rows.Close()

	var accounts []accountForLogin
	for rows.Next() {
		var a accountForLogin
		if err := rows.Scan(&a.id, &a.companyID, &a.email, &a.fullName, &a.passwordHash, &a.roles, &a.status, &a.role); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}
	rows.Close()

	if len(accounts) == 0 {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Verify password against the first account found (all share the same password).
	if err := bcrypt.CompareHashAndPassword([]byte(accounts[0].passwordHash), []byte(req.Password)); err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Check active status.
	if accounts[0].status != "active" {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.account_not_active")
		return
	}

	// Update last_login for all matched accounts.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET last_login = now(), login_count = login_count + 1
		 WHERE email = $1 AND status != 'deleted'`, req.Email)

	// System admin account (company_id IS NULL) → complete immediately.
	first := accounts[0]
	if first.role == "system_admin" {
		cid := ""
		if first.companyID != nil {
			cid = *first.companyID
		}
		accessToken, err := h.generateAccessToken(first.id, cid, first.email, first.fullName, first.roles, cid, first.role)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, err := h.createRefreshToken(r, first.id, cid)
		if err != nil {
			slog.Error("failed to create refresh token", "error", err, "user_id", first.id)
		}
		httputil.JSON(w, http.StatusOK, loginStepResponse{
			Step:         "complete",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         &loginUserInfo{ID: first.id, Name: first.fullName, Email: first.email, Role: first.role},
		})
		return
	}

	// Build company list from accounts (each account belongs to one company).
	companies := []companyInfo{}
	for _, a := range accounts {
		if a.companyID == nil {
			continue
		}
		var ci companyInfo
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, name, code, logo_url FROM dm3_auth.companies WHERE id = $1::uuid AND status = 'active'`,
			*a.companyID,
		).Scan(&ci.ID, &ci.Name, &ci.Code, &ci.LogoURL)
		if err != nil {
			continue
		}
		ci.Role = a.role
		companies = append(companies, ci)
	}

	// No active companies.
	if len(companies) == 0 {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_active_company")
		return
	}

	// Single company → auto-select, complete immediately.
	if len(companies) == 1 {
		c := companies[0]
		// Find the account that matches this company.
		var chosenAccount accountForLogin
		for _, a := range accounts {
			if a.companyID != nil && *a.companyID == c.ID {
				chosenAccount = a
				break
			}
		}
		accessToken, err := h.generateAccessToken(chosenAccount.id, c.ID, chosenAccount.email, chosenAccount.fullName, chosenAccount.roles, c.ID, c.Role)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, _ := h.createRefreshToken(r, chosenAccount.id, c.ID)
		httputil.JSON(w, http.StatusOK, loginStepResponse{
			Step:         "complete",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         &loginUserInfo{ID: chosenAccount.id, Name: chosenAccount.fullName, Email: chosenAccount.email, Role: c.Role, CID: c.ID},
		})
		return
	}

	// Multiple companies → return temp token + company list.
	tempToken, err := h.generateTempToken(first.id, first.email)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}

	httputil.JSON(w, http.StatusOK, loginStepResponse{
		Step:           "select_company",
		TemporaryToken: tempToken,
		User:           &loginUserInfo{ID: first.id, Name: first.fullName, Email: first.email},
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

	// Parse temp token.
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

	// Find the account for this email + selected company.
	var account accountForLogin
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT id, company_id::text, email, COALESCE(full_name, email), password_hash, ARRAY[role], status, role
		 FROM dm3_auth.accounts
		 WHERE email = $1 AND company_id = $2::uuid AND status = 'active'`,
		tempClaims.Email, req.CompanyID,
	).Scan(&account.id, &account.companyID, &account.email, &account.fullName,
		&account.passwordHash, &account.roles, &account.status, &account.role)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_company_access")
		return
	}

	// Verify company is still active.
	var companyStatus string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT status FROM dm3_auth.companies WHERE id = $1::uuid`, req.CompanyID,
	).Scan(&companyStatus)
	if err != nil || companyStatus != "active" {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_company_access")
		return
	}

	accessToken, err := h.generateAccessToken(account.id, req.CompanyID, account.email, account.fullName, account.roles, req.CompanyID, account.role)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}
	refreshToken, err := h.createRefreshToken(r, account.id, req.CompanyID)
	if err != nil {
		slog.Error("failed to create refresh token in step2", "error", err, "user_id", account.id)
	}

	httputil.JSON(w, http.StatusOK, loginStepResponse{
		Step:         "complete",
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         &loginUserInfo{ID: account.id, Name: account.fullName, Email: account.email, Role: account.role, CID: req.CompanyID},
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

	var tokenID, userID, companyID string
	var expiresAt time.Time
	var revoked bool
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, user_id, company_id, expires_at, revoked FROM dm3_auth.refresh_tokens WHERE token_hash = $1`,
		hash,
	).Scan(&tokenID, &userID, &companyID, &expiresAt, &revoked)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_refresh_token")
		return
	}

	if revoked {
		// Replay detection: revoke all tokens for this user.
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

	// Revoke old token.
	_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE id = $1::uuid`, tokenID)

	// Get account info from dm3_auth.accounts.
	var email, fullName string
	var roles []string
	var refreshCompanyID *string
	var refreshUserRole string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT email, COALESCE(full_name, email), ARRAY[role], company_id::text, role
		 FROM dm3_auth.accounts WHERE id = $1::uuid AND status != 'deleted'`, userID,
	).Scan(&email, &fullName, &roles, &refreshCompanyID, &refreshUserRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.user_not_found")
		return
	}

	refreshCID := companyID
	if refreshCompanyID != nil {
		refreshCID = *refreshCompanyID
	}

	accessToken, _ := h.generateAccessToken(userID, companyID, email, fullName, roles, refreshCID, refreshUserRole)
	refreshToken, _ := h.createRefreshToken(r, userID, companyID)

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
	// Revoke all refresh tokens for this user.
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
		`SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		        last_login, created_at, locale, timezone, NULL::int
		 FROM dm3_auth.accounts WHERE id = $1::uuid`,
		claims.Sub,
	).Scan(
		&user.ID, &user.CompanyID, &user.Email, &user.Name, &user.Roles, &user.Role,
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
	PreferredLanguage     *string `json:"preferred_language,omitempty"`
	Timezone              *string `json:"timezone,omitempty"`
	SessionTimeoutMinutes *int    `json:"session_timeout_minutes,omitempty"`
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

	// session_timeout_minutes no longer exists in accounts; validate but ignore.
	timeout := req.SessionTimeoutMinutes
	if timeout != nil {
		if *timeout < 1 || *timeout > 10080 { // 1 minute .. 7 days
			i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
			return
		}
	}

	_, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts
		 SET locale    = COALESCE($2::text, locale),
		     timezone  = COALESCE($3::text, timezone),
		     updated_at = now()
		 WHERE id = $1::uuid`,
		claims.Sub, lang, tz,
	)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Return updated me.
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

	// Verify device exists.
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
		CID:   claims.CID,
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
	ID                    string     `json:"id"`
	CompanyID             *string    `json:"company_id,omitempty"`
	Email                 string     `json:"email"`
	Name                  *string    `json:"name"`
	Roles                 []string   `json:"roles"`
	Role                  *string    `json:"role,omitempty"`
	Status                string     `json:"status"`
	LastLogin             *time.Time `json:"last_login"`
	CreatedAt             time.Time  `json:"created_at"`
	PreferredLanguage     *string    `json:"preferred_language,omitempty"`
	Timezone              *string    `json:"timezone,omitempty"`
	SessionTimeoutMinutes *int       `json:"session_timeout_minutes,omitempty"`
}

func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_auth.accounts WHERE status != 'deleted'`).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at
		 FROM dm3_auth.accounts WHERE status != 'deleted' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	users := []userResponse{}
	for rows.Next() {
		var u userResponse
		if err := rows.Scan(&u.ID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, u)
	}
	httputil.Paginated(w, users, total, page, limit)
}

type createUserRequest struct {
	Email     string   `json:"email"`
	Password  string   `json:"password"`
	Name      string   `json:"name"`
	Roles     []string `json:"roles"`
	CompanyID *string  `json:"company_id,omitempty"`
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
	role := "viewer"
	if len(req.Roles) > 0 {
		role = req.Roles[0]
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.password_hashing_failed")
		return
	}

	var u userResponse
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.accounts (email, password_hash, first_name, role, company_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at`,
		req.Email, string(hash), req.Name, role, req.CompanyID,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
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
		`SELECT id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at
		 FROM dm3_auth.accounts WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
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

	// Derive single role from roles slice if provided.
	var rolePtr *string
	if len(req.Roles) > 0 {
		rolePtr = &req.Roles[0]
	}

	var u userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_auth.accounts SET
			first_name  = COALESCE($2, first_name),
			role        = COALESCE($3, role),
			status      = COALESCE($4, status),
			updated_at  = now()
		 WHERE id = $1::uuid
		 RETURNING id, company_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at`,
		id, req.Name, rolePtr, req.Status,
	).Scan(&u.ID, &u.CompanyID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	httputil.JSON(w, http.StatusOK, u)
}

func (h *Handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	// Soft delete: set status to 'deleted'.
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'deleted', updated_at = now() WHERE id = $1::uuid AND status != 'deleted'`, id)
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
		`UPDATE dm3_auth.accounts SET password_hash = $2, updated_at = now() WHERE id = $1::uuid AND status != 'deleted'`,
		id, string(hash))
	if err != nil || tag.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}

	// Revoke all refresh tokens.
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

func (h *Handlers) generateTempToken(userID, email string) (string, error) {
	now := time.Now()
	claims := TempClaims{
		Sub:     userID,
		Email:   email,
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

func (h *Handlers) generateAccessToken(userID, companyID, email, name string, roles []string, selectedCompanyID, role string) (string, error) {
	now := time.Now()
	claims := AccessClaims{
		Sub:   userID,
		CID:   selectedCompanyID,
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

func (h *Handlers) createRefreshToken(r *http.Request, userID, companyID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	tokenStr := hex.EncodeToString(raw)
	hash := hashToken(tokenStr)

	var cid interface{} = companyID
	if companyID == "" {
		cid = nil
	}
	_, err := h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_auth.refresh_tokens (user_id, company_id, token_hash, expires_at)
		 VALUES ($1::uuid, $2, $3, $4)`,
		userID, cid, hash, time.Now().Add(7*24*time.Hour))
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

// ResetUserPassword generates a new random password for a user.
func (h *Handlers) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	// Generate random password.
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	password := make([]byte, 12)
	for i := range password {
		password[i] = chars[mathrand.Intn(len(chars))]
	}
	newPassword := string(password)

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid AND status != 'deleted'`,
		string(hashedPassword), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"password": newPassword,
		"message":  "password reset successfully",
	})
}

// ChangeUserPassword sets a custom password for a user.
func (h *Handlers) ChangeUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Password == "" {
		httputil.Error(w, http.StatusBadRequest, "password is required")
		return
	}
	if len(req.Password) < 6 {
		httputil.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid AND status != 'deleted'`,
		string(hashedPassword), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": "password changed successfully",
	})
}
