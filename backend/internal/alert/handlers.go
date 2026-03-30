package alert

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"duall-master/pkg/db"
	"duall-master/pkg/httputil"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/nats-io/nats.go"
)

type Handlers struct {
	db   *db.DB
	nats *nats.Conn
	ruleEngine *RuleEngine
}

func NewHandlers(database *db.DB, nc *nats.Conn) *Handlers {
	return &Handlers{
		db:   database,
		nats: nc,
		ruleEngine: NewRuleEngine(database, nc),
	}
}

// Alert Rules management

func (h *Handlers) ListAlertRules(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := AlertRuleListQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 200 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if category := r.URL.Query().Get("category"); category != "" {
		query.Category = &category
	}
	
	if severity := r.URL.Query().Get("severity"); severity != "" {
		query.Severity = &severity
	}
	
	if isEnabled := r.URL.Query().Get("is_enabled"); isEnabled != "" {
		if enabled, err := strconv.ParseBool(isEnabled); err == nil {
			query.IsEnabled = &enabled
		}
	}
	
	if search := r.URL.Query().Get("search"); search != "" {
		query.Search = &search
	}
	
	rules, total, err := h.getAlertRules(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get alert rules", "error", err)
		httputil.Error(w, "failed to get alert rules", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"rules":  rules,
		"total":  total,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

func (h *Handlers) CreateAlertRule(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req CreateAlertRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	rule := &AlertRule{
		ID:               uuid.New(),
		TenantID:         tenantID,
		Name:             req.Name,
		Description:      req.Description,
		Category:         req.Category,
		Severity:         req.Severity,
		IsEnabled:        true,
		Conditions:       req.Conditions,
		Actions:          req.Actions,
		Channels:         req.Channels,
		EscalationPolicy: req.EscalationPolicy,
		Throttle:         req.Throttle,
		Schedule:         req.Schedule,
		Tags:             req.Tags,
		TriggerCount:     0,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
		CreatedBy:        createdBy,
	}
	
	if err := h.createAlertRule(r.Context(), rule); err != nil {
		slog.Error("failed to create alert rule", "error", err)
		httputil.Error(w, "failed to create alert rule", http.StatusInternalServerError)
		return
	}
	
	// Register rule with rule engine
	h.ruleEngine.RegisterRule(rule)
	
	httputil.JSON(w, rule)
}

func (h *Handlers) GetAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	rule, err := h.getAlertRule(r.Context(), tenantID, ruleID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "alert rule not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to get alert rule", "error", err)
		httputil.Error(w, "failed to get alert rule", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, rule)
}

func (h *Handlers) UpdateAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	rule, err := h.getAlertRule(r.Context(), tenantID, ruleID)
	if err != nil {
		httputil.Error(w, "alert rule not found", http.StatusNotFound)
		return
	}
	
	var req CreateAlertRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Update fields
	rule.Name = req.Name
	rule.Description = req.Description
	rule.Category = req.Category
	rule.Severity = req.Severity
	rule.Conditions = req.Conditions
	rule.Actions = req.Actions
	rule.Channels = req.Channels
	rule.EscalationPolicy = req.EscalationPolicy
	rule.Throttle = req.Throttle
	rule.Schedule = req.Schedule
	rule.Tags = req.Tags
	rule.UpdatedAt = time.Now()
	
	if err := h.updateAlertRule(r.Context(), rule); err != nil {
		slog.Error("failed to update alert rule", "error", err)
		httputil.Error(w, "failed to update alert rule", http.StatusInternalServerError)
		return
	}
	
	// Update rule in rule engine
	h.ruleEngine.UpdateRule(rule)
	
	httputil.JSON(w, rule)
}

func (h *Handlers) DeleteAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	rule, err := h.getAlertRule(r.Context(), tenantID, ruleID)
	if err != nil {
		httputil.Error(w, "alert rule not found", http.StatusNotFound)
		return
	}
	
	// Soft delete
	now := time.Now()
	rule.DeletedAt = &now
	rule.IsEnabled = false
	rule.UpdatedAt = now
	
	if err := h.updateAlertRule(r.Context(), rule); err != nil {
		slog.Error("failed to delete alert rule", "error", err)
		httputil.Error(w, "failed to delete alert rule", http.StatusInternalServerError)
		return
	}
	
	// Remove from rule engine
	h.ruleEngine.UnregisterRule(ruleID)
	
	httputil.JSON(w, map[string]string{"message": "alert rule deleted successfully"})
}

func (h *Handlers) EnableAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	if err := h.setAlertRuleEnabled(r.Context(), tenantID, ruleID, true); err != nil {
		httputil.Error(w, "failed to enable alert rule", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{"enabled": true})
}

