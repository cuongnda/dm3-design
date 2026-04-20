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
	"github.com/duali/dm3-backend/internal/visitor"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting visitor-svc")

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

	// Ensure NATS stream for visitor events
	if err := natsClient.EnsureStream(ctx, "VISITOR", []string{"dm3.visitor.>"}); err != nil {
		slog.Error("failed to ensure VISITOR stream", "error", err)
		os.Exit(1)
	}

	// Ensure ACCESS stream to subscribe to credential.created events
	if err := natsClient.EnsureStream(ctx, "ACCESS", []string{"dm3.access.>"}); err != nil {
		slog.Error("failed to ensure ACCESS stream", "error", err)
		os.Exit(1)
	}

	// Ensure AUDIT stream for audit event publishing
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	// Build lookup cache and subscribe to user/zone events from upstream services.
	// The IDENTITY and ACCESS streams are owned by identity-svc and access-svc respectively;
	// we subscribe as a durable consumer to keep the cache warm.
	lookupCache := visitor.NewLookupCache(database)
	if err := lookupCache.Subscribe(ctx, natsClient); err != nil {
		slog.Warn("failed to subscribe lookup cache to NATS events; falling back to DB-only resolution", "error", err)
	}

	// Start credential consumer: receives credential.created from access-svc and
	// stores the temp_credential_id on the visit.
	credConsumer := visitor.NewCredentialConsumer(database, natsClient)
	if err := credConsumer.Start(ctx); err != nil {
		slog.Error("failed to start credential consumer", "error", err)
		os.Exit(1)
	}

	// Load i18n translations
	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Error("failed to load i18n translations", "error", err)
		os.Exit(1)
	}

	// Audit logger
	auditLog := audit.New(natsClient, "visitor-svc")
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
	visitorHandlers := visitor.NewVisitorHandlers(database, auditLog, lookupCache, natsClient)

	// HTTP routes
	r := httputil.NewRouter()
	r.Use(i18n.LocaleMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "visitor-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			httputil.Error(w, http.StatusServiceUnavailable, "database not ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	// Visitor management routes
	r.Route("/api/v1/visitors", func(vr chi.Router) {
		// Public: QR code lookup (no auth required)
		vr.Get("/qr/{qr_token}", visitorHandlers.GetVisitByQR)

		// Authenticated routes
		vr.Group(func(ar chi.Router) {
			ar.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
			ar.Use(authsvc.RequireCompany())
			ar.Use(authsvc.RequirePlugin("visitor"))

			// Dashboard: all authenticated tenant users with the plugin enabled
			ar.Get("/today/summary", visitorHandlers.GetTodaySummary)

			// Visit CRUD/lifecycle: reads open, writes require visitor.visit.manage.
			// Approvals use visitor.visit.approve (always checked — no read pass-through).
			ar.Group(func(mr chi.Router) {
				mr.Use(authsvc.RequireWritePermission("visitor.visit.manage"))
				mr.Post("/walkin", visitorHandlers.WalkinVisit)

				mr.Get("/", visitorHandlers.ListVisits)
				mr.Post("/", visitorHandlers.CreateVisit)
				mr.Get("/{id}", visitorHandlers.GetVisit)
				mr.Put("/{id}", visitorHandlers.UpdateVisit)
				mr.Post("/{id}/checkin", visitorHandlers.CheckinVisit)
				mr.Post("/{id}/checkout", visitorHandlers.CheckoutVisit)
				mr.Post("/{id}/reinvite", visitorHandlers.ReinviteVisit)

				// Legacy /visits aliases
				mr.Get("/visits", visitorHandlers.ListVisits)
				mr.Post("/visits", visitorHandlers.CreateVisit)
				mr.Get("/visits/{id}", visitorHandlers.GetVisit)
				mr.Put("/visits/{id}", visitorHandlers.UpdateVisit)
				mr.Post("/visits/{id}/checkin", visitorHandlers.CheckinVisit)
				mr.Post("/visits/{id}/checkout", visitorHandlers.CheckoutVisit)
				mr.Post("/visits/{id}/reinvite", visitorHandlers.ReinviteVisit)

				// Batch registration
				mr.Post("/batch", visitorHandlers.BatchCreateVisits)

				// Visit groups
				mr.Get("/groups", visitorHandlers.ListVisitGroups)
				mr.Post("/groups", visitorHandlers.CreateVisitGroup)
				mr.Get("/groups/{group_id}", visitorHandlers.GetVisitGroup)
				mr.Delete("/groups/{group_id}", visitorHandlers.DeleteVisitGroup)

				// Access history & evacuation
				mr.Get("/{id}/access-log", visitorHandlers.ListVisitAccessLog)
				mr.Get("/history/{visitor_id}", visitorHandlers.ListVisitorHistory)
				mr.Get("/evacuation", visitorHandlers.GetEvacuationList)

				// Watchlist
				mr.Get("/watchlist", visitorHandlers.ListWatchlist)
				mr.Post("/watchlist", visitorHandlers.CreateWatchlistEntry)
				mr.Delete("/watchlist/{id}", visitorHandlers.DeleteWatchlistEntry)

				// Agreements
				mr.Get("/agreements", visitorHandlers.ListAgreements)
				mr.Post("/agreements", visitorHandlers.CreateAgreement)
				mr.Put("/agreements/{agreement_id}", visitorHandlers.UpdateAgreement)
				mr.Get("/{id}/agreements", visitorHandlers.ListVisitSignatures)
				mr.Post("/{id}/agreements/sign", visitorHandlers.SignAgreement)

				// Analytics
				mr.Get("/analytics", visitorHandlers.GetVisitorAnalytics)
				mr.Get("/analytics/top-visitors", visitorHandlers.GetTopVisitors)

				// Recurring visit templates
				mr.Get("/recurring", visitorHandlers.ListRecurringTemplates)
				mr.Post("/recurring", visitorHandlers.CreateRecurringTemplate)
				mr.Put("/recurring/{template_id}", visitorHandlers.UpdateRecurringTemplate)
				mr.Delete("/recurring/{template_id}", visitorHandlers.DeleteRecurringTemplate)
			})

			// Approvals: always require visitor.visit.approve.
			ar.Group(func(apr chi.Router) {
				apr.Use(authsvc.RequirePermission("visitor.visit.approve"))
				apr.Post("/{id}/approve", visitorHandlers.ApproveVisit)
				apr.Post("/visits/{id}/approve", visitorHandlers.ApproveVisit)
			})

			// Settings: reads open, writes require company.settings.manage.
			ar.Group(func(sr chi.Router) {
				sr.Use(authsvc.RequireWritePermission("company.settings.manage"))
				sr.Get("/settings", visitorHandlers.GetSettings)
				sr.Put("/settings", visitorHandlers.UpdateSettings)
			})
		})
	})

	// Start visitor background jobs (auto-checkout, no-show marking)
	visitorHandlers.StartBackgroundJobs(ctx)

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

	slog.Info("shutting down visitor-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("visitor-svc shutdown complete")
}
