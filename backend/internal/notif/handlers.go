package notif

import (
	"context"
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
	sms  *SMSProvider
	push *PushProvider
}

type SMSProvider struct {
	enabled bool
	// Add SMS provider config here (Twilio, etc.)
}

type PushProvider struct {
	enabled bool
	// Add FCM/APNs config here
}

func NewHandlers(database *db.DB, nc *nats.Conn) *Handlers {
	return &Handlers{
		db:   database,
		nats: nc,
		sms: &SMSProvider{
			enabled: false, // TODO: Configure from env
		},
		push: &PushProvider{
			enabled: false, // TODO: Configure from env
		},
	}
}

// Manual notification sending
func (h *Handlers) SendNotification(w http.ResponseWriter, r *http.Request) {
	var req SendNotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Extract tenant from JWT (middleware sets this)
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	notif := &Notification{
		ID:       uuid.New(),
		TenantID: tenantID,
		Type:     req.Type,
		Title:    req.Title,
		Message:  req.Message,
		Channels: req.Channels,
		UserID:   req.UserID,
		Metadata: req.Metadata,
		Status:   "pending",
		CreatedAt: time.Now(),
	}

	// Store notification
	if err := h.storeNotification(r.Context(), notif); err != nil {
		slog.Error("failed to store notification", "error", err)
		httputil.Error(w, "failed to store notification", http.StatusInternalServerError)
		return
	}

	// Send notification
	go h.sendNotification(notif)

	httputil.JSON(w, map[string]string{
		"id":     notif.ID.String(),
		"status": "queued",
	})
}

func (h *Handlers) GetPreferences(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	userID := r.URL.Query().Get("user_id")

	if userID == "" {
		httputil.Error(w, "user_id required", http.StatusBadRequest)
		return
	}

	prefs, err := h.getNotificationPreferences(r.Context(), tenantID, uuid.MustParse(userID))
	if err != nil {
		slog.Error("failed to get preferences", "error", err)
		httputil.Error(w, "failed to get preferences", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, prefs)
}

func (h *Handlers) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	var req UpdatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	if err := h.updateNotificationPreferences(r.Context(), tenantID, req); err != nil {
		slog.Error("failed to update preferences", "error", err)
		httputil.Error(w, "failed to update preferences", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, map[string]string{"status": "updated"})
}

func (h *Handlers) GetHistory(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 1000 {
			limit = parsed
		}
	}

	userID := r.URL.Query().Get("user_id")
	notifType := r.URL.Query().Get("type")

	history, err := h.getNotificationHistory(r.Context(), tenantID, userID, notifType, limit)
	if err != nil {
		slog.Error("failed to get notification history", "error", err)
		httputil.Error(w, "failed to get history", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, map[string]interface{}{
		"notifications": history,
		"count":        len(history),
	})
}

func (h *Handlers) ListTemplates(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	templates, err := h.getNotificationTemplates(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get templates", "error", err)
		httputil.Error(w, "failed to get templates", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, map[string]interface{}{
		"templates": templates,
		"count":     len(templates),
	})
}

func (h *Handlers) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var req CreateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	template := &NotificationTemplate{
		ID:       uuid.New(),
		TenantID: tenantID,
		Name:     req.Name,
		Type:     req.Type,
		Subject:  req.Subject,
		Body:     req.Body,
		Channels: req.Channels,
		Variables: req.Variables,
		CreatedAt: time.Now(),
	}

	if err := h.storeNotificationTemplate(r.Context(), template); err != nil {
		slog.Error("failed to store template", "error", err)
		httputil.Error(w, "failed to store template", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, template)
}

func (h *Handlers) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	templateID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))

	var req UpdateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if err := h.updateNotificationTemplate(r.Context(), tenantID, templateID, req); err != nil {
		slog.Error("failed to update template", "error", err)
		httputil.Error(w, "failed to update template", http.StatusInternalServerError)
		return
	}

	httputil.JSON(w, map[string]string{"status": "updated"})
}