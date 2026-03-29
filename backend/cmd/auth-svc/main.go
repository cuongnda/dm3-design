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
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
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

	// Run migrations
	if err := database.RunMigrations(ctx, "pkg/db/migrations"); err != nil {
		slog.Warn("migrations", "error", err)
	}

	h := authsvc.NewHandlers(database, cfg.JWTSecret)
	r := httputil.NewRouter()

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
		pr.Post("/api/v1/auth/device-token", h.DeviceToken)
		pr.Get("/api/v1/roles", h.ListRoles)

		// User management: primary_manager and system_admin only
		pr.Group(func(ar chi.Router) {
			ar.Use(authsvc.RequireRole("primary_manager", "system_admin"))
			ar.Get("/api/v1/users", h.ListUsers)
			ar.Post("/api/v1/users", h.CreateUser)
			ar.Get("/api/v1/users/{id}", h.GetUser)
			ar.Put("/api/v1/users/{id}", h.UpdateUser)
			ar.Delete("/api/v1/users/{id}", h.DeleteUser)
			ar.Put("/api/v1/users/{id}/password", h.ChangePassword)
		})

		// System admin only: company management
		pr.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/api/v1/system/companies", h.ListCompanies)
			sr.Post("/api/v1/system/companies", h.CreateCompany)
			sr.Get("/api/v1/system/companies/{id}", h.GetCompany)
			sr.Put("/api/v1/system/companies/{id}", h.UpdateCompany)
			sr.Delete("/api/v1/system/companies/{id}", h.DeleteCompany)
		})
	})

	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	slog.Info("starting auth-svc", "addr", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
