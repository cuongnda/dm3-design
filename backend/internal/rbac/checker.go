package rbac

import "fmt"

// DenyReason categorizes why authorization failed. Distinct reasons let callers
// map to distinct HTTP response shapes (e.g. plugin_not_enabled → "upgrade plan"
// UX vs permission_missing → "contact admin" UX).
type DenyReason string

const (
	DenyTenantMismatch    DenyReason = "tenant_mismatch"
	DenyPluginNotEnabled  DenyReason = "plugin_not_enabled"
	DenyPermissionMissing DenyReason = "permission_missing"
	DenyUnknownPermission DenyReason = "unknown_permission"
)

// DenyError is returned by Check when access is denied.
type DenyError struct {
	Reason DenyReason
	Detail string
}

func (e *DenyError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("%s: %s", e.Reason, e.Detail)
	}
	return string(e.Reason)
}

// Assignment is the caller's snapshot of one role binding at evaluation time.
// Services load these from dm3_auth.user_role_assignments joined with
// dm3_auth.company_role_permissions.
type Assignment struct {
	RoleID      string
	Permissions []string
	ScopeType   ScopeType
	ScopeID     string // empty for company / self scope
}

// Caller holds the acting principal's authorization context.
type Caller struct {
	AccountID      string
	TenantID       string
	FixedRole      FixedRole
	EnabledPlugins []string
	Assignments    []Assignment
	SystemAdmin    bool
}

// Target describes the resource being accessed. Unused fields stay empty.
type Target struct {
	TenantID       string
	OwnerAccountID string // set for self-scoped checks
	SiteID         string
	DepartmentID   string
	ZoneID         string
}

// Check evaluates the RBAC pipeline for a permission key.
// Returns nil if allowed, or *DenyError explaining why denied.
//
// Evaluation order (per docs/specs/platform/company-rbac.md):
//
//	system_admin bypass → tenant boundary → plugin gate →
//	  primary_manager bypass → member self-service → assignment walk
func Check(caller Caller, target Target, permissionKey string) error {
	perm, ok := Lookup(permissionKey)
	if !ok {
		return &DenyError{Reason: DenyUnknownPermission, Detail: permissionKey}
	}

	// system_admin is the platform support role — bypasses all tenant checks.
	if caller.SystemAdmin {
		return nil
	}

	// [1] tenant boundary
	if caller.TenantID == "" || caller.TenantID != target.TenantID {
		return &DenyError{Reason: DenyTenantMismatch}
	}

	// [2] plugin gate — applies even to primary_manager (commercial boundary).
	if perm.Plugin != PluginCore && !containsString(caller.EnabledPlugins, string(perm.Plugin)) {
		return &DenyError{Reason: DenyPluginNotEnabled, Detail: string(perm.Plugin)}
	}

	// [3] permission — primary_manager shortcut
	if caller.FixedRole == RolePrimaryManager {
		return nil
	}

	// [3] permission — member self-service shortcut
	if caller.FixedRole == RoleMember && isMemberPermission(permissionKey) {
		if target.OwnerAccountID != "" && target.OwnerAccountID == caller.AccountID {
			return nil
		}
		// fall through: member may also hold custom role assignments
	}

	// [3+4] assignment walk with scope match
	for _, a := range caller.Assignments {
		if !containsString(a.Permissions, permissionKey) {
			continue
		}
		if scopeMatches(a, target, caller.AccountID) {
			return nil
		}
	}
	return &DenyError{Reason: DenyPermissionMissing, Detail: permissionKey}
}

func scopeMatches(a Assignment, t Target, callerAccountID string) bool {
	switch a.ScopeType {
	case ScopeCompany:
		return true
	case ScopeSite:
		return a.ScopeID != "" && a.ScopeID == t.SiteID
	case ScopeDepartment:
		return a.ScopeID != "" && a.ScopeID == t.DepartmentID
	case ScopeZone:
		return a.ScopeID != "" && a.ScopeID == t.ZoneID
	case ScopeSelf:
		return t.OwnerAccountID != "" && t.OwnerAccountID == callerAccountID
	}
	return false
}

func containsString(xs []string, x string) bool {
	for _, s := range xs {
		if s == x {
			return true
		}
	}
	return false
}

func isMemberPermission(key string) bool {
	for _, k := range MemberPermissions() {
		if k == key {
			return true
		}
	}
	return false
}
