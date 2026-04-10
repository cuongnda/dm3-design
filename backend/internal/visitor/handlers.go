package visitor

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
)

// VisitorHandlers holds the database dependency for all visitor routes.
type VisitorHandlers struct {
	db    *db.DB
	audit *audit.Logger
}

// NewVisitorHandlers constructs a VisitorHandlers with the given database pool.
func NewVisitorHandlers(database *db.DB, auditLog *audit.Logger) *VisitorHandlers {
	return &VisitorHandlers{db: database, audit: auditLog}
}

// parsePagination extracts page and limit from query params.
// Defaults: page=1, limit=20. limit is capped at 100.
func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return page, limit
}

// nilIfEmpty returns nil if s is empty, otherwise returns a pointer to s.
func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return &s
}

func visitIDParam(r *http.Request) string {
	if id := chi.URLParam(r, "visit_id"); id != "" {
		return id
	}
	return chi.URLParam(r, "id")
}

func hasAnyRole(claims *authsvc.AccessClaims, roles ...string) bool {
	if claims == nil {
		return false
	}
	for _, role := range roles {
		if claims.Role == role {
			return true
		}
		for _, existing := range claims.Roles {
			if existing == role {
				return true
			}
		}
	}
	return false
}

func requireVisitorRead(r *http.Request) bool {
	return authsvc.ClaimsFromContext(r.Context()) != nil
}

func requireVisitorWrite(r *http.Request) bool {
	return hasAnyRole(authsvc.ClaimsFromContext(r.Context()), "operator", "manager", "primary_manager", "admin", "site_admin", "super_admin", "system_admin")
}

func requireWatchlistAdmin(r *http.Request) bool {
	return hasAnyRole(authsvc.ClaimsFromContext(r.Context()), "admin", "manager", "primary_manager", "site_admin", "super_admin", "system_admin")
}

func canApproveVisit(r *http.Request, hostUserID string) bool {
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		return false
	}
	if claims.Sub != "" && hostUserID != "" && claims.Sub == hostUserID {
		return true
	}
	return requireVisitorWrite(r)
}

func auditEntityName(firstName, lastName string) string {
	return strings.TrimSpace(firstName + " " + lastName)
}
