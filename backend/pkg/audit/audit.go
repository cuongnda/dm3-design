package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const bufferSize = 10000

// Publisher is the interface for publishing audit events to NATS.
// *natsutil.Client satisfies this interface.
type Publisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

// ContextExtractor extracts actor and tenant information from a request context.
// Register one at startup via SetContextExtractor to avoid an import cycle
// between pkg/audit and internal/authsvc.
type ContextExtractor struct {
	ActorFromContext     func(ctx context.Context) (actorID, actorEmail string)
	CompanyIDFromContext func(ctx context.Context) string
}

var globalExtractor ContextExtractor

// SetContextExtractor registers the context extractor used by LogFromRequest and ActorFromContext.
// Call this once during service startup before serving any requests.
func SetContextExtractor(e ContextExtractor) {
	globalExtractor = e
}

// sensitiveFields are excluded from Diff output to prevent leaking secrets.
var sensitiveFields = map[string]bool{
	"password": true, "password_hash": true, "token": true,
	"token_hash": true, "secret": true, "qr_token": true,
	"refresh_token": true, "access_token": true,
}

// Entry represents a single audit log record.
type Entry struct {
	TenantID   string         `json:"tenant_id,omitempty"`
	ActorID    string         `json:"actor_id,omitempty"`
	ActorEmail string         `json:"actor_email,omitempty"`
	ActorIP    string         `json:"actor_ip,omitempty"`
	UserAgent  string         `json:"user_agent,omitempty"`
	Service    string         `json:"service"`
	Action     string         `json:"action"`
	EntityType string         `json:"entity_type"`
	EntityID   string         `json:"entity_id,omitempty"`
	EntityName string         `json:"entity_name,omitempty"`
	Status     string         `json:"status"`
	OldValues  any            `json:"old_values,omitempty"`
	NewValues  any            `json:"new_values,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// Logger publishes audit entries to NATS via a buffered channel.
type Logger struct {
	pub     Publisher
	service string
	subject string
	ch      chan []byte
	wg      sync.WaitGroup
	done    chan struct{}
}

// New creates an audit logger that publishes entries to NATS.
// It starts a background goroutine for non-blocking publishing.
// Call Close() during shutdown to flush remaining entries.
func New(pub Publisher, serviceName string) *Logger {
	l := &Logger{
		pub:     pub,
		service: serviceName,
		subject: "dm3.audit." + serviceName,
		ch:      make(chan []byte, bufferSize),
		done:    make(chan struct{}),
	}
	l.wg.Add(1)
	go l.run()
	return l
}

// Log enqueues an audit entry for async publishing to NATS.
// Non-blocking: drops the entry if the buffer is full.
func (l *Logger) Log(e Entry) {
	if l == nil {
		return
	}
	if e.Service == "" {
		e.Service = l.service
	}
	if e.Status == "" {
		e.Status = "success"
	}
	data, err := json.Marshal(e)
	if err != nil {
		slog.Warn("audit: marshal failed", "error", err, "action", e.Action)
		return
	}
	select {
	case l.ch <- data:
	default:
		slog.Warn("audit: buffer full, dropping entry", "action", e.Action, "entity", e.EntityType)
	}
}

// LogFromRequest extracts actor info from the HTTP request context and logs.
func (l *Logger) LogFromRequest(r *http.Request, action, entityType, entityID, entityName, status string, oldValues, newValues any) {
	if l == nil {
		return
	}
	actorID, actorEmail := ActorFromContext(r.Context())
	var tenantID string
	if globalExtractor.CompanyIDFromContext != nil {
		tenantID = globalExtractor.CompanyIDFromContext(r.Context())
	}

	l.Log(Entry{
		TenantID:   tenantID,
		ActorID:    actorID,
		ActorEmail: actorEmail,
		ActorIP:    IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		EntityName: entityName,
		Status:     status,
		OldValues:  oldValues,
		NewValues:  newValues,
	})
}

// Close flushes pending entries and stops the background goroutine.
func (l *Logger) Close() {
	if l == nil {
		return
	}
	close(l.done)
	l.wg.Wait()
}

// run is the background goroutine that publishes entries to NATS.
func (l *Logger) run() {
	defer l.wg.Done()
	for {
		select {
		case data := <-l.ch:
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			if err := l.pub.Publish(ctx, l.subject, data); err != nil {
				slog.Warn("audit: publish failed", "error", err)
			}
			cancel()
		case <-l.done:
			// Drain remaining entries
			for {
				select {
				case data := <-l.ch:
					ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					_ = l.pub.Publish(ctx, l.subject, data)
					cancel()
				default:
					return
				}
			}
		}
	}
}

// ActorFromContext extracts actor_id and actor_email from the request context.
func ActorFromContext(ctx context.Context) (actorID, actorEmail string) {
	if globalExtractor.ActorFromContext == nil {
		return "", ""
	}
	return globalExtractor.ActorFromContext(ctx)
}

// IPFromRequest extracts the client IP, respecting X-Forwarded-For.
func IPFromRequest(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		ip := strings.TrimSpace(parts[0])
		if net.ParseIP(ip) != nil {
			return ip
		}
	}
	if xff := r.Header.Get("X-Real-Ip"); xff != "" {
		ip := strings.TrimSpace(xff)
		if net.ParseIP(ip) != nil {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Diff computes changed fields between old and new structs (as maps).
// Sensitive fields (password, token, secret) are excluded.
func Diff(old, new any) (oldVals, newVals map[string]any) {
	oldMap := toMap(old)
	newMap := toMap(new)
	if oldMap == nil || newMap == nil {
		return oldMap, newMap
	}

	oldDiff := make(map[string]any)
	newDiff := make(map[string]any)

	for k, nv := range newMap {
		if sensitiveFields[strings.ToLower(k)] {
			continue
		}
		ov, exists := oldMap[k]
		if !exists || !jsonEqual(ov, nv) {
			if exists {
				oldDiff[k] = ov
			}
			newDiff[k] = nv
		}
	}

	if len(oldDiff) == 0 {
		oldDiff = nil
	}
	if len(newDiff) == 0 {
		newDiff = nil
	}
	return oldDiff, newDiff
}

// --- helpers ---

func toMap(v any) map[string]any {
	if v == nil {
		return nil
	}
	if m, ok := v.(map[string]any); ok {
		return m
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}
	return m
}

func jsonEqual(a, b any) bool {
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	return string(aj) == string(bj)
}
