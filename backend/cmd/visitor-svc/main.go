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
	"duall-master/internal/visitor"
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

	// NATS connection for publishing visitor events
	nc, err := natsutil.Connect(cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	// Initialize visitor handlers
	handlers := visitor.NewHandlers(database, nc)

	// Start background maintenance jobs
	go handlers.StartVisitorMaintenanceJobs()

	// HTTP router
	r := mux.NewRouter()
	r.Use(middleware.CORS())
	r.Use(middleware.Logging())

	// Health check
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Visitor API endpoints
	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.Auth(cfg.JWTSecret))

	// Visitor management
	api.HandleFunc("/visitors", handlers.ListVisitors).Methods("GET")
	api.HandleFunc("/visitors", handlers.CreateVisitor).Methods("POST")
	api.HandleFunc("/visitors/{id}", handlers.GetVisitor).Methods("GET")
	api.HandleFunc("/visitors/{id}", handlers.UpdateVisitor).Methods("PUT")
	api.HandleFunc("/visitors/{id}", handlers.DeleteVisitor).Methods("DELETE")
	
	// Visitor actions
	api.HandleFunc("/visitors/{id}/checkin", handlers.CheckInVisitor).Methods("POST")
	api.HandleFunc("/visitors/{id}/checkout", handlers.CheckOutVisitor).Methods("POST")
	api.HandleFunc("/visitors/{id}/approve", handlers.ApproveVisitor).Methods("POST")
	api.HandleFunc("/visitors/{id}/reject", handlers.RejectVisitor).Methods("POST")
	api.HandleFunc("/visitors/{id}/badge", handlers.PrintBadge).Methods("POST")
	
	// Pre-registration (public endpoint for visitor self-registration)
	public := r.PathPrefix("/api/v1/public").Subrouter()
	public.HandleFunc("/visitors/register", handlers.PreRegisterVisitor).Methods("POST")
	public.HandleFunc("/visitors/{id}/status", handlers.GetVisitorStatus).Methods("GET")
	
	// Host management
	api.HandleFunc("/visitors/hosts", handlers.ListHosts).Methods("GET")
	api.HandleFunc("/visitors/hosts/{id}/visitors", handlers.GetHostVisitors).Methods("GET")
	api.HandleFunc("/visitors/hosts/{id}/approve-all", handlers.ApproveAllHostVisitors).Methods("POST")
	
	// Reports
	api.HandleFunc("/visitors/reports/daily", handlers.GetDailyReport).Methods("GET")
	api.HandleFunc("/visitors/reports/host-activity", handlers.GetHostActivityReport).Methods("GET")
	
	// Statistics
	api.HandleFunc("/visitors/stats", handlers.GetVisitorStats).Methods("GET")
	
	// Settings
	api.HandleFunc("/visitors/settings", handlers.GetVisitorSettings).Methods("GET")
	api.HandleFunc("/visitors/settings", handlers.UpdateVisitorSettings).Methods("PUT")

	// HTTP server
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		slog.Info("visitor service starting", "port", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	slog.Info("shutting down visitor service...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("visitor service stopped")
}