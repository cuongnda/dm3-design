package access

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

type AccessHandlers struct {
	db *db.DB
}

func NewAccessHandlers(database *db.DB) *AccessHandlers {
	return &AccessHandlers{db: database}
}

// ─── Access Rules (legacy stubs) ─────────────────────────────────────────────

func (h *AccessHandlers) ListRules(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) CreateRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) GetRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) UpdateRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

func (h *AccessHandlers) DeleteRule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access rules have been replaced by access groups")
}

// ─── Schedules (legacy stubs) ────────────────────────────────────────────────

func (h *AccessHandlers) ListSchedules(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) GetSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

func (h *AccessHandlers) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "schedules have been removed")
}

// ─── Events ──────────────────────────────────────────────────────────────────

func (h *AccessHandlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if v := r.URL.Query().Get("access_point_id"); v != "" {
		where += fmt.Sprintf(" AND access_point_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("user_id"); v != "" {
		where += fmt.Sprintf(" AND user_id = $%d::uuid", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("decision"); v != "" {
		where += fmt.Sprintf(" AND decision = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("credential_type"); v != "" {
		where += fmt.Sprintf(" AND credential_type = $%d", idx)
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

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_access.access_events "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`SELECT id, tenant_id, time, COALESCE(access_point_id::text,''),
		COALESCE(user_id::text,''), COALESCE(user_name,''), COALESCE(credential_type,''),
		COALESCE(direction,''), decision, COALESCE(reason,''), confidence, COALESCE(photo_ref,''), metadata
		FROM dm3_access.access_events %s ORDER BY time DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list events query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	events := []eventResponse{}
	for rows.Next() {
		var e eventResponse
		if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &e.AccessPointID,
			&e.UserID, &e.UserName, &e.CredentialType, &e.Direction, &e.Decision,
			&e.Reason, &e.Confidence, &e.PhotoRef, &e.Metadata); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		events = append(events, e)
	}
	httputil.Paginated(w, events, total, page, limit)
}

type eventResponse struct {
	ID             string         `json:"id"`
	TenantID       string         `json:"tenant_id"`
	Time           time.Time      `json:"time"`
	AccessPointID  string         `json:"access_point_id,omitempty"`
	UserID         string         `json:"user_id,omitempty"`
	UserName       string         `json:"user_name,omitempty"`
	CredentialType string         `json:"credential_type,omitempty"`
	Direction      string         `json:"direction,omitempty"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason,omitempty"`
	Confidence     *float64       `json:"confidence,omitempty"`
	PhotoRef       string         `json:"photo_ref,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

func (h *AccessHandlers) GetStats(w http.ResponseWriter, r *http.Request) {
	var stats models.DashboardStats
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_points WHERE tenant_id = $1::uuid`, cid).Scan(&stats.DoorsTotal)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_points WHERE status='online' AND tenant_id = $1::uuid`, cid).Scan(&stats.DoorsOnline)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_points WHERE status='offline' AND tenant_id = $1::uuid`, cid).Scan(&stats.DoorsOffline)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_points WHERE status='alarm' AND tenant_id = $1::uuid`, cid).Scan(&stats.DoorsAlarm)

	today := time.Now().Truncate(24 * time.Hour)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND tenant_id = $2::uuid`, today, cid).Scan(&stats.EventsToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='granted' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.GrantedToday)
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_access.access_events WHERE time >= $1 AND decision='denied' AND tenant_id = $2::uuid`, today, cid).Scan(&stats.DeniedToday)

	recentQuery := `SELECT id, tenant_id, time, access_point_id, user_id, user_name, credential_type,
		 direction, decision, reason, metadata
		 FROM dm3_access.access_events WHERE tenant_id = $1::uuid ORDER BY time DESC LIMIT 10`
	rows, err := h.db.Pool.Query(r.Context(), recentQuery, cid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var e models.AccessEvent
			if err := rows.Scan(&e.ID, &e.TenantID, &e.Time, &e.AccessPointID, &e.UserID,
				&e.UserName, &e.CredentialType, &e.Direction, &e.Decision, &e.Reason, &e.Metadata); err == nil {
				stats.RecentEvents = append(stats.RecentEvents, e)
			}
		}
	}
	if stats.RecentEvents == nil {
		stats.RecentEvents = []models.AccessEvent{}
	}

	httputil.JSON(w, http.StatusOK, stats)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
