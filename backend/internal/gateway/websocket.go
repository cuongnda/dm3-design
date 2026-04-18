package gateway

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/duali/dm3-backend/internal/authsvc"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser clients (e.g. curl, device SDKs)
		}
		allowed := os.Getenv("WS_ALLOWED_ORIGINS")
		if allowed == "" {
			// Default: allow localhost dev and same-origin
			allowed = "http://localhost:3000,http://localhost:5173"
		}
		for _, o := range strings.Split(allowed, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		slog.Warn("ws origin rejected", "origin", origin)
		return false
	},
}

// WSEvent is sent to WebSocket clients.
type WSEvent struct {
	Type     string          `json:"type"`
	DeviceID string          `json:"device_id"`
	TenantID string          `json:"tenant_id"`
	Data     json.RawMessage `json:"data"`
	Time     time.Time       `json:"time"`
}

// wsClient wraps a WebSocket connection with its own write mutex so that
// concurrent Broadcast calls never race on a single connection.
type wsClient struct {
	conn     *websocket.Conn
	writeMu  sync.Mutex
	tenantID string // scoped from JWT claims at connection time
}

const wsWriteTimeout = 10 * time.Second

func (c *wsClient) write(data []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// EventHub manages WebSocket clients and broadcasts events.
type EventHub struct {
	clients map[*wsClient]bool
	mu      sync.RWMutex
}

func NewEventHub() *EventHub {
	return &EventHub{clients: make(map[*wsClient]bool)}
}

const (
	pongWait   = 60 * time.Second
	pingPeriod = 50 * time.Second
)

func (h *EventHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "error", err)
		return
	}

	// Extract tenant from JWT claims set by auth middleware.
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	client := &wsClient{conn: conn, tenantID: tenantID}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	slog.Info("ws client connected", "remote", conn.RemoteAddr(), "tenant_id", tenantID)

	// Read pump — detects disconnect and removes the client.
	go func() {
		defer func() {
			h.mu.Lock()
			delete(h.clients, client)
			h.mu.Unlock()
			conn.Close()
			slog.Info("ws client disconnected", "remote", conn.RemoteAddr(), "tenant_id", tenantID)
		}()

		conn.SetReadDeadline(time.Now().Add(pongWait))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Ping pump — sends periodic pings to detect dead connections.
	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				client.writeMu.Lock()
				_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				err := conn.WriteMessage(websocket.PingMessage, nil)
				client.writeMu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()
}

// Broadcast sends evt to all connected clients whose tenantID matches the event.
// It snapshots the client list under a read lock, then writes to each
// client using its own per-connection mutex (no lock held during I/O).
// Failed clients are removed in a single write-lock pass at the end.
func (h *EventHub) Broadcast(evt WSEvent) {
	data, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := make([]*wsClient, 0, len(h.clients))
	for c := range h.clients {
		// Only send to clients in the same tenant
		if c.tenantID != "" && c.tenantID != evt.TenantID {
			continue
		}
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	var failed []*wsClient
	for _, c := range clients {
		if err := c.write(data); err != nil {
			slog.Debug("ws write failed, removing client", "error", err)
			failed = append(failed, c)
		}
	}

	if len(failed) > 0 {
		h.mu.Lock()
		for _, c := range failed {
			delete(h.clients, c)
			c.conn.Close()
		}
		h.mu.Unlock()
	}
}

func (h *EventHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
