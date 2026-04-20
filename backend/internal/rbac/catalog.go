// Package rbac defines the canonical permission catalog and authorization
// evaluation helpers for DM3 company-level RBAC.
//
// Canonical spec: docs/specs/platform/company-rbac.md
package rbac

// Plugin identifies the plugin that owns a permission. Values must match
// dm3_auth.tenants.enabled_plugins entries.
type Plugin string

const (
	PluginCore          Plugin = "core"
	PluginVisitor       Plugin = "visitor"
	PluginParking       Plugin = "parking"
	PluginCCTV          Plugin = "cctv"
	PluginIntercom      Plugin = "intercom"
	PluginSmartBuilding Plugin = "smart_building"
)

// ScopeType enumerates the canonical scope types.
type ScopeType string

const (
	ScopeCompany    ScopeType = "company"
	ScopeSite       ScopeType = "site"
	ScopeDepartment ScopeType = "department"
	ScopeZone       ScopeType = "zone"
	ScopeSelf       ScopeType = "self"
)

// FixedRole enumerates the canonical fixed human roles.
type FixedRole string

const (
	RoleSystemAdmin    FixedRole = "system_admin"
	RolePrimaryManager FixedRole = "primary_manager"
	RoleMember         FixedRole = "member"
)

// Permission is a single catalog entry.
//
// Key format is `{domain}.{action}` when Resource is empty, or
// `{domain}.{resource}.{action}` when Resource is populated. A single-word
// domain like `device` or `report` that has no sub-resources uses the 2-segment
// form; multi-resource domains like `identity` or `access` use 3-segment.
type Permission struct {
	Key         string
	Domain      string
	Resource    string // optional; empty when the domain itself is the resource
	Action      string
	Plugin      Plugin
	ScopeTypes  []ScopeType
	Description string
}

// Catalog is the authoritative map of canonical permission keys.
// Role rows cannot reference keys not in this map.
var Catalog = buildCatalog()

func allScopes() []ScopeType {
	return []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment, ScopeZone, ScopeSelf}
}

