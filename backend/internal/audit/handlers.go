package audit

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ClaimsReader extracts JWT claims fields from a request context.
// Injected at construction to avoid an import cycle with internal/authsvc.
type ClaimsReader struct {
	// IsAdmin returns true when the authenticated user has the system_admin role.
	IsAdmin func(ctx context.Context) bool
	// CompanyID returns the tenant_id from the request context (empty for system admins without scope).
	CompanyID func(ctx context.Context) string
}

// AuditHandlers provides HTTP handlers for querying audit logs.
type AuditHandlers struct {
	db     *db.DB
	claims ClaimsReader
}

// NewAuditHandlers returns a new AuditHandlers.
// claims provides context extractors to avoid an import cycle between
// internal/audit and internal/authsvc (which imports pkg/audit).
func NewAuditHandlers(database *db.DB, claims ClaimsReader) *AuditHandlers {
	return &AuditHandlers{db: database, claims: claims}
}

// auditLogRow is the response shape for a single audit log entry.
type auditLogRow struct {
	ID         string         `json:"id"`
	Time       time.Time      `json:"time"`
	TenantID   string         `json:"tenant_id,omitempty"`
	ActorID    string         `json:"actor_id,omitempty"`
	ActorEmail string         `json:"actor_email,omitempty"`
	ActorIP    string         `json:"actor_ip,omitempty"`
	UserAgent  string         `json:"user_agent,omitempty"`
	Service    string         `json:"service"`
	Action     string         `json:"action"`
	EntityType string         `json:"entity_type"`
	EntityID   string         `json:"entity_id,omitempty"`
	EntityName string         `json:"entity_name,omitempty"`
	Status     string         `json:"status"`
	OldValues  map[string]any `json:"old_values,omitempty"`
	NewValues  map[string]any `json:"new_values,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// statRow is the response shape for a single stats entry.
type statRow struct {
	Action  string `json:"action"`
	Service string `json:"service"`
	Count   int64  `json:"count"`
}

// statsResponse is returned by GetAuditStats.
type statsResponse struct {
	Stats   []statRow `json:"stats"`
	Total   int64     `json:"total"`
	ByStats []statRow `json:"by_service,omitempty"`
}

const (
	defaultAuditLimit = 50
	maxAuditLimit     = 200
	maxExportRows     = 10000
)

// parseAuditPagination parses page/limit with audit-specific defaults and caps.
func parseAuditPagination(r *http.Request) (page, limit int) {
	page = 1
	limit = defaultAuditLimit
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			if v > maxAuditLimit {
				v = maxAuditLimit
			}
			limit = v
		}
	}
	return page, limit
}

// buildAuditWhere builds the WHERE clause and args from common query params.
// isAdmin controls whether tenant scoping is applied or overridden by the caller.
func (h *AuditHandlers) buildAuditWhere(r *http.Request, isAdmin bool) (string, []any, int) {
	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	// Tenant scoping: non-admin is auto-scoped; admin may pass ?tenant_id=
	if !isAdmin {
		cid := h.claims.CompanyID(r.Context())
		if cid != "" {
			where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
			args = append(args, cid)
			idx++
		}
	} else if v := r.URL.Query().Get("tenant_id"); v != "" {
		where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}

	if v := r.URL.Query().Get("actor_id"); v != "" {
		where += fmt.Sprintf(" AND actor_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("action"); v != "" {
		where += fmt.Sprintf(" AND action = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("entity_type"); v != "" {
		where += fmt.Sprintf(" AND entity_type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("entity_id"); v != "" {
		where += fmt.Sprintf(" AND entity_id = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("service"); v != "" {
		where += fmt.Sprintf(" AND service = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time >= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time <= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND (entity_name ILIKE $%d OR actor_email ILIKE $%d)", idx, idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	return where, args, idx
}

// scanAuditRow scans a single audit log row from the query result.
func scanAuditRow(rows interface {
	Scan(dest ...any) error
}) (auditLogRow, error) {
	var row auditLogRow
	var tenantID, actorID, actorEmail, actorIP, userAgent, entityID, entityName *string
	err := rows.Scan(
		&row.ID, &row.Time,
		&tenantID, &actorID, &actorEmail, &actorIP, &userAgent,
		&row.Service, &row.Action, &row.EntityType,
		&entityID, &entityName,
		&row.Status, &row.OldValues, &row.NewValues, &row.Metadata,
	)
	if err != nil {
		return row, err
	}
	if tenantID != nil {
		row.TenantID = *tenantID
	}
	if actorID != nil {
		row.ActorID = *actorID
	}
	if actorEmail != nil {
		row.ActorEmail = *actorEmail
	}
	if actorIP != nil {
		row.ActorIP = *actorIP
	}
	if userAgent != nil {
		row.UserAgent = *userAgent
	}
	if entityID != nil {
		row.EntityID = *entityID
	}
	if entityName != nil {
		row.EntityName = *entityName
	}
	return row, nil
}

const auditSelectCols = `id, time, tenant_id, actor_id, actor_email, actor_ip::text, user_agent,
	service, action, entity_type, entity_id, entity_name,
	status, old_values, new_values, metadata`

// ListAuditLogs — GET /api/v1/audit/logs or /api/v1/audit/tenant/logs
func (h *AuditHandlers) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	page, limit := parseAuditPagination(r)
	offset := (page - 1) * limit

	where, args, idx := h.buildAuditWhere(r, h.claims.IsAdmin(r.Context()))

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_audit.audit_logs "+where, countArgs...).Scan(&total); err != nil {
		slog.Error("audit list count error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	query := fmt.Sprintf(`SELECT %s FROM dm3_audit.audit_logs %s ORDER BY time DESC LIMIT $%d OFFSET $%d`,
		auditSelectCols, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("audit list query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []auditLogRow{}
	for rows.Next() {
		row, err := scanAuditRow(rows)
		if err != nil {
			slog.Error("audit list scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, row)
	}
	if err := rows.Err(); err != nil {
		slog.Error("audit list rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.Paginated(w, entries, total, page, limit)
}

// GetAuditLog — GET /api/v1/audit/logs/{id}
func (h *AuditHandlers) GetAuditLog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	admin := h.claims.IsAdmin(r.Context())

	where := "WHERE id = $1::uuid"
	args := []any{id}

	if !admin {
		cid := h.claims.CompanyID(r.Context())
		if cid == "" {
			httputil.Error(w, http.StatusForbidden, "company context required")
			return
		}
		where += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}

	query := fmt.Sprintf("SELECT %s FROM dm3_audit.audit_logs %s", auditSelectCols, where)
	row := h.db.Pool.QueryRow(r.Context(), query, args...)

	entry, err := scanAuditRow(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "audit log entry not found")
		return
	}

	httputil.JSON(w, http.StatusOK, entry)
}

// ExportAuditLogs — GET /api/v1/audit/export or /api/v1/audit/tenant/export
// Streams up to 10000 rows as CSV.
func (h *AuditHandlers) ExportAuditLogs(w http.ResponseWriter, r *http.Request) {
	where, args, idx := h.buildAuditWhere(r, h.claims.IsAdmin(r.Context()))

	query := fmt.Sprintf(`SELECT %s FROM dm3_audit.audit_logs %s ORDER BY time DESC LIMIT $%d`,
		auditSelectCols, where, idx)
	args = append(args, maxExportRows)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("audit export query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="audit_logs.csv"`)
	w.WriteHeader(http.StatusOK)

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"id", "time", "tenant_id", "actor_id", "actor_email", "actor_ip", "user_agent",
		"service", "action", "entity_type", "entity_id", "entity_name",
		"status", "old_values", "new_values", "metadata",
	})

	for rows.Next() {
		entry, err := scanAuditRow(rows)
		if err != nil {
			slog.Error("audit export scan error", "error", err)
			continue
		}
		_ = cw.Write([]string{
			entry.ID,
			entry.Time.Format(time.RFC3339),
			entry.TenantID,
			entry.ActorID,
			entry.ActorEmail,
			entry.ActorIP,
			entry.UserAgent,
			entry.Service,
			entry.Action,
			entry.EntityType,
			entry.EntityID,
			entry.EntityName,
			entry.Status,
			jsonString(entry.OldValues),
			jsonString(entry.NewValues),
			jsonString(entry.Metadata),
		})
	}
	cw.Flush()
}

