package attendance

import "testing"

// TestIsOrgWideReviewer pins the role short-circuit used by
// ensureDepartmentManagerOfUser. Drift here would either over-permit
// (cross-department approvals sneaking through) or over-restrict
// (primary_manager/system_admin getting 403 on their own tenant).
func TestIsOrgWideReviewer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		roles []string
		want  bool
	}{
		{"nil", nil, false},
		{"empty", []string{}, false},
		{"plain manager is scoped", []string{"manager"}, false},
		{"operator is scoped", []string{"operator"}, false},
		{"viewer is scoped", []string{"viewer"}, false},
		{"primary_manager is org-wide", []string{"primary_manager"}, true},
		{"system_admin is org-wide", []string{"system_admin"}, true},
		{"mixed roles — manager+primary_manager", []string{"manager", "primary_manager"}, true},
		{"mixed roles — manager+system_admin", []string{"manager", "system_admin"}, true},
		{"unknown role falls through", []string{"auditor"}, false},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isOrgWideReviewer(tc.roles); got != tc.want {
				t.Errorf("isOrgWideReviewer(%v) = %v, want %v", tc.roles, got, tc.want)
			}
		})
	}
}
