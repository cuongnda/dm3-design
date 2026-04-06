package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/internal/tenant"
	"github.com/duali/dm3-backend/pkg/bugreporter"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()

	ctx := context.Background()
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations("pkg/db/migrations"); err != nil {
		slog.Warn("migrations", "error", err)
	}

	// Load i18n translations
	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Error("failed to load i18n translations", "error", err)
		os.Exit(1)
	}

	h := authsvc.NewHandlers(database, cfg.JWTSecret)
	r := httputil.NewRouter()

	// Bug reporter middleware (auto-reports 5xx to DV Tasks)
	bugReporter := bugreporter.New(bugreporter.Config{
		BaseURL:     cfg.BugReporterURL,
		Token:       cfg.BugReporterToken,
		ProjectID:   cfg.BugReporterProjectID,
		SprintID:    cfg.BugReporterSprintID,
		AssigneeID:  cfg.BugReporterAssignee,
		ServiceName: "auth-svc",
		Enabled:     cfg.BugReporterEnabled,
	})
	r.Use(bugreporter.Middleware(bugReporter))

	// Add i18n middleware to all routes
	r.Use(i18n.LocaleMiddleware)

	// Register tenant routes (after all global middleware)
	tenant.RegisterRoutes(r, database, cfg.JWTSecret)

	// Health
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "auth-svc"})
	})

	// Public auth routes
	r.Post("/api/v1/auth/login", h.Login)
	r.Post("/api/v1/auth/login-step2", h.LoginStep2)
	r.Post("/api/v1/auth/refresh", h.Refresh)

	// Protected routes
	r.Group(func(pr chi.Router) {
		pr.Use(authsvc.AuthMiddleware(cfg.JWTSecret))

		pr.Post("/api/v1/auth/logout", h.Logout)
		pr.Get("/api/v1/auth/me", h.Me)
		pr.Patch("/api/v1/auth/me", h.UpdateMe)
		pr.Post("/api/v1/auth/device-token", h.DeviceToken)
		pr.Get("/api/v1/roles", h.ListRoles)

		// System admin only: company management + stats
		pr.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/api/v1/system/stats", h.SystemStats)
			sr.Get("/api/v1/system/companies", h.ListCompanies)
			sr.Post("/api/v1/system/companies", h.CreateCompany)
			sr.Get("/api/v1/system/companies/{id}", h.GetCompany)
			sr.Put("/api/v1/system/companies/{id}", h.UpdateCompany)
			sr.Delete("/api/v1/system/companies/{id}", h.DeleteCompany)

			// Account management
			sr.Get("/api/v1/system/accounts", h.ListUserAccounts)
			sr.Post("/api/v1/system/accounts", h.CreateUserAccount)
			sr.Get("/api/v1/system/accounts/{id}", h.GetUserAccount)
			sr.Patch("/api/v1/system/accounts/{id}", h.UpdateUserAccount)
			sr.Delete("/api/v1/system/accounts/{id}", h.DeleteUserAccount)
			sr.Post("/api/v1/system/accounts/{id}/reset-password", h.ResetUserPassword)
			sr.Put("/api/v1/system/accounts/{id}/change-password", h.ChangeUserPassword)
		})
	})

	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	slog.Info("starting auth-svc", "addr", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