func (h *Handlers) DisableAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	if err := h.setAlertRuleEnabled(r.Context(), tenantID, ruleID, false); err != nil {
		httputil.Error(w, "failed to disable alert rule", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{"enabled": false})
}

func (h *Handlers) TestAlertRule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ruleID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	rule, err := h.getAlertRule(r.Context(), tenantID, ruleID)
	if err != nil {
		httputil.Error(w, "alert rule not found", http.StatusNotFound)
		return
	}
	
	// Test the rule with sample data
	testResult := h.ruleEngine.TestRule(rule, map[string]interface{}{
		"test_mode": true,
		"timestamp": time.Now(),
	})
	
	httputil.JSON(w, map[string]interface{}{
		"rule_id": ruleID,
		"result":  testResult,
		"message": "Rule test completed",
	})
}

// Alert Instances management

func (h *Handlers) ListAlertInstances(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := AlertInstanceListQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 200 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if ruleID := r.URL.Query().Get("rule_id"); ruleID != "" {
		query.RuleID = &ruleID
	}
	
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = &status
	}
	
	instances, total, err := h.getAlertInstances(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get alert instances", "error", err)
		httputil.Error(w, "failed to get alert instances", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"instances": instances,
		"total":     total,
		"limit":     query.Limit,
		"offset":    query.Offset,
	})
}

func (h *Handlers) GetAlertInstance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	instance, err := h.getAlertInstance(r.Context(), tenantID, instanceID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "alert instance not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to get alert instance", "error", err)
		httputil.Error(w, "failed to get alert instance", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, instance)
}

func (h *Handlers) AcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	userID := h.getUserID(r)
	
	var req AcknowledgeAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	instance, err := h.getAlertInstance(r.Context(), tenantID, instanceID)
	if err != nil {
		httputil.Error(w, "alert instance not found", http.StatusNotFound)
		return
	}
	
	if instance.Status == StatusAcknowledged || instance.Status == StatusResolved {
		httputil.Error(w, "alert already acknowledged or resolved", http.StatusBadRequest)
		return
	}
	
	now := time.Now()
	instance.Status = StatusAcknowledged
	instance.AcknowledgedAt = &now
	instance.AcknowledgedBy = &userID
	instance.AcknowledgeNote = req.Note
	instance.UpdatedAt = now
	
	if err := h.updateAlertInstance(r.Context(), instance); err != nil {
		slog.Error("failed to acknowledge alert", "error", err)
		httputil.Error(w, "failed to acknowledge alert", http.StatusInternalServerError)
		return
	}
	
	// Publish alert acknowledged event
	go h.publishAlertEvent(instance, "acknowledged")
	
	httputil.JSON(w, instance)
}

func (h *Handlers) ResolveAlert(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	userID := h.getUserID(r)
	
	var req ResolveAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	instance, err := h.getAlertInstance(r.Context(), tenantID, instanceID)
	if err != nil {
		httputil.Error(w, "alert instance not found", http.StatusNotFound)
		return
	}
	
	if instance.Status == StatusResolved {
		httputil.Error(w, "alert already resolved", http.StatusBadRequest)
		return
	}
	
	now := time.Now()
	instance.Status = StatusResolved
	instance.ResolvedAt = &now
	instance.ResolvedBy = &userID
	instance.ResolutionNote = req.Note
	instance.UpdatedAt = now
	
	if err := h.updateAlertInstance(r.Context(), instance); err != nil {
		slog.Error("failed to resolve alert", "error", err)
		httputil.Error(w, "failed to resolve alert", http.StatusInternalServerError)
		return
	}
	
	// Publish alert resolved event
	go h.publishAlertEvent(instance, "resolved")
	
	httputil.JSON(w, instance)
}

func (h *Handlers) SnoozeAlert(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req SnoozeAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	instance, err := h.getAlertInstance(r.Context(), tenantID, instanceID)
	if err != nil {
		httputil.Error(w, "alert instance not found", http.StatusNotFound)
		return
	}
	
	snoozeUntil := time.Now().Add(req.Duration)
	instance.Status = StatusSnoozed
	instance.SnoozedUntil = &snoozeUntil
	instance.UpdatedAt = time.Now()
	
	if err := h.updateAlertInstance(r.Context(), instance); err != nil {
		slog.Error("failed to snooze alert", "error", err)
		httputil.Error(w, "failed to snooze alert", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"snoozed_until": snoozeUntil,
		"duration":      req.Duration,
		"note":          req.Note,
	})
}

// Automation Rules management

