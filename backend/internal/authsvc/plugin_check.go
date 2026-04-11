package authsvc

import (
	"net/http"
)

// RequirePlugin returns middleware that checks if the tenant has a plugin enabled.
// It reads EnabledPlugins from the auth claims injected by AuthMiddleware.
// Returns 403 with {"error": "plugin_not_enabled", "plugin": "<name>"} if not enabled.
func RequirePlugin(pluginName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}

			for _, p := range claims.EnabledPlugins {
				if p == pluginName {
					next.ServeHTTP(w, r)
					return
				}
			}

			writeJSON(w, http.StatusForbidden, map[string]string{
				"error":  "plugin_not_enabled",
				"plugin": pluginName,
			})
		})
	}
}
