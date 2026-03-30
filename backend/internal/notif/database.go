package notif

import (
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// Database operations for notifications

func (h *Handlers) storeNotification(ctx context.Context, notif *Notification) error {
	channelsJSON, _ := json.Marshal(notif.Channels)
	metadataJSON, _ := json.Marshal(notif.Metadata)
	
	query := `
		INSERT INTO dm3_notif.notifications 
		(id, tenant_id, type, title, message, channels, user_id, user_email, metadata, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		notif.ID, notif.TenantID, notif.Type, notif.Title, notif.Message,
		channelsJSON, notif.UserID, notif.UserEmail, metadataJSON,
		notif.Status, notif.CreatedAt,
	)
	
	if err != nil {
		slog.Error("failed to store notification", "error", err, "id", notif.ID)
		return err
	}
	
	return nil
}

func (h *Handlers) updateNotificationStatus(ctx context.Context, id uuid.UUID, status string, sentAt *time.Time, errorMsg *string) error {
	query := `
		UPDATE dm3_notif.notifications 
		SET status = $2, sent_at = $3, error = $4, updated_at = now()
		WHERE id = $1
	`
	
	_, err := h.db.Pool.Exec(ctx, query, id, status, sentAt, errorMsg)
	if err != nil {
		slog.Error("failed to update notification status", "error", err, "id", id)
		return err
	}
	
	return nil
}

func (h *Handlers) getNotificationHistory(ctx context.Context, tenantID uuid.UUID, userID, notifType string, limit int) ([]Notification, error) {
	var args []interface{}
	var conditions []string
	argCount := 1
	
	query := `
		SELECT id, tenant_id, type, title, message, channels, user_id, user_email, 
		       metadata, status, sent_at, error, created_at
		FROM dm3_notif.notifications
		WHERE tenant_id = $1
	`
	args = append(args, tenantID)
	argCount++
	
	if userID != "" {
		conditions = append(conditions, "user_id = $"+strconv.Itoa(argCount))
		args = append(args, uuid.MustParse(userID))
		argCount++
	}
	
	if notifType != "" {
		conditions = append(conditions, "type = $"+strconv.Itoa(argCount))
		args = append(args, notifType)
		argCount++
	}
	
	if len(conditions) > 0 {
		query += " AND " + conditions[0]
		for _, cond := range conditions[1:] {
			query += " AND " + cond
		}
	}
	
	query += " ORDER BY created_at DESC LIMIT $" + strconv.Itoa(argCount)
	args = append(args, limit)
	
	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var notifications []Notification
	for rows.Next() {
		var notif Notification
		var channelsJSON, metadataJSON []byte
		
		err := rows.Scan(
			&notif.ID, &notif.TenantID, &notif.Type, &notif.Title, &notif.Message,
			&channelsJSON, &notif.UserID, &notif.UserEmail, &metadataJSON,
			&notif.Status, &notif.SentAt, &notif.Error, &notif.CreatedAt,
		)
		if err != nil {
			slog.Error("failed to scan notification", "error", err)
			continue
		}
		
		json.Unmarshal(channelsJSON, &notif.Channels)
		json.Unmarshal(metadataJSON, &notif.Metadata)
		
		notifications = append(notifications, notif)
	}
	
	return notifications, nil
}

func (h *Handlers) getNotificationPreferences(ctx context.Context, tenantID, userID uuid.UUID) (*NotificationPreferences, error) {
	query := `
		SELECT id, tenant_id, user_id, email_enabled, push_enabled, sms_enabled,
		       type_preferences, quiet_hours, created_at, updated_at
		FROM dm3_notif.notification_preferences
		WHERE tenant_id = $1 AND user_id = $2
	`
	
	var prefs NotificationPreferences
	var typePrefsJSON, quietHoursJSON []byte
	
	err := h.db.Pool.QueryRow(ctx, query, tenantID, userID).Scan(
		&prefs.ID, &prefs.TenantID, &prefs.UserID, &prefs.EmailEnabled,
		&prefs.PushEnabled, &prefs.SMSEnabled, &typePrefsJSON, &quietHoursJSON,
		&prefs.CreatedAt, &prefs.UpdatedAt,
	)
	
	if err != nil {
		// Create default preferences if not found
		if err.Error() == "no rows in result set" {
			return h.createDefaultPreferences(ctx, tenantID, userID)
		}
		return nil, err
	}
	
	json.Unmarshal(typePrefsJSON, &prefs.TypePreferences)
	json.Unmarshal(quietHoursJSON, &prefs.QuietHours)
	
	return &prefs, nil
}

func (h *Handlers) createDefaultPreferences(ctx context.Context, tenantID, userID uuid.UUID) (*NotificationPreferences, error) {
	prefs := &NotificationPreferences{
		ID:           uuid.New(),
		TenantID:     tenantID,
		UserID:       userID,
		EmailEnabled: true,
		PushEnabled:  true,
		SMSEnabled:   false,
		TypePreferences: map[string][]string{
			NotifTypeAccessDenied:   {ChannelPush},
			NotifTypeAlarmTriggered: {ChannelPush, ChannelEmail},
			NotifTypeDeviceOffline:  {ChannelPush},
			NotifTypeVisitorArrival: {ChannelPush},
			NotifTypeEmergency:      {ChannelPush, ChannelEmail, ChannelSMS},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	
	typePrefsJSON, _ := json.Marshal(prefs.TypePreferences)
	
	query := `
		INSERT INTO dm3_notif.notification_preferences
		(id, tenant_id, user_id, email_enabled, push_enabled, sms_enabled, type_preferences, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		prefs.ID, prefs.TenantID, prefs.UserID, prefs.EmailEnabled,
		prefs.PushEnabled, prefs.SMSEnabled, typePrefsJSON,
		prefs.CreatedAt, prefs.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	return prefs, nil
}

func (h *Handlers) updateNotificationPreferences(ctx context.Context, tenantID uuid.UUID, req UpdatePreferencesRequest) error {
	// First, get existing preferences
	existing, err := h.getNotificationPreferences(ctx, tenantID, req.UserID)
	if err != nil {
		return err
	}
	
	// Update fields that are provided
	if req.EmailEnabled != nil {
		existing.EmailEnabled = *req.EmailEnabled
	}
	if req.PushEnabled != nil {
		existing.PushEnabled = *req.PushEnabled
	}
	if req.SMSEnabled != nil {
		existing.SMSEnabled = *req.SMSEnabled
	}
	if req.TypePreferences != nil {
		existing.TypePreferences = *req.TypePreferences
	}
	if req.QuietHours != nil {
		existing.QuietHours = req.QuietHours
	}
	
	typePrefsJSON, _ := json.Marshal(existing.TypePreferences)
	quietHoursJSON, _ := json.Marshal(existing.QuietHours)
	existing.UpdatedAt = time.Now()
	
	query := `
		UPDATE dm3_notif.notification_preferences
		SET email_enabled = $3, push_enabled = $4, sms_enabled = $5,
		    type_preferences = $6, quiet_hours = $7, updated_at = $8
		WHERE tenant_id = $1 AND user_id = $2
	`
	
	_, err = h.db.Pool.Exec(ctx, query,
		tenantID, req.UserID, existing.EmailEnabled, existing.PushEnabled,
		existing.SMSEnabled, typePrefsJSON, quietHoursJSON, existing.UpdatedAt,
	)
	
	return err
}

func (h *Handlers) getNotificationTemplates(ctx context.Context, tenantID uuid.UUID) ([]NotificationTemplate, error) {
	query := `
		SELECT id, tenant_id, name, type, subject, body, channels, variables, created_at, updated_at
		FROM dm3_notif.notification_templates
		WHERE tenant_id = $1
		ORDER BY name
	`
	
	rows, err := h.db.Pool.Query(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var templates []NotificationTemplate
	for rows.Next() {
		var template NotificationTemplate
		var channelsJSON, variablesJSON []byte
		
		err := rows.Scan(
			&template.ID, &template.TenantID, &template.Name, &template.Type,
			&template.Subject, &template.Body, &channelsJSON, &variablesJSON,
			&template.CreatedAt, &template.UpdatedAt,
		)
		if err != nil {
			slog.Error("failed to scan template", "error", err)
			continue
		}
		
		json.Unmarshal(channelsJSON, &template.Channels)
		json.Unmarshal(variablesJSON, &template.Variables)
		
		templates = append(templates, template)
	}
	
	return templates, nil
}

func (h *Handlers) storeNotificationTemplate(ctx context.Context, template *NotificationTemplate) error {
	channelsJSON, _ := json.Marshal(template.Channels)
	variablesJSON, _ := json.Marshal(template.Variables)
	
	query := `
		INSERT INTO dm3_notif.notification_templates
		(id, tenant_id, name, type, subject, body, channels, variables, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		template.ID, template.TenantID, template.Name, template.Type,
		template.Subject, template.Body, channelsJSON, variablesJSON,
		template.CreatedAt, template.CreatedAt,
	)
	
	return err
}

func (h *Handlers) updateNotificationTemplate(ctx context.Context, tenantID, templateID uuid.UUID, req UpdateTemplateRequest) error {
	setParts := []string{}
	args := []interface{}{tenantID, templateID}
	argCount := 3
	
	if req.Name != nil {
		setParts = append(setParts, "name = $"+strconv.Itoa(argCount))
		args = append(args, *req.Name)
		argCount++
	}
	
	if req.Subject != nil {
		setParts = append(setParts, "subject = $"+strconv.Itoa(argCount))
		args = append(args, *req.Subject)
		argCount++
	}
	
	if req.Body != nil {
		setParts = append(setParts, "body = $"+strconv.Itoa(argCount))
		args = append(args, *req.Body)
		argCount++
	}
	
	if req.Channels != nil {
		channelsJSON, _ := json.Marshal(*req.Channels)
		setParts = append(setParts, "channels = $"+strconv.Itoa(argCount))
		args = append(args, channelsJSON)
		argCount++
	}
	
	if req.Variables != nil {
		variablesJSON, _ := json.Marshal(*req.Variables)
		setParts = append(setParts, "variables = $"+strconv.Itoa(argCount))
		args = append(args, variablesJSON)
		argCount++
	}
	
	if len(setParts) == 0 {
		return nil // Nothing to update
	}
	
	setParts = append(setParts, "updated_at = now()")
	
	query := `
		UPDATE dm3_notif.notification_templates
		SET ` + setParts[0]
	
	for _, part := range setParts[1:] {
		query += ", " + part
	}
	
	query += " WHERE tenant_id = $1 AND id = $2"
	
	_, err := h.db.Pool.Exec(ctx, query, args...)
	return err
}