package tenant

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// AuthHandlers provides consolidated authentication endpoints using dm3_auth schema
type AuthHandlers struct {
	db         *db.DB
	authSvc    *AuthService
	jwtSecret  string
}

// NewAuthHandlers creates new consolidated auth handlers
func NewAuthHandlers(database *db.DB, jwtSecret string) *AuthHandlers {
	return &AuthHandlers{
		db:        database,
		authSvc:   NewAuthService(database),
		jwtSecret: jwtSecret,
	}
}

// LoginRequest represents login request payload
type LoginRequest struct {
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required"`
	TenantID string `json:"tenant_id" validate:"required,uuid"`
	RememberMe bool  `json:"remember_me"`
}

// LoginResponse represents login response
type LoginResponse struct {
	Token        string       `json:"token"`
	RefreshToken *string      `json:"refresh_token,omitempty"`
	ExpiresIn    int64        `json:"expires_in"`
	Account      *AccountInfo `json:"account"`
	TenantInfo   *TenantInfo  `json:"tenant_info"`
}

// Login authenticates user with consolidated auth schema
func (ah *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" || req.TenantID == "" {
		httputil.Error(w, http.StatusBadRequest, "email, password, and tenant_id are required")
		return
	}

	// Get account with permissions
	account, err := ah.authSvc.GetAccountByEmailAndCompany(r.Context(), req.Email, req.TenantID)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Validate password
	if !ah.authSvc.ValidatePassword(account.PasswordHash, req.Password) {
		httputil.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Check account status
	if account.Status != "active" {
		httputil.Error(w, http.StatusForbidden, "account is not active")
		return
	}

	// Get tenant information
	tenantInfo, err := loadTenantInfo(r.Context(), ah.db, req.TenantID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to load tenant information")
		return
	}

	// Validate tenant status
	if tenantInfo.Status != "active" {
		httputil.Error(w, http.StatusForbidden, "company account is not active")
		return
	}

	// Create session data
	sessionData := map[string]string{
		"user_agent":         r.Header.Get("User-Agent"),
		"ip_address":         getClientIP(r),
		"device_fingerprint": r.Header.Get("X-Device-Fingerprint"),
	}
	
	if req.RememberMe {
		sessionData["generate_refresh"] = "true"
	}

	// Create session
	session, token, err := ah.authSvc.CreateSession(r.Context(), account.ID, req.TenantID, sessionData)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Generate JWT token
	jwtToken, err := ah.generateJWTToken(account, tenantInfo)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Prepare response
	response := LoginResponse{
		Token:      jwtToken,
		ExpiresIn:  int64(session.ExpiresAt.Sub(time.Now()).Seconds()),
		Account:    account,
		TenantInfo: tenantInfo,
	}

	if session.RefreshTokenHash != nil {
		// In production, return actual refresh token, not hash
		refreshToken := "refresh_" + token // Simplified
		response.RefreshToken = &refreshToken
	}

	httputil.JSON(w, http.StatusOK, response)
}

// Logout invalidates current session
func (ah *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	// Extract token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		httputil.Error(w, http.StatusBadRequest, "missing authorization token")
		return
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	
	// Invalidate session
	err := ah.authSvc.InvalidateSession(r.Context(), token)
	if err != nil {
		// Log error but don't fail logout
		fmt.Printf("Warning: failed to invalidate session: %v\n", err)
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "logged out successfully",
	})
}

// GetCurrentAccount returns current account information
func (ah *AuthHandlers) GetCurrentAccount(w http.ResponseWriter, r *http.Request) {
	// Extract account from context (set by auth middleware)
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Get full account information
	account, err := ah.authSvc.GetAccountByEmailAndCompany(r.Context(), claims.Email, claims.CID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "account not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"account": account,
	})
}

