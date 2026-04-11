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

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/internal/parking"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting parking-svc")

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

	// Ensure NATS stream for parking events
	if err := natsClient.EnsureStream(ctx, "PARKING", []string{"dm3.parking.>"}); err != nil {
		slog.Error("failed to ensure PARKING stream", "error", err)
		os.Exit(1)
	}

	// Ensure AUDIT stream for audit event publishing
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Audit logger
	auditLog := audit.New(natsClient, "parking-svc")
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
	parkingHandlers := parking.NewParkingHandlers(database, auditLog, natsClient)

	// HTTP routes
	r := httputil.NewRouter()

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "parking-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			httputil.Error(w, http.StatusServiceUnavailable, "database not ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	// Parking routes
	r.Route("/api/v1/parking", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())
		r.Use(authsvc.RequirePlugin("parking"))

		// Operator-level routes
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("operator", "manager", "primary_manager", "system_admin"))
			pr.Get("/vehicles", parkingHandlers.ListParkingVehicles)
			pr.Post("/vehicles", parkingHandlers.CreateParkingVehicle)
			pr.Get("/vehicles/{id}", parkingHandlers.GetParkingVehicle)
			pr.Get("/sessions", parkingHandlers.ListParkingSessions)
			pr.Post("/sessions", parkingHandlers.CreateParkingSession)
			pr.Post("/sessions/recognitions", parkingHandlers.RecognizeParkingPlate)
			pr.Get("/sessions/{id}", parkingHandlers.GetParkingSession)
			pr.Put("/sessions/{id}/exit", parkingHandlers.ExitParkingSession)
			pr.Post("/sessions/{id}/payment", parkingHandlers.ProcessParkingPayment)
			pr.Get("/passes", parkingHandlers.ListParkingPasses)
		})

		// Manager-level routes
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("manager", "primary_manager", "system_admin"))
			pr.Get("/lots", parkingHandlers.ListParkingLots)
			pr.Post("/lots", parkingHandlers.CreateParkingLot)
			pr.Get("/lots/{id}", parkingHandlers.GetParkingLot)
			pr.Get("/zones", parkingHandlers.ListParkingZones)
			pr.Post("/zones", parkingHandlers.CreateParkingZone)
			pr.Get("/zones/{id}", parkingHandlers.GetParkingZone)
			pr.Get("/fee-rules", parkingHandlers.ListParkingFeeRules)
			pr.Post("/fee-rules", parkingHandlers.CreateParkingFeeRule)
			pr.Post("/passes", parkingHandlers.CreateParkingPass)
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

	slog.Info("shutting down parking-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("parking-svc shutdown complete")
}
