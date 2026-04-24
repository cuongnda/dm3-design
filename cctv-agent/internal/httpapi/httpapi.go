// Package httpapi exposes a small localhost HTTP surface so operators
// (or the forthcoming MQTT-based server bridge) can drive the agent by
// shooting JSON at it. The shape mirrors the eventual MQTT command
// envelope so swapping transports later is a one-file change in the
// agent.
//
// Every request is a command:
//
//	POST /v1/commands
//	{
//	  "type":       "set_time",
//	  "protocol":   "viid_tungson",
//	  "camera_ip":  "192.168.1.234",
//	  "username":   "admin",
//	  "password":   "secret",
//	  "params":     { ...type-specific... }
//	}
//
// Response:
//
//	200 { "success": true,  "data": <cam response JSON>, "duration_ms": 42 }
//	200 { "success": false, "error": "…", "duration_ms": 12 }
//
// We deliberately reply 200 even on command failures — the HTTP layer
// is happy, it's the cam that said no. Reserve 4xx/5xx for transport
// and validation errors (bad JSON, unknown type).
package httpapi

import (
	_ "embed"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/cctv-agent/internal/commands"
)

// uiHTML is the single-page console served at `/`. Embedded at compile
// time so the shipped binary still works on an air-gapped LAN without
// a separate static-files directory.
//go:embed ui.html
var uiHTML []byte

// Server wraps the HTTP handler around a command dispatcher.
type Server struct {
	dispatcher *commands.Dispatcher
	addr       string
	httpSrv    *http.Server
}

func NewServer(addr string, dispatcher *commands.Dispatcher) *Server {
	return &Server{dispatcher: dispatcher, addr: addr}
}

// ListenAndServe starts serving until an error or Shutdown is called.
// Blocks — run in a goroutine or use as the main loop.
func (s *Server) ListenAndServe() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/commands", s.handleCommand)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	// Serve the console UI at / (and anything else that falls through).
	// ServeMux pattern "/" is the catch-all — intentional; we want
	// humans who poke the agent with a browser to get something useful.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(uiHTML)
	})
	s.httpSrv = &http.Server{Addr: s.addr, Handler: mux}
	slog.Info("http api listening", "addr", s.addr, "ui_url", "http://"+s.addr+"/")
	return s.httpSrv.ListenAndServe()
}

// Shutdown asks ListenAndServe to return gracefully.
func (s *Server) Shutdown() {
	if s.httpSrv != nil {
		_ = s.httpSrv.Close()
	}
}

func (s *Server) handleCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var cmd commands.Request
	if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
		http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if cmd.Type == "" || cmd.Protocol == "" {
		http.Error(w, "type and protocol are required", http.StatusBadRequest)
		return
	}
	// Most commands need a target cam; discovery and ONVIF-PTZ
	// commands carry their target differently (scan/discover don't
	// have one at all; ptz_move/ptz_stop can use params.xaddr instead
	// of camera_ip, which is the common case after a discover run).
	if cmd.CameraIP == "" {
		switch cmd.Type {
		case "scan", "discover", "ptz_move", "ptz_stop", "brand_probe":
			// OK — either no cam, or params carry the XAddr / IP list.
		default:
			http.Error(w, "camera_ip is required for this command type", http.StatusBadRequest)
			return
		}
	}

	start := time.Now()
	res := s.dispatcher.Dispatch(r.Context(), cmd)
	res.DurationMs = time.Since(start).Milliseconds()

	slog.Info("command done",
		"type", cmd.Type, "protocol", cmd.Protocol, "camera_ip", cmd.CameraIP,
		"success", res.Success, "error", res.Error, "duration_ms", res.DurationMs)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}
