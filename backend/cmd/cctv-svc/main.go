package main

import (
	"context"
	"encoding/base64"
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
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// validateCredentialKeyEntropy rejects CCTV_CREDENTIAL_KEY values that decode
// to purely printable-ASCII bytes, which is a strong indicator of a low-entropy
// placeholder (e.g. "0123456789abcdef0123456789abcdef" base64-encoded).
func validateCredentialKeyEntropy(b64 string) error {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return fmt.Errorf("CCTV_CREDENTIAL_KEY is not valid base64: %w", err)
	}
	if len(raw) != 32 {
		return fmt.Errorf("CCTV_CREDENTIAL_KEY must decode to 32 bytes (got %d)", len(raw))
	}
	allPrintable := true
	for _, b := range raw {
		if b < 0x20 || b > 0x7E {
			allPrintable = false
			break
		}
	}
	if allPrintable {
		return fmt.Errorf("CCTV_CREDENTIAL_KEY appears to be a low-entropy placeholder; use a cryptographically random 32-byte key base64-encoded")
	}
	return nil
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting cctv-svc")

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("insecure configuration", "error", err)
		os.Exit(1)
	}

	// On-prem LAN deployments need RFC1918 cameras (10.x/192.168.x/172.16-31.x)
	// to pass the RTSP URL SSRF check. Loopback / link-local / unspecified
	// remain blocked unconditionally.
	if os.Getenv("CCTV_ALLOW_PRIVATE_RTSP") == "true" {
		cctv.SetAllowPrivateIPs(true)
		slog.Warn("CCTV_ALLOW_PRIVATE_RTSP=true: private-range RTSP hosts permitted")
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
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
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
	// DEVICES stream is owned by device-gateway; ensure it exists so the
	// cctv access-event consumer can attach even if cctv-svc starts first.
	if err := natsClient.EnsureStream(ctx, "DEVICES", []string{"dm3.devices.>"}); err != nil {
		slog.Error("failed to ensure DEVICES stream", "error", err)
		os.Exit(1)
	}
	// IDENTITY stream is owned by identity-svc; ensure it exists so the
	// face sync consumer can attach even if cctv-svc starts first.
	if err := natsClient.EnsureStream(ctx, "IDENTITY", []string{"dm3.identity.>"}); err != nil {
		slog.Error("failed to ensure IDENTITY stream", "error", err)
		os.Exit(1)
	}

	// Clip extractor is wired below, after object store + cipher are ready.
	// Declared here so the access-event consumer can reference it.
	var clipExtractor *cctv.ClipExtractor

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
	if err := validateCredentialKeyEntropy(credKey); err != nil {
		slog.Error("invalid CCTV_CREDENTIAL_KEY", "error", err)
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

	// Bootstrap: register all existing camera paths in MediaMTX (paths are in-memory,
	// lost on MediaMTX restart). Runs async so it doesn't block startup.
	go cctv.BootstrapMediaMTXPaths(ctx, database, mediamtxClient)

	// Camera liveness: poll MediaMTX for RTSP stream readiness and sweep stale
	// tungson heartbeats. Keeps dm3_devices.devices.status in sync with reality
	// AND pushes a status.heartbeat WS event on every transition so the
	// monitoring UI updates without polling.
	cctv.RunStatusMonitor(ctx, database, mediamtxClient, natsClient)

	// Object store + clip signer
	// ObjectStoreClipSigner uses the MinIO client directly for presigned URLs.
	// Falls back to the no-op signer when OBJECT_STORE_ENDPOINT is not set.
	//
	// In production we refuse to start without object storage configured — the
	// no-op signer returns raw MinIO object keys, which would leak storage
	// layout to clip-playback clients. Local/dev keeps the fallback for ergonomics.
	if os.Getenv("APP_ENV") == "production" && cfg.ObjectStoreEndpoint == "" {
		slog.Error("OBJECT_STORE_ENDPOINT is required in production; no-op clip signer would leak raw object keys")
		os.Exit(1)
	}
	var clipSigner cctv.ClipSigner = cctv.DefaultClipSigner
	var objectStore objectstore.Store
	if cfg.ObjectStoreEndpoint != "" {
		var storeErr error
		objectStore, storeErr = objectstore.NewMinIOStore(ctx, objectstore.Config{
			Endpoint:         cfg.ObjectStoreEndpoint,
			PublicEndpoint:   cfg.ObjectStorePublicEndpoint,
			AccessKeyID:      cfg.ObjectStoreAccessKeyID,
			SecretAccessKey:  cfg.ObjectStoreSecretAccessKey,
			Bucket:           cfg.ObjectStoreBucket,
			UseSSL:           cfg.ObjectStoreUseSSL,
			PublicUseSSL:     cfg.ObjectStorePublicUseSSL,
			AutoCreateBucket: cfg.ObjectStoreAutoCreateBucket,
		})
		if storeErr != nil {
			slog.Error("failed to initialize object storage", "error", storeErr)
			os.Exit(1)
		}
		slog.Info("using MinIO object storage", "endpoint", cfg.ObjectStoreEndpoint)

		// Presigned URLs must embed the PUBLIC-facing endpoint so browsers
		// can hit them — signing against minio:9000 (container network) is
		// fine for PutObject calls from cctv-svc itself, but baking that
		// internal hostname into clip playback URLs breaks the UI. Fall
		// back to the internal endpoint when public isn't configured (dev).
		presignEndpoint := cfg.ObjectStorePublicEndpoint
		presignUseSSL := cfg.ObjectStorePublicUseSSL
		if presignEndpoint == "" {
			presignEndpoint = cfg.ObjectStoreEndpoint
			presignUseSSL = cfg.ObjectStoreUseSSL
		}
		realSigner, signerErr := cctv.NewObjectStoreClipSigner(
			presignEndpoint,
			cfg.ObjectStoreAccessKeyID,
			cfg.ObjectStoreSecretAccessKey,
			cfg.ObjectStoreBucket,
			presignUseSSL,
		)
		if signerErr != nil {
			slog.Error("failed to initialize clip signer", "error", signerErr)
			os.Exit(1)
		}
		clipSigner = realSigner
		slog.Info("clip signer configured", "bucket", cfg.ObjectStoreBucket)
	} else {
		slog.Warn("OBJECT_STORE_ENDPOINT not set — clip playback URLs will return object_key unchanged")
	}

	// Clip + snapshot extractors — require object store. Worker pool bounds
	// ffmpeg concurrency across both paths so event bursts can't spawn
	// unbounded concat jobs. Default pool size 8 matches migration 000048's
	// cctv_settings.max_concurrent_extractions default; tenant-specific sizing
	// is a TODO — the pool is process-wide, not per-tenant, so we'd need to
	// either cap the biggest tenant or shard the consumer.
	var snapshotExtractor *cctv.SnapshotExtractor
	var workerPool *cctv.ExtractionWorkerPool
	if objectStore != nil {
		// When MEDIAMTX_RECORD_DIR is set the extractor prefers splicing from
		// the rolling buffer (real pre-roll); empty value means live-pull
		// fallback only. docker-compose.local.yml wires this to the shared
		// volume mounted on both the MediaMTX and cctv-svc containers.
		recordDir := os.Getenv("MEDIAMTX_RECORD_DIR")
		clipExtractor = cctv.NewClipExtractor(database, objectStore, cipher, recordDir)
		snapshotExtractor = cctv.NewSnapshotExtractor(database, objectStore, cipher)
		workerPool = cctv.NewExtractionWorkerPool(8)
		slog.Info("cctv extractors + worker pool enabled", "max_concurrent", 8, "rolling_buffer_dir", recordDir)
	} else {
		slog.Warn("object store not configured — clip & snapshot extraction disabled (placeholders only)")
	}

	// Finalizer: drains pending→finalized for coalesced clips. Runs forever
	// until ctx cancellation. Only meaningful when both extractor + workers
	// are present.
	if finalizer := cctv.NewClipFinalizer(database, clipExtractor, workerPool); finalizer != nil {
		go finalizer.Run(ctx)
	}

	// Start access-event consumer — drives the capture pipeline governed by
	// dm3_cctv.event_rules. Coalesces bursts, dispatches to extractors.
	accessEventConsumer := cctv.NewAccessEventConsumer(database, natsClient, clipExtractor, snapshotExtractor, workerPool)
	if err := accessEventConsumer.Start(ctx); err != nil {
		slog.Error("failed to start cctv access-event consumer", "error", err)
		os.Exit(1)
	}

	// HTTP handlers
	handlers := cctv.NewCCTVHandlers(database, auditLog, natsClient, mediamtxClient, cipher, clipSigner, objectStore)

	// Retention worker — purges expired clips from object storage and DB.
	if objectStore != nil {
		retentionWorker := cctv.NewRetentionWorker(database, objectStore, time.Hour)
		go retentionWorker.Run(ctx)
		slog.Info("cctv retention worker started", "interval", "1h")
	} else {
		slog.Warn("object store not configured — retention worker disabled")
	}

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
	cctv.RegisterStreamProxyRoutes(r, handlers, cfg.JWTSecret)
	cctv.RegisterPublicRoutes(r, handlers)

	// TungSon VIID camera adapter (no JWT — camera auth by device_id)
	tungsonHandlers := cctv.NewTungSonHandlers(database, auditLog, natsClient, objectStore)
	cctv.RegisterTungSonRoutes(r, tungsonHandlers)

	// Face sync service + identity change consumer
	faceSyncSvc := cctv.NewFaceSyncService(database, natsClient)
	identitySyncConsumer := cctv.NewIdentityChangeSyncConsumer(database, natsClient, faceSyncSvc)
	if err := identitySyncConsumer.Start(ctx); err != nil {
		slog.Error("failed to start identity sync consumer", "error", err)
		os.Exit(1)
	}

	// Bridge gateway "Transmit Data" sync into the TungSon face queue.
	// Gateway publishes dm3.devices.sync.request whenever the operator hits
	// /api/v1/gateway/devices/{id}/sync; this consumer turns camera-targeted
	// requests into an EnqueueFullSync.
	deviceSyncConsumer := cctv.NewDeviceSyncRequestConsumer(database, natsClient, faceSyncSvc)
	if err := deviceSyncConsumer.Start(ctx); err != nil {
		slog.Error("failed to start device sync request consumer", "error", err)
		os.Exit(1)
	}

	// Register full-sync API endpoint (manager+ only, under /api/v1/cctv/)
	cctv.RegisterSyncRoutes(r, faceSyncSvc, cfg.JWTSecret)

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
