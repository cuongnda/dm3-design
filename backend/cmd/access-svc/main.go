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
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting access-svc")

	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to database
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	// Run migrations
	if err := database.RunMigrations(ctx, "pkg/db/migrations"); err != nil {
		slog.Warn("migration warning (may already exist)", "error", err)
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

	// HTTP handlers
	handlers := access.NewHandlers(database)

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

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())

		// Doors: viewer can read, manager+ can write
		r.Group(func(dr chi.Router) {
			dr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			dr.Get("/doors", handlers.ListDoors)
			dr.Post("/doors", handlers.CreateDoor)
			dr.Get("/doors/{id}", handlers.GetDoor)
			dr.Put("/doors/{id}", handlers.UpdateDoor)
			dr.Delete("/doors/{id}", handlers.DeleteDoor)
			dr.Get("/doors/{id}/sync-package", handlers.GetSyncPackage)
		})

		// Access Rules: viewer can read, manager+ can write
		r.Group(func(ar chi.Router) {
			ar.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			ar.Get("/rules", handlers.ListRules)
			ar.Post("/rules", handlers.CreateRule)
			ar.Get("/rules/{id}", handlers.GetRule)
			ar.Put("/rules/{id}", handlers.UpdateRule)
			ar.Delete("/rules/{id}", handlers.DeleteRule)
		})

		// Schedules: viewer can read, manager+ can write
		r.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			sr.Get("/schedules", handlers.ListSchedules)
			sr.Post("/schedules", handlers.CreateSchedule)
			sr.Get("/schedules/{id}", handlers.GetSchedule)
			sr.Put("/schedules/{id}", handlers.UpdateSchedule)
			sr.Delete("/schedules/{id}", handlers.DeleteSchedule)
		})

		// Events: all roles can read
		r.Get("/events", handlers.ListEvents)

		// Dashboard stats: all roles can read
		r.Get("/stats", handlers.GetStats)

		// Access Time Templates: manager+ can manage, viewer can read
		r.Group(func(atr chi.Router) {
			atr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			atr.Get("/access-time/templates", handlers.ListAccessTimeTemplates)
			atr.Post("/access-time/templates", handlers.CreateAccessTimeTemplate)
			atr.Get("/access-time/templates/{id}", handlers.GetAccessTimeTemplate)
			atr.Put("/access-time/templates/{id}", handlers.UpdateAccessTimeTemplate)
			atr.Delete("/access-time/templates/{id}", handlers.DeleteAccessTimeTemplate)
		})

		// Access Time Stats: all roles can read
		r.Get("/access-time/stats", handlers.GetAccessTimeStats)
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
