package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/httprate"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/internal/tenant"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/bugreporter"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// realIPKey keys rate-limit buckets on the caller's actual IP, preferring
// X-Forwarded-For / X-Real-IP (set by our nginx) over RemoteAddr (which would
// otherwise be the nginx container's docker-bridge IP — making every request
// share one bucket).
func realIPKey(r *http.Request) (string, error) {
	return audit.IPFromRequest(r), nil
}

// bypassPrivate wraps an httprate limiter so callers from private IP space
// (loopback, RFC1918, link-local, CGNAT) skip the limiter. This covers local
// dev (curl from host → docker bridge gateway ≈ 192.168.x.x on macOS),
// integration tests, and internal corporate networks. Production traffic from
// the public internet always has a public IP and is still limited.
func bypassPrivate(limiter func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		limited := limiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := audit.IPFromRequest(r)
			parsed := net.ParseIP(ip)
			if parsed != nil && (parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsLinkLocalUnicast()) {
				next.ServeHTTP(w, r)
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

// @title           Duall Master API
// @version         1.0
// @description     Multi-tenant access control and smart building platform API.
// @description
// @description     All endpoints are tenant-scoped through the `Authorization: Bearer dm3_live_...`
// @description     or `dm3_test_...` API token. Issue tokens from Settings → API Integration.
// @description     Tokens prefixed `dm3_live_` act on production data; `dm3_test_` are sandbox.
// @description
// @description     The default rate limit is 60 requests/minute per token. Responses use a
// @description     consistent envelope: success responses return the resource directly, errors
// @description     return `{ "error": "<code>", "message": "<human readable>" }`.
// @termsOfService  https://duali.com/terms
//
// @contact.name    Duall Master Support
// @contact.url     https://duali.com/support
// @contact.email   support@duali.com
//
// @license.name    Proprietary
//
// @BasePath        /api/v1
//
// @securityDefinitions.apikey BearerAuth
// @in                         header
// @name                       Authorization
// @description                API token in the form `Bearer dm3_live_...` or `Bearer dm3_test_...`.
//
// @tag.name   Identity
// @tag.description Users, companies, and profiles scoped to your tenant.
// @tag.name   Access
// @tag.description Access groups, rules, and schedules.
// @tag.name   Devices
// @tag.description Door controllers, readers, and gateways.
// @tag.name   Events
// @tag.description Real-time and historical access events.
// @tag.name   Audit
// @tag.description Immutable record of every change and auth event.
// @tag.name   API Tokens
// @tag.description Manage API tokens that authenticate integrations against the public API.
func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("insecure configuration", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.RunMigrations(); err != nil {
		slog.Warn("migrations", "error", err)
	}

	// Load i18n translations
	if err := i18n.Load("pkg/i18n/locales"); err != nil {
		slog.Error("failed to load i18n translations", "error", err)
		os.Exit(1)
	}

	// Connect to NATS (for audit event publishing)
	natsClient, err := natsutil.Connect(ctx, cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to nats", "error", err)
		os.Exit(1)
	}
	defer natsClient.Close()

	if err := natsClient.EnsureStream(ctx, "AUDIT", []string{"dm3.audit.>"}); err != nil {
		slog.Error("failed to ensure AUDIT stream", "error", err)
		os.Exit(1)
	}

	auditLog := audit.New(natsClient, "auth-svc")
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

	h := authsvc.NewAuthHandlers(database, cfg.JWTSecret, auditLog)
	emailClient := email.New(email.Config{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		Username: cfg.SMTPUsername,
		Password: cfg.SMTPPassword,
		FromName: cfg.SMTPFromName,
		FromAddr: cfg.SMTPFromAddr,
		UseTLS:   cfg.SMTPUseTLS,
	})
	h.SetEmailClient(emailClient, cfg.AppURL)

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
	tenant.RegisterRoutes(r, database, cfg.JWTSecret, auditLog)

	// Health
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "auth-svc"})
	})

	// Public routes (no auth required) — rate-limited per client IP to slow
	// brute-force credential stuffing and email-enumeration via the password
	// flow. We key on the forwarded client IP (X-Forwarded-For / X-Real-IP set
	// by nginx) rather than RemoteAddr, otherwise every request would share one
	// bucket (all traffic appears to come from the nginx container). Each
	// limiter has its own window so a flood on /login does not exhaust the
	// budget for /refresh. Loopback callers bypass the limiter entirely so
	// local dev and integration tests aren't tripped by their own traffic.
	loginLimiter := bypassPrivate(httprate.Limit(5, 1*time.Minute, httprate.WithKeyFuncs(realIPKey)))
	refreshLimiter := bypassPrivate(httprate.Limit(20, 1*time.Minute, httprate.WithKeyFuncs(realIPKey)))
	passwordResetLimiter := bypassPrivate(httprate.Limit(3, 10*time.Minute, httprate.WithKeyFuncs(realIPKey)))
	// OAuth2 token endpoint is unauthenticated (clients present credentials in
	// the body); rate-limit to slow credential-stuffing against client_secrets.
	oauthTokenLimiter := bypassPrivate(httprate.Limit(30, 1*time.Minute, httprate.WithKeyFuncs(realIPKey)))

	r.With(loginLimiter).Post("/api/v1/auth/login", h.Login)
	r.With(loginLimiter).Post("/api/v1/auth/login-step2", h.LoginStep2)
	r.With(refreshLimiter).Post("/api/v1/auth/refresh", h.Refresh)
	r.With(passwordResetLimiter).Post("/api/v1/auth/password/forgot", h.ForgotPassword)
	r.With(passwordResetLimiter).Post("/api/v1/auth/password/reset", h.ResetPassword)

	// OAuth2 token endpoint (RFC 6749). Currently implements client_credentials;
	// password / refresh_token / device_code return unsupported_grant_type stubs.
	r.With(oauthTokenLimiter).Post("/api/v1/auth/token", h.Token)

	// Traefik forwardAuth callback for /api/v1/public/* — called internally by
	// the gateway, not by clients. Intentionally has no auth middleware and no
	// rate limit (Traefik is already the rate-limit boundary for public API).
	r.Post("/api/v1/auth/validate-api-key", h.ValidateAPIKey)

	// Protected routes — all under /api/v1/auth/ prefix
	r.Group(func(pr chi.Router) {
		pr.Use(authsvc.AuthMiddleware(cfg.JWTSecret))

		pr.Post("/api/v1/auth/logout", h.Logout)
		pr.Get("/api/v1/auth/me", h.Me)
		pr.Patch("/api/v1/auth/me", h.UpdateMe)
		pr.Put("/api/v1/auth/me/password", h.ChangeMyPassword)
		pr.Post("/api/v1/auth/device-token", h.DeviceToken)
		pr.Get("/api/v1/auth/roles", h.ListRoles)

		// API tokens + OAuth clients — gated behind the api_integration plugin.
		// This feature is only exposed to tenants that have signed an
		// integration agreement; system_admin toggles the plugin per tenant
		// via /api/v1/auth/system/companies/{id}/plugins.
		pr.Group(func(ar chi.Router) {
			ar.Use(authsvc.RequirePlugin("api_integration"))

			// API tokens — tenant-scoped CRUD. Tokens are validated by
			// Traefik forwardAuth against /api/v1/auth/validate-api-key
			// (which itself re-checks the plugin on every request).
			ar.Get("/api/v1/auth/api-tokens", h.ListAPITokens)
			ar.Post("/api/v1/auth/api-tokens", h.CreateAPIToken)
			ar.Delete("/api/v1/auth/api-tokens/{id}", h.RevokeAPIToken)

			// OpenAPI spec for the in-app Scalar viewer. Gated behind the
			// same plugin as the API tokens UI so tenants without integration
			// access can't discover the public API surface.
			ar.Get("/api/v1/openapi.json", ServeOpenAPISpec)

			// OAuth2 clients — tenant admins manage their own; system_admin
			// can create system-wide clients (null tenant_id). Authorization
			// is enforced inside the handlers.
			ar.Get("/api/v1/auth/oauth-clients", h.ListOAuthClients)
			ar.Post("/api/v1/auth/oauth-clients", h.CreateOAuthClient)
			ar.Delete("/api/v1/auth/oauth-clients/{id}", h.RevokeOAuthClient)
		})

		// RBAC — company roles, permissions catalog, and assignments.
		// Authorization is handled inside each handler: system_admin and
		// primary_manager always pass; other callers must hold
		// company.role.read (for GETs) or company.role.manage (for mutations).
		pr.Get("/api/v1/rbac/permissions", h.ListRBACPermissions)
		pr.Get("/api/v1/rbac/accounts", h.ListRBACEligibleAccounts)
		pr.Get("/api/v1/rbac/roles", h.ListRBACRoles)
		pr.Get("/api/v1/rbac/roles/{id}", h.GetRBACRole)
		pr.Post("/api/v1/rbac/roles", h.CreateRBACRole)
		pr.Put("/api/v1/rbac/roles/{id}", h.UpdateRBACRole)
		pr.Delete("/api/v1/rbac/roles/{id}", h.DeleteRBACRole)
		pr.Get("/api/v1/rbac/assignments", h.ListRBACAssignments)
		pr.Post("/api/v1/rbac/assignments", h.CreateRBACAssignment)
		pr.Delete("/api/v1/rbac/assignments/{id}", h.DeleteRBACAssignment)

		// System admin only: company management + stats
		pr.Group(func(sr chi.Router) {
			sr.Use(authsvc.RequireRole("system_admin"))
			sr.Get("/api/v1/auth/system/stats", h.SystemStats)
			sr.Get("/api/v1/auth/system/companies", h.ListCompanies)
			sr.Post("/api/v1/auth/system/companies", h.CreateCompany)
			sr.Get("/api/v1/auth/system/companies/{id}", h.GetCompany)
			sr.Put("/api/v1/auth/system/companies/{id}", h.UpdateCompany)
			sr.Delete("/api/v1/auth/system/companies/{id}", h.DeleteCompany)

			// Account management
			sr.Get("/api/v1/auth/system/accounts", h.ListUserAccounts)
			sr.Post("/api/v1/auth/system/accounts", h.CreateUserAccount)
			sr.Get("/api/v1/auth/system/accounts/{id}", h.GetUserAccount)
			sr.Patch("/api/v1/auth/system/accounts/{id}", h.UpdateUserAccount)
			sr.Delete("/api/v1/auth/system/accounts/{id}", h.DeleteUserAccount)
			sr.Post("/api/v1/auth/system/accounts/{id}/reset-password", h.ResetUserPassword)
			sr.Put("/api/v1/auth/system/accounts/{id}/change-password", h.ChangeUserPassword)

			// Plugin management
			sr.Get("/api/v1/auth/system/plugins", h.ListAvailablePlugins)
			sr.Get("/api/v1/auth/system/companies/{id}/plugins", h.GetTenantPlugins)
			sr.Put("/api/v1/auth/system/companies/{id}/plugins", h.UpdateTenantPlugins)
		})
	})

	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		slog.Info("starting auth-svc", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("shutting down auth-svc")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	_ = srv.Shutdown(shutdownCtx)
	slog.Info("auth-svc shutdown complete")
}
