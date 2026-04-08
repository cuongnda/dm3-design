package tenant

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
)

// RegisterRoutes adds tenant management routes to the router
func RegisterRoutes(r chi.Router, database *db.DB, jwtSecret string) {
	handlers := NewTenantHandlers(database)

	// Public tenant routes (require authentication + tenant context)
	r.Route("/api/v1/auth/tenant", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(Middleware(database, IsolationModeSystemAdmin))

		// Current tenant info (any authenticated user)
		r.Get("/current", handlers.GetCurrentTenant)
		r.Get("/stats", handlers.GetTenantStats)
		r.Get("/limits/validate", handlers.ValidateTenantLimits)
	})

	// Admin tenant routes (system admin only)
	r.Route("/api/v1/auth/admin/tenants", func(r chi.Router) {
		// Auth + system admin middleware
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(authsvc.RequireRole("system_admin"))
		
		r.Get("/", handlers.ListTenants)
		r.Get("/{id}", handlers.GetTenant)
		r.Put("/{id}/status", handlers.UpdateTenantStatus)
	})

	// Tenant-scoped routes with strict isolation
	r.Route("/api/v1/auth/scoped", func(r chi.Router) {
		// Auth + strict tenant middleware
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(authsvc.RequireCompany())
		r.Use(RequireTenant(database))
		
		// Example scoped endpoints - these would be implemented by other services
		// but using the tenant middleware ensures proper isolation
		r.Get("/devices", func(w http.ResponseWriter, r *http.Request) {
			// Example: devices endpoint that's automatically tenant-scoped
			// Implementation would be in the device service
		})
		r.Get("/persons", func(w http.ResponseWriter, r *http.Request) {
			// Example: persons endpoint that's automatically tenant-scoped
			// Implementation would be in the identity service
		})
	})
}

// RegisterMiddleware provides middleware functions for other services
func RegisterMiddleware() map[string]interface{} {
	return map[string]interface{}{
		"require_tenant":     RequireTenant,
		"optional_tenant":    OptionalTenant,
		"system_admin_tenant": SystemAdminTenant,
	}
}