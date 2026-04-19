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

	"github.com/duali/dm3-backend/internal/attendance"
	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting attend-svc")

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("insecure configuration", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations(); err != nil {
		slog.Warn("migrations", "error", err)
	}

	natsClient, err := natsutil.Connect(ctx, cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to nats", "error", err)
		os.Exit(1)
	}
	defer natsClient.Close()

	// DEVICES stream is owned by device-gateway; we subscribe as a durable
	// consumer to derive attendance from access.log events.
	if err := natsClient.EnsureStream(ctx, "DEVICES", []string{"dm3.devices.>"}); err != nil {
		slog.Error("failed to ensure DEVICES stream", "error", err)
		os.Exit(1)
	}
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Warn("failed to load i18n translations", "error", err)
	}

	auditLog := audit.New(natsClient, "attend-svc")
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

	// Attendance consumer: turns device access.log events into
	// attendance_records rows (first event = clock_in, latest = clock_out).
	// auditLog is passed so BR-ATT-009 leave-clash detections are auditable.
	consumer := attendance.NewAccessEventConsumer(database, natsClient, auditLog)
	if err := consumer.Start(ctx); err != nil {
		slog.Error("failed to start access-event consumer", "error", err)
		os.Exit(1)
	}

	// Object storage is optional — if MinIO is not reachable, report
	// export endpoints return 503 but the rest of the service keeps
	// working. This mirrors the cctv-svc policy.
	var objectStore objectstore.Store
	if cfg.ObjectStoreEndpoint != "" {
		store, storeErr := objectstore.NewMinIOStore(ctx, objectstore.Config{
			Endpoint:         cfg.ObjectStoreEndpoint,
			AccessKeyID:      cfg.ObjectStoreAccessKeyID,
			SecretAccessKey:  cfg.ObjectStoreSecretAccessKey,
			Bucket:           cfg.ObjectStoreBucket,
			UseSSL:           cfg.ObjectStoreUseSSL,
			AutoCreateBucket: cfg.ObjectStoreAutoCreateBucket,
		})
		if storeErr != nil {
			slog.Warn("attend-svc: MinIO init failed; monthly export disabled", "error", storeErr)
		} else {
			slog.Info("attend-svc: object storage ready", "endpoint", cfg.ObjectStoreEndpoint)
			objectStore = store
		}
	}

	handlers := attendance.NewAttendanceHandlers(database, auditLog, natsClient).WithObjectStore(objectStore)

	r := httputil.NewRouter()
	r.Use(i18n.LocaleMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "attend-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			httputil.Error(w, http.StatusServiceUnavailable, "database not ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	r.Route("/api/v1/attendance", func(ar chi.Router) {
		ar.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		ar.Use(authsvc.RequireCompany())
		ar.Use(authsvc.RequirePlugin("attendance"))

		ar.Get("/records", handlers.ListRecords)
		ar.Get("/records/summary", handlers.DailySummary)
		ar.Get("/records/{id}", handlers.GetRecord)
		ar.Patch("/records/{id}", handlers.AdjustRecord)

		ar.Get("/shifts", handlers.ListShifts)
		ar.Post("/shifts", handlers.CreateShift)
		ar.Post("/shifts/assign", handlers.BulkAssignShift)
		ar.Get("/shifts/{id}", handlers.GetShift)
		ar.Patch("/shifts/{id}", handlers.UpdateShift)
		ar.Delete("/shifts/{id}", handlers.ArchiveShift)

		ar.Get("/leave/policies", handlers.ListLeavePolicies)
		ar.Post("/leave/policies", handlers.CreateLeavePolicy)
		ar.Patch("/leave/policies/{id}", handlers.UpdateLeavePolicy)
		ar.Delete("/leave/policies/{id}", handlers.DeleteLeavePolicy)
		ar.Get("/leave/requests", handlers.ListLeaveRequests)
		ar.Post("/leave/requests", handlers.CreateLeaveRequest)
		ar.Post("/leave/requests/{id}/approve", handlers.ApproveLeaveRequest)
		ar.Post("/leave/requests/{id}/reject", handlers.RejectLeaveRequest)
		ar.Post("/leave/requests/{id}/cancel", handlers.CancelLeaveRequest)
		ar.Get("/leave/balances", handlers.ListLeaveBalances)
		ar.Post("/leave/balances/adjust", handlers.AdjustLeaveBalance)
		ar.Get("/leave/calendar", handlers.LeaveCalendar)
		ar.Post("/leave/sync", handlers.SyncLeaveRequests)

		ar.Get("/holidays", handlers.ListHolidays)
		ar.Post("/holidays", handlers.CreateHoliday)
		ar.Patch("/holidays/{id}", handlers.UpdateHoliday)
		ar.Delete("/holidays/{id}", handlers.DeleteHoliday)

		ar.Get("/settings", handlers.GetSettings)
		ar.Put("/settings", handlers.UpdateSettings)

		ar.Get("/overtime", handlers.ListOvertime)
		ar.Post("/overtime/request", handlers.RequestOvertime)
		ar.Post("/overtime/{id}/approve", handlers.ApproveOvertime)
		ar.Post("/overtime/{id}/reject", handlers.RejectOvertime)

		ar.Get("/devices", handlers.ListAttendanceDevices)
		ar.Post("/devices", handlers.RegisterAttendanceDevice)
		ar.Delete("/devices/{id}", handlers.DeregisterAttendanceDevice)

		ar.Get("/reports/summary", handlers.GetReport)

		ar.Get("/summary/monthly", handlers.ListAttendanceSummary)
		ar.Post("/summary/monthly/rebuild", handlers.RebuildMonthlySummary)

		ar.Post("/reports/monthly/export", handlers.ExportMonthlyReport)
		ar.Get("/reports/monthly/download", handlers.DownloadMonthlyReport)

		ar.Get("/me/attendance", handlers.MeAttendance)
	})

	handlers.StartBackgroundJobs(ctx)

	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		slog.Info("http server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server error", "error", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("shutting down attend-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("attend-svc shutdown complete")
}
