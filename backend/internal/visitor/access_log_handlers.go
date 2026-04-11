package visitor

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ListVisitAccessLog returns access log entries for a specific visit.
// GET /api/v1/visitors/{id}/access-log
func (h *VisitorHandlers) ListVisitAccessLog(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	visitID := visitIDParam(r)
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_identity.visitor_access_log WHERE visit_id = $1::uuid AND tenant_id = $2::uuid`,
		visitID, cid).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, tenant_id, visit_id, visitor_id, access_event_id,
		       access_point_id, access_point_name, zone_id, zone_name,
		       direction, decision, event_time, credential_type, created_at
		FROM dm3_identity.visitor_access_log
		WHERE visit_id = $1::uuid AND tenant_id = $2::uuid
		ORDER BY event_time DESC
		LIMIT $3 OFFSET $4`,
		visitID, cid, limit, offset)
	if err != nil {
		slog.Error("list visit access log error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []models.VisitorAccessLogEntry{}
	for rows.Next() {
		var e models.VisitorAccessLogEntry
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.VisitID, &e.VisitorID, &e.AccessEventID,
			&e.AccessPointID, &e.AccessPointName, &e.ZoneID, &e.ZoneName,
			&e.Direction, &e.Decision, &e.EventTime, &e.CredentialType, &e.CreatedAt,
		); err != nil {
			slog.Error("scan visit access log error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, entries, total, page, limit)
}

// ListVisitorHistory returns access log entries across all visits for a specific visitor.
// GET /api/v1/visitors/history/{visitor_id}
func (h *VisitorHandlers) ListVisitorHistory(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	visitorID := chi.URLParam(r, "visitor_id")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_identity.visitor_access_log WHERE visitor_id = $1::uuid AND tenant_id = $2::uuid`,
		visitorID, cid).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, tenant_id, visit_id, visitor_id, access_event_id,
		       access_point_id, access_point_name, zone_id, zone_name,
		       direction, decision, event_time, credential_type, created_at
		FROM dm3_identity.visitor_access_log
		WHERE visitor_id = $1::uuid AND tenant_id = $2::uuid
		ORDER BY event_time DESC
		LIMIT $3 OFFSET $4`,
		visitorID, cid, limit, offset)
	if err != nil {
		slog.Error("list visitor history error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []models.VisitorAccessLogEntry{}
	for rows.Next() {
		var e models.VisitorAccessLogEntry
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.VisitID, &e.VisitorID, &e.AccessEventID,
			&e.AccessPointID, &e.AccessPointName, &e.ZoneID, &e.ZoneName,
			&e.Direction, &e.Decision, &e.EventTime, &e.CredentialType, &e.CreatedAt,
		); err != nil {
			slog.Error("scan visitor history error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, entries, total, page, limit)
}

// GetEvacuationList returns all currently checked-in visitors with their last known
// access point and zone — used for emergency evacuation scenarios.
// GET /api/v1/visitors/evacuation
func (h *VisitorHandlers) GetEvacuationList(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	where := "WHERE v.tenant_id = $1::uuid AND v.status = 'checked_in'"
	args := []any{cid}
	idx := 2

	if zone := r.URL.Query().Get("zone"); zone != "" {
		where += fmt.Sprintf(" AND last_log.zone_name ILIKE $%d", idx)
		args = append(args, "%"+zone+"%")
		idx++
	}
	if q := strings.TrimSpace(r.URL.Query().Get("search")); q != "" {
		where += fmt.Sprintf(" AND (vis.first_name ILIKE $%d OR vis.last_name ILIKE $%d OR COALESCE(vis.company,'') ILIKE $%d)", idx, idx, idx)
		args = append(args, "%"+q+"%")
		idx++
	}
	_ = idx

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT v.id, v.visitor_id,
		       vis.first_name || ' ' || vis.last_name,
		       vis.company, vis.phone, vis.photo_ref,
		       COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''),
		       v.actual_checkin,
		       last_log.access_point_name, last_log.zone_name, last_log.event_time
		FROM dm3_identity.visits v
		JOIN dm3_identity.visitors vis ON vis.id = v.visitor_id
		LEFT JOIN dm3_identity.users u ON u.id = v.host_user_id
		LEFT JOIN LATERAL (
			SELECT access_point_name, zone_name, event_time
			FROM dm3_identity.visitor_access_log al
			WHERE al.visit_id = v.id AND al.tenant_id = v.tenant_id
			ORDER BY al.event_time DESC
			LIMIT 1
		) last_log ON true
		`+where+`
		ORDER BY v.actual_checkin DESC`,
		args...)
	if err != nil {
		slog.Error("evacuation list error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []models.EvacuationEntry{}
	for rows.Next() {
		var e models.EvacuationEntry
		if err := rows.Scan(
			&e.VisitID, &e.VisitorID, &e.VisitorName,
			&e.VisitorCompany, &e.VisitorPhone, &e.VisitorPhotoRef,
			&e.HostName, &e.CheckinTime,
			&e.LastAccessPoint, &e.LastZone, &e.LastEventTime,
		); err != nil {
			slog.Error("scan evacuation entry error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, entries)
}
