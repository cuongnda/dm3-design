package gateway

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
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
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (c *wsClient) write(data []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
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

func (h *EventHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "error", err)
		return
	}

	client := &wsClient{conn: conn}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	slog.Info("ws client connected", "remote", conn.RemoteAddr())

	// Read pump — detects disconnect and removes the client.
	go func() {
		defer func() {
			h.mu.Lock()
			delete(h.clients, client)
			h.mu.Unlock()
			conn.Close()
			slog.Info("ws client disconnected", "remote", conn.RemoteAddr())
		}()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}

// Broadcast sends evt to all connected clients.
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
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	var failed []*wsClient
	for _, c := range clients {
		if err := c.write(data); err != nil {
			slog.Debug("ws write failed, removing client", "error", err)
			c.conn.Close()
			failed = append(failed, c)
		}
	}

	if len(failed) > 0 {
		h.mu.Lock()
		for _, c := range failed {
			delete(h.clients, c)
		}
		h.mu.Unlock()
	}
}

func (h *EventHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
