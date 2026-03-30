package audit

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"duall-master/pkg/db"
	"duall-master/pkg/httputil"
	"duall-master/pkg/natsutil"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

type Handlers struct {
	db   *db.DB
	nats *nats.Conn
}

func NewHandlers(database *db.DB, nc *nats.Conn) *Handlers {
	return &Handlers{
		db:   database,
		nats: nc,
	}
}

// GetAuditEvents retrieves audit events with filtering
func (h *Handlers) GetAuditEvents(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := AuditEventQuery{
		TenantID: tenantID,
		Limit:    50, // default
		Offset:   0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 1000 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if eventType := r.URL.Query().Get("event_type"); eventType != "" {
		query.EventType = &eventType
	}
	
	if actorID := r.URL.Query().Get("actor_id"); actorID != "" {
		query.ActorID = &actorID
	}
	
	if actorType := r.URL.Query().Get("actor_type"); actorType != "" {
		query.ActorType = &actorType
	}
	
	if action := r.URL.Query().Get("action"); action != "" {
		query.Action = &action
	}
	
	if resource := r.URL.Query().Get("resource"); resource != "" {
		query.Resource = &resource
	}
	
	if resourceID := r.URL.Query().Get("resource_id"); resourceID != "" {
		query.ResourceID = &resourceID
	}
	
	if result := r.URL.Query().Get("result"); result != "" {
		query.Result = &result
	}
	
	if dateFrom := r.URL.Query().Get("date_from"); dateFrom != "" {
		query.DateFrom = &dateFrom
	}
	
	if dateTo := r.URL.Query().Get("date_to"); dateTo != "" {
		query.DateTo = &dateTo
	}
	
	if search := r.URL.Query().Get("search"); search != "" {
		query.SearchTerm = &search
	}
	
	if orderBy := r.URL.Query().Get("order_by"); orderBy != "" {
		query.OrderBy = &orderBy
	}
	
	if orderDir := r.URL.Query().Get("order_dir"); orderDir != "" {
		query.OrderDir = &orderDir
	}
	
	events, total, err := h.getAuditEvents(r.Context(), query)
	if err != nil {
		slog.Error("failed to get audit events", "error", err)
		httputil.Error(w, "failed to get audit events", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

// SearchAuditEvents provides full-text search across audit events
func (h *Handlers) SearchAuditEvents(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	searchTerm := r.URL.Query().Get("q")
	
	if searchTerm == "" {
		httputil.Error(w, "search term required", http.StatusBadRequest)
		return
	}
	
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 1000 {
			limit = parsed
		}
	}
	
	events, err := h.searchAuditEvents(r.Context(), tenantID, searchTerm, limit)
	if err != nil {
		slog.Error("failed to search audit events", "error", err)
		httputil.Error(w, "failed to search audit events", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"events": events,
		"query":  searchTerm,
		"count":  len(events),
	})
}

// GetActivityReport generates user activity reports
func (h *Handlers) GetActivityReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	req := ActivityReportRequest{
		TenantID: tenantID,
		DateFrom: r.URL.Query().Get("date_from"),
		DateTo:   r.URL.Query().Get("date_to"),
	}
	
	if req.DateFrom == "" || req.DateTo == "" {
		httputil.Error(w, "date_from and date_to required", http.StatusBadRequest)
		return
	}
	
	if actorID := r.URL.Query().Get("actor_id"); actorID != "" {
		req.ActorID = &actorID
	}
	
	if actorType := r.URL.Query().Get("actor_type"); actorType != "" {
		req.ActorType = &actorType
	}
	
	if groupBy := r.URL.Query().Get("group_by"); groupBy != "" {
		req.GroupBy = &groupBy
	}
	
	report, err := h.generateActivityReport(r.Context(), req)
	if err != nil {
		slog.Error("failed to generate activity report", "error", err)
		httputil.Error(w, "failed to generate activity report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetAccessReport generates access control reports
func (h *Handlers) GetAccessReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	req := AccessReportRequest{
		TenantID: tenantID,
		DateFrom: r.URL.Query().Get("date_from"),
		DateTo:   r.URL.Query().Get("date_to"),
	}
	
	if req.DateFrom == "" || req.DateTo == "" {
		httputil.Error(w, "date_from and date_to required", http.StatusBadRequest)
		return
	}
	
	if doorID := r.URL.Query().Get("door_id"); doorID != "" {
		req.DoorID = &doorID
	}
	
	if personID := r.URL.Query().Get("person_id"); personID != "" {
		req.PersonID = &personID
	}
	
	if decision := r.URL.Query().Get("decision"); decision != "" {
		req.Decision = &decision
	}
	
	req.IncludeDenied = r.URL.Query().Get("include_denied") == "true"
	
	report, err := h.generateAccessReport(r.Context(), req)
	if err != nil {
		slog.Error("failed to generate access report", "error", err)
		httputil.Error(w, "failed to generate access report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetAdminActionsReport generates admin action reports
func (h *Handlers) GetAdminActionsReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	req := AdminActionsReportRequest{
		TenantID: tenantID,
		DateFrom: r.URL.Query().Get("date_from"),
		DateTo:   r.URL.Query().Get("date_to"),
	}
	
	if req.DateFrom == "" || req.DateTo == "" {
		httputil.Error(w, "date_from and date_to required", http.StatusBadRequest)
		return
	}
	
	if adminID := r.URL.Query().Get("admin_id"); adminID != "" {
		req.AdminID = &adminID
	}
	
	if action := r.URL.Query().Get("action"); action != "" {
		req.Action = &action
	}
	
	if resource := r.URL.Query().Get("resource"); resource != "" {
		req.Resource = &resource
	}
	
	req.HighRisk = r.URL.Query().Get("high_risk") == "true"
	
	report, err := h.generateAdminActionsReport(r.Context(), req)
	if err != nil {
		slog.Error("failed to generate admin actions report", "error", err)
		httputil.Error(w, "failed to generate admin actions report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// VerifyIntegrity checks audit trail integrity
func (h *Handlers) VerifyIntegrity(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	result, err := h.verifyAuditIntegrity(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to verify audit integrity", "error", err)
		httputil.Error(w, "failed to verify audit integrity", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, result)
}

// ExportAuditEvents exports audit events in CSV or JSON format
func (h *Handlers) ExportAuditEvents(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	format := r.URL.Query().Get("format") // csv, json
	
	if format == "" {
		format = "csv"
	}
	
	if format != "csv" && format != "json" {
		httputil.Error(w, "format must be csv or json", http.StatusBadRequest)
		return
	}
	
	// Build query from parameters
	query := AuditEventQuery{
		TenantID: tenantID,
		Limit:    10000, // max export limit
	}
	
	if eventType := r.URL.Query().Get("event_type"); eventType != "" {
		query.EventType = &eventType
	}
	
	if dateFrom := r.URL.Query().Get("date_from"); dateFrom != "" {
		query.DateFrom = &dateFrom
	}
	
	if dateTo := r.URL.Query().Get("date_to"); dateTo != "" {
		query.DateTo = &dateTo
	}
	
	events, _, err := h.getAuditEvents(r.Context(), query)
	if err != nil {
		slog.Error("failed to get events for export", "error", err)
		httputil.Error(w, "failed to get events for export", http.StatusInternalServerError)
		return
	}
	
	// Log the export action
	go h.logExportAction(tenantID, r.Header.Get("X-User-ID"), format, len(events))
	
	if format == "csv" {
		h.exportCSV(w, events)
	} else {
		h.exportJSON(w, events)
	}
}

// GetAuditStats returns audit statistics
func (h *Handlers) GetAuditStats(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "7d" // last 7 days
	}
	
	stats, err := h.getAuditStatistics(r.Context(), tenantID, period)
	if err != nil {
		slog.Error("failed to get audit statistics", "error", err)
		httputil.Error(w, "failed to get audit statistics", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, stats)
}

// Helper methods for exports

func (h *Handlers) exportCSV(w http.ResponseWriter, events []AuditEvent) {
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="audit_events_%s.csv"`, time.Now().Format("2006-01-02")))
	
	writer := csv.NewWriter(w)
	defer writer.Flush()
	
	// CSV header
	headers := []string{
		"ID", "Timestamp", "Event Type", "Actor ID", "Actor Name", "Actor Type",
		"Action", "Resource", "Resource ID", "Resource Name", "Result",
		"IP Address", "User Agent", "Error Message",
	}
	writer.Write(headers)
	
	// Write data
	for _, event := range events {
		record := []string{
			event.ID.String(),
			event.Timestamp.Format(time.RFC3339),
			event.EventType,
			h.stringOrEmpty((*string)(event.ActorID)),
			h.stringOrEmpty(event.ActorName),
			event.ActorType,
			event.Action,
			event.Resource,
			h.stringOrEmpty(event.ResourceID),
			h.stringOrEmpty(event.ResourceName),
			event.Result,
			h.stringOrEmpty(event.IPAddress),
			h.stringOrEmpty(event.UserAgent),
			h.stringOrEmpty(event.ErrorMsg),
		}
		writer.Write(record)
	}
}

func (h *Handlers) exportJSON(w http.ResponseWriter, events []AuditEvent) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="audit_events_%s.json"`, time.Now().Format("2006-01-02")))
	
	response := map[string]interface{}{
		"exported_at": time.Now(),
		"count":       len(events),
		"events":      events,
	}
	
	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (h *Handlers) logExportAction(tenantID uuid.UUID, userID string, format string, count int) {
	if userID == "" {
		return
	}
	
	actorID := uuid.MustParse(userID)
	metadata := map[string]interface{}{
		"format": format,
		"count":  count,
	}
	
	event := &AuditEvent{
		ID:        uuid.New(),
		TenantID:  tenantID,
		EventType: EventTypeSystem,
		ActorID:   &actorID,
		ActorType: ActorTypeUser,
		Action:    ActionExported,
		Resource:  "audit_events",
		Result:    ResultSuccess,
		Metadata:  metadata,
		Timestamp: time.Now(),
	}
	
	h.storeAuditEvent(event)
}