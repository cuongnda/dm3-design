package tenant

import (
	"github.com/go-chi/chi/v5"
)

// AddUserManagementRoutes adds user management routes for company managers
func AddUserManagementRoutes(r chi.Router, handlers *UserManagementHandlers) {
	r.Route("/api/v1/users", func(r chi.Router) {
		// Apply tenant isolation middleware (simplified)
		// r.Use(OptionalTenantIsolationMiddleware)
		
		// List users with pagination and filters
		r.Get("/", handlers.GetUsers)
		
		// Get specific user details
		r.Get("/{id}", handlers.GetUser)
		
		// Create new user (with optional account)
		r.Post("/", handlers.CreateUser)
		
		// Update user information
		r.Put("/{id}", handlers.UpdateUser)
		
		// Change user password
		r.Put("/{id}/password", handlers.ChangeUserPassword)
		
		// Soft delete user
		r.Delete("/{id}", handlers.DeleteUser)
		
		// Reference data endpoints
		r.Get("/departments", handlers.GetDepartments)
		r.Get("/access-groups", handlers.GetAccessGroups)
		r.Get("/filter-options", handlers.GetFilterOptions)
		
		// Bulk operations
		r.Route("/bulk", func(r chi.Router) {
			r.Post("/delete", handlers.BulkDeleteUsers)
			r.Post("/update-department", handlers.BulkUpdateDepartment)
			r.Post("/update-access-group", handlers.BulkUpdateAccessGroup)
			r.Post("/approve", handlers.BulkApproveUsers)
			r.Post("/suspend", handlers.BulkSuspendUsers)
		})
		
		// Import/Export operations
		r.Route("/import-export", func(r chi.Router) {
			r.Post("/import", handlers.ImportUsers)
			r.Get("/export", handlers.ExportUsers)
			r.Get("/template", handlers.DownloadTemplate)
		})
		
		// User access history
		r.Get("/{id}/access-history", handlers.GetUserAccessHistory)
		
		// User card management
		r.Route("/{id}/cards", func(r chi.Router) {
			r.Get("/", handlers.GetUserCards)
			r.Post("/", handlers.AssignCard)
			r.Delete("/{cardId}", handlers.RevokeCard)
		})
	})
}