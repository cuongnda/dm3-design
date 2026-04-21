package authsvc

import (
	"errors"
	"net/http"

	"github.com/duali/dm3-backend/internal/rbac"
)

// ToCaller adapts JWT claims to the rbac.Caller shape used by rbac.Check.
// Returns the empty caller when c is nil.
func (c *AccessClaims) ToCaller() rbac.Caller {
	if c == nil {
		return rbac.Caller{}
	}
	assignments := make([]rbac.Assignment, 0, len(c.Assignments))
	for _, a := range c.Assignments {
		assignments = append(assignments, rbac.Assignment{
			RoleID:      a.RoleID,
			Permissions: a.Permissions,
			ScopeType:   rbac.ScopeType(a.ScopeType),
			ScopeID:     a.ScopeID,
		})
	}
	return rbac.Caller{
		AccountID:      c.Sub,
		TenantID:       c.CID,
		FixedRole:      rbac.FixedRole(c.FixedRole),
		EnabledPlugins: c.EnabledPlugins,
		Assignments:    assignments,
		SystemAdmin:    c.FixedRole == string(rbac.RoleSystemAdmin) || c.Role == string(rbac.RoleSystemAdmin),
	}
}

// RequirePermission returns middleware that enforces a permission check against
// the caller's tenant. It performs tenant+plugin+role-level gating only — the
// Target passed to rbac.Check has TenantID set from the caller; handlers that
// need scope-level checks (department/site/zone/self) should call rbac.Check
// directly with a populated Target.
func RequirePermission(permissionKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !checkPermission(w, r, permissionKey) {
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireWritePermission returns middleware that mirrors RequireWriteRole but
// enforces an rbac permission check on mutating methods. Read methods
// (GET/HEAD/OPTIONS) pass through for any authenticated caller so existing
// member-tier read access is preserved. POST/PUT/PATCH/DELETE must satisfy
// rbac.Check for the given company-scoped permission key.
func RequireWritePermission(permissionKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			if !checkPermission(w, r, permissionKey) {
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// checkPermission runs rbac.Check for the caller's claims against a company-
// scoped Target and writes the appropriate deny response on failure. Returns
// true when the caller is allowed to proceed.
func checkPermission(w http.ResponseWriter, r *http.Request, permissionKey string) bool {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return false
	}
	caller := claims.ToCaller()
	target := rbac.Target{TenantID: caller.TenantID}
	if err := rbac.Check(caller, target, permissionKey); err != nil {
		var de *rbac.DenyError
		if errors.As(err, &de) {
			writeDenyResponse(w, de)
			return false
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return false
	}
	return true
}

// writeDenyResponse maps an rbac.DenyError to an HTTP status code and JSON
// body. plugin_not_enabled returns 402 (Payment Required) so clients can
// distinguish commercial gating from authorization failures.
func writeDenyResponse(w http.ResponseWriter, de *rbac.DenyError) {
	status := http.StatusForbidden
	if de.Reason == rbac.DenyPluginNotEnabled {
		status = http.StatusPaymentRequired
	}
	writeJSON(w, status, map[string]string{
		"error":  string(de.Reason),
		"detail": de.Detail,
	})
}
