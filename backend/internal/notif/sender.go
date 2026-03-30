package notif

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// sendNotification orchestrates sending a notification across multiple channels
func (h *Handlers) sendNotification(notif *Notification) {
	ctx := context.Background()
	sentAt := time.Now()
	
	// Check user preferences to determine which channels to actually use
	if notif.UserID != nil {
		prefs, err := h.getNotificationPreferences(ctx, notif.TenantID, *notif.UserID)
		if err != nil {
			slog.Error("failed to get user preferences", "error", err, "user_id", *notif.UserID)
		} else {
			// Filter channels based on user preferences
			notif.Channels = h.filterChannelsByPreferences(notif.Channels, notif.Type, prefs)
		}
	}
	
	// Check quiet hours
	if notif.UserID != nil && h.isQuietHours(notif.TenantID, *notif.UserID) {
		// During quiet hours, only send critical notifications
		if !h.isCriticalNotification(notif.Type) {
			slog.Info("skipping notification due to quiet hours", "id", notif.ID, "type", notif.Type)
			h.updateNotificationStatus(ctx, notif.ID, StatusDelivered, &sentAt, nil)
			return
		}
	}
	
	var errors []string
	var successCount int
	
	// Send via each enabled channel
	for _, channel := range notif.Channels {
		var err error
		
		switch channel {
		case ChannelEmail:
			err = h.sendEmailNotification(notif)
		case ChannelPush:
			err = h.sendPushNotification(notif)
		case ChannelSMS:
			err = h.sendSMSNotification(notif)
		default:
			slog.Warn("unknown notification channel", "channel", channel)
			continue
		}
		
		if err != nil {
			slog.Error("failed to send notification", "error", err, "channel", channel, "id", notif.ID)
			errors = append(errors, channel+": "+err.Error())
		} else {
			successCount++
		}
	}
	
	// Update notification status
	var status string
	var errorMsg *string
	
	if successCount == 0 {
		status = StatusFailed
		if len(errors) > 0 {
			errStr := errors[0] // Store first error
			errorMsg = &errStr
		}
	} else if len(errors) == 0 {
		status = StatusDelivered
	} else {
		status = StatusSent // Partial success
		if len(errors) > 0 {
			errStr := "partial failure: " + errors[0]
			errorMsg = &errStr
		}
	}
	
	if err := h.updateNotificationStatus(ctx, notif.ID, status, &sentAt, errorMsg); err != nil {
		slog.Error("failed to update notification status", "error", err, "id", notif.ID)
	}
}