// UpdateAccountProfile updates account profile information
func (ah *AuthHandlers) UpdateAccountProfile(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		FirstName *string `json:"first_name"`
		LastName  *string `json:"last_name"`
		Phone     *string `json:"phone"`
		Locale    *string `json:"locale"`
		Timezone  *string `json:"timezone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Update account profile
	query := `
		UPDATE dm3_auth.accounts 
		SET first_name = COALESCE($2, first_name),
		    last_name = COALESCE($3, last_name),
		    phone = COALESCE($4, phone),
		    locale = COALESCE($5, locale),
		    timezone = COALESCE($6, timezone),
		    updated_at = NOW()
		WHERE id = $1::uuid AND tenant_id = $7::uuid
	`

	_, err := ah.db.Pool.Exec(r.Context(), query,
		claims.Sub, req.FirstName, req.LastName, req.Phone,
		req.Locale, req.Timezone, claims.CID)

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "profile updated successfully",
	})
}

// ChangePassword changes account password
func (ah *AuthHandlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password" validate:"required"`
		NewPassword     string `json:"new_password" validate:"required,min=8"`
		ConfirmPassword string `json:"confirm_password" validate:"required"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate input
	if req.NewPassword != req.ConfirmPassword {
		httputil.Error(w, http.StatusBadRequest, "passwords do not match")
		return
	}

	// Get current account
	account, err := ah.authSvc.GetAccountByEmailAndCompany(r.Context(), claims.Email, claims.CID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "account not found")
		return
	}

	// Verify current password
	if !ah.authSvc.ValidatePassword(account.PasswordHash, req.CurrentPassword) {
		httputil.Error(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to process new password")
		return
	}

	// Update password
	_, err = ah.db.Pool.Exec(r.Context(), `
		UPDATE dm3_auth.accounts 
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1::uuid
	`, claims.Sub, string(hashedPassword))

	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	// Invalidate all sessions except current one (optional)
	// ah.authSvc.InvalidateAllSessions(r.Context(), claims.Sub)

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "password changed successfully",
	})
}

// ListActiveSessions lists active sessions for the current account
func (ah *AuthHandlers) ListActiveSessions(w http.ResponseWriter, r *http.Request) {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := `
		SELECT id, user_agent, ip_address, device_fingerprint, 
		       last_activity, created_at, expires_at
		FROM dm3_auth.sessions
		WHERE account_id = $1::uuid AND is_active = true
		ORDER BY last_activity DESC
	`

	rows, err := ah.db.Pool.Query(r.Context(), query, claims.Sub)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch sessions")
		return
	}
	defer rows.Close()

	var sessions []map[string]interface{}
	for rows.Next() {
		var session map[string]interface{}
		var id, userAgent, ipAddress, deviceFingerprint string
		var lastActivity, createdAt, expiresAt time.Time

		err := rows.Scan(&id, &userAgent, &ipAddress, &deviceFingerprint, 
			&lastActivity, &createdAt, &expiresAt)
		if err != nil {
			continue
		}

		session = map[string]interface{}{
			"id":                id,
			"user_agent":        userAgent,
			"ip_address":        ipAddress,
			"device_fingerprint": deviceFingerprint,
			"last_activity":     lastActivity,
			"created_at":        createdAt,
			"expires_at":        expiresAt,
			"is_current":        false, // TODO: detect current session
		}

		sessions = append(sessions, session)
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
	})
}

// generateJWTToken creates a JWT token for the authenticated account
func (ah *AuthHandlers) generateJWTToken(account *AccountInfo, tenant *TenantInfo) (string, error) {
	claims := authsvc.AccessClaims{
		Sub:   account.ID,
		TID:   tenant.ID,
		CID:   tenant.TenantID,
		Email: account.Email,
		Name:  *account.FullName,
		Role:  account.Role,
		Roles: []string{account.Role}, // Convert single role to array for compatibility
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3-auth",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(ah.jwtSecret))
}

// getClientIP extracts client IP from request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	return r.RemoteAddr
}

// RegisterAuthRoutes registers consolidated auth routes
func RegisterAuthRoutes(r chi.Router, database *db.DB, jwtSecret string) {
	handlers := NewAuthHandlers(database, jwtSecret)

	// Public routes (no auth required)
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/login", handlers.Login)
		r.Post("/logout", handlers.Logout)
	})

	// Protected routes (auth required)
	r.Route("/api/v1/account", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))

		r.Get("/current", handlers.GetCurrentAccount)
		r.Put("/profile", handlers.UpdateAccountProfile)
		r.Put("/password", handlers.ChangePassword)
		r.Get("/sessions", handlers.ListActiveSessions)
	})
}
