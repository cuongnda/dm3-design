package tenant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
)

// IsolationMode defines how strict tenant isolation should be
type IsolationMode int

const (
	// IsolationModeStrict requires tenant context and fails if missing
	IsolationModeStrict IsolationMode = iota
	// IsolationModeOptional allows requests without tenant context (for system-wide operations)
	IsolationModeOptional
	// IsolationModeSystemAdmin allows system admins to operate without tenant context
	IsolationModeSystemAdmin
)

// Middleware enforces tenant isolation with different strictness levels
func Middleware(database *db.DB, mode IsolationMode) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := authsvc.ClaimsFromContext(r.Context())
			if claims == nil {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			// Handle system admin permissions based on isolation mode
			if claims.Role == "system_admin" && mode == IsolationModeSystemAdmin {
				// System admins can optionally scope to a company
				companyID := r.URL.Query().Get("tenant_id")
				if companyID == "" {
					companyID = claims.CID
				}

				ctx := r.Context()
				if companyID != "" {
					// Load tenant info for system admin scoped requests
					tenantInfo, err := loadTenantInfo(database, companyID)
					if err != nil {
						writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid tenant_id: %v", err))
						return
					}
					ctx = WithCompanyID(ctx, companyID)
					ctx = WithTenantID(ctx, companyID) // tenant_id = tenant_id in this system
					ctx = WithTenantInfo(ctx, tenantInfo)
				}
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Regular users must have tenant_id (tenant_id)
			if claims.CID == "" {
				if mode == IsolationModeOptional {
					next.ServeHTTP(w, r) // Allow without tenant context
					return
				}
				writeError(w, http.StatusForbidden, "no company associated with this account")
				return
			}

			// Load complete tenant information
			tenantInfo, err := loadTenantInfo(database, claims.CID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load tenant info: %v", err))
				return
			}

			// Validate tenant status
			if tenantInfo.Status != "active" {
				writeError(w, http.StatusForbidden, "company account is not active")
				return
			}

			// Inject tenant context
			ctx := WithCompanyID(r.Context(), claims.CID)
			ctx = WithTenantID(ctx, claims.CID) // tenant_id = tenant_id in this architecture
			ctx = WithTenantInfo(ctx, tenantInfo)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireTenant is a strict middleware that always requires tenant context
func RequireTenant(database *db.DB) func(http.Handler) http.Handler {
	return Middleware(database, IsolationModeStrict)
}

// OptionalTenant allows requests without tenant context (for public endpoints)
func OptionalTenant(database *db.DB) func(http.Handler) http.Handler {
	return Middleware(database, IsolationModeOptional)
}

// SystemAdminTenant allows system admins to operate with optional tenant scoping
func SystemAdminTenant(database *db.DB) func(http.Handler) http.Handler {
	return Middleware(database, IsolationModeSystemAdmin)
}

// loadTenantInfo fetches complete tenant/company information from database.
//
// Previously this function returned a fake "active" stub when the DB was nil,
// which would silently bypass tenant status validation (suspended/deleted
// tenants would appear active) in any configuration where the middleware was
// wired without a DB. That's a latent privilege-escalation vector — fail
// loudly instead.
func loadTenantInfo(database *db.DB, companyID string) (*TenantInfo, error) {
	if database == nil || database.Pool == nil {
		return nil, fmt.Errorf("tenant middleware: database not configured")
	}
	query := `
		SELECT id, name, code, plan, status, max_devices, max_users
		FROM dm3_auth.tenants
		WHERE id = $1::uuid AND status != 'deleted'
	`
	
	var info TenantInfo
	row := database.Pool.QueryRow(context.Background(), query, companyID)
	err := row.Scan(
		&info.ID,
		&info.CompanyName,
		&info.CompanyCode,
		&info.Plan,
		&info.Status,
		&info.MaxDevices,
		&info.MaxUsers,
	)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("company not found")
		}
		return nil, err
	}
	
	info.TenantID = companyID
	return &info, nil
}

// ValidateResourceAccess checks if the current tenant can access a resource with tenant_id
func ValidateResourceAccess(ctx context.Context, resourceTenantID string) error {
	currentTenantID, err := TenantIDFromContext(ctx)
	if err != nil {
		return fmt.Errorf("no tenant context available")
	}
	
	if currentTenantID != resourceTenantID {
		return fmt.Errorf("access denied: resource belongs to different tenant")
	}
	
	return nil
}

// writeError writes a JSON error response
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
