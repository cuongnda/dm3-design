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

	"duall-master/internal/audit"
	"duall-master/internal/config"
	"duall-master/internal/middleware"
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

	// NATS connection for consuming audit events
	nc, err := natsutil.Connect(cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	// Initialize audit handlers
	handlers := audit.NewHandlers(database, nc)

	// Start NATS consumers for audit events
	go handlers.StartAuditConsumers(ctx)

	// HTTP router
	r := mux.NewRouter()
	r.Use(middleware.CORS())
	r.Use(middleware.Logging())

	// Health check
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Audit API endpoints
	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.Auth(cfg.JWTSecret))

	// Audit log queries (read-only)
	api.HandleFunc("/audit/events", handlers.GetAuditEvents).Methods("GET")
	api.HandleFunc("/audit/search", handlers.SearchAuditEvents).Methods("GET")
	
	// Compliance reports
	api.HandleFunc("/audit/reports/activity", handlers.GetActivityReport).Methods("GET")
	api.HandleFunc("/audit/reports/access", handlers.GetAccessReport).Methods("GET")
	api.HandleFunc("/audit/reports/admin", handlers.GetAdminActionsReport).Methods("GET")
	
	// Audit trail integrity
	api.HandleFunc("/audit/integrity/verify", handlers.VerifyIntegrity).Methods("GET")
	
	// Export functionality (CSV/JSON)
	api.HandleFunc("/audit/export", handlers.ExportAuditEvents).Methods("GET")
	
	// Statistics
	api.HandleFunc("/audit/stats", handlers.GetAuditStats).Methods("GET")

	// HTTP server
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		slog.Info("audit service starting", "port", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	slog.Info("shutting down audit service...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("audit service stopped")
}