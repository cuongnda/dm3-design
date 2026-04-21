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
	"github.com/duali/dm3-backend/internal/cctv"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/internal/gateway"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
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
	// IDENTITY stream is primarily owned by identity-svc, but we ensure
	// it exists here too in case device-gateway starts before identity-svc
	// has had a chance to create it. The config is idempotent.
	if err := natsClient.EnsureStream(ctx, "IDENTITY", []string{"dm3.identity.>"}); err != nil {
		slog.Error("failed to ensure IDENTITY nats stream", "error", err)
		os.Exit(1)
	}

	// WebSocket event hub
	hub := gateway.NewEventHub()

	// Sync service
	syncService := gateway.NewSyncService(database, mqttClient)
	syncService.AttachHub(hub)
	syncService.AttachKioskConfig(cfg.KioskAPIBaseURL)
	// Presigner for avatar URLs in cfg.person_sync / cfg.visitor_sync is wired
	// below, after the MinIO client is initialised (see objectStore).

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

	// Real-time identity → device push: subscribe to identity-svc's
	// person.changed events and fan out a PushPersonSync to every
	// online device in the affected tenant.
	identityConsumer := gateway.NewIdentityConsumer(database, natsClient, syncService)
	if err := identityConsumer.Start(ctx); err != nil {
		slog.Error("failed to start identity consumer", "error", err)
		os.Exit(1)
	}

	// Real-time visitor → device push: subscribe to visitor-svc's visit.*
	// events and fan out a PushVisitorSync to every online device in the
	// affected tenant. Fails soft — a missing VISITOR stream is logged but
	// does not abort startup, since visitor is a plugin-gated feature.
	visitorConsumer := gateway.NewVisitorConsumer(database, natsClient, syncService)
	if err := visitorConsumer.Start(ctx); err != nil {
		slog.Warn("visitor consumer not started; visitor_sync will not fire on events",
			"error", err)
	}

	// Real-time CCTV → WebSocket push: subscribe to cctv-svc's face
	// recognition and unknown face events and broadcast them to the
	// monitoring page via the WebSocket hub. Fails soft — a missing CCTV
	// stream is logged but does not abort startup.
	cctvWSConsumer := gateway.NewCCTVWebSocketConsumer(database, natsClient, hub)
	if err := cctvWSConsumer.Start(ctx); err != nil {
		slog.Warn("cctv ws consumer not started; cctv events will not appear in realtime",
			"error", err)
	}

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

	// Ensure AUDIT stream for audit event publishing
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Audit logger (publishes to NATS → audit-svc)
	auditLog := audit.New(natsClient, "device-gateway")
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

	objectStore, err := objectstore.NewMinIOStore(ctx, objectstore.Config{
		Endpoint:         cfg.ObjectStoreEndpoint,
		PublicEndpoint:   cfg.ObjectStorePublicEndpoint,
		AccessKeyID:      cfg.ObjectStoreAccessKeyID,
		SecretAccessKey:  cfg.ObjectStoreSecretAccessKey,
		Bucket:           cfg.ObjectStoreBucket,
		UseSSL:           cfg.ObjectStoreUseSSL,
		PublicUseSSL:     cfg.ObjectStorePublicUseSSL,
		AutoCreateBucket: cfg.ObjectStoreAutoCreateBucket,
	})
	if err != nil {
		slog.Error("failed to initialize object storage", "error", err)
		os.Exit(1)
	}
	syncService.AttachAssetPresigner(objectStore)

	// HTTP handlers
	handlers := gateway.NewGatewayHandlers(database, mqttClient, auditLog).
		WithMediaPresigner(objectStore)
	syncService.AttachHandlers(handlers)
	provHandlers := gateway.NewProvisioningHandlers(database, mqttClient, cfg, auditLog)

	// Optional: enable type=camera provisioning by wiring the CCTV credential
	// cipher. When CCTV_CREDENTIAL_KEY is unset, non-camera provisioning still
	// works — camera requests will be rejected with 503 by the handler.
	if credKey := os.Getenv("CCTV_CREDENTIAL_KEY"); credKey != "" {
		camCipher, cipherErr := cctv.NewCredentialCipher(credKey)
		if cipherErr != nil {
			slog.Error("failed to init cctv credential cipher; camera provisioning disabled", "error", cipherErr)
		} else {
			provHandlers = provHandlers.WithCameraCipher(camCipher)
			slog.Info("camera provisioning enabled via CCTV_CREDENTIAL_KEY")
		}
	} else {
		slog.Warn("CCTV_CREDENTIAL_KEY not set; type=camera provisioning via /devices/provision will return 503")
	}
	fwDownloadURL := os.Getenv("FIRMWARE_DOWNLOAD_URL")
	if fwDownloadURL == "" {
		fwDownloadURL = fmt.Sprintf("http://localhost:%d", cfg.HTTPPort)
	}
	firmwareHandlers := gateway.NewFirmwareHandlers(database, objectStore, mqttClient, auditLog, fwDownloadURL)
	emqxHandlers := gateway.NewEMQXHandlers(cfg.EMQXApiURL, cfg.EMQXApiUser, cfg.EMQXApiPassword)
	mediaHandlers := gateway.NewMediaHandlers(objectStore, cfg.JWTSecret)

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

	// Token-based firmware download — no JWT required (the token IS the auth).
	// Must be outside the auth middleware group.
	r.Get("/api/v1/gateway/firmware/download/{token}", firmwareHandlers.DownloadFirmwareByToken)

	r.Route("/api/v1/gateway", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))

		// System admin only: pending device management
		r.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/devices/pending", provHandlers.ListPending)
			sr.Post("/devices/pending/{id}/approve", provHandlers.ApprovePending)
			sr.Post("/devices/pending/{id}/reject", provHandlers.RejectPending)
			// Global device list + per-device edit for system admin
			// (no company filter required)
			sr.Get("/system/devices", handlers.ListDevicesGlobal)
			sr.Get("/system/devices/{id}", handlers.GetDeviceGlobal)
			sr.Put("/system/devices/{id}", handlers.UpdateDeviceGlobal)

			// Firmware management
			sr.Get("/system/firmware", firmwareHandlers.ListFirmwares)
			sr.Post("/system/firmware", firmwareHandlers.UploadFirmware)
			sr.Get("/system/firmware/device-types", firmwareHandlers.ListDeviceTypes)
			sr.Get("/system/firmware/{id}", firmwareHandlers.GetFirmware)
			sr.Put("/system/firmware/{id}", firmwareHandlers.UpdateFirmware)
			sr.Delete("/system/firmware/{id}", firmwareHandlers.DeleteFirmware)
			sr.Post("/system/firmware/{id}/deploy", firmwareHandlers.DeployFirmware)
			sr.Get("/system/firmware/{id}/download", firmwareHandlers.DownloadFirmware)
			sr.Get("/system/firmware/{id}/deployments", firmwareHandlers.ListDeployments)

			// EMQX proxy
			sr.Get("/system/emqx/clients", emqxHandlers.ListClients)
		})

		// Company-scoped endpoints
		r.Group(func(cr chi.Router) {
			cr.Use(authsvc.RequireCompany())
			// Devices: reads open to any tenant user, writes require device.manage.
			// Commands (open door, etc.) require device.execute — enforced in
			// the inner groups below.
			cr.Group(func(dr chi.Router) {
				dr.Use(authsvc.RequireWritePermission("device.manage"))
				dr.Get("/devices", handlers.ListDevices)
				dr.Post("/devices", handlers.CreateDevice)
				dr.Get("/devices/{id}", handlers.GetDevice)
				dr.Put("/devices/{id}", handlers.UpdateDevice)
				dr.Delete("/devices/{id}", handlers.DeleteDevice)
				dr.Get("/devices/{id}/events", handlers.GetDeviceEvents)
				dr.Get("/devices/{id}/history", handlers.GetDeviceHistory)
				dr.Get("/events", handlers.ListEvents)
			})
			// Commands: always enforce device.execute (no read-passthrough
			// loophole since these are action endpoints).
			cr.Group(func(er chi.Router) {
				er.Use(authsvc.RequirePermission("device.execute"))
				er.Post("/devices/{id}/command", handlers.SendCommand)
				er.Post("/access-points/{id}/door-command", handlers.SendDoorCommand)
				er.Post("/access-points/door-command/bulk", handlers.BulkDoorCommand)
			})
			// Sync: sync jobs mutate device state, so we require device.manage.
			cr.Group(func(mr chi.Router) {
				mr.Use(authsvc.RequirePermission("device.manage"))
				mr.Post("/devices/{id}/sync", syncService.HandleSyncRequest)
				mr.Get("/devices/{id}/sync/jobs/{jobID}", syncService.HandleGetSyncJob)
			})
		})

		// QR Provisioning: requires device.manage (creates new device rows)
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireCompany())
			pr.Use(authsvc.RequirePermission("device.manage"))
			pr.Post("/devices/provision", provHandlers.ProvisionDevice)
			pr.Get("/devices/provision/{id}/qr", provHandlers.RegenerateQR)
		})
	})

	// No-auth endpoints (device activation does not require user auth)
	r.Post("/api/v1/gateway/devices/activate", provHandlers.ActivateDevice)
	r.Post("/api/v1/gateway/devices/refresh-token", provHandlers.RefreshToken)

	// Device-authenticated upload-url issuance: device JWT is validated inside
	// the handler so this route stays out of the user-JWT middleware group.
	// See docs/architecture/mqtt-protocol.md §15.
	r.Post("/api/v1/gateway/devices/{id}/media-url", mediaHandlers.IssueUploadURL)

	// WebSocket endpoint — requires valid user JWT to prevent unauthenticated
	// clients from receiving the real-time event stream.
	// Uses AssetAuthMiddleware because browsers cannot set Authorization headers
	// on WebSocket connections; the token is passed as ?token= query parameter.
	// RequireCompany ensures events are scoped to the user's tenant.
	r.Group(func(r chi.Router) {
		r.Use(authsvc.AssetAuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())
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
