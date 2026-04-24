// cctv-agent is a LAN-side service that exposes a local HTTP API for
// commanding cameras on the same private network as itself.
//
// Operators and (later) the DM3 cloud server hit this agent to
// control cameras that aren't reachable from outside the LAN. Each
// vendor protocol (TungSon, Hanet, generic ONVIF, …) lives under
// internal/adapters/* and dispatches through internal/commands.
//
// This build is standalone — no MQTT, no server registration. Drive
// it via `POST http://<agent-host>:8088/v1/commands` with a JSON
// envelope matching commands.Request. The MQTT transport will be
// added later without changing the dispatcher.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/duali/cctv-agent/internal/commands"
	"github.com/duali/cctv-agent/internal/config"
	"github.com/duali/cctv-agent/internal/httpapi"
)

var version = "dev" // overridden via -ldflags at build time

func main() {
	configPath := flag.String("config", "agent.yml", "path to agent config YAML")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("cctv-agent", version)
		return
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	slog.Info("cctv-agent starting", "version", version, "config", *configPath)

	cfg, err := config.Load(*configPath)
	if err != nil {
		slog.Error("failed to load config", "error", err, "path", *configPath)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dispatcher := commands.NewDispatcher()
	server := httpapi.NewServer(cfg.HTTP.Addr, dispatcher)

	go func() {
		if err := server.ListenAndServe(); err != nil {
			slog.Error("http server stopped", "error", err)
			cancel()
		}
	}()

	slog.Info("cctv-agent ready",
		"http_addr", cfg.HTTP.Addr,
		"tenant_id", cfg.Agent.TenantID,
		"agent_id", cfg.Agent.AgentID)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-sigCh:
		slog.Info("signal received, shutting down")
	case <-ctx.Done():
	}
	server.Shutdown()
}
