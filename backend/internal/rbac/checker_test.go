package rbac

import (
	"errors"
	"testing"
)

func assertDeny(t *testing.T, err error, want DenyReason) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected deny %q, got nil", want)
	}
	var de *DenyError
	if !errors.As(err, &de) {
		t.Fatalf("expected *DenyError, got %T: %v", err, err)
	}
	if de.Reason != want {
		t.Fatalf("expected reason %q, got %q (%v)", want, de.Reason, err)
	}
}

func TestCheck_UnknownPermission(t *testing.T) {
	err := Check(Caller{}, Target{}, "nope.bad.key")
	assertDeny(t, err, DenyUnknownPermission)
}

func TestCheck_SystemAdminBypassesAll(t *testing.T) {
	// no tenant, no plugins, no assignments — should still pass.
	err := Check(Caller{SystemAdmin: true}, Target{TenantID: "any"}, "visitor.visit.manage")
	if err != nil {
		t.Fatalf("system_admin should bypass: %v", err)
	}
}

func TestCheck_TenantMismatch(t *testing.T) {
	caller := Caller{AccountID: "a", TenantID: "t1", EnabledPlugins: []string{"core"}}
	target := Target{TenantID: "t2"}
	assertDeny(t, Check(caller, target, "device.read"), DenyTenantMismatch)
}

func TestCheck_PluginGateBlocksPrimaryManager(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RolePrimaryManager,
		EnabledPlugins: []string{"core"}, // no visitor
	}
	target := Target{TenantID: "t1"}
	assertDeny(t, Check(caller, target, "visitor.visit.manage"), DenyPluginNotEnabled)
}

func TestCheck_PrimaryManagerCoreAllowed(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RolePrimaryManager,
		EnabledPlugins: []string{"core"},
	}
	target := Target{TenantID: "t1"}
	if err := Check(caller, target, "device.manage"); err != nil {
		t.Fatalf("primary_manager should access core: %v", err)
	}
}

func TestCheck_MemberSelfServiceOnOwnRecord(t *testing.T) {
	caller := Caller{
		AccountID:      "user-1",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
	}
	target := Target{TenantID: "t1", OwnerAccountID: "user-1"}
	if err := Check(caller, target, "access.event.read_self"); err != nil {
		t.Fatalf("member should read own events: %v", err)
	}
}

func TestCheck_MemberCannotReadOthersRecord(t *testing.T) {
	caller := Caller{
		AccountID:      "user-1",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
	}
	target := Target{TenantID: "t1", OwnerAccountID: "user-2"}
	assertDeny(t, Check(caller, target, "access.event.read_self"), DenyPermissionMissing)
}

func TestCheck_MemberCannotAccessNonSelfCorePermission(t *testing.T) {
	caller := Caller{
		AccountID:      "user-1",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
	}
	target := Target{TenantID: "t1"}
	assertDeny(t, Check(caller, target, "device.manage"), DenyPermissionMissing)
}

func TestCheck_ScopedRoleMatchesDepartment(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
		Assignments: []Assignment{
			{Permissions: []string{"attendance.leave.approve"}, ScopeType: ScopeDepartment, ScopeID: "dept-hr"},
		},
	}
	target := Target{TenantID: "t1", DepartmentID: "dept-hr"}
	if err := Check(caller, target, "attendance.leave.approve"); err != nil {
		t.Fatalf("scoped dept approve should pass: %v", err)
	}
}

func TestCheck_ScopedRoleRejectsOtherDepartment(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
		Assignments: []Assignment{
			{Permissions: []string{"attendance.leave.approve"}, ScopeType: ScopeDepartment, ScopeID: "dept-hr"},
		},
	}
	target := Target{TenantID: "t1", DepartmentID: "dept-sales"}
	assertDeny(t, Check(caller, target, "attendance.leave.approve"), DenyPermissionMissing)
}

func TestCheck_CompanyScopeMatchesAnyResource(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
		Assignments: []Assignment{
			{Permissions: []string{"device.read"}, ScopeType: ScopeCompany},
		},
	}
	target := Target{TenantID: "t1", SiteID: "any", ZoneID: "any"}
	if err := Check(caller, target, "device.read"); err != nil {
		t.Fatalf("company scope should cover: %v", err)
	}
}

func TestCheck_MultipleAssignmentsAdditive(t *testing.T) {
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"},
		Assignments: []Assignment{
			{Permissions: []string{"device.read"}, ScopeType: ScopeZone, ScopeID: "zone-1"},
			{Permissions: []string{"report.read"}, ScopeType: ScopeCompany},
		},
	}
	target := Target{TenantID: "t1"}
	if err := Check(caller, target, "report.read"); err != nil {
		t.Fatalf("second assignment should grant: %v", err)
	}
}

func TestCheck_PluginGateBlocksEvenAssignedPermission(t *testing.T) {
	// user has visitor.visit.manage via a custom role, but visitor plugin is off
	caller := Caller{
		AccountID:      "a",
		TenantID:       "t1",
		FixedRole:      RoleMember,
		EnabledPlugins: []string{"core"}, // no visitor
		Assignments: []Assignment{
			{Permissions: []string{"visitor.visit.manage"}, ScopeType: ScopeCompany},
		},
	}
	target := Target{TenantID: "t1"}
	assertDeny(t, Check(caller, target, "visitor.visit.manage"), DenyPluginNotEnabled)
}

func TestMemberPermissions_AllInCatalogAndCore(t *testing.T) {
	for _, key := range MemberPermissions() {
		p, ok := Lookup(key)
		if !ok {
			t.Errorf("member permission %q not in catalog", key)
			continue
		}
		if p.Plugin != PluginCore {
			t.Errorf("member permission %q must be core, got %q", key, p.Plugin)
		}
	}
}

func TestCatalog_KeysMatchDomainResourceAction(t *testing.T) {
	for key, p := range Catalog {
		var want string
		if p.Resource == "" {
			want = p.Domain + "." + p.Action
		} else {
			want = p.Domain + "." + p.Resource + "." + p.Action
		}
		if key != want {
			t.Errorf("catalog key %q does not match expected %q", key, want)
		}
	}
}
