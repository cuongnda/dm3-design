package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// NATS event publishing and notification helpers

func (h *Handlers) publishVisitorEvent(visitor *Visitor, action string) {
	event := VisitorEvent{
		Type:        "visitor",
		TenantID:    visitor.TenantID,
		VisitorID:   visitor.ID,
		Action:      action,
		VisitorName: visitor.FirstName + " " + visitor.LastName,
		HostID:      visitor.HostID,
		HostName:    visitor.HostName,
		HostEmail:   visitor.HostEmail,
		Timestamp:   time.Now(),
		Metadata: map[string]interface{}{
			"visitor_type": visitor.VisitorType,
			"purpose":      visitor.Purpose,
			"company":      visitor.Company,
			"status":       visitor.Status,
		},
	}
	
	// Add action-specific metadata
	switch action {
	case VisitorActionCheckedIn:
		if visitor.CheckedInAt != nil {
			event.Metadata["checked_in_at"] = visitor.CheckedInAt
		}
		if visitor.BadgeNumber != nil {
			event.Metadata["badge_number"] = *visitor.BadgeNumber
		}
	case VisitorActionCheckedOut:
		if visitor.CheckedOutAt != nil {
			event.Metadata["checked_out_at"] = visitor.CheckedOutAt
		}
		// Calculate visit duration
		if visitor.CheckedInAt != nil && visitor.CheckedOutAt != nil {
			duration := visitor.CheckedOutAt.Sub(*visitor.CheckedInAt)
			event.Metadata["visit_duration_minutes"] = int(duration.Minutes())
		}
	}
	
	eventJSON, err := json.Marshal(event)
	if err != nil {
		slog.Error("failed to marshal visitor event", "error", err)
		return
	}
	
	// Publish to NATS
	subject := "dm.visitor." + action
	if err := h.nats.Publish(subject, eventJSON); err != nil {
		slog.Error("failed to publish visitor event", "error", err, "subject", subject)
	}
	
	// Also publish to tenant-specific subject
	tenantSubject := "dm." + visitor.TenantID.String() + ".visitor." + action
	if err := h.nats.Publish(tenantSubject, eventJSON); err != nil {
		slog.Error("failed to publish tenant visitor event", "error", err, "subject", tenantSubject)
	}
}

// Notification helpers - these trigger notifications via the notification service

