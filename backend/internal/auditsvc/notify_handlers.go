package auditsvc

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// NotifyHandlers provides HTTP handlers for notification operations.
type NotifyHandlers struct {
	db     *db.DB
	claims ClaimsReader
}

// NewNotifyHandlers returns a new NotifyHandlers.
func NewNotifyHandlers(database *db.DB, claims ClaimsReader) *NotifyHandlers {
	return &NotifyHandlers{db: database, claims: claims}
}

type notificationRow struct {
	ID             string         `json:"id"`
	TenantID       string         `json:"tenant_id"`
	UserID         *string        `json:"user_id,omitempty"`
	Title          string         `json:"title"`
	Message        string         `json:"message"`
	Type           string         `json:"type"`
	Severity       string         `json:"severity"`
	Status         string         `json:"status"`
	Source         string         `json:"source"`
	ReferenceType  *string        `json:"reference_type,omitempty"`
	ReferenceID    *string        `json:"reference_id,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	ReadAt         *time.Time     `json:"read_at,omitempty"`
	AcknowledgedAt *time.Time     `json:"acknowledged_at,omitempty"`
}

type createNotificationRequest struct {
	Title         string         `json:"title"`
	Message       string         `json:"message"`
	Type          string         `json:"type"`
	Severity      string         `json:"severity"`
	Source        string         `json:"source"`
	UserID        *string        `json:"user_id,omitempty"`
	ReferenceType *string        `json:"reference_type,omitempty"`
	ReferenceID   *string        `json:"reference_id,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

const notifySelectCols = `id, tenant_id, user_id, title, message, type, severity, status,
	source, reference_type, reference_id, metadata, created_at, updated_at, read_at, acknowledged_at`

func scanNotifyRow(rows interface{ Scan(dest ...any) error }) (notificationRow, error) {
	var row notificationRow
	err := rows.Scan(
		&row.ID, &row.TenantID, &row.UserID, &row.Title, &row.Message,
		&row.Type, &row.Severity, &row.Status, &row.Source,
		&row.ReferenceType, &row.ReferenceID, &row.Metadata,
		&row.CreatedAt, &row.UpdatedAt, &row.ReadAt, &row.AcknowledgedAt,
	)
	return row, err
}

func (h *NotifyHandlers) buildNotifyWhere(r *http.Request) (string, []any, int) {
	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	// Always scope to tenant
	cid := h.claims.CompanyID(r.Context())
	if cid != "" {
		where += fmt.Sprintf(" AND tenant_id = $%d::uuid", idx)
		args = append(args, cid)
		idx++
	}

	if v := r.URL.Query().Get("user_id"); v != "" {
		where += fmt.Sprintf(" AND user_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("severity"); v != "" {
		where += fmt.Sprintf(" AND severity = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND type = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("source"); v != "" {
		where += fmt.Sprintf(" AND source = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := parseFlexibleTime(v); err == nil {
			where += fmt.Sprintf(" AND created_at >= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := parseFlexibleTime(v); err == nil {
			where += fmt.Sprintf(" AND created_at <= $%d", idx)
			args = append(args, t)
			idx++
		}
	}
	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND (title ILIKE $%d OR message ILIKE $%d)", idx, idx)
		args = append(args, "%"+v+"%")
		idx++
	}

	return where, args, idx
}

// ListNotifications handles GET /api/v1/notifications
func (h *NotifyHandlers) ListNotifications(w http.ResponseWriter, r *http.Request) {
	page, limit := parseAuditPagination(r)
	offset := (page - 1) * limit

	where, args, idx := h.buildNotifyWhere(r)

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_audit.notifications "+where, countArgs...).Scan(&total); err != nil {
		slog.Error("notifications list count error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	query := fmt.Sprintf(`SELECT %s FROM dm3_audit.notifications %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		notifySelectCols, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("notifications list query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []notificationRow{}
	for rows.Next() {
		row, err := scanNotifyRow(rows)
		if err != nil {
			slog.Error("notifications list scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, row)
	}
	if err := rows.Err(); err != nil {
		slog.Error("notifications list rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.Paginated(w, entries, total, page, limit)
}

// UnreadCount handles GET /api/v1/notifications/unread-count
func (h *NotifyHandlers) UnreadCount(w http.ResponseWriter, r *http.Request) {
	cid := h.claims.CompanyID(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var count int64
	err := h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_audit.notifications WHERE tenant_id = $1::uuid AND status = 'unread'",
		cid).Scan(&count)
	if err != nil {
		slog.Error("notifications unread count error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]int64{"count": count})
}

// CreateNotification handles POST /api/v1/notifications
func (h *NotifyHandlers) CreateNotification(w http.ResponseWriter, r *http.Request) {
	cid := h.claims.CompanyID(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req createNotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		httputil.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Severity == "" {
		req.Severity = "info"
	}
	if req.Type == "" {
		req.Type = "info"
	}

	metaJSON, _ := json.Marshal(req.Metadata)
	if req.Metadata == nil {
		metaJSON = []byte("{}")
	}

	query := fmt.Sprintf(`INSERT INTO dm3_audit.notifications
		(tenant_id, user_id, title, message, type, severity, source, reference_type, reference_id, metadata)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
		RETURNING %s`, notifySelectCols)

	row := h.db.Pool.QueryRow(r.Context(), query,
		cid, req.UserID, req.Title, req.Message, req.Type, req.Severity,
		req.Source, req.ReferenceType, req.ReferenceID, string(metaJSON),
	)

	entry, err := scanNotifyRow(row)
	if err != nil {
		slog.Error("notifications create error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create notification")
		return
	}

	httputil.JSON(w, http.StatusCreated, entry)
}

// MarkRead handles PATCH /api/v1/notifications/{id}/read
func (h *NotifyHandlers) MarkRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := h.claims.CompanyID(r.Context())

	query := fmt.Sprintf(`UPDATE dm3_audit.notifications
		SET status = 'read', read_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'unread'
		RETURNING %s`, notifySelectCols)

	row := h.db.Pool.QueryRow(r.Context(), query, id, cid)
	entry, err := scanNotifyRow(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "notification not found or already read")
		return
	}

	httputil.JSON(w, http.StatusOK, entry)
}

// MarkAllRead handles PATCH /api/v1/notifications/mark-all-read
func (h *NotifyHandlers) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	cid := h.claims.CompanyID(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_audit.notifications SET status = 'read', read_at = now()
		 WHERE tenant_id = $1::uuid AND status = 'unread'`, cid)
	if err != nil {
		slog.Error("notifications mark all read error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]int64{"updated": tag.RowsAffected()})
}

// Acknowledge handles PATCH /api/v1/notifications/{id}/acknowledge
func (h *NotifyHandlers) Acknowledge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := h.claims.CompanyID(r.Context())

	query := fmt.Sprintf(`UPDATE dm3_audit.notifications
		SET status = 'acknowledged', acknowledged_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING %s`, notifySelectCols)

	row := h.db.Pool.QueryRow(r.Context(), query, id, cid)
	entry, err := scanNotifyRow(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "notification not found")
		return
	}

	httputil.JSON(w, http.StatusOK, entry)
}

// DeleteNotification handles DELETE /api/v1/notifications/{id}
func (h *NotifyHandlers) DeleteNotification(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := h.claims.CompanyID(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		"DELETE FROM dm3_audit.notifications WHERE id = $1::uuid AND tenant_id = $2::uuid",
		id, cid)
	if err != nil {
		slog.Error("notifications delete error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "notification not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
