package authsvc

import (
	"context"
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
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/internal/rbac"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// ─── Claims ──────────────────────────────────────────────────────────────────

type AccessClaims struct {
	Sub            string   `json:"sub"`
	TID            string   `json:"tid,omitempty"` // tenant_id
	CID            string   `json:"cid,omitempty"` // tenant_id
	Email          string   `json:"email"`
	Name           string   `json:"name"`
	Roles          []string `json:"roles"`
	Role           string   `json:"role,omitempty"` // legacy: primary_manager, manager, operator, viewer, system_admin
	EnabledPlugins []string `json:"enabled_plugins,omitempty"`

	// RBAC dual-claim (new canonical fields; legacy Role kept during migration window).
	// See docs/specs/platform/company-rbac.md.
	FixedRole   string            `json:"fixed_role,omitempty"` // system_admin | primary_manager | member
	Assignments []AssignmentClaim `json:"assignments,omitempty"`

	jwt.RegisteredClaims
}

// AssignmentClaim is a compact JSON shape for one role assignment carried in the JWT.
// Short field names keep the access token size small.
type AssignmentClaim struct {
	RoleID      string   `json:"rid,omitempty"`
	Permissions []string `json:"perms"`
	ScopeType   string   `json:"stype"`
	ScopeID     string   `json:"sid,omitempty"`
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

type AuthHandlers struct {
	db        *db.DB
	jwtSecret string
	audit     *audit.Logger
	email     *email.Client
	appURL    string
}

func NewAuthHandlers(database *db.DB, jwtSecret string, auditLog *audit.Logger) *AuthHandlers {
	return &AuthHandlers{db: database, jwtSecret: jwtSecret, audit: auditLog}
}

// SetEmailClient configures the email client for password reset and notifications.
func (h *AuthHandlers) SetEmailClient(client *email.Client, appURL string) {
	h.email = client
	h.appURL = appURL
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
	CID   string `json:"tenant_id,omitempty"`
}

type loginStepResponse struct {
	Step           string         `json:"step"`                      // "select_company" or "complete"
	TemporaryToken string         `json:"temporary_token,omitempty"` // only for select_company
	AccessToken    string         `json:"access_token,omitempty"`
	RefreshToken   string         `json:"refresh_token,omitempty"`
	User           *loginUserInfo `json:"user,omitempty"`
	Companies      []companyInfo  `json:"companies,omitempty"`
	EnabledPlugins []string       `json:"enabled_plugins,omitempty"`
}

type loginStep2Request struct {
	TemporaryToken string `json:"temporary_token"`
	TenantID      string `json:"tenant_id"`
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
	lockedUntil  *time.Time
}

// Account lockout policy — second half of P1.2 (security review C1).
// IP rate limiting (httprate, see cmd/auth-svc/main.go) bounds *attempts
// per source IP*; this bounds attempts per *account*. They compose: an
// attacker rotating IPs still has only loginLockoutMaxFailures shots
// against any single email before the account freezes for
// loginLockoutDuration.
const (
	loginLockoutMaxFailures = 5
	loginLockoutDuration    = 15 * time.Minute
)

func (h *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
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
		`SELECT id, tenant_id::text, email, COALESCE(full_name, email), password_hash, ARRAY[role], status, role, locked_until
		 FROM dm3_auth.accounts
		 WHERE email = $1 AND status != 'deleted'
		 ORDER BY tenant_id NULLS FIRST`,
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
		if err := rows.Scan(&a.id, &a.companyID, &a.email, &a.fullName, &a.passwordHash, &a.roles, &a.status, &a.role, &a.lockedUntil); err != nil {
			continue
		}
		accounts = append(accounts, a)
	}
	if len(accounts) == 0 {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Account lockout check — return generic invalid_credentials so a
	// caller cannot distinguish "wrong password" from "account locked"
	// (that would aid enumeration). All accounts sharing this email
	// share the same password_hash, so the first row's lock state is
	// authoritative for the credential check.
	if lu := accounts[0].lockedUntil; lu != nil && lu.After(time.Now()) {
		h.audit.Log(audit.Entry{
			ActorEmail: req.Email,
			ActorIP:    audit.IPFromRequest(r),
			UserAgent:  r.Header.Get("User-Agent"),
			Action:     "auth.login_locked",
			EntityType: "account",
			EntityName: req.Email,
			Status:     "failure",
		})
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Verify password against the first account found (all share the same password).
	if err := bcrypt.CompareHashAndPassword([]byte(accounts[0].passwordHash), []byte(req.Password)); err != nil {
		// Increment failure counter; trip the lock at the threshold.
		// CASE expression keeps a still-valid earlier lock in place and
		// only sets a new lock when this attempt is the trigger.
		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.accounts
			    SET failed_attempts = failed_attempts + 1,
			        locked_until = CASE
			            WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(secs => $3)
			            ELSE locked_until
			        END
			  WHERE email = $1 AND status != 'deleted'`,
			req.Email, loginLockoutMaxFailures, int(loginLockoutDuration.Seconds()))
		h.audit.Log(audit.Entry{
			ActorEmail: req.Email,
			ActorIP:    audit.IPFromRequest(r),
			UserAgent:  r.Header.Get("User-Agent"),
			Action:     "auth.login_failed",
			EntityType: "account",
			EntityName: req.Email,
			Status:     "failure",
		})
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.invalid_credentials")
		return
	}

	// Check active status.
	if accounts[0].status != "active" {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.account_not_active")
		return
	}

	// Update last_login for all matched accounts and reset lockout state.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts
		    SET last_login = now(),
		        login_count = login_count + 1,
		        failed_attempts = 0,
		        locked_until = NULL
		  WHERE email = $1 AND status != 'deleted'`, req.Email)

	// System admin account (tenant_id IS NULL) → complete immediately.
	first := accounts[0]
	if first.role == "system_admin" {
		cid := ""
		if first.companyID != nil {
			cid = *first.companyID
		}
		accessToken, err := h.generateAccessToken(first.id, cid, first.email, first.fullName, first.roles, cid, first.role, nil, resolveFixedRole(first.role), nil)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, err := h.createRefreshToken(r, first.id, cid)
		if err != nil {
			slog.Error("failed to create refresh token", "error", err, "user_id", first.id)
		}
		h.audit.Log(audit.Entry{
			ActorID:    first.id,
			ActorEmail: first.email,
			ActorIP:    audit.IPFromRequest(r),
			UserAgent:  r.Header.Get("User-Agent"),
			Action:     "auth.login",
			EntityType: "account",
			EntityID:   first.id,
			EntityName: first.email,
			Status:     "success",
		})
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
			`SELECT id, name, code, logo_url FROM dm3_auth.tenants WHERE id = $1::uuid AND status = 'active'`,
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
		plugins, _ := h.fetchEnabledPlugins(r.Context(), c.ID)
		assignments, _ := h.loadAssignments(r.Context(), chosenAccount.id)
		accessToken, err := h.generateAccessToken(chosenAccount.id, c.ID, chosenAccount.email, chosenAccount.fullName, chosenAccount.roles, c.ID, c.Role, plugins, resolveFixedRole(chosenAccount.role), assignments)
		if err != nil {
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		refreshToken, err := h.createRefreshToken(r, chosenAccount.id, c.ID)
		if err != nil {
			slog.Error("LoginStep2: failed to create refresh token", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
			return
		}
		h.audit.Log(audit.Entry{
			TenantID:   c.ID,
			ActorID:    chosenAccount.id,
			ActorEmail: chosenAccount.email,
			ActorIP:    audit.IPFromRequest(r),
			UserAgent:  r.Header.Get("User-Agent"),
			Action:     "auth.login",
			EntityType: "account",
			EntityID:   chosenAccount.id,
			EntityName: chosenAccount.email,
			Status:     "success",
		})
		httputil.JSON(w, http.StatusOK, loginStepResponse{
			Step:           "complete",
			AccessToken:    accessToken,
			RefreshToken:   refreshToken,
			User:           &loginUserInfo{ID: chosenAccount.id, Name: chosenAccount.fullName, Email: chosenAccount.email, Role: c.Role, CID: c.ID},
			EnabledPlugins: plugins,
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

func (h *AuthHandlers) LoginStep2(w http.ResponseWriter, r *http.Request) {
	var req loginStep2Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.TemporaryToken == "" || req.TenantID == "" {
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
		`SELECT id, tenant_id::text, email, COALESCE(full_name, email), password_hash, ARRAY[role], status, role
		 FROM dm3_auth.accounts
		 WHERE email = $1 AND tenant_id = $2::uuid AND status = 'active'`,
		tempClaims.Email, req.TenantID,
	).Scan(&account.id, &account.companyID, &account.email, &account.fullName,
		&account.passwordHash, &account.roles, &account.status, &account.role)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_company_access")
		return
	}

	// Verify company is still active.
	var companyStatus string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT status FROM dm3_auth.tenants WHERE id = $1::uuid`, req.TenantID,
	).Scan(&companyStatus)
	if err != nil || companyStatus != "active" {
		i18n.ErrorResponse(w, r, http.StatusForbidden, "auth.no_company_access")
		return
	}

	plugins, _ := h.fetchEnabledPlugins(r.Context(), req.TenantID)
	assignments, _ := h.loadAssignments(r.Context(), account.id)
	accessToken, err := h.generateAccessToken(account.id, req.TenantID, account.email, account.fullName, account.roles, req.TenantID, account.role, plugins, resolveFixedRole(account.role), assignments)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.token_generation_failed")
		return
	}
	refreshToken, err := h.createRefreshToken(r, account.id, req.TenantID)
	if err != nil {
		slog.Error("failed to create refresh token in step2", "error", err, "user_id", account.id)
	}

	h.audit.Log(audit.Entry{
		TenantID:   req.TenantID,
		ActorID:    account.id,
		ActorEmail: account.email,
		ActorIP:    audit.IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     "auth.login",
		EntityType: "account",
		EntityID:   account.id,
		EntityName: account.email,
		Status:     "success",
	})
	httputil.JSON(w, http.StatusOK, loginStepResponse{
		Step:           "complete",
		AccessToken:    accessToken,
		RefreshToken:   refreshToken,
		User:           &loginUserInfo{ID: account.id, Name: account.fullName, Email: account.email, Role: account.role, CID: req.TenantID},
		EnabledPlugins: plugins,
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandlers) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}

	hash := hashToken(req.RefreshToken)

	var tokenID, userID string
	var companyID *string
	var expiresAt time.Time
	var revoked bool
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, user_id, tenant_id, expires_at, revoked FROM dm3_auth.refresh_tokens WHERE token_hash = $1`,
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

	// Revoke old token. If this fails we must not issue a new token —
	// the old token would remain valid and the rotation guarantee is broken.
	if _, err := h.db.Pool.Exec(r.Context(), `UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE id = $1::uuid`, tokenID); err != nil {
		slog.Error("Refresh: failed to revoke old token", "error", err, "token_id", tokenID)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Get account info from dm3_auth.accounts.
	var email, fullName string
	var roles []string
	var refreshCompanyID *string
	var refreshUserRole string
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT email, COALESCE(full_name, email), ARRAY[role], tenant_id::text, role
		 FROM dm3_auth.accounts WHERE id = $1::uuid AND status != 'deleted'`, userID,
	).Scan(&email, &fullName, &roles, &refreshCompanyID, &refreshUserRole)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.user_not_found")
		return
	}

	// Resolve tenant ID: from refresh token (nullable for system_admin)
	tenantID := ""
	if companyID != nil {
		tenantID = *companyID
	}
	refreshTenantID := tenantID
	if refreshCompanyID != nil {
		refreshTenantID = *refreshCompanyID
	}

	refreshPlugins, _ := h.fetchEnabledPlugins(r.Context(), refreshTenantID)
	refreshAssignments, _ := h.loadAssignments(r.Context(), userID)
	accessToken, err := h.generateAccessToken(userID, tenantID, email, fullName, roles, refreshTenantID, refreshUserRole, refreshPlugins, resolveFixedRole(refreshUserRole), refreshAssignments)
	if err != nil {
		slog.Error("Refresh: failed to generate access token", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	refreshToken, err := h.createRefreshToken(r, userID, tenantID)
	if err != nil {
		slog.Error("Refresh: failed to create refresh token", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.audit.Log(audit.Entry{
		TenantID:   tenantID,
		ActorID:    userID,
		ActorEmail: email,
		ActorIP:    audit.IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     "auth.token_refresh",
		EntityType: "account",
		EntityID:   userID,
		EntityName: email,
		Status:     "success",
	})
	httputil.JSON(w, http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		TokenType:    "Bearer",
	})
}

func (h *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}
	// Revoke all refresh tokens for this user.
	if _, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE user_id = $1::uuid`, claims.Sub); err != nil {
		slog.Error("Logout: failed to revoke tokens", "error", err, "user_id", claims.Sub)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	h.audit.LogFromRequest(r, "auth.logout", "account", claims.Sub, claims.Email, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandlers) Me(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}

	var user userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status,
		        last_login, created_at, locale, timezone, NULL::int
		 FROM dm3_auth.accounts WHERE id = $1::uuid`,
		claims.Sub,
	).Scan(
		&user.ID, &user.TenantID, &user.Email, &user.Name, &user.Roles, &user.Role,
		&user.Status, &user.LastLogin, &user.CreatedAt,
		&user.PreferredLanguage, &user.Timezone, &user.SessionTimeoutMinutes,
	)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}
	user.EnabledPlugins = claims.EnabledPlugins
	httputil.JSON(w, http.StatusOK, user)
}

type updateMeRequest struct {
	PreferredLanguage     *string `json:"preferred_language,omitempty"`
	Timezone              *string `json:"timezone,omitempty"`
	SessionTimeoutMinutes *int    `json:"session_timeout_minutes,omitempty"`
}

func (h *AuthHandlers) UpdateMe(w http.ResponseWriter, r *http.Request) {
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

	h.audit.LogFromRequest(r, "account.self_update", "account", claims.Sub, claims.Email, "success", nil, req)

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

func (h *AuthHandlers) DeviceToken(w http.ResponseWriter, r *http.Request) {
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
	TenantID             *string    `json:"tenant_id,omitempty"`
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
	EnabledPlugins        []string   `json:"enabled_plugins,omitempty"`
}

func (h *AuthHandlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_auth.accounts WHERE status != 'deleted'`).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at
		 FROM dm3_auth.accounts WHERE status != 'deleted' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		slog.Error("list users: query", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	users := []userResponse{}
	for rows.Next() {
		var u userResponse
		if err := rows.Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt); err != nil {
			slog.Error("list users: scan", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
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
	TenantID *string  `json:"tenant_id,omitempty"`
}

func (h *AuthHandlers) CreateUser(w http.ResponseWriter, r *http.Request) {
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
		`INSERT INTO dm3_auth.accounts (email, password_hash, first_name, role, tenant_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, tenant_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at`,
		req.Email, string(hash), req.Name, role, req.TenantID,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		slog.Error("create user", "error", err)
		i18n.ErrorResponse(w, r, http.StatusConflict, "user.already_exists")
		return
	}
	httputil.JSON(w, http.StatusCreated, u)
}

func (h *AuthHandlers) GetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var u userResponse
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at
		 FROM dm3_auth.accounts WHERE id = $1::uuid`, id,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
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

func (h *AuthHandlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
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
		 RETURNING id, tenant_id::text, email, COALESCE(full_name, email), ARRAY[role], role, status, last_login, created_at`,
		id, req.Name, rolePtr, req.Status,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.Name, &u.Roles, &u.Role, &u.Status, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	httputil.JSON(w, http.StatusOK, u)
}

func (h *AuthHandlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	// Soft delete: set status to 'deleted'.
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'deleted', updated_at = now() WHERE id = $1::uuid AND status != 'deleted'`, id)
	if err != nil {
		slog.Error("delete user", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type changeMyPasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}

// ChangeMyPassword lets the authenticated user change their own password.
func (h *AuthHandlers) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil || claims.Sub == "" {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "auth.unauthorized")
		return
	}

	var req changeMyPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" || req.ConfirmPassword == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.all_fields_required")
		return
	}
	if len(req.NewPassword) < 6 {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.password_too_short")
		return
	}
	if req.NewPassword != req.ConfirmPassword {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.password_mismatch")
		return
	}

	// Verify current password. We also grab the email because the UPDATE
	// below scopes by email, not id — see the "all rows share password"
	// invariant notes on the Login handler.
	var currentHash, email string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT password_hash, email FROM dm3_auth.accounts WHERE id = $1::uuid AND status != 'deleted'`,
		claims.Sub).Scan(&currentHash, &email)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "auth.current_password_incorrect")
		return
	}

	// Hash and update new password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.password_hashing_failed")
		return
	}

	// Multi-tenant accounts: one email can have multiple rows in
	// dm3_auth.accounts (one per tenant the user belongs to, plus an
	// optional system_admin row with tenant_id NULL). The Login handler
	// only verifies against accounts[0].passwordHash and assumes every
	// row for this email stores the same hash (comment on Login line ~208).
	// Updating by id would silently break that invariant whenever the
	// current tenant's row isn't the one login picks first — the user
	// would see "password changed successfully" but then fail to log in
	// with the new password because login matched a different, still-stale
	// hash. Updating by email keeps every row in sync. We also clear the
	// lockout counters so a user who got locked out can recover by
	// changing their password.
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts
		    SET password_hash = $2,
		        failed_attempts = 0,
		        locked_until = NULL,
		        updated_at = now()
		  WHERE email = $1 AND status != 'deleted'`,
		email, string(hash))
	if err != nil || tag.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "user.not_found")
		return
	}

	// Revoke every refresh token the user holds so stolen tokens can't
	// survive a password rotation. The user's current access token stays
	// valid until its natural expiry (15m) — acceptable for a self-serve
	// flow; device reprovisioning is handled by separate endpoints.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.refresh_tokens rt
		    SET revoked = true
		   FROM dm3_auth.accounts a
		  WHERE rt.user_id = a.id
		    AND a.email = $1
		    AND rt.revoked = false`,
		email)

	w.WriteHeader(http.StatusNoContent)
}

type changePasswordRequest struct {
	Password string `json:"password"`
}

func (h *AuthHandlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
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

func (h *AuthHandlers) ListRoles(w http.ResponseWriter, r *http.Request) {
	// Mirrors the CHECK constraint on dm3_auth.accounts.role (migration 000001).
	// Ordered high → low privilege.
	roles := []roleInfo{
		{Name: "system_admin", Description: "Cross-tenant platform administrator", Permissions: []string{"system:*", "tenant:*", "users:*", "devices:*", "access:*", "identity:*", "audit:read"}},
		{Name: "primary_manager", Description: "Tenant owner — full access within tenant", Permissions: []string{"users:*", "devices:*", "access:*", "identity:*", "audit:read"}},
		{Name: "manager", Description: "Tenant manager — user + access management", Permissions: []string{"users:read", "users:write", "devices:read", "devices:write", "access:read", "access:write", "identity:read", "identity:write"}},
		{Name: "operator", Description: "Day-to-day operational access", Permissions: []string{"devices:read", "devices:write", "access:read", "access:write", "identity:read"}},
		{Name: "viewer", Description: "Read-only access", Permissions: []string{"devices:read", "access:read", "identity:read"}},
	}
	httputil.JSON(w, http.StatusOK, roles)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *AuthHandlers) generateTempToken(userID, email string) (string, error) {
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

// fetchEnabledPlugins queries the tenant's enabled_plugins from the database.
// Returns nil (not an error) when tenantID is empty (e.g. system_admin with no company).
func (h *AuthHandlers) fetchEnabledPlugins(ctx context.Context, tenantID string) ([]string, error) {
	if tenantID == "" {
		return nil, nil
	}
	var plugins []string
	err := h.db.Pool.QueryRow(ctx,
		`SELECT enabled_plugins FROM dm3_auth.tenants WHERE id = $1::uuid`,
		tenantID,
	).Scan(&plugins)
	if err != nil {
		return nil, fmt.Errorf("fetchEnabledPlugins: %w", err)
	}
	return plugins, nil
}

func (h *AuthHandlers) generateAccessToken(userID, companyID, email, name string, roles []string, selectedCompanyID, role string, enabledPlugins []string, fixedRole string, assignments []AssignmentClaim) (string, error) {
	now := time.Now()
	claims := AccessClaims{
		Sub:            userID,
		CID:            selectedCompanyID,
		Email:          email,
		Name:           name,
		Roles:          roles,
		Role:           role,
		EnabledPlugins: enabledPlugins,
		FixedRole:      fixedRole,
		Assignments:    assignments,
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

// resolveFixedRole maps the legacy accounts.role value to the canonical
// FixedRole enum used by the RBAC pipeline. Legacy values (manager/operator/
// viewer) fall back to `member`; they still receive authority via assignments.
func resolveFixedRole(legacy string) string {
	switch legacy {
	case string(rbac.RoleSystemAdmin), string(rbac.RolePrimaryManager), string(rbac.RoleMember):
		return legacy
	default:
		return string(rbac.RoleMember)
	}
}

// loadAssignments returns the RBAC assignments carried by an account. Each
// assignment is a row from dm3_auth.user_role_assignments joined with its
// company_role_permissions so the JWT can be validated offline.
func (h *AuthHandlers) loadAssignments(ctx context.Context, accountID string) ([]AssignmentClaim, error) {
	if accountID == "" {
		return nil, nil
	}
	rows, err := h.db.Pool.Query(ctx, `
		SELECT ura.id::text,
		       ura.role_id::text,
		       ura.scope_type,
		       COALESCE(ura.scope_id::text, ''),
		       COALESCE(array_agg(crp.permission_key) FILTER (WHERE crp.permission_key IS NOT NULL), '{}')
		  FROM dm3_auth.user_role_assignments ura
		  LEFT JOIN dm3_auth.company_role_permissions crp ON crp.role_id = ura.role_id
		 WHERE ura.account_id = $1::uuid
		   AND (ura.effective_from IS NULL OR ura.effective_from <= now())
		   AND (ura.effective_to   IS NULL OR ura.effective_to   >  now())
		 GROUP BY ura.id, ura.role_id, ura.scope_type, ura.scope_id
	`, accountID)
	if err != nil {
		return nil, fmt.Errorf("loadAssignments: %w", err)
	}
	defer rows.Close()

	var out []AssignmentClaim
	for rows.Next() {
		var assignmentID, roleID, scopeType, scopeID string
		var perms []string
		if err := rows.Scan(&assignmentID, &roleID, &scopeType, &scopeID, &perms); err != nil {
			return nil, fmt.Errorf("loadAssignments scan: %w", err)
		}
		out = append(out, AssignmentClaim{
			RoleID:      roleID,
			Permissions: perms,
			ScopeType:   scopeType,
			ScopeID:     scopeID,
		})
	}
	return out, rows.Err()
}

func (h *AuthHandlers) createRefreshToken(r *http.Request, userID, companyID string) (string, error) {
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
		`INSERT INTO dm3_auth.refresh_tokens (user_id, tenant_id, token_hash, expires_at)
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
func (h *AuthHandlers) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		httputil.Error(w, http.StatusBadRequest, "user ID required")
		return
	}

	// Generate a cryptographically random password using rejection sampling to
	// avoid modulo bias (256 % 62 = 8 values are rejected per byte).
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	password := make([]byte, 12)
	buf := make([]byte, 1)
	for i := range password {
		for {
			if _, err := rand.Read(buf); err != nil {
				httputil.Error(w, http.StatusInternalServerError, "failed to generate password")
				return
			}
			if int(buf[0]) < 256-(256%len(chars)) {
				password[i] = chars[int(buf[0])%len(chars)]
				break
			}
		}
	}
	newPassword := string(password)

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	// Update ALL rows for this user's email — the codebase assumes every row
	// sharing an email shares one password (Login picks accounts[0] and treats
	// its hash as authoritative; partial updates leave other-company rows
	// stuck on the old hash). RETURNING surfaces the email + name once, so we
	// can email the user without a second round-trip.
	//
	// Also clear failed_attempts + locked_until: an admin reset is implicitly
	// an unlock. Otherwise a user who got locked out from typing the previous
	// (broken) password 5× sees "invalid credentials" even with the new one.
	// See [SA-02].
	var userEmail, userName string
	err = h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_auth.accounts
		    SET password_hash   = $1,
		        failed_attempts = 0,
		        locked_until    = NULL,
		        updated_at      = NOW()
		  WHERE email IN (
		            SELECT email FROM dm3_auth.accounts
		             WHERE id = $2::uuid AND status != 'deleted'
		        )
		    AND status != 'deleted'
		RETURNING email, COALESCE(full_name, first_name, email)`,
		string(hashedPassword), userID,
	).Scan(&userEmail, &userName)
	if err != nil {
		// pgx returns ErrNoRows when nothing matched.
		if err == pgx.ErrNoRows {
			httputil.Error(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	// Email the new password to the user — best-effort. SMTP failures (no
	// client configured, network down, bad credentials) must not fail the
	// reset itself; the admin already sees the password in the response and
	// can communicate it manually. We surface email_sent so the UI can show
	// "emailed to user@example.com" vs "tell them yourself" without a guess.
	// See [SA-03].
	emailSent := false
	if h.email != nil {
		go func(addr, name, pw, loginURL string) {
			msg := email.AdminPasswordResetEmail(addr, email.AdminPasswordResetData{
				UserName:    name,
				NewPassword: pw,
				LoginLink:   loginURL,
			})
			if err := h.email.Send(msg); err != nil {
				slog.Error("admin password reset: send email", "error", err, "email", addr)
				return
			}
			slog.Info("admin password reset email sent", "email", addr)
		}(userEmail, userName, newPassword, h.appURL)
		emailSent = true
	}

	h.audit.LogFromRequest(r, "account.password_reset", "account", userID, userEmail, "success", nil, map[string]any{
		"email_dispatched": emailSent,
	})
	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"password":   newPassword,
		"email_sent": emailSent,
		"email":      userEmail,
		"message":    "password reset successfully",
	})
}

// ChangeUserPassword sets a custom password for a user.
func (h *AuthHandlers) ChangeUserPassword(w http.ResponseWriter, r *http.Request) {
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

	// See ResetUserPassword — same rationale: update every row sharing this
	// user's email and clear lockout state in the same transaction. [SA-02]
	result, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts
		    SET password_hash   = $1,
		        failed_attempts = 0,
		        locked_until    = NULL,
		        updated_at      = NOW()
		  WHERE email IN (
		            SELECT email FROM dm3_auth.accounts
		             WHERE id = $2::uuid AND status != 'deleted'
		        )
		    AND status != 'deleted'`,
		string(hashedPassword), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	h.audit.LogFromRequest(r, "account.password_change", "account", userID, userID, "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"message": "password changed successfully",
	})
}