func (h *Handlers) notifyHostPreRegistration(visitor *Visitor) {
	if visitor.HostEmail == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.pre_registered",
		"title":    "New Visitor Pre-Registration",
		"message":  visitor.FirstName + " " + visitor.LastName + " has pre-registered for a visit.",
		"channels": []string{"email", "push"},
		"metadata": map[string]interface{}{
			"visitor_id":   visitor.ID,
			"visitor_name": visitor.FirstName + " " + visitor.LastName,
			"purpose":      visitor.Purpose,
			"scheduled_at": visitor.ScheduledAt,
			"company":      visitor.Company,
		},
	}
	
	// If host is in system, send to user ID, otherwise use email
	if visitor.HostID != nil {
		notification["user_id"] = *visitor.HostID
	} else {
		notification["email"] = *visitor.HostEmail
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyHostVisitorApproved(visitor *Visitor) {
	if visitor.HostEmail == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.approved",
		"title":    "Visitor Approved",
		"message":  visitor.FirstName + " " + visitor.LastName + " has been automatically approved for their visit.",
		"channels": []string{"push"},
		"metadata": map[string]interface{}{
			"visitor_id":   visitor.ID,
			"visitor_name": visitor.FirstName + " " + visitor.LastName,
			"purpose":      visitor.Purpose,
			"valid_until":  visitor.ValidUntil,
		},
	}
	
	if visitor.HostID != nil {
		notification["user_id"] = *visitor.HostID
	} else {
		notification["email"] = *visitor.HostEmail
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyHostVisitorCheckedIn(visitor *Visitor) {
	if visitor.HostEmail == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.arrival",
		"title":    "Visitor Arrived",
		"message":  visitor.FirstName + " " + visitor.LastName + " has checked in and is waiting for you.",
		"channels": []string{"push", "email"},
		"metadata": map[string]interface{}{
			"visitor_id":     visitor.ID,
			"visitor_name":   visitor.FirstName + " " + visitor.LastName,
			"purpose":        visitor.Purpose,
			"checked_in_at":  visitor.CheckedInAt,
			"badge_number":   visitor.BadgeNumber,
		},
	}
	
	if visitor.HostID != nil {
		notification["user_id"] = *visitor.HostID
	} else {
		notification["email"] = *visitor.HostEmail
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyVisitorApproved(visitor *Visitor) {
	if visitor.Email == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.approved",
		"title":    "Visit Approved",
		"message":  "Your visit has been approved. Please check in at reception when you arrive.",
		"channels": []string{"email"},
		"email":    *visitor.Email,
		"metadata": map[string]interface{}{
			"visitor_id":   visitor.ID,
			"visitor_name": visitor.FirstName + " " + visitor.LastName,
			"host_name":    visitor.HostName,
			"valid_until":  visitor.ValidUntil,
		},
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyVisitorRejected(visitor *Visitor) {
	if visitor.Email == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.rejected",
		"title":    "Visit Request Declined",
		"message":  "Unfortunately, your visit request has been declined. Please contact your host for more information.",
		"channels": []string{"email"},
		"email":    *visitor.Email,
		"metadata": map[string]interface{}{
			"visitor_id":   visitor.ID,
			"visitor_name": visitor.FirstName + " " + visitor.LastName,
			"host_name":    visitor.HostName,
		},
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyVisitorExpired(visitor *Visitor) {
	if visitor.HostEmail == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.expired",
		"title":    "Visitor Authorization Expired",
		"message":  visitor.FirstName + " " + visitor.LastName + "'s visit authorization has expired.",
		"channels": []string{"push"},
		"metadata": map[string]interface{}{
			"visitor_id":   visitor.ID,
			"visitor_name": visitor.FirstName + " " + visitor.LastName,
			"expired_at":   visitor.ValidUntil,
		},
	}
	
	if visitor.HostID != nil {
		notification["user_id"] = *visitor.HostID
	} else {
		notification["email"] = *visitor.HostEmail
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

func (h *Handlers) notifyVisitorOverstay(visitor *Visitor, overstayDuration time.Duration) {
	if visitor.HostEmail == nil {
		return
	}
	
	notification := map[string]interface{}{
		"type":     "visitor.overstay",
		"title":    "Visitor Overstay Alert",
		"message":  visitor.FirstName + " " + visitor.LastName + " has been on-site longer than expected.",
		"channels": []string{"push", "email"},
		"metadata": map[string]interface{}{
			"visitor_id":        visitor.ID,
			"visitor_name":      visitor.FirstName + " " + visitor.LastName,
			"checked_in_at":     visitor.CheckedInAt,
			"overstay_duration": int(overstayDuration.Hours()),
		},
	}
	
	if visitor.HostID != nil {
		notification["user_id"] = *visitor.HostID
	} else {
		notification["email"] = *visitor.HostEmail
	}
	
	h.sendNotification(visitor.TenantID, notification)
}

// Helper to send notification via NATS to notification service
func (h *Handlers) sendNotification(tenantID uuid.UUID, notification map[string]interface{}) {
	notificationEvent := map[string]interface{}{
		"type":      "send_notification",
		"tenant_id": tenantID,
		"timestamp": time.Now(),
		"data":      notification,
	}
	
	eventJSON, err := json.Marshal(notificationEvent)
	if err != nil {
		slog.Error("failed to marshal notification event", "error", err)
		return
	}
	
	subject := "dm.notification.send"
	if err := h.nats.Publish(subject, eventJSON); err != nil {
		slog.Error("failed to send notification", "error", err, "subject", subject)
	}
}

// Background job to expire visitors and check for overstays
func (h *Handlers) StartVisitorMaintenanceJobs() {
	go h.runVisitorExpirationJob()
	go h.runOverstayCheckJob()
}

func (h *Handlers) runVisitorExpirationJob() {
	ticker := time.NewTicker(1 * time.Hour) // Check every hour
	defer ticker.Stop()
	
	for range ticker.C {
		h.expireVisitors()
	}
}

func (h *Handlers) runOverstayCheckJob() {
	ticker := time.NewTicker(30 * time.Minute) // Check every 30 minutes
	defer ticker.Stop()
	
	for range ticker.C {
		h.checkForOverstays()
	}
}

func (h *Handlers) expireVisitors() {
	ctx := context.Background()
	
	// Find visitors whose authorization has expired
	query := `
		UPDATE dm3_visitor.visitors
		SET status = 'expired', updated_at = now()
		WHERE status IN ('approved', 'waiting') 
		  AND valid_until < now()
		  AND deleted_at IS NULL
		RETURNING id, tenant_id, first_name, last_name, host_id, host_name, host_email, valid_until
	`
	
	rows, err := h.db.Pool.Query(ctx, query)
	if err != nil {
		slog.Error("failed to expire visitors", "error", err)
		return
	}
	defer rows.Close()
	
	var expiredCount int
	for rows.Next() {
		var visitor Visitor
		err := rows.Scan(
			&visitor.ID, &visitor.TenantID, &visitor.FirstName, &visitor.LastName,
			&visitor.HostID, &visitor.HostName, &visitor.HostEmail, &visitor.ValidUntil,
		)
		if err != nil {
			continue
		}
		
		expiredCount++
		visitor.Status = VisitorStatusExpired
		
		// Publish event and notify
		go h.publishVisitorEvent(&visitor, VisitorActionExpired)
		go h.notifyVisitorExpired(&visitor)
	}
	
	if expiredCount > 0 {
		slog.Info("expired visitors", "count", expiredCount)
	}
}

func (h *Handlers) checkForOverstays() {
	ctx := context.Background()
	
	// Find visitors who have been checked in for more than expected duration
	// Default overstay threshold: 8 hours
	overstayThreshold := 8 * time.Hour
	
	query := `
		SELECT v.id, v.tenant_id, v.first_name, v.last_name, v.host_id, v.host_name, 
		       v.host_email, v.checked_in_at, s.max_visit_duration
		FROM dm3_visitor.visitors v
		LEFT JOIN dm3_visitor.visitor_settings s ON v.tenant_id = s.tenant_id
		WHERE v.status = 'checked_in' 
		  AND v.checked_in_at < now() - COALESCE(s.max_visit_duration * interval '1 hour', interval '8 hours')
		  AND v.deleted_at IS NULL
		  AND (v.metadata->>'overstay_notified_at' IS NULL 
		       OR (v.metadata->>'overstay_notified_at')::timestamp < now() - interval '2 hours')
	`
	
	rows, err := h.db.Pool.Query(ctx, query)
	if err != nil {
		slog.Error("failed to check for overstays", "error", err)
		return
	}
	defer rows.Close()
	
	var overstayCount int
	for rows.Next() {
		var visitor Visitor
		var maxVisitDuration *int
		
		err := rows.Scan(
			&visitor.ID, &visitor.TenantID, &visitor.FirstName, &visitor.LastName,
			&visitor.HostID, &visitor.HostName, &visitor.HostEmail, &visitor.CheckedInAt,
			&maxVisitDuration,
		)
		if err != nil {
			continue
		}
		
		// Calculate actual overstay duration
		var threshold time.Duration
		if maxVisitDuration != nil {
			threshold = time.Duration(*maxVisitDuration) * time.Hour
		} else {
			threshold = overstayThreshold
		}
		
		if visitor.CheckedInAt != nil {
			overstayDuration := time.Since(*visitor.CheckedInAt) - threshold
			if overstayDuration > 0 {
				overstayCount++
				
				// Mark as notified
				h.markOverstayNotified(ctx, &visitor)
				
				// Notify host
				go h.notifyVisitorOverstay(&visitor, overstayDuration)
			}
		}
	}
	
	if overstayCount > 0 {
		slog.Info("found visitor overstays", "count", overstayCount)
	}
}

func (h *Handlers) markOverstayNotified(ctx context.Context, visitor *Visitor) {
	// Update metadata to mark that overstay notification was sent
	query := `
		UPDATE dm3_visitor.visitors
		SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('overstay_notified_at', now()),
		    updated_at = now()
		WHERE id = $1
	`
	
	_, err := h.db.Pool.Exec(ctx, query, visitor.ID)
	if err != nil {
		slog.Error("failed to mark overstay notified", "error", err, "visitor_id", visitor.ID)
	}
}