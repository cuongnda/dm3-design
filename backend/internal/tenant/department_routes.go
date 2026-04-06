package tenant

import (
	"github.com/go-chi/chi/v5"
)

// AddDepartmentRoutes adds department management routes
func AddDepartmentRoutes(r chi.Router, h *UserManagementHandlers) {
	r.Route("/api/v1/departments", func(r chi.Router) {
		r.Get("/", h.ListDepartments)
		r.Post("/", h.CreateDepartment)
		r.Get("/{id}", h.GetDepartment)
		r.Put("/{id}", h.UpdateDepartment)
		r.Delete("/{id}", h.DeleteDepartment)

		// Department users management
		r.Get("/{id}/users", h.GetDepartmentUsers)
		r.Post("/{id}/users", h.AssignUsersToDepartment)
		r.Delete("/{id}/users/{userId}", h.RemoveUserFromDepartment)

		// Import/Export
		r.Post("/import", h.ImportDepartments)
		r.Get("/export", h.ExportDepartments)
	})

	// Managers endpoint for dropdown data
	r.Get("/api/v1/accounts/managers", h.GetManagers)

	// Available users for department assignment
	r.Get("/api/v1/users/available-for-department", h.GetAvailableUsersForDepartment)
}
