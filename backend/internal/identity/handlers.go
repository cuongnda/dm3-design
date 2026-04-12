package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

type IdentityHandlers struct {
	db      *db.DB
	nats    *natsutil.Client
	audit   *audit.Logger
	objects objectstore.Store
	email   *email.Client
	appURL  string
}

func NewIdentityHandlers(database *db.DB, nats *natsutil.Client, auditLog *audit.Logger, objects objectstore.Store) *IdentityHandlers {
	return &IdentityHandlers{db: database, nats: nats, audit: auditLog, objects: objects}
}

// SetEmailClient configures the email client for sending notifications.
func (h *IdentityHandlers) SetEmailClient(client *email.Client, appURL string) {
	h.email = client
	h.appURL = appURL
}

// publishEvent publishes a NATS event for identity changes.
func (h *IdentityHandlers) publishEvent(subject string, data any) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(data)
	if err != nil {
		slog.Error("marshal event error", "error", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.nats.Publish(ctx, subject, b); err != nil {
		slog.Error("nats publish error", "subject", subject, "error", err)
	}
}

// ─── Photo Upload ────────────────────────────────────────────────────────────

func (h *IdentityHandlers) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())
	assetURL, uploadErr := h.uploadUserImage(r, userID, companyID, "photo", identityPhotoVariant)
	if uploadErr != nil {
		httputil.Error(w, uploadErr.status, uploadErr.message)
		return
	}

	h.publishEvent("dm3.identity.user.updated", map[string]string{"id": userID, "photo_url": assetURL})
	h.audit.LogFromRequest(r, "identity.user.photo_upload", "user", userID, userID, "success", nil, map[string]any{"photo_url": assetURL})
	httputil.JSON(w, http.StatusOK, map[string]string{"photo_url": assetURL})
}

// ─── Credentials ─────────────────────────────────────────────────────────────

func (h *IdentityHandlers) ListCredentials(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	// Verify user exists and belongs to caller's tenant
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM dm3_identity.users WHERE id = $1::uuid AND tenant_id = $2::uuid)`, userID, cid).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, user_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE user_id = $1::uuid ORDER BY created_at DESC`, userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	creds := []models.Credential{}
	for rows.Next() {
		var c models.Credential
		if err := rows.Scan(&c.ID, &c.TenantID, &c.UserID, &c.Type, &c.Value,
			&c.Status, &c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		creds = append(creds, c)
	}
	httputil.JSON(w, http.StatusOK, creds)
}

type createCredentialRequest struct {
	Type       string     `json:"type"`  // face, card, pin, qr, fingerprint
	Value      string     `json:"value"` // NOTE: would be encrypted in production
	Status     string     `json:"status"`
	ValidFrom  *time.Time `json:"valid_from"`
	ValidUntil *time.Time `json:"valid_until"`
}

