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

	"duall-master/internal/config"
	"duall-master/internal/middleware"
	"duall-master/internal/notif"
	"duall-master/pkg/db"
	"duall-master/pkg/natsutil"

	"github.com/gorilla/mux"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	// Database connection
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	// NATS connection for consuming notification events
	nc, err := natsutil.Connect(cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	// Initialize notification handlers
	handlers := notif.NewHandlers(database, nc)

	// Start NATS consumers for notification events
	go handlers.StartEventConsumers(ctx)

	// HTTP router
	r := mux.NewRouter()
	r.Use(middleware.CORS())
	r.Use(middleware.Logging())

	// Health check
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Notification API endpoints
	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.Auth(cfg.JWTSecret))

	// Send notification (manual)
	api.HandleFunc("/notifications", handlers.SendNotification).Methods("POST")
	
	// Notification preferences
	api.HandleFunc("/notifications/preferences", handlers.GetPreferences).Methods("GET")
	api.HandleFunc("/notifications/preferences", handlers.UpdatePreferences).Methods("PUT")
	
	// Notification history
	api.HandleFunc("/notifications/history", handlers.GetHistory).Methods("GET")
	
	// Template management
	api.HandleFunc("/notifications/templates", handlers.ListTemplates).Methods("GET")
	api.HandleFunc("/notifications/templates", handlers.CreateTemplate).Methods("POST")
	api.HandleFunc("/notifications/templates/{id}", handlers.UpdateTemplate).Methods("PUT")

	// HTTP server
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		slog.Info("notification service starting", "port", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	slog.Info("shutting down notification service...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("notification service stopped")
}