func (h *Handlers) ListAutomationRules(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	rules, err := h.getAutomationRules(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get automation rules", "error", err)
		httputil.Error(w, "failed to get automation rules", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"automation_rules": rules,
	})
}

func (h *Handlers) CreateAutomationRule(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req CreateAutomationRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	rule := &AutomationRule{
		ID:             uuid.New(),
		TenantID:       tenantID,
		Name:           req.Name,
		Description:    req.Description,
		Category:       req.Category,
		IsEnabled:      true,
		Trigger:        req.Trigger,
		Conditions:     req.Conditions,
		Actions:        req.Actions,
		Schedule:       req.Schedule,
		Cooldown:       req.Cooldown,
		Tags:           req.Tags,
		ExecutionCount: 0,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
		CreatedBy:      createdBy,
	}
	
	if err := h.createAutomationRule(r.Context(), rule); err != nil {
		slog.Error("failed to create automation rule", "error", err)
		httputil.Error(w, "failed to create automation rule", http.StatusInternalServerError)
		return
	}
	
	// Register automation rule with rule engine
	h.ruleEngine.RegisterAutomationRule(rule)
	
	httputil.JSON(w, rule)
}

// Alert Channels management

func (h *Handlers) ListAlertChannels(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	channels, err := h.getAlertChannels(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get alert channels", "error", err)
		httputil.Error(w, "failed to get alert channels", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"channels": channels,
	})
}

func (h *Handlers) CreateAlertChannel(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req CreateAlertChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	channel := &AlertChannel{
		ID:            uuid.New(),
		TenantID:      tenantID,
		Name:          req.Name,
		Description:   req.Description,
		Type:          req.Type,
		IsEnabled:     true,
		Configuration: req.Configuration,
		Templates:     req.Templates,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		CreatedBy:     createdBy,
	}
	
	if err := h.createAlertChannel(r.Context(), channel); err != nil {
		slog.Error("failed to create alert channel", "error", err)
		httputil.Error(w, "failed to create alert channel", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, channel)
}

func (h *Handlers) TestAlertChannel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	channelID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	channel, err := h.getAlertChannel(r.Context(), tenantID, channelID)
	if err != nil {
		httputil.Error(w, "alert channel not found", http.StatusNotFound)
		return
	}
	
	// Send test message
	testResult := h.testAlertChannel(channel)
	
	httputil.JSON(w, map[string]interface{}{
		"channel_id": channelID,
		"success":    testResult.Success,
		"message":    testResult.Message,
		"tested_at":  time.Now(),
	})
}

// Analytics and reporting

func (h *Handlers) GetAlertAnalytics(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	analytics, err := h.generateAlertAnalytics(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to generate alert analytics", "error", err)
		httputil.Error(w, "failed to generate alert analytics", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, analytics)
}

func (h *Handlers) GetAlertSummaryReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	// Get date range from query params
	dateFrom := r.URL.Query().Get("date_from")
	dateTo := r.URL.Query().Get("date_to")
	
	report, err := h.generateSummaryReport(r.Context(), tenantID, dateFrom, dateTo)
	if err != nil {
		slog.Error("failed to generate summary report", "error", err)
		httputil.Error(w, "failed to generate summary report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// Settings management

func (h *Handlers) GetAlertSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	settings, err := h.getAlertSettings(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get alert settings", "error", err)
		httputil.Error(w, "failed to get alert settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}

func (h *Handlers) UpdateAlertSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	settings, err := h.updateAlertSettings(r.Context(), tenantID, req)
	if err != nil {
		slog.Error("failed to update alert settings", "error", err)
		httputil.Error(w, "failed to update alert settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}

// Manual alert creation

func (h *Handlers) CreateManualAlert(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req CreateManualAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	instance := &AlertInstance{
		ID:          uuid.New(),
		TenantID:    tenantID,
		RuleID:      uuid.Nil, // Manual alerts don't have rules
		RuleName:    "Manual Alert",
		Title:       req.Title,
		Description: req.Description,
		Severity:    req.Severity,
		Status:      StatusOpen,
		Category:    getDefaultValue(req.Category, CategoryCustom),
		Source:      getDefaultValue(req.Source, "manual"),
		EventData:   req.EventData,
		TriggeredAt: time.Now(),
		Tags:        req.Tags,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	
	if err := h.createAlertInstance(r.Context(), instance); err != nil {
		slog.Error("failed to create manual alert", "error", err)
		httputil.Error(w, "failed to create manual alert", http.StatusInternalServerError)
		return
	}
	
	// Send notifications for manual alert
	go h.processAlertNotifications(instance)
	
	httputil.JSON(w, instance)
}

// Webhooks and external integrations

func (h *Handlers) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	webhookID := vars["webhook_id"]
	
	// Process webhook alert
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httputil.Error(w, "invalid JSON payload", http.StatusBadRequest)
		return
	}
	
	slog.Info("webhook received", "webhook_id", webhookID, "payload", payload)
	
	// Process webhook payload and create alert if needed
	if err := h.processWebhookAlert(webhookID, payload); err != nil {
		slog.Error("failed to process webhook", "error", err)
		httputil.Error(w, "failed to process webhook", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]string{"status": "received"})
}

// Placeholder implementations for remaining handlers

func (h *Handlers) GetAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get automation rule not yet implemented"})
}

func (h *Handlers) UpdateAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update automation rule not yet implemented"})
}

func (h *Handlers) DeleteAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete automation rule not yet implemented"})
}

func (h *Handlers) EnableAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Enable automation rule not yet implemented"})
}

func (h *Handlers) DisableAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Disable automation rule not yet implemented"})
}

func (h *Handlers) TestAutomationRule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Test automation rule not yet implemented"})
}

