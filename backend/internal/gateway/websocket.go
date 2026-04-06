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
	CompanyID string          `json:"company_id"`
	Data     json.RawMessage `json:"data"`
	Time     time.Time       `json:"time"`
}

// EventHub manages WebSocket clients and broadcasts events.
type EventHub struct {
	clients map[*websocket.Conn]bool
	mu      sync.RWMutex
}

func NewEventHub() *EventHub {
	return &EventHub{clients: make(map[*websocket.Conn]bool)}
}

func (h *EventHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "error", err)
		return
	}

	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()

	slog.Info("ws client connected", "remote", conn.RemoteAddr())

	// Read pump (just to detect disconnect)
	go func() {
		defer func() {
			h.mu.Lock()
			delete(h.clients, conn)
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

func (h *EventHub) Broadcast(evt WSEvent) {
	data, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			slog.Debug("ws write failed, removing client", "error", err)
			conn.Close()
			go func(c *websocket.Conn) {
				h.mu.Lock()
				delete(h.clients, c)
				h.mu.Unlock()
			}(conn)
		}
	}
}

func (h *EventHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
