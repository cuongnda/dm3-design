package authsvc

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/rbac"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Models ──────────────────────────────────────────────────────────────────

type rbacRoleResponse struct {
	ID                 string   `json:"id"`
	TenantID           string   `json:"tenant_id"`
	Name               string   `json:"name"`
	Description        string   `json:"description,omitempty"`
	TemplateKey        string   `json:"template_key,omitempty"`
	IsSystemCopy       bool     `json:"is_system_template_copy"`
	Status             string   `json:"status"`
	Permissions        []string `json:"permissions"`
	AssignmentCount    int64    `json:"assignment_count"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

type rbacRoleWriteRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	TemplateKey string   `json:"template_key,omitempty"`
	Permissions []string `json:"permissions"`
	Status      string   `json:"status,omitempty"`
}

type rbacPermissionResponse struct {
	Key         string   `json:"key"`
	Domain      string   `json:"domain"`
	Resource    string   `json:"resource,omitempty"`
	Action      string   `json:"action"`
	Plugin      string   `json:"plugin"`
	ScopeTypes  []string `json:"scope_types"`
	Description string   `json:"description,omitempty"`
}

type rbacAssignmentResponse struct {
	ID            string  `json:"id"`
	AccountID     string  `json:"account_id"`
	AccountEmail  string  `json:"account_email,omitempty"`
	RoleID        string  `json:"role_id"`
	RoleName      string  `json:"role_name,omitempty"`
	ScopeType     string  `json:"scope_type"`
	ScopeID       *string `json:"scope_id,omitempty"`
	EffectiveFrom *string `json:"effective_from,omitempty"`
	EffectiveTo   *string `json:"effective_to,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

type rbacAssignmentCreateRequest struct {
	AccountID     string  `json:"account_id"`
	RoleID        string  `json:"role_id"`
	ScopeType     string  `json:"scope_type"`
	ScopeID       *string `json:"scope_id,omitempty"`
	EffectiveFrom *string `json:"effective_from,omitempty"`
	EffectiveTo   *string `json:"effective_to,omitempty"`
}

// ─── Authorization helper ────────────────────────────────────────────────────

// requireCompanyRoleAdmin resolves the caller's tenant and confirms they can
// manage company roles. system_admin may act on any tenant (via ?tenant_id=).
// Everyone else is restricted to their own tenant and must be primary_manager
// OR hold company.role.manage (for read: company.role.read).
func (h *AuthHandlers) requireCompanyRoleAdmin(w http.ResponseWriter, r *http.Request, write bool) (tenantID string, ok bool) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	caller := claims.ToCaller()

	// system_admin: may act on any tenant; pick from query param, fallback to own.
	if caller.SystemAdmin || caller.FixedRole == rbac.RoleSystemAdmin {
		if q := strings.TrimSpace(r.URL.Query().Get("tenant_id")); q != "" {
			return q, true
		}
		return caller.TenantID, true
	}

	if caller.TenantID == "" {
		httputil.Error(w, http.StatusForbidden, "missing tenant")
		return "", false
	}

	// primary_manager always allowed.
	if caller.FixedRole == rbac.RolePrimaryManager {
		return caller.TenantID, true
	}

	key := "company.role.read"
	if write {
		key = "company.role.manage"
	}
	target := rbac.Target{TenantID: caller.TenantID}
	if err := rbac.Check(caller, target, key); err != nil {
		var de *rbac.DenyError
		if errors.As(err, &de) {
			writeDenyResponse(w, de)
			return "", false
		}
		httputil.Error(w, http.StatusForbidden, "forbidden")
		return "", false
	}
	return caller.TenantID, true
}

// ─── Permission catalog ──────────────────────────────────────────────────────