// GetAuditStats — GET /api/v1/audit/stats
func (h *AuditHandlers) GetAuditStats(w http.ResponseWriter, r *http.Request) {
	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	admin := h.claims.IsAdmin(r.Context())
	if !admin {
		cid := h.claims.CompanyID(r.Context())
		if cid != "" {
			where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
			args = append(args, cid)
			idx++
		}
	} else if v := r.URL.Query().Get("tenant_id"); v != "" {
		where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}

	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time >= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			where += fmt.Sprintf(" AND time <= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	_ = idx // suppress unused warning; idx used only during filter building

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_audit.audit_logs "+where, countArgs...).Scan(&total)

	statsQuery := fmt.Sprintf(
		`SELECT action, service, COUNT(*) FROM dm3_audit.audit_logs %s GROUP BY action, service ORDER BY COUNT(*) DESC`,
		where)
	rows, err := h.db.Pool.Query(r.Context(), statsQuery, args...)
	if err != nil {
		slog.Error("audit stats query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	stats := []statRow{}
	for rows.Next() {
		var s statRow
		if err := rows.Scan(&s.Action, &s.Service, &s.Count); err != nil {
			slog.Error("audit stats scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		stats = append(stats, s)
	}
	if err := rows.Err(); err != nil {
		slog.Error("audit stats rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.JSON(w, http.StatusOK, statsResponse{
		Stats: stats,
		Total: total,
	})
}

// jsonString marshals a map to a JSON string for CSV output; returns empty on nil.
func jsonString(v map[string]any) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}
