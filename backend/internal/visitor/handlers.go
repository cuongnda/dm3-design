package visitor

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"duall-master/pkg/db"
	"duall-master/pkg/httputil"
	"duall-master/pkg/natsutil"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
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

// ListVisitors retrieves visitors with filtering
func (h *Handlers) ListVisitors(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := VisitorListQuery{
		Limit:  50, // default
		Offset: 0,
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
	
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = &status
	}
	
	if hostID := r.URL.Query().Get("host_id"); hostID != "" {
		query.HostID = &hostID
	}
	
	if visitorType := r.URL.Query().Get("visitor_type"); visitorType != "" {
		query.VisitorType = &visitorType
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
	
	visitors, total, err := h.getVisitors(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get visitors", "error", err)
		httputil.Error(w, "failed to get visitors", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"visitors": visitors,
		"total":    total,
		"limit":    query.Limit,
		"offset":   query.Offset,
	})
}

// CreateVisitor creates a new visitor
func (h *Handlers) CreateVisitor(w http.ResponseWriter, r *http.Request) {
	var req CreateVisitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	visitor := &Visitor{
		ID:           uuid.New(),
		TenantID:     tenantID,
		VisitorType:  req.VisitorType,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Email:        req.Email,
		Phone:        req.Phone,
		Company:      req.Company,
		IDNumber:     req.IDNumber,
		VehiclePlate: req.VehiclePlate,
		Purpose:      req.Purpose,
		HostID:       req.HostID,
		Status:       VisitorStatusWaiting,
		ScheduledAt:  req.ScheduledAt,
		ValidFrom:    req.ValidFrom,
		ValidUntil:   req.ValidUntil,
		AccessZones:  req.AccessZones,
		Metadata:     req.Metadata,
		Notes:        req.Notes,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
		CreatedBy:    createdBy,
	}
	
	// Set default valid times if not provided
	if visitor.ValidFrom == nil {
		now := time.Now()
		visitor.ValidFrom = &now
	}
	
	if visitor.ValidUntil == nil {
		settings, err := h.getVisitorSettings(r.Context(), tenantID)
		if err == nil {
			until := time.Now().Add(time.Duration(settings.DefaultValidDuration) * time.Hour)
			visitor.ValidUntil = &until
		}
	}
	
	// Lookup host information if host ID provided
	if visitor.HostID != nil {
		host, err := h.getVisitorHost(r.Context(), tenantID, *visitor.HostID)
		if err != nil {
			httputil.Error(w, "host not found", http.StatusBadRequest)
			return
		}
		visitor.HostName = &host.Name
		visitor.HostEmail = &host.Email
		visitor.HostPhone = host.Phone
		
		// Auto-approve if host has auto-approve enabled
		if host.AutoApprove {
			visitor.Status = VisitorStatusApproved
		}
	} else if req.HostEmail != nil {
		// Try to find host by email
		if host, err := h.getVisitorHostByEmail(r.Context(), tenantID, *req.HostEmail); err == nil {
			visitor.HostID = &host.ID
			visitor.HostName = &host.Name
			visitor.HostEmail = &host.Email
			visitor.HostPhone = host.Phone
			
			if host.AutoApprove {
				visitor.Status = VisitorStatusApproved
			}
		} else {
			// Store host email even if host not found in system
			visitor.HostEmail = req.HostEmail
		}
	}
	
	if err := h.createVisitor(r.Context(), visitor); err != nil {
		slog.Error("failed to create visitor", "error", err)
		httputil.Error(w, "failed to create visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish visitor event
	go h.publishVisitorEvent(visitor, VisitorActionCreated)
	
	// Send notification to host if approved automatically
	if visitor.Status == VisitorStatusApproved && visitor.HostID != nil {
		go h.notifyHostVisitorApproved(visitor)
	}
	
	httputil.JSON(w, visitor)
}

// GetVisitor retrieves a single visitor
func (h *Handlers) GetVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "visitor not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to get visitor", "error", err)
		httputil.Error(w, "failed to get visitor", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, visitor)
}

// UpdateVisitor updates a visitor
func (h *Handlers) UpdateVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req UpdateVisitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	if err := h.updateVisitor(r.Context(), tenantID, visitorID, req); err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "visitor not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to update visitor", "error", err)
		httputil.Error(w, "failed to update visitor", http.StatusInternalServerError)
		return
	}
	
	// Get updated visitor
	visitor, _ := h.getVisitor(r.Context(), tenantID, visitorID)
	
	httputil.JSON(w, visitor)
}

// DeleteVisitor soft deletes a visitor
func (h *Handlers) DeleteVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	if err := h.deleteVisitor(r.Context(), tenantID, visitorID); err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "visitor not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to delete visitor", "error", err)
		httputil.Error(w, "failed to delete visitor", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]string{"status": "deleted"})
}

