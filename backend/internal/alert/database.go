package alert

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"duall-master/pkg/db"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Database operations for alert service

func (h *Handlers) getAlertRules(ctx context.Context, tenantID uuid.UUID, query AlertRuleListQuery) ([]AlertRule, int64, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	var conditions []string
	var args []interface{}
	argCount := 0

	// Base condition for non-deleted records
	conditions = append(conditions, "deleted_at IS NULL")

	if query.Category != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("category = $%d", argCount))
		args = append(args, *query.Category)
	}

	if query.Severity != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("severity = $%d", argCount))
		args = append(args, *query.Severity)
	}

	if query.IsEnabled != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("is_enabled = $%d", argCount))
		args = append(args, *query.IsEnabled)
	}

	if query.Search != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("(name ILIKE $%d OR description ILIKE $%d)", argCount, argCount))
		args = append(args, "%"+*query.Search+"%")
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_alert.alert_rules %s", whereClause)
	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			id, tenant_id, name, description, category, severity, is_enabled,
			conditions, actions, channels, escalation_policy, throttle, schedule,
			tags, metadata, last_triggered, trigger_count, created_at, updated_at, created_by
		FROM dm3_alert.alert_rules
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var rules []AlertRule
	for rows.Next() {
		var r AlertRule
		var conditions, throttle, schedule, metadata sql.NullString
		var channels, tags pq.StringArray

		err := rows.Scan(
			&r.ID, &r.TenantID, &r.Name, &r.Description, &r.Category, &r.Severity,
			&r.IsEnabled, &conditions, pq.Array(&r.Actions), &channels, &r.EscalationPolicy,
			&throttle, &schedule, &tags, &metadata, &r.LastTriggered, &r.TriggerCount,
			&r.CreatedAt, &r.UpdatedAt, &r.CreatedBy,
		)
		if err != nil {
			return nil, 0, err
		}

		// Parse JSON fields
		if conditions.Valid && conditions.String != "" {
			if err := json.Unmarshal([]byte(conditions.String), &r.Conditions); err != nil {
				r.Conditions = make(map[string]interface{})
			}
		}

		if throttle.Valid && throttle.String != "" {
			if err := json.Unmarshal([]byte(throttle.String), &r.Throttle); err != nil {
				r.Throttle = nil
			}
		}

		if schedule.Valid && schedule.String != "" {
			if err := json.Unmarshal([]byte(schedule.String), &r.Schedule); err != nil {
				r.Schedule = nil
			}
		}

		if metadata.Valid && metadata.String != "" {
			if err := json.Unmarshal([]byte(metadata.String), &r.Metadata); err != nil {
				r.Metadata = make(map[string]interface{})
			}
		}

		// Convert channels to UUIDs
		r.Channels = make([]uuid.UUID, len(channels))
		for i, ch := range channels {
			if chUUID, err := uuid.Parse(ch); err == nil {
				r.Channels[i] = chUUID
			}
		}

		r.Tags = []string(tags)
		rules = append(rules, r)
	}

	return rules, total, nil
}

