package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/cctv"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting cctv-svc")

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("insecure configuration", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Database
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations(); err != nil {
		slog.Warn("migrations", "error", err)
	}

	// NATS
	natsClient, err := natsutil.Connect(ctx, cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to nats", "error", err)
		os.Exit(1)
	}
	defer natsClient.Close()

	if err := natsClient.EnsureStream(ctx, "CCTV", []string{"dm3.cctv.>"}); err != nil {
		slog.Error("failed to ensure CCTV stream", "error", err)
		os.Exit(1)
	}
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Audit logger
	auditLog := audit.New(natsClient, "cctv-svc")
	defer auditLog.Close()
	audit.SetContextExtractor(audit.ContextExtractor{
		ActorFromContext: func(ctx context.Context) (string, string) {
			c := authsvc.ClaimsFromContext(ctx)
			if c == nil {
				return "", ""
			}
			return c.Sub, c.Email
		},
		CompanyIDFromContext: authsvc.CompanyIDFromContext,
	})

	// Credential cipher (AES-256-GCM) for RTSP passwords
	credKey := os.Getenv("CCTV_CREDENTIAL_KEY")
	if credKey == "" {
		slog.Error("CCTV_CREDENTIAL_KEY env var is required (base64-encoded 32 bytes)")
		os.Exit(1)
	}
	cipher, err := cctv.NewCredentialCipher(credKey)
	if err != nil {
		slog.Error("failed to init credential cipher", "error", err)
		os.Exit(1)
	}

	// MediaMTX client — HTTP impl when MEDIAMTX_API_URL is set, else noop (dev)
	var mediamtxClient cctv.MediaMTXClient
	if apiURL := os.Getenv("MEDIAMTX_API_URL"); apiURL != "" {
		mediamtxClient = cctv.NewHTTPMediaMTXClient(
			apiURL,
			os.Getenv("MEDIAMTX_API_USER"),
			os.Getenv("MEDIAMTX_API_PASS"),
		)
		slog.Info("mediamtx client configured", "url", apiURL)
	} else {
		mediamtxClient = cctv.NoopMediaMTXClient{}
		slog.Warn("MEDIAMTX_API_URL not set — using no-op MediaMTX client (dev mode)")
	}

	// HTTP handlers
	handlers := cctv.NewCCTVHandlers(database, auditLog, natsClient, mediamtxClient, cipher)

	// Router
	r := httputil.NewRouter()

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "cctv-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			httputil.Error(w, http.StatusServiceUnavailable, "database not ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	cctv.RegisterRoutes(r, handlers, cfg.JWTSecret)

	// Serve
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		slog.Info("http server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("shutting down cctv-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("cctv-svc shutdown complete")
}
