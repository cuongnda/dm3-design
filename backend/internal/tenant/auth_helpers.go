package tenant

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"golang.org/x/crypto/bcrypt"
)

// AccountInfo represents a user account in the consolidated auth schema
type AccountInfo struct {
	ID            string    `json:"id"`
	CompanyID     *string   `json:"company_id"`
	Email         string    `json:"email"`
	PasswordHash  string    `json:"-"` // Never expose in JSON
	FirstName     *string   `json:"first_name"`
	LastName      *string   `json:"last_name"`
	FullName      *string   `json:"full_name"`
	Role          string    `json:"role"`
	Permissions   []string  `json:"permissions"`
	Status        string    `json:"status"`
	EmailVerified bool      `json:"email_verified"`
	Phone         *string   `json:"phone"`
	AvatarURL     *string   `json:"avatar_url"`
	Locale        string    `json:"locale"`
	Timezone      string    `json:"timezone"`
	LastLogin     *time.Time `json:"last_login"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// SessionInfo represents an active user session
type SessionInfo struct {
	ID              string     `json:"id"`
	AccountID       string     `json:"account_id"`
	CompanyID       string     `json:"company_id"`
	TokenHash       string     `json:"-"` // Never expose in JSON
	RefreshTokenHash *string   `json:"-"` // Never expose in JSON
	UserAgent       *string    `json:"user_agent"`
	IPAddress       *string    `json:"ip_address"`
	DeviceFingerprint *string  `json:"device_fingerprint"`
	IsActive        bool       `json:"is_active"`
	ExpiresAt       time.Time  `json:"expires_at"`
	LastActivity    time.Time  `json:"last_activity"`
	CreatedAt       time.Time  `json:"created_at"`
}

// AuthService provides authentication operations using consolidated auth schema
type AuthService struct {
	db *db.DB
}

// NewAuthService creates a new auth service
func NewAuthService(database *db.DB) *AuthService {
	return &AuthService{db: database}
}

// GetAccountByEmailAndCompany retrieves account with permissions
func (as *AuthService) GetAccountByEmailAndCompany(ctx context.Context, email string, companyID string) (*AccountInfo, error) {
	query := `
		SELECT 
			ap.account_id, ap.email, a.password_hash, a.first_name, a.last_name, 
			ap.full_name, ap.role, ap.all_permissions, ap.status, 
			a.email_verified, a.phone, a.avatar_url, a.locale, a.timezone,
			a.last_login, a.created_at, a.updated_at, ap.company_id
		FROM dm3_auth.account_permissions ap
		JOIN dm3_auth.accounts a ON ap.account_id = a.id
		WHERE ap.email = $1 AND ap.company_id = $2::uuid
		AND ap.status = 'active' AND ap.company_status = 'active'
	`

	var account AccountInfo
	var permissions string
	var lastLogin sql.NullTime

	err := as.db.Pool.QueryRow(ctx, query, email, companyID).Scan(
		&account.ID, &account.Email, &account.PasswordHash,
		&account.FirstName, &account.LastName, &account.FullName,
		&account.Role, &permissions, &account.Status,
		&account.EmailVerified, &account.Phone, &account.AvatarURL,
		&account.Locale, &account.Timezone, &lastLogin,
		&account.CreatedAt, &account.UpdatedAt, &account.CompanyID,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("account not found")
		}
		return nil, err
	}

	// Parse permissions array
	if permissions != "" {
		// PostgreSQL array format: {permission1,permission2}
		// Simple parsing - in production, use proper array parsing
		permissions = permissions[1 : len(permissions)-1] // Remove { }
		if permissions != "" {
			// Split by comma and clean quotes
			// This is simplified - use proper PostgreSQL array parsing library
			account.Permissions = []string{permissions} // Simplified
		}
	}

	if lastLogin.Valid {
		account.LastLogin = &lastLogin.Time
	}

	return &account, nil
}

// ValidatePassword checks if the provided password matches the account's password hash
func (as *AuthService) ValidatePassword(hashedPassword, plainPassword string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// CreateSession creates a new session for the account
func (as *AuthService) CreateSession(ctx context.Context, accountID, companyID string, sessionData map[string]string) (*SessionInfo, string, error) {
	// Generate session token
	token, err := generateSecureToken(32)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate session token: %v", err)
	}

	tokenHash := hashToken(token)
	expiresAt := time.Now().Add(24 * time.Hour) // 24 hour session

	var refreshTokenHash *string
	if refreshToken := sessionData["generate_refresh"]; refreshToken == "true" {
		refresh, err := generateSecureToken(32)
		if err == nil {
			hash := hashToken(refresh)
			refreshTokenHash = &hash
		}
	}

	session := &SessionInfo{
		AccountID:         accountID,
		CompanyID:         companyID,
		TokenHash:         tokenHash,
		RefreshTokenHash:  refreshTokenHash,
		UserAgent:        getStringPtr(sessionData["user_agent"]),
		IPAddress:        getStringPtr(sessionData["ip_address"]),
		DeviceFingerprint: getStringPtr(sessionData["device_fingerprint"]),
		IsActive:         true,
		ExpiresAt:        expiresAt,
		LastActivity:     time.Now(),
	}

	// Insert session into database
	err = as.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_auth.sessions 
		(account_id, company_id, token_hash, refresh_token_hash, user_agent, ip_address, device_fingerprint, expires_at)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`, accountID, companyID, tokenHash, refreshTokenHash, 
		session.UserAgent, session.IPAddress, session.DeviceFingerprint, expiresAt).
		Scan(&session.ID, &session.CreatedAt)

	if err != nil {
		return nil, "", fmt.Errorf("failed to create session: %v", err)
	}

	// Update last login time
	_, err = as.db.Pool.Exec(ctx, `
		UPDATE dm3_auth.accounts 
		SET last_login = NOW(), login_count = login_count + 1
		WHERE id = $1::uuid
	`, accountID)

	if err != nil {
		// Log error but don't fail session creation
		fmt.Printf("Warning: failed to update last login: %v\n", err)
	}

	return session, token, nil
}

