package attendance

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// errCrossDepartmentReview is returned by ensureDepartmentManagerOfUser when
// the reviewer is a plain manager (no org-wide scope) and the target user
// does not belong to a department they manage. Handlers translate this into
// a 403 "reviewer is not the department manager of this user".
var errCrossDepartmentReview = errors.New("reviewer is not the department manager of the target user")

// isOrgWideReviewer reports whether any of the reviewer's roles grants
// tenant-wide approval authority. Used to short-circuit the department-scope
// check for primary_manager / system_admin — they are expected to approve
// across departments as part of their role.
func isOrgWideReviewer(roles []string) bool {
	for _, r := range roles {
		switch r {
		case "system_admin", "primary_manager":
			return true
		}
	}
	return false
}

// ensureDepartmentManagerOfUser enforces the department-scope rule for
// approval-style actions.
//
//   - system_admin / primary_manager reviewers are allowed for any user in
//     the tenant (short-circuit).
//   - All other roles (notably plain "manager") must be registered as the
//     department manager of the target user's department via
//     dm3_identity.departments.department_manager_id.
//
// Identity bridging: reviewerID is dm3_auth.accounts.id (claims.Sub).
// dm3_identity.departments.department_manager_id stores a dm3_identity.users.id,
// so we map account → user via dm3_identity.users.account_id. A single
// existence query enforces tenant isolation, the department relationship, and
// the reviewer mapping together so we don't round-trip twice.
func ensureDepartmentManagerOfUser(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID, reviewerID, targetUserID string,
	reviewerRoles []string,
) error {
	if isOrgWideReviewer(reviewerRoles) {
		return nil
	}
	if reviewerID == "" || targetUserID == "" || tenantID == "" {
		return errCrossDepartmentReview
	}
	var allowed bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			  FROM dm3_identity.users target
			  JOIN dm3_identity.departments d ON target.department_id = d.id
			  JOIN dm3_identity.users reviewer ON reviewer.id = d.department_manager_id
			 WHERE target.id           = $1::uuid
			   AND target.tenant_id    = $2::uuid
			   AND d.tenant_id         = $2::uuid
			   AND reviewer.tenant_id  = $2::uuid
			   AND reviewer.account_id = $3::uuid
			   AND COALESCE(target.is_deleted, false)   = false
			   AND COALESCE(reviewer.is_deleted, false) = false
			   AND COALESCE(d.is_deleted, false)        = false
		)`, targetUserID, tenantID, reviewerID).Scan(&allowed)
	if err != nil {
		return fmt.Errorf("check department manager scope: %w", err)
	}
	if !allowed {
		return errCrossDepartmentReview
	}
	return nil
}
