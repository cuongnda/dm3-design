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

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	bufferSize    = 10000
	batchSize     = 50
	flushInterval = 100 * time.Millisecond
)

// ContextExtractor extracts actor and tenant information from a request context.
// Register one at startup via SetContextExtractor to avoid an import cycle
// between pkg/audit and internal/authsvc.
type ContextExtractor struct {
	// ActorFromContext returns the actor_id and actor_email for the current user.
	ActorFromContext func(ctx context.Context) (actorID, actorEmail string)
	// CompanyIDFromContext returns the tenant_id for the current user.
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

// Logger writes audit entries asynchronously via a buffered channel.
type Logger struct {
	pool    *pgxpool.Pool
	service string
	ch      chan Entry
	wg      sync.WaitGroup
	done    chan struct{}
}

// New creates an audit logger for the given service.
// It starts a background goroutine that batch-inserts entries.
// Call Close() during shutdown to flush remaining entries.
func New(pool *pgxpool.Pool, serviceName string) *Logger {
	l := &Logger{
		pool:    pool,
		service: serviceName,
		ch:      make(chan Entry, bufferSize),
		done:    make(chan struct{}),
	}
	l.wg.Add(1)
	go l.run()
	return l
}

// Log enqueues an audit entry for async write.
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
	select {
	case l.ch <- e:
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

// run is the background goroutine that batches and flushes entries.
func (l *Logger) run() {
	defer l.wg.Done()
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	batch := make([]Entry, 0, batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := l.insertBatch(ctx, batch); err != nil {
			slog.Error("audit: batch insert failed", "error", err, "count", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case e := <-l.ch:
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-l.done:
			// Drain remaining entries
			for {
				select {
				case e := <-l.ch:
					batch = append(batch, e)
					if len(batch) >= batchSize {
						flush()
					}
				default:
					flush()
					return
				}
			}
		}
	}
}

func (l *Logger) insertBatch(ctx context.Context, batch []Entry) error {
	query := `INSERT INTO dm3_audit.audit_logs
		(tenant_id, actor_id, actor_email, actor_ip, user_agent, service, action,
		 entity_type, entity_id, entity_name, status, old_values, new_values, metadata)
		VALUES `

	args := make([]any, 0, len(batch)*14)
	for i, e := range batch {
		if i > 0 {
			query += ", "
		}
		base := i * 14
		query += "("
		for j := 0; j < 14; j++ {
			if j > 0 {
				query += ", "
			}
			query += "$" + itoa(base+j+1)
		}
		query += ")"

		args = append(args,
			nilIfEmpty(e.TenantID),
			nilIfEmpty(e.ActorID),
			nilIfEmpty(e.ActorEmail),
			nilIP(e.ActorIP),
			nilIfEmpty(e.UserAgent),
			e.Service,
			e.Action,
			e.EntityType,
			nilIfEmpty(e.EntityID),
			nilIfEmpty(e.EntityName),
			e.Status,
			toJSONB(e.OldValues),
			toJSONB(e.NewValues),
			toJSONB(e.Metadata),
		)
	}

	_, err := l.pool.Exec(ctx, query, args...)
	return err
}

// ActorFromContext extracts actor_id and actor_email from the request context
// using the registered ContextExtractor. Returns empty strings if none is registered.
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

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nilIP(s string) any {
	if s == "" {
		return nil
	}
	// Validate it's a real IP before inserting into INET column
	if net.ParseIP(s) == nil {
		return nil
	}
	return s
}

func toJSONB(v any) any {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" || string(b) == "{}" {
		return nil
	}
	return b
}

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

func itoa(i int) string {
	// Simple int to ASCII for parameter placeholders
	if i < 10 {
		return string(rune('0' + i))
	}
	if i < 100 {
		return string([]byte{byte('0' + i/10), byte('0' + i%10)})
	}
	// Fallback for 100+
	s := ""
	for i > 0 {
		s = string(rune('0'+i%10)) + s
		i /= 10
	}
	return s
}