// ValidateSession validates a session token and returns session info
func (as *AuthService) ValidateSession(ctx context.Context, token string) (*SessionInfo, *AccountInfo, error) {
	tokenHash := hashToken(token)

	query := `
		SELECT 
			s.id, s.account_id, s.company_id, s.token_hash, s.user_agent, 
			s.ip_address, s.device_fingerprint, s.is_active, s.expires_at, 
			s.last_activity, s.created_at,
			a.email, a.full_name, a.role, a.status
		FROM dm3_auth.sessions s
		JOIN dm3_auth.accounts a ON s.account_id = a.id
		WHERE s.token_hash = $1 AND s.is_active = true AND s.expires_at > NOW()
	`

	var session SessionInfo
	var account AccountInfo

	err := as.db.Pool.QueryRow(ctx, query, tokenHash).Scan(
		&session.ID, &session.AccountID, &session.CompanyID, &session.TokenHash,
		&session.UserAgent, &session.IPAddress, &session.DeviceFingerprint,
		&session.IsActive, &session.ExpiresAt, &session.LastActivity, &session.CreatedAt,
		&account.Email, &account.FullName, &account.Role, &account.Status,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, fmt.Errorf("invalid or expired session")
		}
		return nil, nil, err
	}

	// Update last activity
	_, err = as.db.Pool.Exec(ctx, `
		UPDATE dm3_auth.sessions 
		SET last_activity = NOW() 
		WHERE id = $1::uuid
	`, session.ID)

	if err != nil {
		// Log warning but continue
		fmt.Printf("Warning: failed to update session activity: %v\n", err)
	}

	account.ID = session.AccountID
	if session.CompanyID != "" {
		account.CompanyID = &session.CompanyID
	}

	return &session, &account, nil
}

// InvalidateSession invalidates a session
func (as *AuthService) InvalidateSession(ctx context.Context, token string) error {
	tokenHash := hashToken(token)

	_, err := as.db.Pool.Exec(ctx, `
		UPDATE dm3_auth.sessions 
		SET is_active = false 
		WHERE token_hash = $1
	`, tokenHash)

	return err
}

// InvalidateAllSessions invalidates all sessions for an account
func (as *AuthService) InvalidateAllSessions(ctx context.Context, accountID string) error {
	_, err := as.db.Pool.Exec(ctx, `
		UPDATE dm3_auth.sessions 
		SET is_active = false 
		WHERE account_id = $1::uuid
	`, accountID)

	return err
}

// CleanupExpiredTokens removes expired sessions and tokens
func (as *AuthService) CleanupExpiredTokens(ctx context.Context) (int, error) {
	result, err := as.db.Pool.Exec(ctx, "SELECT cleanup_expired_auth_tokens()")
	if err != nil {
		return 0, err
	}

	return int(result.RowsAffected()), nil
}

// CreatePasswordResetToken creates a password reset token
func (as *AuthService) CreatePasswordResetToken(ctx context.Context, accountID string) (string, error) {
	token, err := generateSecureToken(32)
	if err != nil {
		return "", err
	}

	tokenHash := hashToken(token)
	expiresAt := time.Now().Add(1 * time.Hour) // 1 hour expiry

	_, err = as.db.Pool.Exec(ctx, `
		INSERT INTO dm3_auth.password_reset_tokens (account_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3)
	`, accountID, tokenHash, expiresAt)

	if err != nil {
		return "", err
	}

	return token, nil
}

// Utility functions

func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func getStringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}