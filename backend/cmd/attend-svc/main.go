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

	// Attendance routes split into four concentric permission bands:
	//
	//  1. /me/*       — self-service. Any authenticated tenant user. Writes
	//                   force user_id = claims.Sub so employees can't act on
	//                   behalf of anyone else.
	//  2. shared reads — GETs that both employees and managers need
	//                   (shifts, holidays, leave policies, leave calendar).
	//                   Gated by RequireWriteRole which is a no-op on
	//                   GET/HEAD/OPTIONS so reads stay open to all roles.
	//  3. management   — CRUD on org-level resources (shifts, policies,
	//                   holidays, settings, reports, records adjustment,
	//                   overtime review, leave approve/reject/cancel on
	//                   behalf of others, admin leave create). Requires a
	//                   manager-tier role.
	//  4. /leave/sync  — HR integration hook. Tighter role list
	//                   (primary_manager / system_admin) because it bulk-
	//                   mutates leave balances and has no per-row UI guard.
	//
	// All bands share the auth+company+plugin middleware.
	managerRoles := []string{"manager", "primary_manager", "system_admin"}
	hrSyncRoles := []string{"primary_manager", "system_admin"}

	r.Route("/api/v1/attendance", func(ar chi.Router) {
		ar.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		ar.Use(authsvc.RequireCompany())
		ar.Use(authsvc.RequirePlugin("attendance"))

		// ── Band 1: self-service (no role gate; handlers force claims.Sub) ──
		ar.Get("/me/attendance", handlers.MeAttendance)
		ar.Get("/me/leave", handlers.MeLeave)
		ar.Post("/me/leave/requests", handlers.CreateMeLeaveRequest)
		ar.Post("/me/leave/requests/{id}/cancel", handlers.CancelMeLeaveRequest)
		ar.Post("/me/overtime/request", handlers.RequestMeOvertime)

		// ── Band 2+3: shared reads + management writes.
		// RequireWriteRole only gates mutating methods, so GETs remain open
		// to all authenticated roles while POST/PATCH/PUT/DELETE require a
		// manager tier.
		ar.Group(func(mgr chi.Router) {
			mgr.Use(authsvc.RequireWriteRole(managerRoles...))

			mgr.Get("/records", handlers.ListRecords)
			mgr.Get("/records/summary", handlers.DailySummary)
			mgr.Get("/records/{id}", handlers.GetRecord)
			mgr.Patch("/records/{id}", handlers.AdjustRecord)

			mgr.Get("/shifts", handlers.ListShifts)
			mgr.Post("/shifts", handlers.CreateShift)
			mgr.Post("/shifts/assign", handlers.BulkAssignShift)
			mgr.Get("/shifts/{id}", handlers.GetShift)
			mgr.Patch("/shifts/{id}", handlers.UpdateShift)
			mgr.Delete("/shifts/{id}", handlers.ArchiveShift)

			mgr.Get("/leave/policies", handlers.ListLeavePolicies)
			mgr.Post("/leave/policies", handlers.CreateLeavePolicy)
			mgr.Patch("/leave/policies/{id}", handlers.UpdateLeavePolicy)
			mgr.Delete("/leave/policies/{id}", handlers.DeleteLeavePolicy)
			mgr.Get("/leave/requests", handlers.ListLeaveRequests)
			mgr.Post("/leave/requests", handlers.CreateLeaveRequest)
			mgr.Post("/leave/requests/{id}/approve", handlers.ApproveLeaveRequest)
			mgr.Post("/leave/requests/{id}/reject", handlers.RejectLeaveRequest)
			mgr.Post("/leave/requests/{id}/cancel", handlers.CancelLeaveRequest)
			mgr.Get("/leave/balances", handlers.ListLeaveBalances)
			mgr.Post("/leave/balances/adjust", handlers.AdjustLeaveBalance)
			mgr.Get("/leave/calendar", handlers.LeaveCalendar)

			mgr.Get("/holidays", handlers.ListHolidays)
			mgr.Post("/holidays", handlers.CreateHoliday)
			mgr.Patch("/holidays/{id}", handlers.UpdateHoliday)
			mgr.Delete("/holidays/{id}", handlers.DeleteHoliday)

			mgr.Get("/settings", handlers.GetSettings)
			mgr.Put("/settings", handlers.UpdateSettings)

			mgr.Get("/overtime", handlers.ListOvertime)
			mgr.Post("/overtime/request", handlers.RequestOvertime)
			mgr.Post("/overtime/{id}/approve", handlers.ApproveOvertime)
			mgr.Post("/overtime/{id}/reject", handlers.RejectOvertime)

			mgr.Get("/devices", handlers.ListAttendanceDevices)
			mgr.Post("/devices", handlers.RegisterAttendanceDevice)
			mgr.Delete("/devices/{id}", handlers.DeregisterAttendanceDevice)

			mgr.Get("/reports/summary", handlers.GetReport)
			mgr.Get("/reports/summary.csv", handlers.GetReportCSV)

			mgr.Get("/summary/monthly", handlers.ListAttendanceSummary)
			mgr.Post("/summary/monthly/rebuild", handlers.RebuildMonthlySummary)

			mgr.Post("/reports/monthly/export", handlers.ExportMonthlyReport)
			mgr.Get("/reports/monthly/download", handlers.DownloadMonthlyReport)
		})

		// ── Band 4: HR integration. Primary manager / system admin only.
		ar.Group(func(hr chi.Router) {
			hr.Use(authsvc.RequireRole(hrSyncRoles...))
			hr.Post("/leave/sync", handlers.SyncLeaveRequests)
		})
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
