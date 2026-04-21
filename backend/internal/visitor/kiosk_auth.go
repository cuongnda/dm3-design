package visitor

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// kioskContextKey is the private context key for the tenant_id resolved from
// a kiosk bearer token. We use a separate context key from the regular
// AccessClaims path so code can tell kiosk-authenticated requests apart from
// user-authenticated ones if needed.
type kioskContextKey struct{}

// kioskCtx holds the tenant_id and token_id resolved by KioskAuthMiddleware.
type kioskCtx struct {
	TenantID string
	TokenID  string
}

// KioskTokenPrefix is the human-readable prefix on generated tokens so they
// are easy to recognise in logs and distinguish from JWTs. The cleartext
// token shape is `dm3kiosk_<64 hex chars>` (32 random bytes hex-encoded).
const KioskTokenPrefix = "dm3kiosk_"

// KioskAuthMiddleware validates a kiosk bearer token in the Authorization
// header, looks it up in dm3_auth.kiosk_tokens, and injects the tenant_id
// into the request context. Unlike the user JWT middleware it does not
// require (or understand) JWT claims — the token is just a long random
// secret, hashed at rest.
func KioskAuthMiddleware(database *db.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				httputil.Error(w, http.StatusUnauthorized, "missing authorization header")
				return
			}
			tokenStr := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
			if tokenStr == "" || !strings.HasPrefix(tokenStr, KioskTokenPrefix) {
				httputil.Error(w, http.StatusUnauthorized, "invalid kiosk token")
				return
			}

			tokenHash := hashKioskToken(tokenStr)

			var tokenID, tenantID string
			var revokedAt *time.Time
			err := database.Pool.QueryRow(r.Context(), `
				SELECT id::text, tenant_id::text, revoked_at
				FROM dm3_auth.kiosk_tokens
				WHERE token_hash = $1
			`, tokenHash).Scan(&tokenID, &tenantID, &revokedAt)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					httputil.Error(w, http.StatusUnauthorized, "invalid kiosk token")
					return
				}
				httputil.Error(w, http.StatusInternalServerError, "auth lookup failed")
				return
			}
			if revokedAt != nil {
				httputil.Error(w, http.StatusUnauthorized, "kiosk token revoked")
				return
			}

			// Bump last_used_at asynchronously so the happy path isn't gated
			// on a secondary DB write. A missed update is harmless — this
			// field is purely observability.
			go func(id string) {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				_, _ = database.Pool.Exec(ctx,
					`UPDATE dm3_auth.kiosk_tokens SET last_used_at = now() WHERE id = $1::uuid`, id)
			}(tokenID)

			ctx := context.WithValue(r.Context(), kioskContextKey{}, kioskCtx{
				TenantID: tenantID,
				TokenID:  tokenID,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// KioskTenantIDFromContext returns the tenant_id resolved by
// KioskAuthMiddleware, or "" when the request was not kiosk-authenticated.
func KioskTenantIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(kioskContextKey{}).(kioskCtx)
	return v.TenantID
}

// KioskTokenIDFromContext returns the kiosk_tokens.id used for the request,
// or "" when the request was not kiosk-authenticated.
func KioskTokenIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(kioskContextKey{}).(kioskCtx)
	return v.TokenID
}

// generateKioskToken returns a fresh opaque token suitable for use as a kiosk
// bearer credential. 32 random bytes → 64 hex chars, prefixed so a human can
// recognise it in configs and logs.
func generateKioskToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("kiosk token rand: %w", err)
	}
	return KioskTokenPrefix + hex.EncodeToString(buf), nil
}

// hashKioskToken is the at-rest representation of a kiosk token. SHA-256 is
// sufficient here because the cleartext is already 256 bits of random
// entropy — there is nothing to brute-force and nothing to salt for.
func hashKioskToken(clear string) string {
	sum := sha256.Sum256([]byte(clear))
	return hex.EncodeToString(sum[:])
}