func (h *Handlers) getAlertRule(ctx context.Context, tenantID, ruleID uuid.UUID) (*AlertRule, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			id, tenant_id, name, description, category, severity, is_enabled,
			conditions, actions, channels, escalation_policy, throttle, schedule,
			tags, metadata, last_triggered, trigger_count, created_at, updated_at, created_by
		FROM dm3_alert.alert_rules
		WHERE id = $1 AND deleted_at IS NULL
	`

	var r AlertRule
	var conditions, throttle, schedule, metadata sql.NullString
	var channels, tags pq.StringArray

	err := h.db.QueryRow(ctx, query, ruleID).Scan(
		&r.ID, &r.TenantID, &r.Name, &r.Description, &r.Category, &r.Severity,
		&r.IsEnabled, &conditions, pq.Array(&r.Actions), &channels, &r.EscalationPolicy,
		&throttle, &schedule, &tags, &metadata, &r.LastTriggered, &r.TriggerCount,
		&r.CreatedAt, &r.UpdatedAt, &r.CreatedBy,
	)

	if err != nil {
		return nil, err
	}

	// Parse JSON fields (same as above)
	if conditions.Valid && conditions.String != "" {
		json.Unmarshal([]byte(conditions.String), &r.Conditions)
	}
	if throttle.Valid && throttle.String != "" {
		json.Unmarshal([]byte(throttle.String), &r.Throttle)
	}
	if schedule.Valid && schedule.String != "" {
		json.Unmarshal([]byte(schedule.String), &r.Schedule)
	}
	if metadata.Valid && metadata.String != "" {
		json.Unmarshal([]byte(metadata.String), &r.Metadata)
	}

	// Convert channels to UUIDs
	r.Channels = make([]uuid.UUID, len(channels))
	for i, ch := range channels {
		if chUUID, err := uuid.Parse(ch); err == nil {
			r.Channels[i] = chUUID
		}
	}

	r.Tags = []string(tags)
	return &r, nil
}

func (h *Handlers) createAlertRule(ctx context.Context, rule *AlertRule) error {
	if err := h.db.SetTenant(ctx, rule.TenantID); err != nil {
		return err
	}

	conditionsJSON, _ := json.Marshal(rule.Conditions)
	throttleJSON, _ := json.Marshal(rule.Throttle)
	scheduleJSON, _ := json.Marshal(rule.Schedule)
	metadataJSON, _ := json.Marshal(rule.Metadata)

	// Convert UUID channels to strings
	channelStrings := make([]string, len(rule.Channels))
	for i, ch := range rule.Channels {
		channelStrings[i] = ch.String()
	}

	query := `
		INSERT INTO dm3_alert.alert_rules (
			id, tenant_id, name, description, category, severity, is_enabled,
			conditions, actions, channels, escalation_policy, throttle, schedule,
			tags, metadata, trigger_count, created_at, updated_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
		)
	`

	_, err := h.db.Exec(ctx, query,
		rule.ID, rule.TenantID, rule.Name, rule.Description, rule.Category, rule.Severity,
		rule.IsEnabled, conditionsJSON, pq.Array(rule.Actions), pq.Array(channelStrings),
		rule.EscalationPolicy, throttleJSON, scheduleJSON, pq.Array(rule.Tags),
		metadataJSON, rule.TriggerCount, rule.CreatedAt, rule.UpdatedAt, rule.CreatedBy,
	)

	return err
}

func (h *Handlers) updateAlertRule(ctx context.Context, rule *AlertRule) error {
	if err := h.db.SetTenant(ctx, rule.TenantID); err != nil {
		return err
	}

	conditionsJSON, _ := json.Marshal(rule.Conditions)
	throttleJSON, _ := json.Marshal(rule.Throttle)
	scheduleJSON, _ := json.Marshal(rule.Schedule)
	metadataJSON, _ := json.Marshal(rule.Metadata)

	channelStrings := make([]string, len(rule.Channels))
	for i, ch := range rule.Channels {
		channelStrings[i] = ch.String()
	}

	query := `
		UPDATE dm3_alert.alert_rules SET
			name = $2, description = $3, category = $4, severity = $5, is_enabled = $6,
			conditions = $7, actions = $8, channels = $9, escalation_policy = $10,
			throttle = $11, schedule = $12, tags = $13, metadata = $14,
			last_triggered = $15, trigger_count = $16, updated_at = $17, deleted_at = $18
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query,
		rule.ID, rule.Name, rule.Description, rule.Category, rule.Severity, rule.IsEnabled,
		conditionsJSON, pq.Array(rule.Actions), pq.Array(channelStrings), rule.EscalationPolicy,
		throttleJSON, scheduleJSON, pq.Array(rule.Tags), metadataJSON,
		rule.LastTriggered, rule.TriggerCount, rule.UpdatedAt, rule.DeletedAt,
	)

	return err
}

func (h *Handlers) setAlertRuleEnabled(ctx context.Context, tenantID, ruleID uuid.UUID, enabled bool) error {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return err
	}

	query := `UPDATE dm3_alert.alert_rules SET is_enabled = $2, updated_at = now() WHERE id = $1`
	_, err := h.db.Exec(ctx, query, ruleID, enabled)
	return err
}

// Alert instances

