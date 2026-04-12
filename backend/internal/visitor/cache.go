package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// UserInfo holds cached user data for host resolution.
type UserInfo struct {
	ID           string
	Name         string
	Email        string
	DepartmentID string
	Department   string
}

// ZoneInfo holds cached zone data for access area resolution.
type ZoneInfo struct {
	ID   string
	Name string
}

// LookupCache provides fast user and zone lookups via NATS event subscriptions
// with DB fallback for cache misses.
type LookupCache struct {
	mu    sync.RWMutex
	users map[string]*UserInfo // key: user_id
	zones map[string]*ZoneInfo // key: zone_id
	db    *db.DB
}

// NewLookupCache constructs a LookupCache backed by the given database.
func NewLookupCache(database *db.DB) *LookupCache {
	return &LookupCache{
		users: make(map[string]*UserInfo),
		zones: make(map[string]*ZoneInfo),
		db:    database,
	}
}

// GetUser returns user info from cache, falling back to DB on a cache miss.
// Returns nil if the user cannot be found.
func (c *LookupCache) GetUser(ctx context.Context, userID string) *UserInfo {
	if userID == "" {
		return nil
	}

	c.mu.RLock()
	u, ok := c.users[userID]
	c.mu.RUnlock()
	if ok {
		return u
	}

	// DB fallback with bounded timeout.
	dbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var info UserInfo
	var deptID, deptName *string
	err := c.db.Pool.QueryRow(dbCtx, `
		SELECT u.id::text, COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''),
		       COALESCE(u.email,''), u.department_id::text, COALESCE(d.name,'')
		FROM dm3_identity.users u
		LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
		WHERE u.id = $1::uuid`, userID,
	).Scan(&info.ID, &info.Name, &info.Email, &deptID, &deptName)
	if err != nil {
		slog.Debug("lookup cache: user not found in db", "user_id", userID, "error", err)
		return nil
	}
	if deptID != nil {
		info.DepartmentID = *deptID
	}
	if deptName != nil {
		info.Department = *deptName
	}

	c.mu.Lock()
	c.users[userID] = &info
	c.mu.Unlock()

	return &info
}

// GetZone returns zone info from cache, falling back to DB on a cache miss.
// Returns nil if the zone cannot be found.
func (c *LookupCache) GetZone(ctx context.Context, zoneID string) *ZoneInfo {
	if zoneID == "" {
		return nil
	}

	c.mu.RLock()
	z, ok := c.zones[zoneID]
	c.mu.RUnlock()
	if ok {
		return z
	}

	dbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var info ZoneInfo
	err := c.db.Pool.QueryRow(dbCtx,
		`SELECT id::text, name FROM dm3_access.zones WHERE id = $1::uuid`, zoneID,
	).Scan(&info.ID, &info.Name)
	if err != nil {
		slog.Debug("lookup cache: zone not found in db", "zone_id", zoneID, "error", err)
		return nil
	}

	c.mu.Lock()
	c.zones[zoneID] = &info
	c.mu.Unlock()

	return &info
}

// userEventPayload matches the payload published by identity-svc for user events.
type userEventPayload struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
}

// zoneEventPayload matches the payload published by access-svc for zone events.
type zoneEventPayload struct {
	ZoneID   string `json:"zone_id"`
	TenantID string `json:"tenant_id"`
	Name     string `json:"name"`
}

// handleUserEvent processes a NATS user event to update or evict the cache entry.
func (c *LookupCache) handleUserEvent(subject string, data []byte) {
	var payload userEventPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("lookup cache: failed to unmarshal user event", "subject", subject, "error", err)
		return
	}
	if payload.UserID == "" {
		return
	}

	if strings.HasSuffix(subject, ".deleted") {
		c.mu.Lock()
		delete(c.users, payload.UserID)
		c.mu.Unlock()
		slog.Debug("lookup cache: evicted user", "user_id", payload.UserID)
		return
	}

	// For created/updated: upsert with the data we have from the event.
	// Department info is not in the event payload, so we evict the entry to
	// force a fresh DB lookup on next access rather than storing stale data.
	c.mu.Lock()
	delete(c.users, payload.UserID)
	c.mu.Unlock()
	slog.Debug("lookup cache: invalidated user on event", "subject", subject, "user_id", payload.UserID)
}

// handleZoneEvent processes a NATS zone event to update or evict the cache entry.
func (c *LookupCache) handleZoneEvent(subject string, data []byte) {
	var payload zoneEventPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("lookup cache: failed to unmarshal zone event", "subject", subject, "error", err)
		return
	}
	if payload.ZoneID == "" {
		return
	}

	if strings.HasSuffix(subject, ".deleted") {
		c.mu.Lock()
		delete(c.zones, payload.ZoneID)
		c.mu.Unlock()
		slog.Debug("lookup cache: evicted zone", "zone_id", payload.ZoneID)
		return
	}

	// For created/updated: upsert directly from event payload (zone events include the name).
	c.mu.Lock()
	c.zones[payload.ZoneID] = &ZoneInfo{ID: payload.ZoneID, Name: payload.Name}
	c.mu.Unlock()
	slog.Debug("lookup cache: upserted zone from event", "subject", subject, "zone_id", payload.ZoneID)
}

// Subscribe registers durable JetStream consumers on the IDENTITY and ACCESS streams
// to keep the cache warm.
func (c *LookupCache) Subscribe(ctx context.Context, natsClient *natsutil.Client) error {
	userHandler := func(subject string, data []byte) error {
		c.handleUserEvent(subject, data)
		return nil
	}
	if err := natsClient.Subscribe(ctx, "IDENTITY", "visitor-svc-cache", "dm3.identity.*.user.*", userHandler); err != nil {
		return err
	}
	slog.Info("lookup cache: subscribed to user events", "stream", "IDENTITY", "filter", "dm3.identity.*.user.*")

	zoneHandler := func(subject string, data []byte) error {
		c.handleZoneEvent(subject, data)
		return nil
	}
	if err := natsClient.Subscribe(ctx, "ACCESS", "visitor-svc-zones", "dm3.access.*.zone.*", zoneHandler); err != nil {
		return err
	}
	slog.Info("lookup cache: subscribed to zone events", "stream", "ACCESS", "filter", "dm3.access.*.zone.*")

	return nil
}
