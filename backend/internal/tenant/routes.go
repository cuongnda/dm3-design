package tenant

import (
	"github.com/go-chi/chi/v5"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
)

// RegisterRoutes adds tenant management routes to the router.
func RegisterRoutes(r chi.Router, database *db.DB, jwtSecret string, auditLog *audit.Logger) {
	handlers := NewTenantHandlers(database, auditLog)

	// Public tenant routes (require authentication + tenant context)
	r.Route("/api/v1/auth/tenant", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(Middleware(database, IsolationModeSystemAdmin))

		r.Get("/current", handlers.GetCurrentTenant)
		r.Get("/stats", handlers.GetTenantStats)
		r.Get("/limits/validate", handlers.ValidateTenantLimits)
	})

	// Admin tenant routes (system admin only)
	r.Route("/api/v1/auth/admin/tenants", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(authsvc.RequireRole("system_admin"))

		r.Get("/", handlers.ListTenants)
		r.Get("/{id}", handlers.GetTenant)
		r.Put("/{id}/status", handlers.UpdateTenantStatus)
	})
}