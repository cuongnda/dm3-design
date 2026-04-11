package visitor

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

type createRecurringRequest struct {
	VisitorID      string   `json:"visitor_id"`
	HostUserID     string   `json:"host_user_id"`
	Purpose        string   `json:"purpose"`
	AccessAreas    []string `json:"access_areas"`
	EscortRequired bool     `json:"escort_required"`
	RecurrenceRule string   `json:"recurrence_rule"` // e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR"
	StartDate      string   `json:"start_date"`      // YYYY-MM-DD
	EndDate        *string  `json:"end_date"`         // YYYY-MM-DD, optional
}

// ListRecurringTemplates lists recurring visit templates for the tenant.
func (h *VisitorHandlers) ListRecurringTemplates(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	activeOnly := r.URL.Query().Get("active") != "false"

	var total int64
	if activeOnly {
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM dm3_visitor.recurring_visit_templates WHERE tenant_id = $1::uuid AND active = true`, cid).Scan(&total)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM dm3_visitor.recurring_visit_templates WHERE tenant_id = $1::uuid`, cid).Scan(&total)
	}

	activeFilter := ""
	if activeOnly {
		activeFilter = " AND t.active = true"
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT t.id, t.tenant_id, t.visitor_id, t.host_user_id, t.purpose,
		       t.access_areas, t.escort_required, t.recurrence_rule,
		       t.start_date::text, t.end_date::text, t.active, t.last_generated::text,
		       t.created_by, t.created_at, t.updated_at,
		       vis.id, vis.tenant_id, vis.first_name, vis.last_name, vis.display_name,
		       vis.email, vis.phone, vis.company, vis.national_id, vis.photo_ref,
		       vis.watchlist_status, vis.watchlist_reason, vis.visit_count, vis.last_visit_at,
		       vis.created_at, vis.updated_at
		FROM dm3_visitor.recurring_visit_templates t
		JOIN dm3_visitor.visitors vis ON vis.id = t.visitor_id
		WHERE t.tenant_id = $1::uuid`+activeFilter+`
		ORDER BY t.created_at DESC
		LIMIT $2 OFFSET $3`, cid, limit, offset)
	if err != nil {
		slog.Error("list recurring templates error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	templates := []RecurringVisitTemplate{}
	for rows.Next() {
		var t RecurringVisitTemplate
		var v Visitor
		if err := rows.Scan(
			&t.ID, &t.TenantID, &t.VisitorID, &t.HostUserID, &t.Purpose,
			&t.AccessAreas, &t.EscortRequired, &t.RecurrenceRule,
			&t.StartDate, &t.EndDate, &t.Active, &t.LastGenerated,
			&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
			&v.ID, &v.TenantID, &v.FirstName, &v.LastName, &v.DisplayName,
			&v.Email, &v.Phone, &v.Company, &v.NationalID, &v.PhotoRef,
			&v.WatchlistStatus, &v.WatchlistReason, &v.VisitCount, &v.LastVisitAt,
			&v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			slog.Error("scan recurring template error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		t.Visitor = &v
		templates = append(templates, t)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, templates, total, page, limit)
}

// CreateRecurringTemplate creates a new recurring visit template.
func (h *VisitorHandlers) CreateRecurringTemplate(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req createRecurringRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.VisitorID == "" || req.HostUserID == "" || req.Purpose == "" || req.RecurrenceRule == "" || req.StartDate == "" {
		httputil.Error(w, http.StatusBadRequest, "visitor_id, host_user_id, purpose, recurrence_rule, and start_date are required")
		return
	}
	if _, err := time.Parse("2006-01-02", req.StartDate); err != nil {
		httputil.Error(w, http.StatusBadRequest, "start_date must be YYYY-MM-DD format")
		return
	}
	if req.EndDate != nil {
		if _, err := time.Parse("2006-01-02", *req.EndDate); err != nil {
			httputil.Error(w, http.StatusBadRequest, "end_date must be YYYY-MM-DD format")
			return
		}
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	createdBy := ""
	if claims != nil {
		createdBy = claims.Sub
	}

	var t RecurringVisitTemplate
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.recurring_visit_templates
		  (tenant_id, visitor_id, host_user_id, purpose, access_areas,
		   escort_required, recurrence_rule, start_date, end_date, created_by)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid[], $6, $7, $8::date, $9::date, $10::uuid)
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose,
		          access_areas, escort_required, recurrence_rule,
		          start_date::text, end_date::text, active, last_generated::text,
		          created_by, created_at, updated_at`,
		cid, req.VisitorID, req.HostUserID, req.Purpose, req.AccessAreas,
		req.EscortRequired, req.RecurrenceRule, req.StartDate, req.EndDate, createdBy,
	).Scan(
		&t.ID, &t.TenantID, &t.VisitorID, &t.HostUserID, &t.Purpose,
		&t.AccessAreas, &t.EscortRequired, &t.RecurrenceRule,
		&t.StartDate, &t.EndDate, &t.Active, &t.LastGenerated,
		&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		slog.Error("create recurring template error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "recurring_template.created", "recurring_template", t.ID, "", "success", nil, t)
	}
	httputil.JSON(w, http.StatusCreated, t)
}

// UpdateRecurringTemplate updates active/end_date of a recurring template.
func (h *VisitorHandlers) UpdateRecurringTemplate(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	templateID := chi.URLParam(r, "template_id")

	var req struct {
		Active  *bool   `json:"active"`
		EndDate *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var t RecurringVisitTemplate
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_visitor.recurring_visit_templates
		SET active   = COALESCE($3, active),
		    end_date = COALESCE($4::date, end_date),
		    updated_at = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose,
		          access_areas, escort_required, recurrence_rule,
		          start_date::text, end_date::text, active, last_generated::text,
		          created_by, created_at, updated_at`,
		templateID, cid, req.Active, req.EndDate,
	).Scan(
		&t.ID, &t.TenantID, &t.VisitorID, &t.HostUserID, &t.Purpose,
		&t.AccessAreas, &t.EscortRequired, &t.RecurrenceRule,
		&t.StartDate, &t.EndDate, &t.Active, &t.LastGenerated,
		&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "recurring template not found")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "recurring_template.updated", "recurring_template", t.ID, "", "success", nil, t)
	}
	httputil.JSON(w, http.StatusOK, t)
}

// DeleteRecurringTemplate deactivates a recurring template.
func (h *VisitorHandlers) DeleteRecurringTemplate(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	templateID := chi.URLParam(r, "template_id")

	cmd, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_visitor.recurring_visit_templates SET active = false, updated_at = now()
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		templateID, cid)
	if err != nil || cmd.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "recurring template not found")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "recurring_template.deactivated", "recurring_template", templateID, "", "success", nil, nil)
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deactivated"})
}