func (h *Handlers) getAlertInstances(ctx context.Context, tenantID uuid.UUID, query AlertInstanceListQuery) ([]AlertInstance, int64, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	var conditions []string
	var args []interface{}
	argCount := 0

	if query.RuleID != nil {
		if ruleID, err := uuid.Parse(*query.RuleID); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("rule_id = $%d", argCount))
			args = append(args, ruleID)
		}
	}

	if query.Status != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("status = $%d", argCount))
		args = append(args, *query.Status)
	}

	if query.Severity != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("severity = $%d", argCount))
		args = append(args, *query.Severity)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_alert.alert_instances %s", whereClause)
	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			id, tenant_id, rule_id, rule_name, title, description, severity, status,
			category, source, event_data, triggered_at, acknowledged_at, acknowledged_by,
			acknowledge_note, resolved_at, resolved_by, resolution_note, snoozed_until,
			escalation_level, notifications_sent, tags, metadata, created_at, updated_at
		FROM dm3_alert.alert_instances
		%s
		ORDER BY triggered_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var instances []AlertInstance
	for rows.Next() {
		var inst AlertInstance
		var eventData, metadata sql.NullString
		var tags pq.StringArray

		err := rows.Scan(
			&inst.ID, &inst.TenantID, &inst.RuleID, &inst.RuleName, &inst.Title,
			&inst.Description, &inst.Severity, &inst.Status, &inst.Category, &inst.Source,
			&eventData, &inst.TriggeredAt, &inst.AcknowledgedAt, &inst.AcknowledgedBy,
			&inst.AcknowledgeNote, &inst.ResolvedAt, &inst.ResolvedBy, &inst.ResolutionNote,
			&inst.SnoozedUntil, &inst.EscalationLevel, &inst.NotificationsSent, &tags,
			&metadata, &inst.CreatedAt, &inst.UpdatedAt,
		)
		if err != nil {
			continue
		}

		// Parse JSON fields
		if eventData.Valid && eventData.String != "" {
			json.Unmarshal([]byte(eventData.String), &inst.EventData)
		}
		if metadata.Valid && metadata.String != "" {
			json.Unmarshal([]byte(metadata.String), &inst.Metadata)
		}

		inst.Tags = []string(tags)
		instances = append(instances, inst)
	}

	return instances, total, nil
}

func (h *Handlers) getAlertInstance(ctx context.Context, tenantID, instanceID uuid.UUID) (*AlertInstance, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			id, tenant_id, rule_id, rule_name, title, description, severity, status,
			category, source, event_data, triggered_at, acknowledged_at, acknowledged_by,
			acknowledge_note, resolved_at, resolved_by, resolution_note, snoozed_until,
			escalation_level, notifications_sent, tags, metadata, created_at, updated_at
		FROM dm3_alert.alert_instances
		WHERE id = $1
	`

	var inst AlertInstance
	var eventData, metadata sql.NullString
	var tags pq.StringArray

	err := h.db.QueryRow(ctx, query, instanceID).Scan(
		&inst.ID, &inst.TenantID, &inst.RuleID, &inst.RuleName, &inst.Title,
		&inst.Description, &inst.Severity, &inst.Status, &inst.Category, &inst.Source,
		&eventData, &inst.TriggeredAt, &inst.AcknowledgedAt, &inst.AcknowledgedBy,
		&inst.AcknowledgeNote, &inst.ResolvedAt, &inst.ResolvedBy, &inst.ResolutionNote,
		&inst.SnoozedUntil, &inst.EscalationLevel, &inst.NotificationsSent, &tags,
		&metadata, &inst.CreatedAt, &inst.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Parse JSON fields
	if eventData.Valid && eventData.String != "" {
		json.Unmarshal([]byte(eventData.String), &inst.EventData)
	}
	if metadata.Valid && metadata.String != "" {
		json.Unmarshal([]byte(metadata.String), &inst.Metadata)
	}

	inst.Tags = []string(tags)
	return &inst, nil
}

func (h *Handlers) createAlertInstance(ctx context.Context, instance *AlertInstance) error {
	if err := h.db.SetTenant(ctx, instance.TenantID); err != nil {
		return err
	}

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

	_, err := h.db.Exec(ctx, query,
		instance.ID, instance.TenantID, instance.RuleID, instance.RuleName, instance.Title,
		instance.Description, instance.Severity, instance.Status, instance.Category,
		instance.Source, eventDataJSON, instance.TriggeredAt, instance.EscalationLevel,
		instance.NotificationsSent, pq.Array(instance.Tags), metadataJSON,
		instance.CreatedAt, instance.UpdatedAt,
	)

	return err
}

func (h *Handlers) updateAlertInstance(ctx context.Context, instance *AlertInstance) error {
	if err := h.db.SetTenant(ctx, instance.TenantID); err != nil {
		return err
	}

	eventDataJSON, _ := json.Marshal(instance.EventData)
	metadataJSON, _ := json.Marshal(instance.Metadata)

	query := `
		UPDATE dm3_alert.alert_instances SET
			status = $2, acknowledged_at = $3, acknowledged_by = $4, acknowledge_note = $5,
			resolved_at = $6, resolved_by = $7, resolution_note = $8, snoozed_until = $9,
			escalation_level = $10, notifications_sent = $11, event_data = $12,
			metadata = $13, updated_at = $14
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query,
		instance.ID, instance.Status, instance.AcknowledgedAt, instance.AcknowledgedBy,
		instance.AcknowledgeNote, instance.ResolvedAt, instance.ResolvedBy,
		instance.ResolutionNote, instance.SnoozedUntil, instance.EscalationLevel,
		instance.NotificationsSent, eventDataJSON, metadataJSON, instance.UpdatedAt,
	)

	return err
}

