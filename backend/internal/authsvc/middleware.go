package authsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const claimsContextKey contextKey = "auth_claims"

// AuthMiddleware validates JWT and injects claims into context.
func AuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing authorization header"})
				return
			}

			tokenStr := strings.TrimPrefix(header, "Bearer ")
			token, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return []byte(jwtSecret), nil
			})
			if err != nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
				return
			}

			claims, ok := token.Claims.(*AccessClaims)
			if !ok || !token.Valid {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token claims"})
				return
			}

			ctx := context.WithValue(r.Context(), claimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns middleware that checks the user has one of the required roles.
// Checks both the new Role field and legacy Roles array.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			// Check new role field first
			for _, required := range roles {
				if claims.Role == required {
					next.ServeHTTP(w, r)
					return
				}
			}
			// Fallback: check legacy roles array
			for _, cr := range claims.Roles {
				for _, required := range roles {
					if cr == required {
						next.ServeHTTP(w, r)
						return
					}
				}
			}
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "insufficient permissions"})
		})
	}
}

// CompanyIDKey is the context key for the resolved company_id.
const companyIDContextKey contextKey = "company_id"

// RequireCompany extracts company_id from JWT claims and injects it into context.
// System admins (role=system_admin) are allowed through without a company_id.
// Optionally accepts a query param ?company_id= for system admins to scope requests.
func RequireCompany() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}

			// System admins can optionally scope to a company via query param
			if claims.Role == "system_admin" {
				cid := r.URL.Query().Get("company_id")
				if cid == "" {
					cid = claims.CID
				}
				ctx := context.WithValue(r.Context(), companyIDContextKey, cid)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Regular users must have a company_id
			if claims.CID == "" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "no company associated with this account"})
				return
			}

			ctx := context.WithValue(r.Context(), companyIDContextKey, claims.CID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// CompanyIDFromContext extracts the company_id from request context.
func CompanyIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(companyIDContextKey).(string)
	return v
}

// ClaimsFromContext extracts AccessClaims from context.
func ClaimsFromContext(ctx context.Context) *AccessClaims {
	c, _ := ctx.Value(claimsContextKey).(*AccessClaims)
	return c
}

// RequireWriteRole returns middleware that allows any authenticated user for GET/HEAD/OPTIONS,
// but requires one of the specified roles for mutating methods (POST/PUT/PATCH/DELETE).
func RequireWriteRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Read methods are allowed for any authenticated user
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			// Mutating methods require one of the specified roles
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			for _, required := range roles {
				if claims.Role == required {
					next.ServeHTTP(w, r)
					return
				}
			}
			for _, cr := range claims.Roles {
				for _, required := range roles {
					if cr == required {
						next.ServeHTTP(w, r)
						return
					}
				}
			}
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "insufficient permissions"})
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
