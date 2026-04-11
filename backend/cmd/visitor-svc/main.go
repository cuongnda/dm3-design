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

	// Ensure AUDIT stream for audit event publishing
	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
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
	visitorHandlers := visitor.NewVisitorHandlers(database, auditLog, natsClient)

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

			// Dashboard
			ar.Get("/today/summary", visitorHandlers.GetTodaySummary)

			// Walk-in registration
			ar.Post("/walkin", visitorHandlers.WalkinVisit)

			// Visit CRUD & lifecycle
			ar.Get("/", visitorHandlers.ListVisits)
			ar.Post("/", visitorHandlers.CreateVisit)
			ar.Get("/{id}", visitorHandlers.GetVisit)
			ar.Put("/{id}", visitorHandlers.UpdateVisit)
			ar.Post("/{id}/approve", visitorHandlers.ApproveVisit)
			ar.Post("/{id}/checkin", visitorHandlers.CheckinVisit)
			ar.Post("/{id}/checkout", visitorHandlers.CheckoutVisit)
			ar.Post("/{id}/reinvite", visitorHandlers.ReinviteVisit)

			// Legacy /visits aliases
			ar.Get("/visits", visitorHandlers.ListVisits)
			ar.Post("/visits", visitorHandlers.CreateVisit)
			ar.Get("/visits/{id}", visitorHandlers.GetVisit)
			ar.Put("/visits/{id}", visitorHandlers.UpdateVisit)
			ar.Post("/visits/{id}/approve", visitorHandlers.ApproveVisit)
			ar.Post("/visits/{id}/checkin", visitorHandlers.CheckinVisit)
			ar.Post("/visits/{id}/checkout", visitorHandlers.CheckoutVisit)
			ar.Post("/visits/{id}/reinvite", visitorHandlers.ReinviteVisit)

			// Batch registration
			ar.Post("/batch", visitorHandlers.BatchCreateVisits)

			// Visit groups
			ar.Get("/groups", visitorHandlers.ListVisitGroups)
			ar.Post("/groups", visitorHandlers.CreateVisitGroup)
			ar.Get("/groups/{group_id}", visitorHandlers.GetVisitGroup)
			ar.Delete("/groups/{group_id}", visitorHandlers.DeleteVisitGroup)

			// Access history & evacuation
			ar.Get("/{id}/access-log", visitorHandlers.ListVisitAccessLog)
			ar.Get("/history/{visitor_id}", visitorHandlers.ListVisitorHistory)
			ar.Get("/evacuation", visitorHandlers.GetEvacuationList)

			// Watchlist
			ar.Get("/watchlist", visitorHandlers.ListWatchlist)
			ar.Post("/watchlist", visitorHandlers.CreateWatchlistEntry)
			ar.Delete("/watchlist/{id}", visitorHandlers.DeleteWatchlistEntry)

			// Agreements
			ar.Get("/agreements", visitorHandlers.ListAgreements)
			ar.Post("/agreements", visitorHandlers.CreateAgreement)
			ar.Put("/agreements/{agreement_id}", visitorHandlers.UpdateAgreement)
			ar.Get("/{id}/agreements", visitorHandlers.ListVisitSignatures)
			ar.Post("/{id}/agreements/sign", visitorHandlers.SignAgreement)

			// Analytics
			ar.Get("/analytics", visitorHandlers.GetVisitorAnalytics)
			ar.Get("/analytics/top-visitors", visitorHandlers.GetTopVisitors)

			// Recurring visit templates
			ar.Get("/recurring", visitorHandlers.ListRecurringTemplates)
			ar.Post("/recurring", visitorHandlers.CreateRecurringTemplate)
			ar.Put("/recurring/{template_id}", visitorHandlers.UpdateRecurringTemplate)
			ar.Delete("/recurring/{template_id}", visitorHandlers.DeleteRecurringTemplate)

			// Settings (manager+ only)
			ar.Get("/settings", visitorHandlers.GetSettings)
			ar.Put("/settings", visitorHandlers.UpdateSettings)
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