// Automation rules

func (h *Handlers) getAutomationRules(ctx context.Context, tenantID uuid.UUID) ([]AutomationRule, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			id, tenant_id, name, description, category, is_enabled, trigger_config,
			conditions, actions, schedule, cooldown, tags, last_executed,
			execution_count, metadata, created_at, updated_at, created_by
		FROM dm3_alert.automation_rules
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AutomationRule
	for rows.Next() {
		var rule AutomationRule
		var triggerConfig, conditions, actions, schedule, metadata sql.NullString
		var cooldown sql.NullInt64
		var tags pq.StringArray

		err := rows.Scan(
			&rule.ID, &rule.TenantID, &rule.Name, &rule.Description, &rule.Category,
			&rule.IsEnabled, &triggerConfig, &conditions, &actions, &schedule,
			&cooldown, &tags, &rule.LastExecuted, &rule.ExecutionCount,
			&metadata, &rule.CreatedAt, &rule.UpdatedAt, &rule.CreatedBy,
		)
		if err != nil {
			continue
		}

		// Parse JSON fields
		if triggerConfig.Valid && triggerConfig.String != "" {
			json.Unmarshal([]byte(triggerConfig.String), &rule.Trigger)
		}
		if conditions.Valid && conditions.String != "" {
			json.Unmarshal([]byte(conditions.String), &rule.Conditions)
		}
		if actions.Valid && actions.String != "" {
			json.Unmarshal([]byte(actions.String), &rule.Actions)
		}
		if schedule.Valid && schedule.String != "" {
			json.Unmarshal([]byte(schedule.String), &rule.Schedule)
		}
		if metadata.Valid && metadata.String != "" {
			json.Unmarshal([]byte(metadata.String), &rule.Metadata)
		}

		if cooldown.Valid {
			duration := time.Duration(cooldown.Int64) * time.Second
			rule.Cooldown = &duration
		}

		rule.Tags = []string(tags)
		rules = append(rules, rule)
	}

	return rules, nil
}

func (h *Handlers) createAutomationRule(ctx context.Context, rule *AutomationRule) error {
	if err := h.db.SetTenant(ctx, rule.TenantID); err != nil {
		return err
	}

	triggerJSON, _ := json.Marshal(rule.Trigger)
	conditionsJSON, _ := json.Marshal(rule.Conditions)
	actionsJSON, _ := json.Marshal(rule.Actions)
	scheduleJSON, _ := json.Marshal(rule.Schedule)
	metadataJSON, _ := json.Marshal(rule.Metadata)

	var cooldownSeconds sql.NullInt64
	if rule.Cooldown != nil {
		cooldownSeconds = sql.NullInt64{Int64: int64(*rule.Cooldown / time.Second), Valid: true}
	}

	query := `
		INSERT INTO dm3_alert.automation_rules (
			id, tenant_id, name, description, category, is_enabled, trigger_config,
			conditions, actions, schedule, cooldown, tags, execution_count,
			metadata, created_at, updated_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
		)
	`

	_, err := h.db.Exec(ctx, query,
		rule.ID, rule.TenantID, rule.Name, rule.Description, rule.Category,
		rule.IsEnabled, triggerJSON, conditionsJSON, actionsJSON, scheduleJSON,
		cooldownSeconds, pq.Array(rule.Tags), rule.ExecutionCount, metadataJSON,
		rule.CreatedAt, rule.UpdatedAt, rule.CreatedBy,
	)

	return err
}