func (h *Handlers) BulkAcknowledgeAlerts(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Bulk acknowledge alerts not yet implemented"})
}

func (h *Handlers) BulkResolveAlerts(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Bulk resolve alerts not yet implemented"})
}

func (h *Handlers) ListEscalationPolicies(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"escalation_policies": {}})
}

func (h *Handlers) CreateEscalationPolicy(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Create escalation policy not yet implemented"})
}

func (h *Handlers) GetEscalationPolicy(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get escalation policy not yet implemented"})
}

func (h *Handlers) UpdateEscalationPolicy(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update escalation policy not yet implemented"})
}

func (h *Handlers) DeleteEscalationPolicy(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete escalation policy not yet implemented"})
}

func (h *Handlers) GetAlertChannel(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get alert channel not yet implemented"})
}

func (h *Handlers) UpdateAlertChannel(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update alert channel not yet implemented"})
}

func (h *Handlers) DeleteAlertChannel(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete alert channel not yet implemented"})
}

func (h *Handlers) ListAlertTemplates(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"templates": {}})
}

func (h *Handlers) CreateAlertTemplate(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Create alert template not yet implemented"})
}

func (h *Handlers) GetAlertTemplate(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get alert template not yet implemented"})
}

func (h *Handlers) UpdateAlertTemplate(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update alert template not yet implemented"})
}

func (h *Handlers) DeleteAlertTemplate(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete alert template not yet implemented"})
}

func (h *Handlers) ListSchedules(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"schedules": {}})
}

func (h *Handlers) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Create schedule not yet implemented"})
}

func (h *Handlers) GetSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get schedule not yet implemented"})
}

func (h *Handlers) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update schedule not yet implemented"})
}

func (h *Handlers) GetScheduleOverrides(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"overrides": {}})
}

func (h *Handlers) CreateScheduleOverride(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Create schedule override not yet implemented"})
}

func (h *Handlers) GetOnCallStatus(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]interface{}{
		"current_on_call": []interface{}{},
		"next_on_call": []interface{}{},
	})
}

func (h *Handlers) GetCurrentOnCall(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"current_on_call": {}})
}

func (h *Handlers) HandoffOnCall(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Handoff on-call not yet implemented"})
}

func (h *Handlers) GetAlertPerformanceReport(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get performance report not yet implemented"})
}

func (h *Handlers) GetAlertTrendsReport(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get trends report not yet implemented"})
}

func (h *Handlers) ListMaintenanceWindows(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string][]interface{}{"maintenance_windows": {}})
}

func (h *Handlers) CreateMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Create maintenance window not yet implemented"})
}

func (h *Handlers) GetMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get maintenance window not yet implemented"})
}

func (h *Handlers) UpdateMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update maintenance window not yet implemented"})
}

func (h *Handlers) DeleteMaintenanceWindow(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete maintenance window not yet implemented"})
}

func (h *Handlers) HandleExternalAlert(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Handle external alert not yet implemented"})
}

// Helper functions

func (h *Handlers) getUserID(r *http.Request) uuid.UUID {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		return uuid.Nil
	}
	
	if userID, err := uuid.Parse(userIDStr); err == nil {
		return userID
	}
	
	return uuid.Nil
}

func getDefaultValue(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}

// Cleanup gracefully shuts down alert resources
func (h *Handlers) Cleanup() {
	if h.ruleEngine != nil {
		h.ruleEngine.Shutdown()
	}
	slog.Info("alert service cleanup completed")
}