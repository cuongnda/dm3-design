package authsvc

import (
	"net/http"
)

// RequireModule returns middleware that checks if the tenant has a module enabled.
// It reads EnabledModules from the auth claims injected by AuthMiddleware.
// Returns 403 with {"error": "module_not_enabled", "module": "<name>"} if not enabled.
func RequireModule(moduleName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}

			for _, m := range claims.EnabledModules {
				if m == moduleName {
					next.ServeHTTP(w, r)
					return
				}
			}

			writeJSON(w, http.StatusForbidden, map[string]string{
				"error":  "module_not_enabled",
				"module": moduleName,
			})
		})
	}
}
