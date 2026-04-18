package auditsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/duali/dm3-backend/pkg/audit"
)

// notifyRule defines how an audit action maps to a notification.
type notifyRule struct {
	severity string // critical, warning, info
	titleFn  func(e audit.Entry) string
	msgFn    func(e audit.Entry) string
}

// notifyRules maps audit action → notification rule.
// Only actions in this map generate notifications.
var notifyRules = map[string]notifyRule{
	// ── Auth / Security ──
	"auth.login_failed": {
		severity: "warning",
		titleFn:  func(e audit.Entry) string { return "Failed login attempt" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Failed login for %s", coalesce(e.ActorEmail, e.EntityName, "unknown")) },
	},
	"account.password_change": {
		severity: "info",
		titleFn:  func(e audit.Entry) string { return "Password changed" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Password changed for %s", coalesce(e.ActorEmail, e.EntityName)) },
	},
	"account.create": {
		severity: "info",
		titleFn:  func(e audit.Entry) string { return "New account created" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Account created: %s", coalesce(e.EntityName, e.EntityID)) },
	},
	"account.delete": {
		severity: "warning",
		titleFn:  func(e audit.Entry) string { return "Account deleted" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Account deleted: %s", coalesce(e.EntityName, e.EntityID)) },
	},

	// ── Tenant ──
	"tenant.status_change": {
		severity: "critical",
		titleFn:  func(e audit.Entry) string { return "Tenant status changed" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Tenant %s status changed", coalesce(e.EntityName, e.EntityID)) },
	},

	// ── Device ──
	"device.provision": {
		severity: "info",
		titleFn:  func(e audit.Entry) string { return "New device provisioned" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Device provisioned: %s", coalesce(e.EntityName, e.EntityID)) },
	},
	"device.delete": {
		severity: "warning",
		titleFn:  func(e audit.Entry) string { return "Device removed" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Device removed: %s", coalesce(e.EntityName, e.EntityID)) },
	},
	"device.approve": {
		severity: "info",
		titleFn:  func(e audit.Entry) string { return "Device approved" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Device approved: %s", coalesce(e.EntityName, e.EntityID)) },
	},
	"device.reject": {
		severity: "warning",
		titleFn:  func(e audit.Entry) string { return "Device rejected" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Device rejected: %s", coalesce(e.EntityName, e.EntityID)) },
	},

	// ── Visitor / Watchlist ──
	"watchlist.match": {
		severity: "critical",
		titleFn:  func(e audit.Entry) string { return "Watchlist match detected" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Watchlist match: %s", coalesce(e.EntityName, e.EntityID)) },
	},
	"visit.pre_registered": {
		severity: "info",
		titleFn:  func(e audit.Entry) string { return "New visitor registered" },
		msgFn:    func(e audit.Entry) string { return fmt.Sprintf("Visitor: %s", coalesce(e.EntityName, e.EntityID)) },
	},
}

// maybeCreateNotification checks if an audit entry should generate a notification
// and inserts one into dm3_audit.notifications if so.
func maybeCreateNotification(ctx context.Context, pool *pgxpool.Pool, e audit.Entry) {
	rule, ok := notifyRules[e.Action]
	if !ok {
		return
	}

	// Must have a tenant to create a notification
	if e.TenantID == "" {
		return
	}

	// Only create notifications for successful or failure events, not errors
	if e.Status == "error" {
		return
	}

	title := rule.titleFn(e)
	msg := rule.msgFn(e)

	metaJSON, _ := json.Marshal(map[string]any{
		"audit_action":  e.Action,
		"entity_type":   e.EntityType,
		"entity_id":     e.EntityID,
		"actor_email":   e.ActorEmail,
	})

	_, err := pool.Exec(ctx,
		`INSERT INTO dm3_audit.notifications
			(tenant_id, title, message, type, severity, source, reference_type, reference_id, metadata)
		 VALUES ($1::uuid, $2, $3, 'alert', $4, $5, $6, $7, $8::jsonb)`,
		e.TenantID, title, msg, rule.severity,
		e.Service, e.EntityType, e.EntityID, string(metaJSON),
	)
	if err != nil {
		slog.Warn("notify: failed to create notification", "error", err, "action", e.Action)
	}
}

func coalesce(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return "—"
}
