package alert

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"duall-master/pkg/db"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// RuleEngine manages alert rules and automation
type RuleEngine struct {
	db           *db.DB
	nats         *nats.Conn
	alertRules   sync.Map // map[uuid.UUID]*AlertRule
	automationRules sync.Map // map[uuid.UUID]*AutomationRule
	throttleCache sync.Map // map[string]time.Time for throttling
	subscriptions []*nats.Subscription
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewRuleEngine creates a new rule engine instance
func NewRuleEngine(database *db.DB, nc *nats.Conn) *RuleEngine {
	ctx, cancel := context.WithCancel(context.Background())
	
	engine := &RuleEngine{
		db:     database,
		nats:   nc,
		ctx:    ctx,
		cancel: cancel,
	}
	
	// Start the rule engine
	go engine.start()
	
	return engine
}

// start initializes the rule engine and loads existing rules
func (re *RuleEngine) start() {
	slog.Info("starting alert rule engine")
	
	// Subscribe to system events for rule evaluation
	re.subscribeToEvents()
	
	// Start periodic tasks
	go re.periodicTasks()
	
	slog.Info("alert rule engine started successfully")
}

// subscribeToEvents sets up NATS subscriptions for rule evaluation
func (re *RuleEngine) subscribeToEvents() {
	// Access control events
	if sub, err := re.nats.Subscribe("dm.*.access.*", re.handleAccessEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// Device events
	if sub, err := re.nats.Subscribe("dm.*.device.*", re.handleDeviceEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// Video/motion events
	if sub, err := re.nats.Subscribe("dm.*.video.*", re.handleVideoEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// Attendance events
	if sub, err := re.nats.Subscribe("dm.*.attendance.*", re.handleAttendanceEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// Visitor events
	if sub, err := re.nats.Subscribe("dm.*.visitor.*", re.handleVisitorEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// System events (health, errors, etc.)
	if sub, err := re.nats.Subscribe("dm.*.system.*", re.handleSystemEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	// Emergency events
	if sub, err := re.nats.Subscribe("dm.*.emergency.*", re.handleEmergencyEvent); err == nil {
		re.subscriptions = append(re.subscriptions, sub)
	}
	
	slog.Info("rule engine subscribed to system events", "subscriptions", len(re.subscriptions))
}

// Event handlers

func (re *RuleEngine) handleAccessEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "access"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleDeviceEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "device"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleVideoEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "video"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleAttendanceEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "attendance"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleVisitorEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "visitor"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleSystemEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "system"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

func (re *RuleEngine) handleEmergencyEvent(msg *nats.Msg) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		return
	}
	
	event["event_type"] = "emergency"
	event["subject"] = msg.Subject
	event["timestamp"] = time.Now()
	event["priority"] = "critical"
	
	// Emergency events bypass throttling
	re.evaluateRules(event)
	re.executeAutomationRules(event)
}

// Rule management

func (re *RuleEngine) RegisterRule(rule *AlertRule) {
	if rule.IsEnabled && rule.DeletedAt == nil {
		re.alertRules.Store(rule.ID, rule)
		slog.Info("registered alert rule", "rule_id", rule.ID, "name", rule.Name)
	}
}

func (re *RuleEngine) UpdateRule(rule *AlertRule) {
	if rule.IsEnabled && rule.DeletedAt == nil {
		re.alertRules.Store(rule.ID, rule)
		slog.Info("updated alert rule", "rule_id", rule.ID, "name", rule.Name)
	} else {
		re.UnregisterRule(rule.ID)
	}
}

func (re *RuleEngine) UnregisterRule(ruleID uuid.UUID) {
	re.alertRules.Delete(ruleID)
	slog.Info("unregistered alert rule", "rule_id", ruleID)
}

func (re *RuleEngine) RegisterAutomationRule(rule *AutomationRule) {
	if rule.IsEnabled && rule.DeletedAt == nil {
		re.automationRules.Store(rule.ID, rule)
		slog.Info("registered automation rule", "rule_id", rule.ID, "name", rule.Name)
	}
}

func (re *RuleEngine) UnregisterAutomationRule(ruleID uuid.UUID) {
	re.automationRules.Delete(ruleID)
	slog.Info("unregistered automation rule", "rule_id", ruleID)
}

// Rule evaluation

func (re *RuleEngine) evaluateRules(event map[string]interface{}) {
	re.alertRules.Range(func(key, value interface{}) bool {
		rule := value.(*AlertRule)
		
		// Check if rule matches the event
		if re.matchesRule(rule, event) {
			// Check throttling
			if re.isThrottled(rule, event) {
				return true // continue iteration
			}
			
			// Check schedule
			if !re.isWithinSchedule(rule) {
				return true
			}
			
			// Create alert instance
			instance := re.createAlertInstance(rule, event)
			if instance != nil {
				re.processAlertInstance(instance)
			}
		}
		
		return true // continue iteration
	})
}

func (re *RuleEngine) executeAutomationRules(event map[string]interface{}) {
	re.automationRules.Range(func(key, value interface{}) bool {
		rule := value.(*AutomationRule)
		
		// Check trigger conditions
		if re.matchesAutomationTrigger(rule, event) {
			// Check schedule
			if !re.isWithinAutomationSchedule(rule) {
				return true
			}
			
			// Check cooldown
			if re.isInCooldown(rule) {
				return true
			}
			
			// Execute automation actions
			re.executeAutomationActions(rule, event)
		}
		
		return true // continue iteration
	})
}

// Rule matching logic

func (re *RuleEngine) matchesRule(rule *AlertRule, event map[string]interface{}) bool {
	// Check if conditions match
	for key, expectedValue := range rule.Conditions {
		if !re.evaluateCondition(key, expectedValue, event) {
			return false
		}
	}
	
	return true
}

func (re *RuleEngine) matchesAutomationTrigger(rule *AutomationRule, event map[string]interface{}) bool {
	// Check trigger type
	if rule.Trigger.Type == TriggerTypeEvent {
		// Check event types
		if len(rule.Trigger.EventTypes) > 0 {
			eventType := getStringValue(event, "event_type")
			found := false
			for _, et := range rule.Trigger.EventTypes {
				if strings.Contains(eventType, et) || strings.Contains(getStringValue(event, "subject"), et) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		
		// Check filters
		for key, expectedValue := range rule.Trigger.Filters {
			if !re.evaluateCondition(key, expectedValue, event) {
				return false
			}
		}
		
		// Check rule conditions
		return re.evaluateAutomationConditions(rule.Conditions, event)
	}
	
	return false
}

func (re *RuleEngine) evaluateCondition(key string, expectedValue interface{}, event map[string]interface{}) bool {
	actualValue := getNestedValue(event, key)
	
	// Handle different condition types
	switch expected := expectedValue.(type) {
	case map[string]interface{}:
		// Complex condition with operator
		operator := getStringValue(expected, "operator")
		value := expected["value"]
		
		return re.evaluateOperator(actualValue, operator, value)
		
	default:
		// Simple equality check
		return reflect.DeepEqual(actualValue, expectedValue)
	}
}

func (re *RuleEngine) evaluateAutomationConditions(conditions []AutomationCondition, event map[string]interface{}) bool {
	if len(conditions) == 0 {
		return true
	}
	
	result := true
	lastLogic := "AND"
	
	for _, condition := range conditions {
		actualValue := getNestedValue(event, condition.Field)
		conditionResult := re.evaluateOperator(actualValue, condition.Operator, condition.Value)
		
		if lastLogic == "AND" {
			result = result && conditionResult
		} else if lastLogic == "OR" {
			result = result || conditionResult
		}
		
		if condition.LogicOp != "" {
			lastLogic = condition.LogicOp
		}
	}
	
	return result
}

func (re *RuleEngine) evaluateOperator(actual interface{}, operator string, expected interface{}) bool {
	switch operator {
	case "equals", "eq", "==":
		return reflect.DeepEqual(actual, expected)
		
	case "not_equals", "ne", "!=":
		return !reflect.DeepEqual(actual, expected)
		
	case "contains":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return strings.Contains(actualStr, expectedStr)
		
	case "not_contains":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return !strings.Contains(actualStr, expectedStr)
		
	case "greater_than", "gt", ">":
		return compareNumbers(actual, expected) > 0
		
	case "greater_equal", "gte", ">=":
		return compareNumbers(actual, expected) >= 0
		
	case "less_than", "lt", "<":
		return compareNumbers(actual, expected) < 0
		
	case "less_equal", "lte", "<=":
		return compareNumbers(actual, expected) <= 0
		
	case "starts_with":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return strings.HasPrefix(actualStr, expectedStr)
		
	case "ends_with":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return strings.HasSuffix(actualStr, expectedStr)
		
	case "regex_match":
		// TODO: Implement regex matching
		return false
		
	case "in":
		if expectedSlice, ok := expected.([]interface{}); ok {
			for _, item := range expectedSlice {
				if reflect.DeepEqual(actual, item) {
					return true
				}
			}
		}
		return false
		
	case "not_in":
		if expectedSlice, ok := expected.([]interface{}); ok {
			for _, item := range expectedSlice {
				if reflect.DeepEqual(actual, item) {
					return false
				}
			}
		}
		return true
		
	default:
		// Default to equality
		return reflect.DeepEqual(actual, expected)
	}
}

// Throttling and scheduling

func (re *RuleEngine) isThrottled(rule *AlertRule, event map[string]interface{}) bool {
	if rule.Throttle == nil || !rule.Throttle.Enabled {
		return false
	}
	
	throttleKey := fmt.Sprintf("alert:%s", rule.ID)
	
	if lastTime, exists := re.throttleCache.Load(throttleKey); exists {
		if time.Since(lastTime.(time.Time)) < rule.Throttle.WindowSize {
			return true
		}
	}
	
	re.throttleCache.Store(throttleKey, time.Now())
	return false
}

func (re *RuleEngine) isInCooldown(rule *AutomationRule) bool {
	if rule.Cooldown == nil {
		return false
	}
	
	if rule.LastExecuted != nil {
		return time.Since(*rule.LastExecuted) < *rule.Cooldown
	}
	
	return false
}

func (re *RuleEngine) isWithinSchedule(rule *AlertRule) bool {
	if rule.Schedule == nil || !rule.Schedule.Enabled {
		return true
	}
	
	return re.checkSchedule(rule.Schedule)
}

func (re *RuleEngine) isWithinAutomationSchedule(rule *AutomationRule) bool {
	if rule.Schedule == nil || !rule.Schedule.Enabled {
		return true
	}
	
	return re.checkSchedule(rule.Schedule)
}

func (re *RuleEngine) checkSchedule(schedule *ScheduleSettings) bool {
	now := time.Now()
	
	// Check weekdays
	if len(schedule.WeekDays) > 0 {
		currentWeekday := int(now.Weekday())
		found := false
		for _, day := range schedule.WeekDays {
			if day == currentWeekday {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	
	// Check time range
	if schedule.StartTime != "" && schedule.EndTime != "" {
		startTime, _ := time.Parse("15:04", schedule.StartTime)
		endTime, _ := time.Parse("15:04", schedule.EndTime)
		
		currentTime := time.Date(0, 1, 1, now.Hour(), now.Minute(), 0, 0, time.UTC)
		startCheck := time.Date(0, 1, 1, startTime.Hour(), startTime.Minute(), 0, 0, time.UTC)
		endCheck := time.Date(0, 1, 1, endTime.Hour(), endTime.Minute(), 0, 0, time.UTC)
		
		if endCheck.Before(startCheck) {
			// Overnight schedule (e.g., 22:00 - 06:00)
			return currentTime.After(startCheck) || currentTime.Before(endCheck)
		} else {
			// Same day schedule
			return currentTime.After(startCheck) && currentTime.Before(endCheck)
		}
	}
	
	return true
}

// Alert processing

func (re *RuleEngine) createAlertInstance(rule *AlertRule, event map[string]interface{}) *AlertInstance {
	tenantID := rule.TenantID
	if eventTenantID := getStringValue(event, "tenant_id"); eventTenantID != "" {
		if tid, err := uuid.Parse(eventTenantID); err == nil {
			tenantID = tid
		}
	}
	
	title := fmt.Sprintf("Alert: %s", rule.Name)
	if eventTitle := getStringValue(event, "title"); eventTitle != "" {
		title = eventTitle
	}
	
	description := rule.Description
	if eventDesc := getStringValue(event, "description"); eventDesc != "" {
		description = eventDesc
	}
	
	instance := &AlertInstance{
		ID:          uuid.New(),
		TenantID:    tenantID,
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		Title:       title,
		Description: description,
		Severity:    rule.Severity,
		Status:      StatusOpen,
		Category:    rule.Category,
		Source:      getStringValue(event, "source"),
		EventData:   event,
		TriggeredAt: time.Now(),
		Tags:        rule.Tags,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	
	return instance
}

func (re *RuleEngine) processAlertInstance(instance *AlertInstance) {
	// Save to database
	ctx := context.Background()
	if err := re.db.SetTenant(ctx, instance.TenantID); err != nil {
		slog.Error("failed to set tenant for alert", "error", err)
		return
	}
	
	if err := re.createAlertInstanceDB(ctx, instance); err != nil {
		slog.Error("failed to create alert instance", "error", err, "alert_id", instance.ID)
		return
	}
	
	// Update rule trigger count
	re.updateRuleTriggerCount(instance.RuleID)
	
	// Publish alert event
	re.publishAlertEvent(instance, "triggered")
	
	slog.Info("alert triggered", "alert_id", instance.ID, "rule_id", instance.RuleID, "severity", instance.Severity)
}

func (re *RuleEngine) executeAutomationActions(rule *AutomationRule, event map[string]interface{}) {
	for _, action := range rule.Actions {
		go re.executeAction(rule, action, event)
	}
	
	// Update execution count and last executed
	re.updateAutomationExecution(rule.ID)
	
	slog.Info("automation rule executed", "rule_id", rule.ID, "actions", len(rule.Actions))
}

func (re *RuleEngine) executeAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	switch action.Type {
	case AutoActionNotify:
		re.executeNotificationAction(rule, action, event)
		
	case AutoActionCommand:
		re.executeCommandAction(rule, action, event)
		
	case AutoActionDevice:
		re.executeDeviceAction(rule, action, event)
		
	case AutoActionDoor:
		re.executeDoorAction(rule, action, event)
		
	case AutoActionCamera:
		re.executeCameraAction(rule, action, event)
		
	case AutoActionRecording:
		re.executeRecordingAction(rule, action, event)
		
	case AutoActionWebhook:
		re.executeWebhookAction(rule, action, event)
		
	default:
		slog.Warn("unknown automation action type", "type", action.Type, "rule_id", rule.ID)
	}
}

func (re *RuleEngine) executeNotificationAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	notification := map[string]interface{}{
		"tenant_id": rule.TenantID,
		"title":     getParameterValue(action.Parameters, "title", fmt.Sprintf("Automation: %s", rule.Name)),
		"message":   getParameterValue(action.Parameters, "message", rule.Description),
		"channels":  action.Parameters["channels"],
		"priority":  getParameterValue(action.Parameters, "priority", "medium"),
		"source":    "automation",
		"metadata": map[string]interface{}{
			"rule_id":    rule.ID,
			"rule_name":  rule.Name,
			"event_data": event,
		},
	}
	
	notificationJSON, _ := json.Marshal(notification)
	re.nats.Publish("dm.notification.send", notificationJSON)
}

func (re *RuleEngine) executeCommandAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	// Execute system commands (careful with security)
	slog.Info("executing command action", "rule_id", rule.ID, "command", action.Parameters["command"])
}

func (re *RuleEngine) executeDeviceAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	deviceAction := map[string]interface{}{
		"tenant_id":   rule.TenantID,
		"device_id":   action.Parameters["device_id"],
		"action_type": action.Parameters["action_type"],
		"parameters":  action.Parameters,
		"source":      "automation",
		"rule_id":     rule.ID,
	}
	
	deviceActionJSON, _ := json.Marshal(deviceAction)
	subject := fmt.Sprintf("dm.%s.device.action", rule.TenantID)
	re.nats.Publish(subject, deviceActionJSON)
}

func (re *RuleEngine) executeDoorAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	doorAction := map[string]interface{}{
		"tenant_id": rule.TenantID,
		"door_id":   action.Parameters["door_id"],
		"action":    action.Parameters["action"], // lock, unlock, open
		"duration":  action.Parameters["duration"],
		"source":    "automation",
		"rule_id":   rule.ID,
	}
	
	doorActionJSON, _ := json.Marshal(doorAction)
	subject := fmt.Sprintf("dm.%s.access.door.control", rule.TenantID)
	re.nats.Publish(subject, doorActionJSON)
}

func (re *RuleEngine) executeCameraAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	cameraAction := map[string]interface{}{
		"tenant_id": rule.TenantID,
		"camera_id": action.Parameters["camera_id"],
		"action":    action.Parameters["action"], // start_recording, stop_recording, snapshot, pan, tilt
		"parameters": action.Parameters,
		"source":    "automation",
		"rule_id":   rule.ID,
	}
	
	cameraActionJSON, _ := json.Marshal(cameraAction)
	subject := fmt.Sprintf("dm.%s.video.camera.control", rule.TenantID)
	re.nats.Publish(subject, cameraActionJSON)
}

func (re *RuleEngine) executeRecordingAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	recordingAction := map[string]interface{}{
		"tenant_id": rule.TenantID,
		"camera_id": action.Parameters["camera_id"],
		"duration":  getParameterValue(action.Parameters, "duration", 300), // 5 minutes default
		"quality":   getParameterValue(action.Parameters, "quality", "high"),
		"source":    "automation",
		"rule_id":   rule.ID,
	}
	
	recordingActionJSON, _ := json.Marshal(recordingAction)
	subject := fmt.Sprintf("dm.%s.video.recording.start", rule.TenantID)
	re.nats.Publish(subject, recordingActionJSON)
}

func (re *RuleEngine) executeWebhookAction(rule *AutomationRule, action AutomationAction, event map[string]interface{}) {
	webhookData := map[string]interface{}{
		"rule_id":     rule.ID,
		"rule_name":   rule.Name,
		"tenant_id":   rule.TenantID,
		"event_data":  event,
		"timestamp":   time.Now(),
		"action_type": "automation",
	}
	
	// Add custom parameters
	for key, value := range action.Parameters {
		if key != "url" && key != "method" {
			webhookData[key] = value
		}
	}
	
	webhookPayload := map[string]interface{}{
		"url":     action.Parameters["url"],
		"method":  getParameterValue(action.Parameters, "method", "POST"),
		"headers": getParameterValue(action.Parameters, "headers", map[string]interface{}{}),
		"data":    webhookData,
	}
	
	webhookJSON, _ := json.Marshal(webhookPayload)
	re.nats.Publish("dm.webhook.send", webhookJSON)
}

// Testing

func (re *RuleEngine) TestRule(rule *AlertRule, testData map[string]interface{}) map[string]interface{} {
	matches := re.matchesRule(rule, testData)
	
	result := map[string]interface{}{
		"matches":    matches,
		"rule_id":    rule.ID,
		"rule_name":  rule.Name,
		"test_data":  testData,
		"conditions": rule.Conditions,
		"timestamp":  time.Now(),
	}
	
	if matches {
		result["alert_would_trigger"] = true
		result["severity"] = rule.Severity
		result["actions"] = rule.Actions
	}
	
	return result
}

// Periodic tasks

func (re *RuleEngine) periodicTasks() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-re.ctx.Done():
			return
		case <-ticker.C:
			re.cleanupThrottleCache()
			re.checkSnoozeExpiration()
		}
	}
}

func (re *RuleEngine) cleanupThrottleCache() {
	now := time.Now()
	re.throttleCache.Range(func(key, value interface{}) bool {
		if now.Sub(value.(time.Time)) > 24*time.Hour {
			re.throttleCache.Delete(key)
		}
		return true
	})
}

func (re *RuleEngine) checkSnoozeExpiration() {
	// TODO: Check for snoozed alerts that should be reactivated
}

// Database operations (simplified versions)

func (re *RuleEngine) createAlertInstanceDB(ctx context.Context, instance *AlertInstance) error {
	eventDataJSON, _ := json.Marshal(instance.EventData)
	metadataJSON, _ := json.Marshal(instance.Metadata)
	
	query := `
		INSERT INTO dm3_alert.alert_instances (
			id, tenant_id, rule_id, rule_name, title, description, severity, status,
			category, source, event_data, triggered_at, escalation_level,
			notifications_sent, tags, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
		)
	`
	
	_, err := re.db.Exec(ctx, query,
		instance.ID, instance.TenantID, instance.RuleID, instance.RuleName, instance.Title,
		instance.Description, instance.Severity, instance.Status, instance.Category,
		instance.Source, eventDataJSON, instance.TriggeredAt, instance.EscalationLevel,
		instance.NotificationsSent, instance.Tags, metadataJSON,
		instance.CreatedAt, instance.UpdatedAt,
	)
	
	return err
}

func (re *RuleEngine) updateRuleTriggerCount(ruleID uuid.UUID) {
	if rule, exists := re.alertRules.Load(ruleID); exists {
		r := rule.(*AlertRule)
		r.TriggerCount++
		now := time.Now()
		r.LastTriggered = &now
		re.alertRules.Store(ruleID, r)
		
		// Update in database
		go func() {
			ctx := context.Background()
			re.db.SetTenant(ctx, r.TenantID)
			re.db.Exec(ctx, "UPDATE dm3_alert.alert_rules SET trigger_count = trigger_count + 1, last_triggered = now() WHERE id = $1", ruleID)
		}()
	}
}

func (re *RuleEngine) updateAutomationExecution(ruleID uuid.UUID) {
	if rule, exists := re.automationRules.Load(ruleID); exists {
		r := rule.(*AutomationRule)
		r.ExecutionCount++
		now := time.Now()
		r.LastExecuted = &now
		re.automationRules.Store(ruleID, r)
		
		// Update in database
		go func() {
			ctx := context.Background()
			re.db.SetTenant(ctx, r.TenantID)
			re.db.Exec(ctx, "UPDATE dm3_alert.automation_rules SET execution_count = execution_count + 1, last_executed = now() WHERE id = $1", ruleID)
		}()
	}
}

func (re *RuleEngine) publishAlertEvent(instance *AlertInstance, action string) {
	event := map[string]interface{}{
		"type":        "alert",
		"tenant_id":   instance.TenantID,
		"instance_id": instance.ID,
		"rule_id":     instance.RuleID,
		"action":      action,
		"status":      instance.Status,
		"severity":    instance.Severity,
		"category":    instance.Category,
		"timestamp":   time.Now(),
	}
	
	eventJSON, _ := json.Marshal(event)
	
	// Publish to tenant-specific subject
	subject := fmt.Sprintf("dm.%s.alert.%s", instance.TenantID, action)
	re.nats.Publish(subject, eventJSON)
	
	// Also publish to notification service
	if action == "triggered" {
		re.nats.Publish("dm.notification.send", eventJSON)
	}
}

// Shutdown gracefully shuts down the rule engine
func (re *RuleEngine) Shutdown() {
	slog.Info("shutting down rule engine")
	
	// Unsubscribe from all NATS subscriptions
	for _, sub := range re.subscriptions {
		sub.Unsubscribe()
	}
	
	// Cancel context
	re.cancel()
	
	slog.Info("rule engine shutdown completed")
}

// Helper functions

func getNestedValue(data map[string]interface{}, path string) interface{} {
	keys := strings.Split(path, ".")
	current := data
	
	for i, key := range keys {
		if i == len(keys)-1 {
			return current[key]
		}
		
		if next, ok := current[key].(map[string]interface{}); ok {
			current = next
		} else {
			return nil
		}
	}
	
	return nil
}

func getStringValue(data map[string]interface{}, key string) string {
	if value := getNestedValue(data, key); value != nil {
		return fmt.Sprintf("%v", value)
	}
	return ""
}

func getParameterValue(params map[string]interface{}, key string, defaultValue interface{}) interface{} {
	if value, exists := params[key]; exists {
		return value
	}
	return defaultValue
}

func compareNumbers(a, b interface{}) int {
	aFloat, err1 := convertToFloat(a)
	bFloat, err2 := convertToFloat(b)
	
	if err1 != nil || err2 != nil {
		return 0
	}
	
	if aFloat > bFloat {
		return 1
	} else if aFloat < bFloat {
		return -1
	} else {
		return 0
	}
}

func convertToFloat(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("cannot convert %T to float64", value)
	}
}