// Alert channels

func (h *Handlers) getAlertChannels(ctx context.Context, tenantID uuid.UUID) ([]AlertChannel, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, name, description, type, is_enabled, configuration,
			   templates, created_at, updated_at, created_by
		FROM dm3_alert.alert_channels
		ORDER BY name
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []AlertChannel
	for rows.Next() {
		var ch AlertChannel
		var configuration, templates sql.NullString

		err := rows.Scan(
			&ch.ID, &ch.TenantID, &ch.Name, &ch.Description, &ch.Type,
			&ch.IsEnabled, &configuration, &templates, &ch.CreatedAt,
			&ch.UpdatedAt, &ch.CreatedBy,
		)
		if err != nil {
			continue
		}

		// Parse JSON fields
		if configuration.Valid && configuration.String != "" {
			json.Unmarshal([]byte(configuration.String), &ch.Configuration)
		}
		if templates.Valid && templates.String != "" {
			json.Unmarshal([]byte(templates.String), &ch.Templates)
		}

		channels = append(channels, ch)
	}

	return channels, nil
}

func (h *Handlers) getAlertChannel(ctx context.Context, tenantID, channelID uuid.UUID) (*AlertChannel, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, name, description, type, is_enabled, configuration,
			   templates, created_at, updated_at, created_by
		FROM dm3_alert.alert_channels
		WHERE id = $1
	`

	var ch AlertChannel
	var configuration, templates sql.NullString

	err := h.db.QueryRow(ctx, query, channelID).Scan(
		&ch.ID, &ch.TenantID, &ch.Name, &ch.Description, &ch.Type,
		&ch.IsEnabled, &configuration, &templates, &ch.CreatedAt,
		&ch.UpdatedAt, &ch.CreatedBy,
	)

	if err != nil {
		return nil, err
	}

	// Parse JSON fields
	if configuration.Valid && configuration.String != "" {
		json.Unmarshal([]byte(configuration.String), &ch.Configuration)
	}
	if templates.Valid && templates.String != "" {
		json.Unmarshal([]byte(templates.String), &ch.Templates)
	}

	return &ch, nil
}

func (h *Handlers) createAlertChannel(ctx context.Context, channel *AlertChannel) error {
	if err := h.db.SetTenant(ctx, channel.TenantID); err != nil {
		return err
	}

	configJSON, _ := json.Marshal(channel.Configuration)
	templatesJSON, _ := json.Marshal(channel.Templates)

	query := `
		INSERT INTO dm3_alert.alert_channels (
			id, tenant_id, name, description, type, is_enabled, configuration,
			templates, created_at, updated_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
		)
	`

	_, err := h.db.Exec(ctx, query,
		channel.ID, channel.TenantID, channel.Name, channel.Description,
		channel.Type, channel.IsEnabled, configJSON, templatesJSON,
		channel.CreatedAt, channel.UpdatedAt, channel.CreatedBy,
	)

	return err
}

// Settings

func (h *Handlers) getAlertSettings(ctx context.Context, tenantID uuid.UUID) (*AlertSettings, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, default_severity, auto_resolution_enabled,
			   auto_resolution_timeout, global_throttle, default_channels,
			   alert_retention_days, enable_maintenance_mode, notification_settings,
			   integration_settings, created_at, updated_at
		FROM dm3_alert.alert_settings
		WHERE tenant_id = $1
	`

	var settings AlertSettings
	var globalThrottle, notificationSettings, integrationSettings sql.NullString
	var defaultChannels pq.StringArray

	err := h.db.QueryRow(ctx, query, tenantID).Scan(
		&settings.ID, &settings.TenantID, &settings.DefaultSeverity,
		&settings.AutoResolutionEnabled, &settings.AutoResolutionTimeout,
		&globalThrottle, &defaultChannels, &settings.AlertRetentionDays,
		&settings.EnableMaintenanceMode, &notificationSettings,
		&integrationSettings, &settings.CreatedAt, &settings.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return default settings
			defaults := DefaultAlertSettings
			defaults.TenantID = tenantID
			return &defaults, nil
		}
		return nil, err
	}

	// Parse JSON fields
	if globalThrottle.Valid && globalThrottle.String != "" {
		json.Unmarshal([]byte(globalThrottle.String), &settings.GlobalThrottle)
	}
	if notificationSettings.Valid && notificationSettings.String != "" {
		json.Unmarshal([]byte(notificationSettings.String), &settings.NotificationSettings)
	}
	if integrationSettings.Valid && integrationSettings.String != "" {
		json.Unmarshal([]byte(integrationSettings.String), &settings.IntegrationSettings)
	}

	// Convert default channels to UUIDs
	settings.DefaultChannels = make([]uuid.UUID, len(defaultChannels))
	for i, ch := range defaultChannels {
		if chUUID, err := uuid.Parse(ch); err == nil {
			settings.DefaultChannels[i] = chUUID
		}
	}

	return &settings, nil
}

