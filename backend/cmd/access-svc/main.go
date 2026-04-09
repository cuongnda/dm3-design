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

	"github.com/duali/dm3-backend/internal/access"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting access-svc")

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("insecure configuration", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to database
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
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

	// Ensure NATS stream
	if err := natsClient.EnsureStream(ctx, "DEVICES", []string{"dm3.devices.>"}); err != nil {
		slog.Error("failed to ensure nats stream", "error", err)
		os.Exit(1)
	}

	// Start NATS consumer for access events
	consumer := access.NewNATSConsumer(database, natsClient)
	if err := consumer.Start(ctx); err != nil {
		slog.Error("failed to start nats consumer", "error", err)
		os.Exit(1)
	}

	// Load i18n translations
	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Error("failed to load i18n translations", "error", err)
		os.Exit(1)
	}

	// Ensure AUDIT stream for audit event publishing
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Audit logger (publishes to NATS → audit-svc)
	auditLog := audit.New(natsClient, "access-svc")
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

	// HTTP handlers
	handlers := access.NewAccessHandlers(database, auditLog, natsClient)

	// HTTP routes
	r := httputil.NewRouter()

	// Add i18n middleware to all routes
	r.Use(i18n.LocaleMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "access-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			i18n.ErrorResponse(w, r, http.StatusServiceUnavailable, "system.database_not_ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	r.Route("/api/v1/access", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())

		// Zones
		r.Group(func(zr chi.Router) {
			zr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			zr.Get("/zones", handlers.ListZones)
			zr.Post("/zones", handlers.CreateZone)
			zr.Post("/zones/bulk-delete", handlers.BulkDeleteZones)
			zr.Get("/zones/{id}", handlers.GetZone)
			zr.Put("/zones/{id}", handlers.UpdateZone)
			zr.Delete("/zones/{id}", handlers.DeleteZone)
			zr.Get("/zones/{id}/access-points", handlers.ListZoneDoors)
			zr.Get("/zones/{id}/map", handlers.GetZoneMap)
			zr.Put("/zones/{id}/map", handlers.UpdateZoneMap)
		})

		// Access Points
		r.Group(func(apr chi.Router) {
			apr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			apr.Get("/access-points", handlers.ListAccessPoints)
			apr.Post("/access-points", handlers.CreateAccessPoint)
			apr.Post("/access-points/bulk-delete", handlers.BulkDeleteAccessPoints)
			apr.Get("/access-points/{id}", handlers.GetAccessPoint)
			apr.Put("/access-points/{id}", handlers.UpdateAccessPoint)
			apr.Delete("/access-points/{id}", handlers.DeleteAccessPoint)
			apr.Get("/access-points/{id}/devices", handlers.ListAccessPointDevices)
			apr.Post("/access-points/{id}/devices", handlers.AddAccessPointDevice)
			apr.Delete("/access-points/{id}/devices/{deviceId}", handlers.RemoveAccessPointDevice)
			apr.Get("/access-points/{id}/access-groups", handlers.ListAccessPointGroups)
			apr.Post("/access-points/{id}/access-groups", handlers.AddAccessPointGroup)
			apr.Delete("/access-points/{id}/access-groups/{groupId}", handlers.RemoveAccessPointGroup)
		})

		// Access Devices
		r.Group(func(dr chi.Router) {
			dr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			dr.Get("/access-devices", handlers.ListAccessDevices)
			dr.Post("/access-devices", handlers.CreateAccessDevice)
			dr.Post("/access-devices/bulk-delete", handlers.BulkDeleteAccessDevices)
			dr.Get("/access-devices/{id}", handlers.GetAccessDevice)
			dr.Put("/access-devices/{id}", handlers.UpdateAccessDevice)
			dr.Delete("/access-devices/{id}", handlers.DeleteAccessDevice)
			dr.Get("/access-devices/{id}/sync-package", handlers.GetSyncPackage)
		})

		// Access Groups
		r.Group(func(agr chi.Router) {
			agr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			agr.Get("/access-groups", handlers.ListAccessGroups)
			agr.Post("/access-groups", handlers.CreateAccessGroup)
			agr.Post("/access-groups/bulk-delete", handlers.BulkDeleteAccessGroups)
			agr.Get("/access-groups/{id}", handlers.GetAccessGroup)
			agr.Put("/access-groups/{id}", handlers.UpdateAccessGroup)
			agr.Delete("/access-groups/{id}", handlers.DeleteAccessGroup)
			agr.Get("/access-groups/{id}/access-points", handlers.ListAccessGroupAccessPoints)
			agr.Post("/access-groups/{id}/access-points", handlers.AddAccessGroupAccessPoint)
			agr.Delete("/access-groups/{id}/access-points/{apId}", handlers.RemoveAccessGroupAccessPoint)
			agr.Get("/access-groups/{id}/users", handlers.ListAccessGroupUsers)
			agr.Post("/access-groups/{id}/users", handlers.AssignUsersToGroup)
			agr.Put("/access-groups/{id}/users/{userId}", handlers.UpdateUserMembership)
			agr.Delete("/access-groups/{id}/users/{userId}", handlers.RemoveUserFromGroup)
		})

		// Access Times
		r.Group(func(atr chi.Router) {
			atr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			atr.Get("/access-times", handlers.ListAccessTimeTemplates)
			atr.Post("/access-times", handlers.CreateAccessTimeTemplate)
			atr.Post("/access-times/bulk-delete", handlers.BulkDeleteAccessTimes)
			atr.Get("/access-times/{id}", handlers.GetAccessTimeTemplate)
			atr.Put("/access-times/{id}", handlers.UpdateAccessTimeTemplate)
			atr.Delete("/access-times/{id}", handlers.DeleteAccessTimeTemplate)
		})

		// Events: all roles can read
		r.Get("/events", handlers.ListEvents)

		// Dashboard stats: all roles can read
		r.Get("/stats", handlers.GetStats)
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

	slog.Info("shutting down access-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("access-svc shutdown complete")
}