func (h *Handlers) filterChannelsByPreferences(channels []string, notifType string, prefs *NotificationPreferences) []string {
	var filtered []string
	
	for _, channel := range channels {
		// Check global channel preferences
		switch channel {
		case ChannelEmail:
			if !prefs.EmailEnabled {
				continue
			}
		case ChannelPush:
			if !prefs.PushEnabled {
				continue
			}
		case ChannelSMS:
			if !prefs.SMSEnabled {
				continue
			}
		}
		
		// Check type-specific preferences
		if typeChannels, exists := prefs.TypePreferences[notifType]; exists {
			found := false
			for _, tc := range typeChannels {
				if tc == channel {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		
		filtered = append(filtered, channel)
	}
	
	return filtered
}

func (h *Handlers) isQuietHours(tenantID, userID uuid.UUID) bool {
	ctx := context.Background()
	prefs, err := h.getNotificationPreferences(ctx, tenantID, userID)
	if err != nil {
		return false
	}
	
	if prefs.QuietHours == nil || !prefs.QuietHours.Enabled {
		return false
	}
	
	now := time.Now()
	// TODO: Implement proper time zone handling based on prefs.QuietHours.Timezone
	currentTime := now.Format("15:04")
	
	return currentTime >= prefs.QuietHours.StartTime && currentTime <= prefs.QuietHours.EndTime
}

func (h *Handlers) isCriticalNotification(notifType string) bool {
	criticalTypes := map[string]bool{
		NotifTypeEmergency:      true,
		NotifTypeAlarmTriggered: true,
		NotifTypeSecurityAlert:  true,
	}
	
	return criticalTypes[notifType]
}

// Channel-specific sending methods

func (h *Handlers) sendEmailNotification(notif *Notification) error {
	// TODO: Implement email sending
	// This would integrate with SMTP server or email service (SendGrid, SES, etc.)
	slog.Info("sending email notification", "id", notif.ID, "title", notif.Title)
	
	// For now, just log and return success
	// In real implementation:
	// - Get user email from notif.UserEmail or lookup by UserID
	// - Apply notification template if available
	// - Send via configured email provider
	// - Handle delivery confirmation/bounces
	
	return nil
}

func (h *Handlers) sendPushNotification(notif *Notification) error {
	// TODO: Implement push notification sending
	// This would integrate with FCM (Firebase) and APNs (Apple)
	slog.Info("sending push notification", "id", notif.ID, "title", notif.Title)
	
	// For now, just log and return success
	// In real implementation:
	// - Get user device tokens from device registration table
	// - Format payload for FCM/APNs
	// - Send to push notification service
	// - Handle token validation/cleanup
	// - Store delivery receipts
	
	return nil
}

func (h *Handlers) sendSMSNotification(notif *Notification) error {
	if !h.sms.enabled {
		slog.Debug("SMS notifications disabled", "id", notif.ID)
		return nil
	}
	
	// TODO: Implement SMS sending
	// This would integrate with Twilio, AWS SNS, or local SMS gateway
	slog.Info("sending SMS notification", "id", notif.ID, "title", notif.Title)
	
	// For now, just log and return success
	// In real implementation:
	// - Get user phone number from user profile
	// - Format message (SMS has character limits)
	// - Send via SMS provider
	// - Handle delivery receipts
	// - Respect SMS rate limits
	
	return nil
}

// Notification delivery tracking

func (h *Handlers) handleDeliveryReceipt(notifID uuid.UUID, channel, status string, deliveredAt *time.Time) {
	ctx := context.Background()
	
	// Update notification delivery status
	// This would be called by webhooks from email/push/SMS providers
	
	query := `
		UPDATE dm3_notif.notifications
		SET status = $2, sent_at = $3, updated_at = now()
		WHERE id = $1
	`
	
	_, err := h.db.Pool.Exec(ctx, query, notifID, status, deliveredAt)
	if err != nil {
		slog.Error("failed to update delivery receipt", "error", err, "id", notifID)
	}
}

// Retry logic for failed notifications

func (h *Handlers) retryFailedNotifications() {
	ctx := context.Background()
	
	// Find failed notifications that should be retried
	query := `
		SELECT id, tenant_id, type, title, message, channels, user_id, user_email, metadata, created_at
		FROM dm3_notif.notifications
		WHERE status = 'failed'
		  AND created_at > now() - interval '24 hours'
		  AND (retry_count IS NULL OR retry_count < 3)
		ORDER BY created_at DESC
		LIMIT 100
	`
	
	rows, err := h.db.Pool.Query(ctx, query)
	if err != nil {
		slog.Error("failed to query failed notifications", "error", err)
		return
	}
	defer rows.Close()
	
	for rows.Next() {
		var notif Notification
		var channelsJSON, metadataJSON []byte
		
		err := rows.Scan(
			&notif.ID, &notif.TenantID, &notif.Type, &notif.Title, &notif.Message,
			&channelsJSON, &notif.UserID, &notif.UserEmail, &metadataJSON, &notif.CreatedAt,
		)
		if err != nil {
			slog.Error("failed to scan failed notification", "error", err)
			continue
		}
		
		// Unmarshal JSON fields
		if len(channelsJSON) > 0 {
			if err := json.Unmarshal(channelsJSON, &notif.Channels); err != nil {
				slog.Error("failed to unmarshal channels", "error", err)
				continue
			}
		}
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &notif.Metadata)
		}
		
		slog.Info("retrying failed notification", "id", notif.ID, "type", notif.Type)
		
		// Increment retry count
		h.db.Pool.Exec(ctx, "UPDATE dm3_notif.notifications SET retry_count = COALESCE(retry_count, 0) + 1 WHERE id = $1", notif.ID)
		
		// Retry sending
		go h.sendNotification(&notif)
	}
}