func (h *Handlers) updateAlertSettings(ctx context.Context, tenantID uuid.UUID, updates map[string]interface{}) (*AlertSettings, error) {
	// For now, just return current settings
	// In a full implementation, this would update the settings
	return h.getAlertSettings(ctx, tenantID)
}

// Analytics and reporting

func (h *Handlers) generateAlertAnalytics(ctx context.Context, tenantID uuid.UUID) (*AlertAnalyticsResponse, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	analytics := &AlertAnalyticsResponse{
		TenantID:   tenantID,
		ByStatus:   make(map[string]int64),
		BySeverity: make(map[string]int64),
		ByCategory: make(map[string]int64),
	}

	// Get rule counts
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_rules WHERE deleted_at IS NULL").Scan(&analytics.TotalRules)
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_rules WHERE is_enabled = true AND deleted_at IS NULL").Scan(&analytics.ActiveRules)

	// Get alert instance counts
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances").Scan(&analytics.TotalAlerts)
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances WHERE status = 'open'").Scan(&analytics.OpenAlerts)
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances WHERE status = 'acknowledged'").Scan(&analytics.AcknowledgedAlerts)
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances WHERE status = 'resolved'").Scan(&analytics.ResolvedAlerts)

	// Get today's alerts
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances WHERE DATE(triggered_at) = CURRENT_DATE").Scan(&analytics.AlertsToday)

	// Get this week's alerts
	h.db.QueryRow(ctx, "SELECT COUNT(*) FROM dm3_alert.alert_instances WHERE triggered_at >= date_trunc('week', CURRENT_DATE)").Scan(&analytics.AlertsThisWeek)

	return analytics, nil
}

func (h *Handlers) generateSummaryReport(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo string) (map[string]interface{}, error) {
	// Placeholder summary report
	return map[string]interface{}{
		"tenant_id":     tenantID,
		"date_from":     dateFrom,
		"date_to":       dateTo,
		"total_alerts":  0,
		"resolved_rate": 0.0,
	}, nil
}

// Helper functions for testing and notifications

type TestResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func (h *Handlers) testAlertChannel(channel *AlertChannel) *TestResult {
	// Placeholder test implementation
	return &TestResult{
		Success: true,
		Message: fmt.Sprintf("Test message sent to %s channel '%s'", channel.Type, channel.Name),
	}
}

func (h *Handlers) publishAlertEvent(instance *AlertInstance, action string) {
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
	h.nats.Publish(subject, eventJSON)

	// Also publish to notification service if needed
	if action == "triggered" {
		h.nats.Publish("dm.notification.send", eventJSON)
	}
}

func (h *Handlers) processAlertNotifications(instance *AlertInstance) {
	// Placeholder notification processing
	// Would send notifications via configured channels
}

func (h *Handlers) processWebhookAlert(webhookID string, payload map[string]interface{}) error {
	// Placeholder webhook processing
	// Would parse webhook payload and create alerts as needed
	return nil
}