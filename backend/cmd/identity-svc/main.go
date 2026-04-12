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
	"github.com/duali/dm3-backend/internal/identity"
	"github.com/duali/dm3-backend/internal/tenant"
	"github.com/duali/dm3-backend/internal/visitor"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting identity-svc")

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

	// Ensure NATS stream for identity events
	if err := natsClient.EnsureStream(ctx, "IDENTITY", []string{"dm3.identity.>"}); err != nil {
		slog.Error("failed to ensure nats stream", "error", err)
		os.Exit(1)
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
	auditLog := audit.New(natsClient, "identity-svc")
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

	var objectStore objectstore.Store
	if cfg.PhotoStorage == "local" {
		objectStore, err = objectstore.NewLocalStore(cfg.PhotoLocalDir)
		if err != nil {
			slog.Error("failed to initialize local file storage", "error", err)
			os.Exit(1)
		}
		slog.Info("using local file storage", "dir", cfg.PhotoLocalDir)
	} else {
		objectStore, err = objectstore.NewMinIOStore(ctx, objectstore.Config{
			Endpoint:         cfg.ObjectStoreEndpoint,
			AccessKeyID:      cfg.ObjectStoreAccessKeyID,
			SecretAccessKey:  cfg.ObjectStoreSecretAccessKey,
			Bucket:           cfg.ObjectStoreBucket,
			UseSSL:           cfg.ObjectStoreUseSSL,
			AutoCreateBucket: cfg.ObjectStoreAutoCreateBucket,
		})
		if err != nil {
			slog.Error("failed to initialize object storage", "error", err)
			os.Exit(1)
		}
		slog.Info("using MinIO object storage", "endpoint", cfg.ObjectStoreEndpoint)
	}

	// Email client
	emailClient := email.New(email.Config{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		Username: cfg.SMTPUsername,
		Password: cfg.SMTPPassword,
		FromName: cfg.SMTPFromName,
		FromAddr: cfg.SMTPFromAddr,
		UseTLS:   cfg.SMTPUseTLS,
	})

	// HTTP handlers
	handlers := identity.NewIdentityHandlers(database, natsClient, auditLog, objectStore)
	handlers.SetEmailClient(emailClient, cfg.AppURL)
	umHandlers := tenant.NewUserManagementHandlers(database, auditLog)
	visitorHandlers := visitor.NewVisitorHandlers(database, auditLog)
	visitorHandlers.SetEmailClient(emailClient)

	// HTTP routes
	r := httputil.NewRouter()

	// Add i18n middleware to all routes
	r.Use(i18n.LocaleMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "identity-svc"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := database.Pool.Ping(r.Context()); err != nil {
			i18n.ErrorResponse(w, r, http.StatusServiceUnavailable, "system.database_not_ready")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	// Serve uploaded photos/avatars (requires authentication via header or ?token= query param)
	r.Group(func(ar chi.Router) {
		ar.Use(authsvc.AssetAuthMiddleware(cfg.JWTSecret))
		ar.Use(authsvc.RequireCompany())
		ar.Get("/photos/*", handlers.ServeManagedPhoto)
	})

	r.Route("/api/v1/identity", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())

		// Users: operator+viewer can read, manager+ can write
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			pr.Get("/users", handlers.ListUsers)
			pr.Post("/users", handlers.CreateUser)
			pr.Get("/users/sync", handlers.SyncUsers)
			pr.Get("/users/{id}", handlers.GetUser)
			pr.Put("/users/{id}", handlers.UpdateUser)
			pr.Delete("/users/{id}", handlers.DeleteUser)
			pr.Post("/users/bulk-delete", handlers.BulkDeleteUsers)
			pr.Post("/users/{id}/photo", handlers.UploadPhoto)
			pr.Post("/users/{id}/avatar", handlers.UploadUserAvatar)
		})

		// Credentials: operator+viewer can read, manager+ can write
		r.Group(func(cr chi.Router) {
			cr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			cr.Get("/users/{id}/credentials", handlers.ListCredentials)
			cr.Post("/users/{id}/credentials", handlers.CreateCredential)
			cr.Get("/users/{id}/credentials/{credID}", handlers.GetCredential)
			cr.Put("/users/{id}/credentials/{credID}", handlers.UpdateCredential)
			cr.Delete("/users/{id}/credentials/{credID}", handlers.DeleteCredential)
		})

		// User Groups: manager+ can write
		r.Group(func(gr chi.Router) {
			gr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			gr.Get("/groups", handlers.ListGroups)
			gr.Post("/groups", handlers.CreateGroup)
			gr.Get("/groups/{id}", handlers.GetGroup)
			gr.Put("/groups/{id}", handlers.UpdateGroup)
			gr.Delete("/groups/{id}", handlers.DeleteGroup)
			gr.Get("/groups/{id}/members", handlers.ListGroupMembers)
			gr.Post("/groups/{id}/members", handlers.AddGroupMember)
			gr.Delete("/groups/{id}/members/{userID}", handlers.RemoveGroupMember)
		})

		// Vehicles: manager+ can write
		r.Group(func(vr chi.Router) {
			vr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			vr.Get("/vehicles", handlers.ListVehicles)
			vr.Post("/vehicles", handlers.CreateVehicle)
			vr.Get("/vehicles/{vehicleID}", handlers.GetVehicle)
			vr.Put("/vehicles/{vehicleID}", handlers.UpdateVehicle)
			vr.Delete("/vehicles/{vehicleID}", handlers.DeleteVehicle)
			vr.Post("/vehicles/bulk-delete", handlers.BulkDeleteVehicles)
			vr.Get("/users/{id}/vehicles", handlers.ListUserVehicles)
		})

		// Stats: all roles can read
		r.Get("/stats", handlers.GetStats)

		// Email templates: manager+ can manage
		r.Route("/email-templates", func(et chi.Router) {
			et.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			et.Get("/types", handlers.ListEmailTemplateTypes)
			et.Get("/", handlers.ListEmailTemplates)
			et.Post("/", handlers.CreateEmailTemplate)
			et.Post("/preview", handlers.PreviewEmailTemplate)
			et.Get("/by-type/{type}", handlers.GetEmailTemplateByType)
			et.Get("/{id}", handlers.GetEmailTemplate)
			et.Put("/{id}", handlers.UpdateEmailTemplate)
			et.Delete("/{id}", handlers.DeleteEmailTemplate)
		})
	})

	// Department management routes (proxied here from frontend)
	r.Group(func(pr chi.Router) {
		pr.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		pr.Use(authsvc.RequireCompany())
		tenant.AddDepartmentRoutes(pr, umHandlers)
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

			// Visit CRUD & lifecycle (keep legacy /visits aliases for compatibility)
			ar.Get("/", visitorHandlers.ListVisits)
			ar.Post("/", visitorHandlers.CreateVisit)
			ar.Get("/{id}", visitorHandlers.GetVisit)
			ar.Put("/{id}", visitorHandlers.UpdateVisit)
			ar.Post("/{id}/approve", visitorHandlers.ApproveVisit)
			ar.Post("/{id}/checkin", visitorHandlers.CheckinVisit)
			ar.Post("/{id}/checkout", visitorHandlers.CheckoutVisit)
			ar.Get("/visits", visitorHandlers.ListVisits)
			ar.Post("/visits", visitorHandlers.CreateVisit)
			ar.Get("/visits/{id}", visitorHandlers.GetVisit)
			ar.Put("/visits/{id}", visitorHandlers.UpdateVisit)
			ar.Post("/visits/{id}/approve", visitorHandlers.ApproveVisit)
			ar.Post("/visits/{id}/checkin", visitorHandlers.CheckinVisit)
			ar.Post("/visits/{id}/checkout", visitorHandlers.CheckoutVisit)

			// Watchlist
			ar.Get("/watchlist", visitorHandlers.ListWatchlist)
			ar.Post("/watchlist", visitorHandlers.CreateWatchlistEntry)
			ar.Delete("/watchlist/{id}", visitorHandlers.DeleteWatchlistEntry)
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

	slog.Info("shutting down identity-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("identity-svc shutdown complete")
}
