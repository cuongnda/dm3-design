package tenant

import (
	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
)

// AddDepartmentRoutes adds department management routes.
// Reads are open to any authenticated tenant user; writes require the
// identity.department.manage permission via rbac.Check.
func AddDepartmentRoutes(r chi.Router, h *UserManagementHandlers) {
	r.Route("/api/v1/identity/departments", func(r chi.Router) {
		r.Use(authsvc.RequireWritePermission("identity.department.manage"))

		r.Get("/", h.ListDepartments)
		r.Post("/", h.CreateDepartment)

		// Managers dropdown (static before /{id})
		r.Get("/managers", h.GetManagers)

		// Import/Export and bulk operations (static before /{id})
		r.Post("/import", h.ImportDepartments)
		r.Get("/export", h.ExportDepartments)
		r.Post("/bulk-delete", h.BulkDeleteDepartments)

		r.Get("/{id}", h.GetDepartment)
		r.Put("/{id}", h.UpdateDepartment)
		r.Delete("/{id}", h.DeleteDepartment)

		// Department users management
		r.Get("/{id}/users", h.GetDepartmentUsers)
		r.Post("/{id}/users", h.AssignUsersToDepartment)
		r.Delete("/{id}/users/{userId}", h.RemoveUserFromDepartment)
		r.Get("/{id}/available-users", h.GetAvailableUsersForDepartment)
	})
}