// ListRBACPermissions returns the canonical permission catalog for UI pickers.
// Any authenticated caller may read the catalog — it contains no tenant data.
func (h *AuthHandlers) ListRBACPermissions(w http.ResponseWriter, r *http.Request) {
	if ClaimsFromContext(r.Context()) == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	out := make([]rbacPermissionResponse, 0, len(rbac.Catalog))
	for _, p := range rbac.Catalog {
		scopes := make([]string, 0, len(p.ScopeTypes))
		for _, s := range p.ScopeTypes {
			scopes = append(scopes, string(s))
		}
		out = append(out, rbacPermissionResponse{
			Key:         p.Key,
			Domain:      p.Domain,
			Resource:    p.Resource,
			Action:      p.Action,
			Plugin:      string(p.Plugin),
			ScopeTypes:  scopes,
			Description: p.Description,
		})
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── Roles CRUD ──────────────────────────────────────────────────────────────

func (h *AuthHandlers) ListRBACRoles(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, false)
	if !ok {
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT cr.id::text, cr.tenant_id::text, cr.name,
		       COALESCE(cr.description,''), COALESCE(cr.template_key,''),
		       cr.is_system_template_copy, cr.status,
		       COALESCE(array_agg(crp.permission_key) FILTER (WHERE crp.permission_key IS NOT NULL), '{}')::text[],
		       (SELECT COUNT(*) FROM dm3_auth.user_role_assignments ura WHERE ura.role_id = cr.id),
		       cr.created_at::text, cr.updated_at::text
		  FROM dm3_auth.company_roles cr
		  LEFT JOIN dm3_auth.company_role_permissions crp ON crp.role_id = cr.id
		 WHERE cr.tenant_id = $1::uuid
		 GROUP BY cr.id
		 ORDER BY cr.name ASC
	`, tenantID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	out := []rbacRoleResponse{}
	for rows.Next() {
		var rr rbacRoleResponse
		if err := rows.Scan(&rr.ID, &rr.TenantID, &rr.Name, &rr.Description, &rr.TemplateKey,
			&rr.IsSystemCopy, &rr.Status, &rr.Permissions, &rr.AssignmentCount,
			&rr.CreatedAt, &rr.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, rr)
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h *AuthHandlers) GetRBACRole(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, false)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var rr rbacRoleResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT cr.id::text, cr.tenant_id::text, cr.name,
		       COALESCE(cr.description,''), COALESCE(cr.template_key,''),
		       cr.is_system_template_copy, cr.status,
		       COALESCE(array_agg(crp.permission_key) FILTER (WHERE crp.permission_key IS NOT NULL), '{}')::text[],
		       (SELECT COUNT(*) FROM dm3_auth.user_role_assignments ura WHERE ura.role_id = cr.id),
		       cr.created_at::text, cr.updated_at::text
		  FROM dm3_auth.company_roles cr
		  LEFT JOIN dm3_auth.company_role_permissions crp ON crp.role_id = cr.id
		 WHERE cr.tenant_id = $1::uuid AND cr.id = $2::uuid
		 GROUP BY cr.id
	`, tenantID, id).Scan(&rr.ID, &rr.TenantID, &rr.Name, &rr.Description, &rr.TemplateKey,
		&rr.IsSystemCopy, &rr.Status, &rr.Permissions, &rr.AssignmentCount,
		&rr.CreatedAt, &rr.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "role not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, rr)
}

// validatePermissions rejects keys that aren't in the catalog.
func validatePermissions(keys []string) (bad []string) {
	seen := map[string]bool{}
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		if _, ok := rbac.Lookup(k); !ok {
			bad = append(bad, k)
		}
	}
	return bad
}

func (h *AuthHandlers) CreateRBACRole(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, true)
	if !ok {
		return
	}
	var req rbacRoleWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if bad := validatePermissions(req.Permissions); len(bad) > 0 {
		httputil.Error(w, http.StatusBadRequest, "unknown permission keys: "+strings.Join(bad, ", "))
		return
	}
	status := req.Status
	if status == "" {
		status = "active"
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var newID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO dm3_auth.company_roles (tenant_id, name, description, template_key, status)
		VALUES ($1::uuid, $2, NULLIF($3,''), NULLIF($4,''), $5)
		RETURNING id::text
	`, tenantID, strings.TrimSpace(req.Name), strings.TrimSpace(req.Description),
		strings.TrimSpace(req.TemplateKey), status).Scan(&newID)
	if err != nil {
		if isUniqueViolation(err) {
			httputil.Error(w, http.StatusConflict, "role name already exists for this tenant")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := replacePermissions(r, tx, newID, req.Permissions); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.JSON(w, http.StatusCreated, map[string]string{"id": newID})
}

func (h *AuthHandlers) UpdateRBACRole(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, true)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req rbacRoleWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if bad := validatePermissions(req.Permissions); len(bad) > 0 {
		httputil.Error(w, http.StatusBadRequest, "unknown permission keys: "+strings.Join(bad, ", "))
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	tag, err := tx.Exec(r.Context(), `
		UPDATE dm3_auth.company_roles
		   SET name          = $3,
		       description   = NULLIF($4,''),
		       template_key  = NULLIF($5,''),
		       status        = COALESCE(NULLIF($6,''), status),
		       updated_at    = now()
		 WHERE id = $2::uuid AND tenant_id = $1::uuid
	`, tenantID, id, strings.TrimSpace(req.Name),
		strings.TrimSpace(req.Description), strings.TrimSpace(req.TemplateKey),
		strings.TrimSpace(req.Status))
	if err != nil {
		if isUniqueViolation(err) {
			httputil.Error(w, http.StatusConflict, "role name already exists for this tenant")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "role not found")
		return
	}

	// Replace permissions wholesale — simplest and matches spec expectations
	// that the role's permission set is the authoritative state the UI submits.
	if _, err := tx.Exec(r.Context(),
		`DELETE FROM dm3_auth.company_role_permissions WHERE role_id = $1::uuid`, id); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := replacePermissions(r, tx, id, req.Permissions); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"id": id})
}

func (h *AuthHandlers) DeleteRBACRole(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, true)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	// Block delete if any assignments exist — caller must remove those first.
	var count int64
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_auth.user_role_assignments WHERE role_id = $1::uuid`, id).Scan(&count); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if count > 0 {
		httputil.Error(w, http.StatusConflict, "role still has active assignments; remove them first")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_auth.company_roles WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, tenantID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "role not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Assignments ─────────────────────────────────────────────────────────────

func (h *AuthHandlers) ListRBACAssignments(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, false)
	if !ok {
		return
	}

	accountFilter := strings.TrimSpace(r.URL.Query().Get("account_id"))
	roleFilter := strings.TrimSpace(r.URL.Query().Get("role_id"))

	q := `
		SELECT ura.id::text, ura.account_id::text, COALESCE(a.email,''),
		       ura.role_id::text, COALESCE(cr.name,''),
		       ura.scope_type,
		       CASE WHEN ura.scope_id IS NULL THEN NULL ELSE ura.scope_id::text END,
		       CASE WHEN ura.effective_from IS NULL THEN NULL ELSE ura.effective_from::text END,
		       CASE WHEN ura.effective_to IS NULL THEN NULL ELSE ura.effective_to::text END,
		       ura.created_at::text
		  FROM dm3_auth.user_role_assignments ura
		  LEFT JOIN dm3_auth.accounts a ON a.id = ura.account_id
		  LEFT JOIN dm3_auth.company_roles cr ON cr.id = ura.role_id
		 WHERE ura.tenant_id = $1::uuid`
	args := []any{tenantID}
	if accountFilter != "" {
		q += ` AND ura.account_id = $2::uuid`
		args = append(args, accountFilter)
	}
	if roleFilter != "" {
		q += ` AND ura.role_id = $` + itoa(len(args)+1) + `::uuid`
		args = append(args, roleFilter)
	}
	q += ` ORDER BY ura.created_at DESC`

	rows, err := h.db.Pool.Query(r.Context(), q, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	out := []rbacAssignmentResponse{}
	for rows.Next() {
		var a rbacAssignmentResponse
		if err := rows.Scan(&a.ID, &a.AccountID, &a.AccountEmail, &a.RoleID, &a.RoleName,
			&a.ScopeType, &a.ScopeID, &a.EffectiveFrom, &a.EffectiveTo, &a.CreatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, a)
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h *AuthHandlers) CreateRBACAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, true)
	if !ok {
		return
	}
	var req rbacAssignmentCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AccountID == "" || req.RoleID == "" || req.ScopeType == "" {
		httputil.Error(w, http.StatusBadRequest, "account_id, role_id, scope_type are required")
		return
	}
	if !validScopeType(req.ScopeType) {
		httputil.Error(w, http.StatusBadRequest, "invalid scope_type")
		return
	}
	// scope_id rules are also enforced by a table CHECK, but we produce a
	// friendlier error at the API boundary.
	if (req.ScopeType == "company" || req.ScopeType == "self") && req.ScopeID != nil {
		httputil.Error(w, http.StatusBadRequest, "scope_id must be null for company/self scope")
		return
	}
	if (req.ScopeType == "site" || req.ScopeType == "department" || req.ScopeType == "zone") && (req.ScopeID == nil || *req.ScopeID == "") {
		httputil.Error(w, http.StatusBadRequest, "scope_id is required for site/department/zone scope")
		return
	}

	// Verify the account + role both belong to this tenant.
	var accountTenant, roleTenant string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id::text FROM dm3_auth.accounts WHERE id = $1::uuid`, req.AccountID).
		Scan(&accountTenant)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusBadRequest, "account not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	err = h.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id::text FROM dm3_auth.company_roles WHERE id = $1::uuid`, req.RoleID).
		Scan(&roleTenant)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusBadRequest, "role not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if accountTenant != tenantID || roleTenant != tenantID {
		httputil.Error(w, http.StatusForbidden, "account or role belongs to a different tenant")
		return
	}

	var newID string
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_auth.user_role_assignments
		   (tenant_id, account_id, role_id, scope_type, scope_id, effective_from, effective_to)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4,
		        CASE WHEN $5::text IS NULL OR $5 = '' THEN NULL ELSE $5::uuid END,
		        CASE WHEN $6::text IS NULL OR $6 = '' THEN NULL ELSE $6::timestamptz END,
		        CASE WHEN $7::text IS NULL OR $7 = '' THEN NULL ELSE $7::timestamptz END)
		RETURNING id::text
	`, tenantID, req.AccountID, req.RoleID, req.ScopeType,
		nullableString(req.ScopeID), nullableString(req.EffectiveFrom), nullableString(req.EffectiveTo)).Scan(&newID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": newID})
}

func (h *AuthHandlers) DeleteRBACAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireCompanyRoleAdmin(w, r, true)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_auth.user_role_assignments WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, tenantID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "assignment not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// replacePermissions inserts the given keys as rows for role_id.
// Caller is responsible for clearing existing rows (on update) or for inserting
// into an empty set (on create).
func replacePermissions(r *http.Request, tx pgx.Tx, roleID string, keys []string) error {
	seen := map[string]bool{}
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO dm3_auth.company_role_permissions (role_id, permission_key)
			 VALUES ($1::uuid, $2)`, roleID, k); err != nil {
			return err
		}
	}
	return nil
}

func validScopeType(s string) bool {
	switch s {
	case "company", "site", "department", "zone", "self":
		return true
	}
	return false
}

func nullableString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// isUniqueViolation checks pg SQLSTATE 23505.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

// itoa is a local, allocation-free small-int-to-string used for positional
// parameters. strconv.Itoa would work but importing strconv just for this is
// noisy given the rest of the file has no need for it.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [4]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
