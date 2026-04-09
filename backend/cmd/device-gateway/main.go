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
	"github.com/duali/dm3-backend/internal/gateway"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting device-gateway")

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

	// Connect to MQTT
	mqttClient, err := mqtt.Connect(ctx, mqtt.Options{
		Broker:   cfg.MQTTBroker,
		ClientID: cfg.MQTTClientID,
		Username: cfg.MQTTUsername,
		Password: cfg.MQTTPassword,
	})
	if err != nil {
		slog.Error("failed to connect to mqtt", "error", err)
		os.Exit(1)
	}

	// Connect to NATS
	natsClient, err := natsutil.Connect(ctx, cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to nats", "error", err)
		os.Exit(1)
	}
	defer natsClient.Close()

	// Ensure NATS streams
	if err := natsClient.EnsureStream(ctx, "DEVICES", []string{"dm3.devices.>"}); err != nil {
		slog.Error("failed to create nats stream", "error", err)
		os.Exit(1)
	}

	// WebSocket event hub
	hub := gateway.NewEventHub()

	// Sync service
	syncService := gateway.NewSyncService(database, mqttClient)

	// MQTT message handler
	mqttHandler := gateway.NewMQTTHandler(database, natsClient, hub)
	mqttHandler.SetAppContext(ctx)
	mqttHandler.SetSyncService(syncService)

	// Subscribe to all device topics
	topics := []string{
		"dm/+/device/+/evt",
		"dm/+/device/+/sta",
		"dm/+/device/+/cmd/resp",
		"dm/+/device/+/cfg/ack",
	}
	for _, topic := range topics {
		if err := mqttClient.Subscribe(ctx, topic, 1, mqttHandler.Handle); err != nil {
			slog.Warn("mqtt subscribe failed, will retry on reconnect", "topic", topic, "error", err)
		}
	}

	// Start heartbeat checker
	go gateway.StartHeartbeatChecker(ctx, database, hub)

	// Bootstrap MQTT handler
	bootstrapHandler := gateway.NewBootstrapMQTTHandler(database, mqttClient, cfg)
	bootstrapHandler.SetAppContext(ctx)
	if err := mqttClient.Subscribe(ctx, "dm/bootstrap/register", 1, bootstrapHandler.Handle); err != nil {
		slog.Warn("mqtt subscribe bootstrap failed", "error", err)
	}

	// Load i18n translations
	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Error("failed to load i18n translations", "error", err)
		os.Exit(1)
	}

	// Audit logger
	auditLog := audit.New(database.Pool, "device-gateway")
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
	handlers := gateway.NewGatewayHandlers(database, mqttClient, auditLog)
	provHandlers := gateway.NewProvisioningHandlers(database, mqttClient, cfg, auditLog)
	firmwareHandlers := gateway.NewFirmwareHandlers(database)

	// HTTP routes
	r := httputil.NewRouter()

	// Add i18n middleware to all routes
	r.Use(i18n.LocaleMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "device-gateway"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			i18n.ErrorResponse(w, r, http.StatusServiceUnavailable, "system.database_not_ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	r.Route("/api/v1/gateway", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))

		// System admin only: pending device management
		r.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/devices/pending", provHandlers.ListPending)
			sr.Post("/devices/pending/{id}/approve", provHandlers.ApprovePending)
			sr.Post("/devices/pending/{id}/reject", provHandlers.RejectPending)
			// Global device list for system admin (no company filter required)
			sr.Get("/system/devices", handlers.ListDevicesGlobal)

			// Firmware management
			sr.Get("/system/firmware", firmwareHandlers.ListFirmwares)
			sr.Post("/system/firmware", firmwareHandlers.UploadFirmware)
			sr.Get("/system/firmware/device-types", firmwareHandlers.ListDeviceTypes)
			sr.Get("/system/firmware/{id}", firmwareHandlers.GetFirmware)
			sr.Put("/system/firmware/{id}", firmwareHandlers.UpdateFirmware)
			sr.Delete("/system/firmware/{id}", firmwareHandlers.DeleteFirmware)
			sr.Post("/system/firmware/{id}/deploy", firmwareHandlers.DeployFirmware)
			sr.Get("/system/firmware/{id}/download", firmwareHandlers.DownloadFirmware)
		})

		// Company-scoped endpoints
		r.Group(func(cr chi.Router) {
			cr.Use(authsvc.RequireCompany())
			// Devices: operator+viewer can read, manager+ can write
			cr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			cr.Get("/devices", handlers.ListDevices)
			cr.Post("/devices", handlers.CreateDevice)
			cr.Get("/devices/{id}", handlers.GetDevice)
			cr.Put("/devices/{id}", handlers.UpdateDevice)
			cr.Delete("/devices/{id}", handlers.DeleteDevice)
			cr.Post("/devices/{id}/command", handlers.SendCommand)
			cr.Get("/devices/{id}/events", handlers.GetDeviceEvents)
			cr.Get("/events", handlers.ListEvents)
			// Sync: manager+ only
			cr.Group(func(mr chi.Router) {
				mr.Use(authsvc.RequireRole("primary_manager", "manager", "system_admin"))
				mr.Post("/devices/{id}/sync", syncService.HandleSyncRequest)
			})
		})

		// QR Provisioning: manager+ with company context
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireCompany())
			pr.Use(authsvc.RequireRole("primary_manager", "manager", "system_admin"))
			pr.Post("/devices/provision", provHandlers.ProvisionDevice)
			pr.Get("/devices/provision/{id}/qr", provHandlers.RegenerateQR)
		})
	})

	// No-auth endpoints (device activation does not require user auth)
	r.Post("/api/v1/gateway/devices/activate", provHandlers.ActivateDevice)
	r.Post("/api/v1/gateway/devices/refresh-token", provHandlers.RefreshToken)

	// WebSocket endpoint — requires valid user JWT to prevent unauthenticated
	// clients from receiving the real-time event stream.
	r.Group(func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Get("/ws/events", hub.ServeHTTP)
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

	slog.Info("shutting down")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = mqttClient.Disconnect(shutdownCtx)
	_ = srv.Shutdown(shutdownCtx)
	slog.Info("shutdown complete")
}