// CheckInVisitor checks in a visitor
func (h *Handlers) CheckInVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req CheckInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get visitor
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	// Check if visitor can be checked in
	if visitor.Status != VisitorStatusApproved && visitor.Status != VisitorStatusWaiting {
		httputil.Error(w, "visitor cannot be checked in", http.StatusBadRequest)
		return
	}
	
	// Check if visitor is still valid
	if visitor.ValidUntil != nil && time.Now().After(*visitor.ValidUntil) {
		httputil.Error(w, "visitor authorization has expired", http.StatusBadRequest)
		return
	}
	
	now := time.Now()
	visitor.Status = VisitorStatusCheckedIn
	visitor.CheckedInAt = &now
	visitor.CheckedInBy = req.CheckedInBy
	
	if req.BadgeNumber != nil {
		visitor.BadgeNumber = req.BadgeNumber
		visitor.BadgePrinted = true
	}
	
	if req.PhotoURL != nil {
		visitor.PhotoURL = req.PhotoURL
	}
	
	if err := h.updateVisitorStatus(r.Context(), visitor); err != nil {
		slog.Error("failed to check in visitor", "error", err)
		httputil.Error(w, "failed to check in visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish event and notify host
	go h.publishVisitorEvent(visitor, VisitorActionCheckedIn)
	go h.notifyHostVisitorCheckedIn(visitor)
	
	httputil.JSON(w, visitor)
}

// CheckOutVisitor checks out a visitor
func (h *Handlers) CheckOutVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req CheckOutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get visitor
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	// Check if visitor can be checked out
	if visitor.Status != VisitorStatusCheckedIn {
		httputil.Error(w, "visitor is not checked in", http.StatusBadRequest)
		return
	}
	
	now := time.Now()
	visitor.Status = VisitorStatusCheckedOut
	visitor.CheckedOutAt = &now
	visitor.CheckedOutBy = req.CheckedOutBy
	
	if err := h.updateVisitorStatus(r.Context(), visitor); err != nil {
		slog.Error("failed to check out visitor", "error", err)
		httputil.Error(w, "failed to check out visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishVisitorEvent(visitor, VisitorActionCheckedOut)
	
	httputil.JSON(w, visitor)
}

// ApproveVisitor approves a visitor
func (h *Handlers) ApproveVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	if visitor.Status != VisitorStatusWaiting {
		httputil.Error(w, "visitor cannot be approved", http.StatusBadRequest)
		return
	}
	
	visitor.Status = VisitorStatusApproved
	visitor.UpdatedAt = time.Now()
	
	if err := h.updateVisitorStatus(r.Context(), visitor); err != nil {
		slog.Error("failed to approve visitor", "error", err)
		httputil.Error(w, "failed to approve visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish event and notify visitor
	go h.publishVisitorEvent(visitor, VisitorActionApproved)
	go h.notifyVisitorApproved(visitor)
	
	httputil.JSON(w, visitor)
}

// RejectVisitor rejects a visitor
func (h *Handlers) RejectVisitor(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	if visitor.Status != VisitorStatusWaiting {
		httputil.Error(w, "visitor cannot be rejected", http.StatusBadRequest)
		return
	}
	
	visitor.Status = VisitorStatusRejected
	visitor.UpdatedAt = time.Now()
	
	if err := h.updateVisitorStatus(r.Context(), visitor); err != nil {
		slog.Error("failed to reject visitor", "error", err)
		httputil.Error(w, "failed to reject visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish event and notify visitor
	go h.publishVisitorEvent(visitor, VisitorActionRejected)
	go h.notifyVisitorRejected(visitor)
	
	httputil.JSON(w, visitor)
}

// PrintBadge generates a visitor badge
func (h *Handlers) PrintBadge(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	visitor, err := h.getVisitor(r.Context(), tenantID, visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	if visitor.Status != VisitorStatusApproved && visitor.Status != VisitorStatusCheckedIn {
		httputil.Error(w, "visitor cannot print badge", http.StatusBadRequest)
		return
	}
	
	// Generate badge number if not already assigned
	if visitor.BadgeNumber == nil {
		badgeNumber, err := h.generateBadgeNumber(r.Context(), tenantID)
		if err != nil {
			slog.Error("failed to generate badge number", "error", err)
			httputil.Error(w, "failed to generate badge", http.StatusInternalServerError)
			return
		}
		visitor.BadgeNumber = &badgeNumber
	}
	
	visitor.BadgePrinted = true
	visitor.UpdatedAt = time.Now()
	
	if err := h.updateVisitorBadgeStatus(r.Context(), visitor); err != nil {
		slog.Error("failed to update badge status", "error", err)
		httputil.Error(w, "failed to update badge status", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"visitor_id":    visitor.ID,
		"badge_number":  visitor.BadgeNumber,
		"badge_printed": visitor.BadgePrinted,
	})
}

// PreRegisterVisitor allows visitors to pre-register (public endpoint)
func (h *Handlers) PreRegisterVisitor(w http.ResponseWriter, r *http.Request) {
	var req PreRegisterVisitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get tenant by company code
	tenantID, err := h.getTenantByCode(r.Context(), req.TenantCode)
	if err != nil {
		httputil.Error(w, "invalid company code", http.StatusBadRequest)
		return
	}
	
	// Check if pre-registration is allowed
	settings, err := h.getVisitorSettings(r.Context(), tenantID)
	if err == nil && settings.RequirePreRegistration == false {
		httputil.Error(w, "pre-registration not allowed", http.StatusForbidden)
		return
	}
	
	visitor := &Visitor{
		ID:          uuid.New(),
		TenantID:    tenantID,
		VisitorType: VisitorTypeGuest,
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		Email:       &req.Email,
		Phone:       req.Phone,
		Company:     req.Company,
		VehiclePlate: req.VehiclePlate,
		Purpose:     req.Purpose,
		Status:      VisitorStatusPreRegistered,
		ScheduledAt: req.ScheduledAt,
		Notes:       req.Notes,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	
	// Try to find host by email
	if host, err := h.getVisitorHostByEmail(r.Context(), tenantID, req.HostEmail); err == nil {
		visitor.HostID = &host.ID
		visitor.HostName = &host.Name
		visitor.HostEmail = &host.Email
		visitor.HostPhone = host.Phone
	} else {
		visitor.HostEmail = &req.HostEmail
	}
	
	// Set default validation period
	now := time.Now()
	visitor.ValidFrom = &now
	
	if visitor.ScheduledAt != nil {
		// Valid until scheduled time + 24 hours
		until := visitor.ScheduledAt.Add(24 * time.Hour)
		visitor.ValidUntil = &until
	} else {
		// Valid for 24 hours
		until := now.Add(24 * time.Hour)
		visitor.ValidUntil = &until
	}
	
	if err := h.createVisitor(r.Context(), visitor); err != nil {
		slog.Error("failed to pre-register visitor", "error", err)
		httputil.Error(w, "failed to pre-register visitor", http.StatusInternalServerError)
		return
	}
	
	// Publish event and notify host
	go h.publishVisitorEvent(visitor, VisitorActionCreated)
	go h.notifyHostPreRegistration(visitor)
	
	httputil.JSON(w, map[string]interface{}{
		"visitor_id": visitor.ID,
		"status":     visitor.Status,
		"message":    "Pre-registration successful. Please wait for host approval.",
	})
}

// GetVisitorStatus allows visitors to check their status (public endpoint)
func (h *Handlers) GetVisitorStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	visitorID := uuid.MustParse(vars["id"])
	
	visitor, err := h.getVisitorByID(r.Context(), visitorID)
	if err != nil {
		httputil.Error(w, "visitor not found", http.StatusNotFound)
		return
	}
	
	// Return limited information for security
	response := map[string]interface{}{
		"visitor_id":   visitor.ID,
		"name":         visitor.FirstName + " " + visitor.LastName,
		"status":       visitor.Status,
		"scheduled_at": visitor.ScheduledAt,
		"valid_until":  visitor.ValidUntil,
		"host_name":    visitor.HostName,
	}
	
	if visitor.Status == VisitorStatusCheckedIn && visitor.CheckedInAt != nil {
		response["checked_in_at"] = visitor.CheckedInAt
	}
	
	if visitor.Status == VisitorStatusCheckedOut && visitor.CheckedOutAt != nil {
		response["checked_out_at"] = visitor.CheckedOutAt
	}
	
	httputil.JSON(w, response)
}

// Helper method to get user ID from request
func (h *Handlers) getUserID(r *http.Request) *uuid.UUID {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		return nil
	}
	
	if userID, err := uuid.Parse(userIDStr); err == nil {
		return &userID
	}
	
	return nil
}

// GetVisitorSettings retrieves visitor settings
func (h *Handlers) GetVisitorSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	settings, err := h.getVisitorSettings(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get visitor settings", "error", err)
		httputil.Error(w, "failed to get visitor settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}

// UpdateVisitorSettings updates visitor settings
func (h *Handlers) UpdateVisitorSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var settings VisitorSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	settings.TenantID = tenantID
	settings.UpdatedAt = time.Now()
	
	if err := h.updateVisitorSettings(r.Context(), &settings); err != nil {
		slog.Error("failed to update visitor settings", "error", err)
		httputil.Error(w, "failed to update visitor settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}