func (h *IdentityHandlers) CreateCredential(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	tenantID := authsvc.CompanyIDFromContext(r.Context())

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM dm3_identity.users WHERE id = $1::uuid AND tenant_id = $2::uuid)`, userID, tenantID).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	var req createCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" || req.Value == "" {
		httputil.Error(w, http.StatusBadRequest, "type and value are required")
		return
	}
	validTypes := map[string]bool{"face": true, "card": true, "pin": true, "qr": true, "fingerprint": true}
	if !validTypes[req.Type] {
		httputil.Error(w, http.StatusBadRequest, "type must be one of: face, card, pin, qr, fingerprint")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.credentials (tenant_id, user_id, type, value, status, valid_from, valid_until, updated_at)
		 VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7, now())
		 RETURNING id, tenant_id, user_id, type, value, status, valid_from, valid_until, created_at, updated_at`,
		tenantID, userID, req.Type, req.Value, req.Status, req.ValidFrom, req.ValidUntil,
	).Scan(&c.ID, &c.TenantID, &c.UserID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		slog.Error("create credential error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.LogFromRequest(r, "identity.credential.create", "credential", c.ID, c.Type, "success", nil, map[string]any{"type": c.Type, "user_id": userID})
	httputil.JSON(w, http.StatusCreated, c)
}

func (h *IdentityHandlers) GetCredential(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, user_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE id = $1::uuid AND user_id = $2::uuid`,
		credID, userID,
	).Scan(&c.ID, &c.TenantID, &c.UserID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *IdentityHandlers) UpdateCredential(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	var req createCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.credentials SET
			type = COALESCE(NULLIF($3,''), type), value = COALESCE(NULLIF($4,''), value),
			status = COALESCE(NULLIF($5,''), status), valid_from = COALESCE($6, valid_from),
			valid_until = COALESCE($7, valid_until), updated_at = now()
		 WHERE id = $1::uuid AND user_id = $2::uuid
		 RETURNING id, tenant_id, user_id, type, value, status, valid_from, valid_until, created_at, updated_at`,
		credID, userID, req.Type, req.Value, req.Status, req.ValidFrom, req.ValidUntil,
	).Scan(&c.ID, &c.TenantID, &c.UserID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	h.audit.LogFromRequest(r, "identity.credential.update", "credential", c.ID, c.Type, "success", nil, req)
	httputil.JSON(w, http.StatusOK, c)
}

func (h *IdentityHandlers) DeleteCredential(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.credentials WHERE id = $1::uuid AND user_id = $2::uuid`, credID, userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	h.audit.LogFromRequest(r, "identity.credential.delete", "credential", credID, credID, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ─── Sync ────────────────────────────────────────────────────────────────────

func (h *IdentityHandlers) SyncUsers(w http.ResponseWriter, r *http.Request) {
	sinceStr := r.URL.Query().Get("since")
	var since time.Time
	if sinceStr != "" {
		var err error
		since, err = time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid since timestamp, use RFC3339 format")
			return
		}
	}

	now := time.Now().UTC()

	// Get users changed since timestamp
	personRows, err := h.db.Pool.Query(r.Context(),
		`SELECT u.id, u.tenant_id, u.first_name, u.last_name, COALESCE(u.email,''), COALESCE(u.phone,''),
		 COALESCE(d.name,''), COALESCE(u.position,''), COALESCE(u.emp_number,''), u.status, COALESCE(u.avatar,''),
		 u.created_at, u.updated_at
		 FROM dm3_identity.users u
		 LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
		 WHERE u.updated_at > $1 ORDER BY u.updated_at ASC`, since)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer personRows.Close()

	users := []models.User{}
	for personRows.Next() {
		var p models.User
		if err := personRows.Scan(&p.ID, &p.TenantID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
			&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, p)
	}

	// Get credentials changed since timestamp
	credRows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, user_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE COALESCE(updated_at, created_at) > $1 ORDER BY COALESCE(updated_at, created_at) ASC`, since)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer credRows.Close()

	creds := []models.Credential{}
	for credRows.Next() {
		var c models.Credential
		if err := credRows.Scan(&c.ID, &c.TenantID, &c.UserID, &c.Type, &c.Value,
			&c.Status, &c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		creds = append(creds, c)
	}

	resp := models.SyncResponse{
		Users:       users,
		Credentials: creds,
		Since:       sinceStr,
		Timestamp:   now.Format(time.RFC3339),
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// ─── Stats ───────────────────────────────────────────────────────────────────

func (h *IdentityHandlers) GetStats(w http.ResponseWriter, r *http.Request) {
	stats := models.IdentityStats{
		UsersByStatus:    make(map[string]int64),
		UsersByDept:      make(map[string]int64),
		CredentialCounts: make(map[string]int64),
	}
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.users WHERE tenant_id = $1::uuid`, cid).Scan(&stats.TotalUsers)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.users`).Scan(&stats.TotalUsers)
	}

	// By status
	var statusQuery string
	var statusArgs []any
	if cid != "" {
		statusQuery = `SELECT status, COUNT(*) FROM dm3_identity.users WHERE tenant_id = $1::uuid GROUP BY status`
		statusArgs = []any{cid}
	} else {
		statusQuery = `SELECT status, COUNT(*) FROM dm3_identity.users GROUP BY status`
	}
	rows, err := h.db.Pool.Query(r.Context(), statusQuery, statusArgs...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var c int64
			if rows.Scan(&s, &c) == nil {
				stats.UsersByStatus[s] = c
			}
		}
	}

	// By department
	var deptQuery string
	var deptArgs []any
	if cid != "" {
		deptQuery = `SELECT COALESCE(department,'unassigned'), COUNT(*) FROM dm3_identity.users WHERE tenant_id = $1::uuid GROUP BY department`
		deptArgs = []any{cid}
	} else {
		deptQuery = `SELECT COALESCE(department,'unassigned'), COUNT(*) FROM dm3_identity.users GROUP BY department`
	}
	rows2, err := h.db.Pool.Query(r.Context(), deptQuery, deptArgs...)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var d string
			var c int64
			if rows2.Scan(&d, &c) == nil {
				stats.UsersByDept[d] = c
			}
		}
	}

	// Credential counts by type
	var credQuery string
	var credArgs []any
	if cid != "" {
		credQuery = `SELECT type, COUNT(*) FROM dm3_identity.credentials WHERE tenant_id = $1::uuid GROUP BY type`
		credArgs = []any{cid}
	} else {
		credQuery = `SELECT type, COUNT(*) FROM dm3_identity.credentials GROUP BY type`
	}
	rows3, err := h.db.Pool.Query(r.Context(), credQuery, credArgs...)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var t string
			var c int64
			if rows3.Scan(&t, &c) == nil {
				stats.CredentialCounts[t] = c
			}
		}
	}

	if cid != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.user_groups WHERE tenant_id = $1::uuid`, cid).Scan(&stats.TotalGroups)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.user_groups`).Scan(&stats.TotalGroups)
	}

	httputil.JSON(w, http.StatusOK, stats)
}

