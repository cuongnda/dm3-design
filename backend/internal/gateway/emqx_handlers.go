package gateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// EMQXHandlers proxies EMQX Dashboard REST API to expose MQTT client
// connection details (SSL/TCP, IP, listener, etc.) to the admin UI.
type EMQXHandlers struct {
	apiURL   string
	user     string
	password string

	mu    sync.Mutex
	token string
	expAt time.Time
}

func NewEMQXHandlers(apiURL, user, password string) *EMQXHandlers {
	return &EMQXHandlers{apiURL: apiURL, user: user, password: password}
}

// login gets a bearer token from EMQX dashboard. Cached until expiry.
// Uses a double-check pattern to avoid holding the mutex during the HTTP round-trip.
// Two concurrent callers may both fetch a token if the cache is stale; the second
// write simply overwrites, which is harmless for a bearer token.
func (h *EMQXHandlers) login() (string, error) {
	// Step 1: Check cached token under lock.
	h.mu.Lock()
	if h.token != "" && time.Now().Before(h.expAt.Add(-60*time.Second)) {
		tok := h.token
		h.mu.Unlock()
		return tok, nil
	}
	h.mu.Unlock()

	// Step 2: Fetch a new token without holding the lock.
	body, _ := json.Marshal(map[string]string{"username": h.user, "password": h.password})
	resp, err := http.Post(h.apiURL+"/api/v5/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("emqx login request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("emqx login failed (%d): %s", resp.StatusCode, string(b))
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("emqx login decode failed: %w", err)
	}

	// Step 3: Write the new token under lock.
	h.mu.Lock()
	h.token = result.Token
	h.expAt = time.Now().Add(2 * time.Hour) // EMQX tokens are valid for ~8h, refresh every 2h
	h.mu.Unlock()

	return result.Token, nil
}

// emqxClient is the simplified client info returned to the frontend.
type emqxClient struct {
	ClientID    string `json:"client_id"`
	Username    string `json:"username"`
	IPAddress   string `json:"ip_address"`
	Port        int    `json:"port"`
	Listener    string `json:"listener"`     // e.g. "tcp:default", "ssl:default"
	ConnType    string `json:"conn_type"`    // "tcp" or "ssl"
	Connected   bool   `json:"connected"`
	ConnectedAt string `json:"connected_at"`
	ProtoVer    int    `json:"proto_ver"`
	Keepalive   int    `json:"keepalive"`
	RecvMsg     int64  `json:"recv_msg"`
	SendMsg     int64  `json:"send_msg"`
	RecvOct     int64  `json:"recv_oct"`
	SendOct     int64  `json:"send_oct"`
	SubsCount   int    `json:"subscriptions_cnt"`
}

// ListClients handles GET /api/v1/gateway/system/emqx/clients
func (h *EMQXHandlers) ListClients(w http.ResponseWriter, r *http.Request) {
	if h.apiURL == "" {
		httputil.Error(w, http.StatusServiceUnavailable, "EMQX API not configured")
		return
	}

	token, err := h.login()
	if err != nil {
		slog.Error("EMQX: login failed", "error", err)
		httputil.Error(w, http.StatusBadGateway, "failed to authenticate with EMQX")
		return
	}

	// Fetch all clients from EMQX (paginated, get up to 500)
	req, _ := http.NewRequestWithContext(r.Context(), "GET",
		h.apiURL+"/api/v5/clients?limit=500", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("EMQX: clients request failed", "error", err)
		httputil.Error(w, http.StatusBadGateway, "failed to fetch EMQX clients")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		slog.Error("EMQX: clients response error", "status", resp.StatusCode, "body", string(b))
		httputil.Error(w, http.StatusBadGateway, "EMQX API error")
		return
	}

	var raw struct {
		Data []struct {
			ClientID    string `json:"clientid"`
			Username    *string `json:"username"`
			IPAddress   string `json:"ip_address"`
			Port        int    `json:"port"`
			Listener    string `json:"listener"`
			Connected   bool   `json:"connected"`
			ConnectedAt string `json:"connected_at"`
			ProtoVer    int    `json:"proto_ver"`
			Keepalive   int    `json:"keepalive"`
			RecvMsg     int64  `json:"recv_msg"`
			SendMsg     int64  `json:"send_msg"`
			RecvOct     int64  `json:"recv_oct"`
			SendOct     int64  `json:"send_oct"`
			SubsCount   int    `json:"subscriptions_cnt"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		slog.Error("EMQX: decode failed", "error", err)
		httputil.Error(w, http.StatusBadGateway, "failed to parse EMQX response")
		return
	}

	clients := make([]emqxClient, 0, len(raw.Data))
	for _, c := range raw.Data {
		connType := "tcp"
		if len(c.Listener) >= 3 && c.Listener[:3] == "ssl" {
			connType = "ssl"
		}
		username := ""
		if c.Username != nil {
			username = *c.Username
		}
		clients = append(clients, emqxClient{
			ClientID:    c.ClientID,
			Username:    username,
			IPAddress:   c.IPAddress,
			Port:        c.Port,
			Listener:    c.Listener,
			ConnType:    connType,
			Connected:   c.Connected,
			ConnectedAt: c.ConnectedAt,
			ProtoVer:    c.ProtoVer,
			Keepalive:   c.Keepalive,
			RecvMsg:     c.RecvMsg,
			SendMsg:     c.SendMsg,
			RecvOct:     c.RecvOct,
			SendOct:     c.SendOct,
			SubsCount:   c.SubsCount,
		})
	}

	httputil.JSON(w, http.StatusOK, clients)
}

