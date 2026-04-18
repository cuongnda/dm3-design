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

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/auditsvc"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting audit-svc")

	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to database
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations(); err != nil {
		slog.Warn("migrations", "error", err)
	}

	// Connect to NATS
	natsClient, err := natsutil.Connect(ctx, cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to nats", "error", err)
		os.Exit(1)
	}
	defer natsClient.Close()

	// Ensure AUDIT stream
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Start audit consumer (NATS → batch INSERT → TimescaleDB)
	consumer := auditsvc.NewConsumer(database.Pool)
	defer consumer.Close()

	if err := natsClient.Subscribe(ctx, "AUDIT", "audit-svc", "dm3.audit.>", consumer.HandleMessage); err != nil {
		slog.Error("failed to subscribe to audit stream", "error", err)
		os.Exit(1)
	}
	slog.Info("audit consumer started", "stream", "AUDIT", "subject", "dm3.audit.>")

	// Claims reader shared by audit + notification handlers
	claimsReader := auditsvc.ClaimsReader{
		IsAdmin: func(ctx context.Context) bool {
			c := authsvc.ClaimsFromContext(ctx)
			return c != nil && c.Role == "system_admin"
		},
		CompanyID: authsvc.CompanyIDFromContext,
	}

	// Query API handlers
	auditHandlers := auditsvc.NewAuditHandlers(database, claimsReader)
	notifyHandlers := auditsvc.NewNotifyHandlers(database, claimsReader)

	// HTTP routes
	r := httputil.NewRouter()

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "audit-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			httputil.Error(w, http.StatusServiceUnavailable, "database not ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	r.Group(func(pr chi.Router) {
		pr.Use(authsvc.AuthMiddleware(cfg.JWTSecret))

		// Tenant-scoped audit logs (any authenticated user with company)
		pr.Group(func(ar chi.Router) {
			ar.Use(authsvc.RequireCompany())
			ar.Get("/api/v1/audit/tenant/logs", auditHandlers.ListAuditLogs)
			ar.Get("/api/v1/audit/tenant/export", auditHandlers.ExportAuditLogs)
		})

		// Notifications (tenant-scoped)
		pr.Group(func(nr chi.Router) {
			nr.Use(authsvc.RequireCompany())
			nr.Get("/api/v1/notifications", notifyHandlers.ListNotifications)
			nr.Get("/api/v1/notifications/unread-count", notifyHandlers.UnreadCount)
			nr.Post("/api/v1/notifications", notifyHandlers.CreateNotification)
			nr.Patch("/api/v1/notifications/mark-all-read", notifyHandlers.MarkAllRead)
			nr.Patch("/api/v1/notifications/{id}/read", notifyHandlers.MarkRead)
			nr.Patch("/api/v1/notifications/{id}/acknowledge", notifyHandlers.Acknowledge)
			nr.Delete("/api/v1/notifications/{id}", notifyHandlers.DeleteNotification)
		})

		// System admin only
		pr.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/api/v1/audit/logs", auditHandlers.ListAuditLogs)
			sr.Get("/api/v1/audit/logs/{id}", auditHandlers.GetAuditLog)
			sr.Get("/api/v1/audit/export", auditHandlers.ExportAuditLogs)
			sr.Get("/api/v1/audit/stats", auditHandlers.GetAuditStats)
		})
	})

	// Start server
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

	slog.Info("shutting down audit-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("audit-svc shutdown complete")
}
