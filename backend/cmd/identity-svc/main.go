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
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	slog.Info("starting identity-svc")

	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to database
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations("pkg/db/migrations"); err != nil {
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

	// HTTP handlers
	handlers := identity.NewHandlers(database, natsClient)

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

	// Serve uploaded photos/avatars
	r.Handle("/photos/*", http.StripPrefix("/photos/", http.FileServer(http.Dir("data/photos"))))

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(cfg.JWTSecret))
		r.Use(authsvc.RequireCompany())

		// Users (identity): manager+ can read/write
		r.Group(func(ur chi.Router) {
			ur.Use(authsvc.RequireRole("manager", "primary_manager", "system_admin"))
			ur.Get("/users", handlers.ListUsers)
			ur.Post("/users", handlers.CreateUser)
			ur.Get("/users/{id}", handlers.GetUser)
			ur.Put("/users/{id}", handlers.UpdateUser)
			ur.Delete("/users/{id}", handlers.DeleteUser)
			ur.Post("/users/bulk-delete", handlers.BulkDeleteUsers)
			ur.Post("/users/{id}/avatar", handlers.UploadUserAvatar)
			ur.Get("/departments", handlers.ListUserDepartments)
		})

		// Persons: operator+viewer can read, manager+ can write
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			pr.Get("/persons", handlers.ListPersons)
			pr.Post("/persons", handlers.CreatePerson)
			pr.Get("/persons/sync", handlers.SyncPersons)
			pr.Get("/persons/{id}", handlers.GetPerson)
			pr.Put("/persons/{id}", handlers.UpdatePerson)
			pr.Delete("/persons/{id}", handlers.DeletePerson)
			pr.Post("/persons/{id}/photo", handlers.UploadPhoto)
		})

		// Credentials: operator+viewer can read, manager+ can write
		r.Group(func(cr chi.Router) {
			cr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			cr.Get("/persons/{id}/credentials", handlers.ListCredentials)
			cr.Post("/persons/{id}/credentials", handlers.CreateCredential)
			cr.Get("/persons/{id}/credentials/{credID}", handlers.GetCredential)
			cr.Put("/persons/{id}/credentials/{credID}", handlers.UpdateCredential)
			cr.Delete("/persons/{id}/credentials/{credID}", handlers.DeleteCredential)
		})

		// Person Groups: operator+viewer can read, manager+ can write
		r.Group(func(gr chi.Router) {
			gr.Use(authsvc.RequireWriteRole("primary_manager", "manager", "system_admin"))
			gr.Get("/groups", handlers.ListGroups)
			gr.Post("/groups", handlers.CreateGroup)
			gr.Get("/groups/{id}", handlers.GetGroup)
			gr.Put("/groups/{id}", handlers.UpdateGroup)
			gr.Delete("/groups/{id}", handlers.DeleteGroup)
			gr.Get("/groups/{id}/members", handlers.ListGroupMembers)
			gr.Post("/groups/{id}/members", handlers.AddGroupMember)
			gr.Delete("/groups/{id}/members/{personID}", handlers.RemoveGroupMember)
		})

		// Stats: all roles can read
		r.Get("/stats", handlers.GetStats)
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

	slog.Info("shutting down identity-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("identity-svc shutdown complete")
}