// ─── User Groups ──────────────────────────────────────────────────────────────

func (h *IdentityHandlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())
	var total int64
	var rows pgx.Rows
	var err error

	if cid != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.user_groups WHERE tenant_id = $1::uuid`, cid).Scan(&total)
		rows, err = h.db.Pool.Query(r.Context(), `SELECT id, tenant_id, name, COALESCE(description,''),
		 (SELECT COUNT(*) FROM dm3_identity.user_group_members m WHERE m.group_id = g.id),
		 created_at, updated_at
		 FROM dm3_identity.user_groups g WHERE g.tenant_id = $1::uuid ORDER BY g.name ASC LIMIT $2 OFFSET $3`,
			cid, limit, offset)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.user_groups`).Scan(&total)
		rows, err = h.db.Pool.Query(r.Context(), `SELECT id, tenant_id, name, COALESCE(description,''),
		 (SELECT COUNT(*) FROM dm3_identity.user_group_members m WHERE m.group_id = g.id),
		 created_at, updated_at
		 FROM dm3_identity.user_groups g ORDER BY g.name ASC LIMIT $1 OFFSET $2`,
			limit, offset)
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	groups := []models.UserGroup{}
	for rows.Next() {
		var g models.UserGroup
		if err := rows.Scan(&g.ID, &g.TenantID, &g.Name, &g.Description, &g.MemberCount, &g.CreatedAt, &g.UpdatedAt); err == nil {
			groups = append(groups, g)
		}
	}
	httputil.Paginated(w, groups, total, page, limit)
}

type createGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *IdentityHandlers) CreateGroup(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name required")
		return
	}
	var g models.UserGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.user_groups (tenant_id, name, description) VALUES ($1::uuid,$2,$3)
		 RETURNING id, tenant_id, name, COALESCE(description,''), 0, created_at, updated_at`,
		cid, req.Name, nilIfEmpty(req.Description),
	).Scan(&g.ID, &g.TenantID, &g.Name, &g.Description, &g.MemberCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.LogFromRequest(r, "identity.group.create", "group", g.ID, g.Name, "success", nil, req)
	httputil.JSON(w, http.StatusCreated, g)
}

func (h *IdentityHandlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var g models.UserGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, name, COALESCE(description,''),
		 (SELECT COUNT(*) FROM dm3_identity.user_group_members m WHERE m.group_id = g.id),
		 created_at, updated_at
		 FROM dm3_identity.user_groups g WHERE g.id = $1::uuid`, id,
	).Scan(&g.ID, &g.TenantID, &g.Name, &g.Description, &g.MemberCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	httputil.JSON(w, http.StatusOK, g)
}

func (h *IdentityHandlers) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	var g models.UserGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.user_groups SET
			name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id, tenant_id, name, COALESCE(description,''), 0, created_at, updated_at`,
		id, nilIfEmpty(req.Name), nilIfEmpty(req.Description),
	).Scan(&g.ID, &g.TenantID, &g.Name, &g.Description, &g.MemberCount, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	h.audit.LogFromRequest(r, "identity.group.update", "group", g.ID, g.Name, "success", nil, req)
	httputil.JSON(w, http.StatusOK, g)
}

func (h *IdentityHandlers) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_identity.user_groups WHERE id = $1::uuid`, id)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	h.audit.LogFromRequest(r, "identity.group.delete", "group", id, id, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *IdentityHandlers) ListGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT p.id, p.tenant_id, p.first_name, p.last_name, COALESCE(p.email,''), COALESCE(p.phone,''),
		 COALESCE(d.name,''), COALESCE(p.position,''), COALESCE(p.emp_number,''), p.status, COALESCE(p.avatar,''),
		 p.created_at, p.updated_at
		 FROM dm3_identity.users p
		 JOIN dm3_identity.user_group_members m ON m.user_id = p.id
		 LEFT JOIN dm3_identity.departments d ON p.department_id = d.id
		 WHERE m.group_id = $1::uuid ORDER BY p.last_name, p.first_name`, groupID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	members := []models.User{}
	for rows.Next() {
		var p models.User
		if err := rows.Scan(&p.ID, &p.TenantID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
			&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
			&p.CreatedAt, &p.UpdatedAt); err == nil {
			members = append(members, p)
		}
	}
	httputil.JSON(w, http.StatusOK, members)
}

type addMemberRequest struct {
	UserID string `json:"user_id"`
}

func (h *IdentityHandlers) AddGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	var req addMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
		httputil.Error(w, http.StatusBadRequest, "user_id required")
		return
	}
	_, err := h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_identity.user_group_members (group_id, user_id, tenant_id)
		 SELECT $1::uuid, $2::uuid, tenant_id FROM dm3_identity.users WHERE id = $2::uuid
		 ON CONFLICT DO NOTHING`,
		groupID, req.UserID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.LogFromRequest(r, "identity.group.add_member", "group", groupID, groupID, "success", nil, map[string]any{"user_id": req.UserID})
	w.WriteHeader(http.StatusNoContent)
}

func (h *IdentityHandlers) RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userID")
	h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.user_group_members WHERE group_id = $1::uuid AND user_id = $2::uuid`,
		groupID, userID)
	h.audit.LogFromRequest(r, "identity.group.remove_member", "group", groupID, groupID, "success", nil, map[string]any{"user_id": userID})
	w.WriteHeader(http.StatusNoContent)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *IdentityHandlers) scanPerson(r *http.Request, id string) (models.User, error) {
	var p models.User
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		 COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		 created_at, updated_at
		 FROM dm3_identity.users WHERE id = $1::uuid`, id,
	).Scan(&p.ID, &p.TenantID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
		&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return p, fmt.Errorf("not found")
		}
		return p, err
	}
	return p, nil
}

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

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