func buildCatalog() map[string]Permission {
	entries := []Permission{
		// identity (core)
		{Key: "identity.user.read", Domain: "identity", Resource: "user", Action: "read",
			Plugin: PluginCore, ScopeTypes: allScopes(), Description: "Read user records"},
		{Key: "identity.user.create", Domain: "identity", Resource: "user", Action: "create",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},
		{Key: "identity.user.update", Domain: "identity", Resource: "user", Action: "update",
			Plugin: PluginCore, ScopeTypes: allScopes()},
		{Key: "identity.user.delete", Domain: "identity", Resource: "user", Action: "delete",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},
		{Key: "identity.user.read_self", Domain: "identity", Resource: "user", Action: "read_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}, Description: "Read own user record"},
		{Key: "identity.user.update_self", Domain: "identity", Resource: "user", Action: "update_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}, Description: "Update own profile"},
		// identity credentials
		{Key: "identity.credential.read", Domain: "identity", Resource: "credential", Action: "read",
			Plugin: PluginCore, ScopeTypes: allScopes()},
		{Key: "identity.credential.manage", Domain: "identity", Resource: "credential", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},
		{Key: "identity.credential.enroll_self", Domain: "identity", Resource: "credential", Action: "enroll_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf},
			Description: "Enroll own face/fingerprint/QR"},
		// identity departments
		{Key: "identity.department.read", Domain: "identity", Resource: "department", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
		{Key: "identity.department.manage", Domain: "identity", Resource: "department", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},

		// devices (core)
		{Key: "device.read", Domain: "device", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "device.manage", Domain: "device", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "device.execute", Domain: "device", Action: "execute",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},

		// access (core)
		{Key: "access.rule.read", Domain: "access", Resource: "rule", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "access.rule.manage", Domain: "access", Resource: "rule", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "access.point.read", Domain: "access", Resource: "point", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "access.point.manage", Domain: "access", Resource: "point", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "access.event.read", Domain: "access", Resource: "event", Action: "read",
			Plugin: PluginCore, ScopeTypes: allScopes()},
		{Key: "access.event.read_self", Domain: "access", Resource: "event", Action: "read_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}, Description: "Read own access history"},
		{Key: "access.emergency.manage", Domain: "access", Resource: "emergency", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
		{Key: "access.emergency.execute", Domain: "access", Resource: "emergency", Action: "execute",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},

		// attendance (core)
		{Key: "attendance.record.read", Domain: "attendance", Resource: "record", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},
		{Key: "attendance.record.read_self", Domain: "attendance", Resource: "record", Action: "read_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}},
		{Key: "attendance.leave.read", Domain: "attendance", Resource: "leave", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeDepartment}},
		{Key: "attendance.leave.approve", Domain: "attendance", Resource: "leave", Action: "approve",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeDepartment}},
		{Key: "attendance.leave.request_self", Domain: "attendance", Resource: "leave", Action: "request_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}},
		{Key: "attendance.overtime.approve", Domain: "attendance", Resource: "overtime", Action: "approve",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeDepartment}},
		{Key: "attendance.overtime.request_self", Domain: "attendance", Resource: "overtime", Action: "request_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}},

		// reports (core)
		{Key: "report.read", Domain: "report", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},
		{Key: "report.export", Domain: "report", Action: "export",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},

		// company admin (core)
		{Key: "company.settings.read", Domain: "company", Resource: "settings", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},
		{Key: "company.settings.manage", Domain: "company", Resource: "settings", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},
		{Key: "company.role.read", Domain: "company", Resource: "role", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},
		{Key: "company.role.manage", Domain: "company", Resource: "role", Action: "manage",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},

		// notifications (core)
		{Key: "notification.read_self", Domain: "notification", Action: "read_self",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeSelf}},

		// audit (core)
		{Key: "audit.log.read", Domain: "audit", Resource: "log", Action: "read",
			Plugin: PluginCore, ScopeTypes: []ScopeType{ScopeCompany}},

		// visitor plugin
		{Key: "visitor.visit.read", Domain: "visitor", Resource: "visit", Action: "read",
			Plugin: PluginVisitor, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
		{Key: "visitor.visit.manage", Domain: "visitor", Resource: "visit", Action: "manage",
			Plugin: PluginVisitor, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "visitor.visit.approve", Domain: "visitor", Resource: "visit", Action: "approve",
			Plugin: PluginVisitor, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeDepartment}},

		// parking plugin
		{Key: "parking.vehicle.read", Domain: "parking", Resource: "vehicle", Action: "read",
			Plugin: PluginParking, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
		{Key: "parking.vehicle.manage", Domain: "parking", Resource: "vehicle", Action: "manage",
			Plugin: PluginParking, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
		{Key: "parking.ticket.read", Domain: "parking", Resource: "ticket", Action: "read",
			Plugin: PluginParking, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "parking.ticket.manage", Domain: "parking", Resource: "ticket", Action: "manage",
			Plugin: PluginParking, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},

		// cctv plugin
		{Key: "cctv.camera.read", Domain: "cctv", Resource: "camera", Action: "read",
			Plugin: PluginCCTV, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "cctv.camera.manage", Domain: "cctv", Resource: "camera", Action: "manage",
			Plugin: PluginCCTV, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "cctv.camera.stream", Domain: "cctv", Resource: "camera", Action: "stream",
			Plugin: PluginCCTV, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "cctv.clip.read", Domain: "cctv", Resource: "clip", Action: "read",
			Plugin: PluginCCTV, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "cctv.clip.export", Domain: "cctv", Resource: "clip", Action: "export",
			Plugin: PluginCCTV, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},

		// intercom plugin
		{Key: "intercom.call.answer", Domain: "intercom", Resource: "call", Action: "answer",
			Plugin: PluginIntercom, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "intercom.call.read", Domain: "intercom", Resource: "call", Action: "read",
			Plugin: PluginIntercom, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},

		// smart_building plugin
		{Key: "smart.sensor.read", Domain: "smart", Resource: "sensor", Action: "read",
			Plugin: PluginSmartBuilding, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite, ScopeZone}},
		{Key: "smart.sensor.manage", Domain: "smart", Resource: "sensor", Action: "manage",
			Plugin: PluginSmartBuilding, ScopeTypes: []ScopeType{ScopeCompany, ScopeSite}},
	}

	m := make(map[string]Permission, len(entries))
	for _, p := range entries {
		m[p.Key] = p
	}
	return m
}

// Lookup returns the catalog entry for key and whether it exists.
func Lookup(key string) (Permission, bool) {
	p, ok := Catalog[key]
	return p, ok
}

// MemberPermissions is the canonical permission set auto-granted to every
// tenant user via the fixed `member` role at `self` scope. All entries must
// be plugin=core so self-service works regardless of commercial tier.
func MemberPermissions() []string {
	return []string{
		"identity.user.read_self",
		"identity.user.update_self",
		"identity.credential.enroll_self",
		"access.event.read_self",
		"attendance.record.read_self",
		"attendance.leave.request_self",
		"attendance.overtime.request_self",
		"notification.read_self",
	}
}
