package authsvc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

const (
	resetTokenExpiry = 1 * time.Hour
	resetTokenBytes  = 32
)

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

type resetPasswordRequest struct {
	Token           string `json:"token"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}

// ForgotPassword handles POST /api/v1/auth/password/forgot.
// Always returns 202 to prevent email enumeration.
func (h *AuthHandlers) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.Email == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.email_required")
		return
	}

	// Always return 202 regardless of whether the email exists.
	// Do the actual work, but don't leak info.
	go h.processForgotPassword(req.Email)

	httputil.JSON(w, http.StatusAccepted, map[string]string{
		"message": "If an account with that email exists, a password reset link has been sent.",
	})
}

func (h *AuthHandlers) processForgotPassword(emailAddr string) {
	if h.email == nil {
		slog.Warn("password reset: email client not configured")
		return
	}

	ctx := context.Background()

	// Look up the user.
	var userID, fullName string
	err := h.db.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(full_name, email)
		 FROM dm3_auth.accounts
		 WHERE email = $1 AND status = 'active'
		 LIMIT 1`,
		emailAddr,
	).Scan(&userID, &fullName)
	if err != nil {
		// No account found — silently return (prevents enumeration).
		return
	}

	// Invalidate any existing unused tokens for this user.
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE dm3_auth.password_reset_tokens SET used_at = now() WHERE user_id = $1::uuid AND used_at IS NULL`,
		userID,
	)

	// Generate a secure random token.
	raw := make([]byte, resetTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		slog.Error("password reset: generate token", "error", err)
		return
	}
	token := hex.EncodeToString(raw)
	tokenHash := hashResetToken(token)
	expiresAt := time.Now().Add(resetTokenExpiry)

	// Store the token hash in the database.
	_, err = h.db.Pool.Exec(ctx,
		`INSERT INTO dm3_auth.password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1::uuid, $2, $3)`,
		userID, tokenHash, expiresAt,
	)
	if err != nil {
		slog.Error("password reset: store token", "error", err)
		return
	}

	// Build and send the reset email.
	resetLink := h.appURL + "/reset-password?token=" + token

	// Check for custom template (try to find company from account)
	var customSubject, customBody string
	var companyID string
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COALESCE(company_id::text, '') FROM dm3_auth.accounts WHERE id = $1::uuid`, userID,
	).Scan(&companyID)
	if companyID != "" {
		_ = h.db.Pool.QueryRow(ctx,
			`SELECT subject, body_html FROM dm3_identity.email_templates
			 WHERE tenant_id = $1::uuid AND type = 'password_reset' AND is_active = true`,
			companyID,
		).Scan(&customSubject, &customBody)
	}

	var msg email.Message
	if customBody != "" {
		msg = email.RenderCustomTemplate(emailAddr, customSubject, customBody, map[string]string{
			"user_name":  fullName,
			"reset_link": resetLink,
			"expires_in": "1 hour",
		})
	} else {
		msg = email.PasswordResetEmail(emailAddr, email.PasswordResetData{
			UserName:  fullName,
			ResetLink: resetLink,
			ExpiresIn: "1 hour",
		})
	}

	if err := h.email.Send(msg); err != nil {
		slog.Error("password reset: send email", "error", err, "email", emailAddr)
		return
	}

	h.audit.Log(audit.Entry{
		ActorID:    userID,
		ActorEmail: emailAddr,
		Action:     "auth.password_reset_requested",
		EntityType: "account",
		EntityID:   userID,
		EntityName: emailAddr,
		Status:     "success",
	})

	slog.Info("password reset email sent", "email", emailAddr)
}

// ResetPassword handles POST /api/v1/auth/password/reset.
// Validates the token and sets the new password.
func (h *AuthHandlers) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.Token == "" || req.NewPassword == "" || req.ConfirmPassword == "" {
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

	tokenHash := hashResetToken(req.Token)

	// Find the token and verify it's valid.
	var tokenID, userID, userEmail string
	var expiresAt time.Time
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT t.id, t.user_id, a.email, t.expires_at
		 FROM dm3_auth.password_reset_tokens t
		 JOIN dm3_auth.accounts a ON a.id = t.user_id
		 WHERE t.token_hash = $1 AND t.used_at IS NULL`,
		tokenHash,
	).Scan(&tokenID, &userID, &userEmail, &expiresAt)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "auth.invalid_reset_token")
		return
	}

	if time.Now().After(expiresAt) {
		// Mark as used so it can't be retried.
		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.password_reset_tokens SET used_at = now() WHERE id = $1::uuid`, tokenID)
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "auth.reset_token_expired")
		return
	}

	// Hash the new password.
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "auth.password_hashing_failed")
		return
	}

	// Update password and mark token as used.
	_, err = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`,
		userID, string(hash))
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.password_reset_tokens SET used_at = now() WHERE id = $1::uuid`, tokenID)

	// Revoke all refresh tokens for security.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.refresh_tokens SET revoked = true WHERE user_id = $1::uuid`, userID)

	h.audit.Log(audit.Entry{
		ActorID:    userID,
		ActorEmail: userEmail,
		ActorIP:    audit.IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     "auth.password_reset_completed",
		EntityType: "account",
		EntityID:   userID,
		EntityName: userEmail,
		Status:     "success",
	})

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Password reset successfully. You can now login with your new password.",
	})
}

func hashResetToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
