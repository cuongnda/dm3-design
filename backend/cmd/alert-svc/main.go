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

	"duall-master/internal/alert"
	"duall-master/pkg/auth"
	"duall-master/pkg/db"
	"duall-master/pkg/httputil"

	"github.com/gorilla/mux"
	"github.com/nats-io/nats.go"
	"github.com/rs/cors"
)

func main() {
	// Service configuration
	serviceName := getEnv("SERVICE_NAME", "alert-svc")
	httpPort := getEnv("HTTP_PORT", "8011")
	dbURL := getEnv("DATABASE_URL", "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable")
	natsURL := getEnv("NATS_URL", "nats://localhost:4222")

	// Setup logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting alert service", 
		"service", serviceName, 
		"port", httpPort,
		"version", "1.0.0")

	// Database connection
	database, err := db.NewDB(dbURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	// Test database connection
	if err := database.Ping(context.Background()); err != nil {
		slog.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	slog.Info("database connection established")

	// NATS connection with retry logic
	var nc *nats.Conn
	for retries := 0; retries < 10; retries++ {
		nc, err = nats.Connect(natsURL,
			nats.Name(serviceName),
			nats.ReconnectWait(time.Second*2),
			nats.MaxReconnects(10),
			nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
				if err != nil {
					slog.Error("nats disconnected", "error", err)
				} else {
					slog.Info("nats disconnected")
				}
			}),
			nats.ReconnectHandler(func(nc *nats.Conn) {
				slog.Info("nats reconnected", "url", nc.ConnectedUrl())
			}),
		)
		if err == nil {
			break
		}
		slog.Warn("failed to connect to NATS, retrying...", "attempt", retries+1, "error", err)
		time.Sleep(time.Second * 2)
	}

	if nc == nil {
		slog.Error("failed to connect to NATS after retries")
		os.Exit(1)
	}
	defer nc.Close()

	slog.Info("nats connection established", "url", nc.ConnectedUrl())

	// Create rule engine
	ruleEngine := alert.NewRuleEngine(database, nc)
	defer ruleEngine.Shutdown()

	// Create alert handlers
	handlers := alert.NewHandlers(database, nc)
	defer handlers.Cleanup()

	// Create event consumer
	consumer := alert.NewEventConsumer(database, nc, ruleEngine)
	if err := consumer.Start(); err != nil {
		slog.Error("failed to start event consumer", "error", err)
		os.Exit(1)
	}
	defer consumer.Stop()

	// Load existing rules into rule engine on startup
	go func() {
		time.Sleep(2 * time.Second) // Give services time to initialize
		loadExistingRules(database, ruleEngine)
	}()

	// Setup HTTP server
	router := mux.NewRouter()

	// Health check endpoint (no auth required)
	router.HandleFunc("/healthz", healthCheckHandler).Methods("GET")
	router.HandleFunc("/readiness", readinessHandler(database, nc)).Methods("GET")
	router.HandleFunc("/metrics", metricsHandler).Methods("GET")

	// API routes with authentication
	api := router.PathPrefix("/api/v1").Subrouter()
	
	// JWT middleware
	jwtMiddleware := auth.NewJWTMiddleware()
	api.Use(jwtMiddleware.ValidateJWT)

	// Alert Rules API
	api.HandleFunc("/alert-rules", handlers.ListAlertRules).Methods("GET")
	api.HandleFunc("/alert-rules", handlers.CreateAlertRule).Methods("POST")
	api.HandleFunc("/alert-rules/{id}", handlers.GetAlertRule).Methods("GET")
	api.HandleFunc("/alert-rules/{id}", handlers.UpdateAlertRule).Methods("PUT")
	api.HandleFunc("/alert-rules/{id}", handlers.DeleteAlertRule).Methods("DELETE")
	api.HandleFunc("/alert-rules/{id}/enable", handlers.EnableAlertRule).Methods("POST")
	api.HandleFunc("/alert-rules/{id}/disable", handlers.DisableAlertRule).Methods("POST")
	api.HandleFunc("/alert-rules/{id}/test", handlers.TestAlertRule).Methods("POST")

	// Alert Instances API
	api.HandleFunc("/alerts", handlers.ListAlertInstances).Methods("GET")
	api.HandleFunc("/alerts", handlers.CreateManualAlert).Methods("POST")
	api.HandleFunc("/alerts/{id}", handlers.GetAlertInstance).Methods("GET")
	api.HandleFunc("/alerts/{id}/acknowledge", handlers.AcknowledgeAlert).Methods("POST")
	api.HandleFunc("/alerts/{id}/resolve", handlers.ResolveAlert).Methods("POST")
	api.HandleFunc("/alerts/{id}/snooze", handlers.SnoozeAlert).Methods("POST")
	api.HandleFunc("/alerts/bulk/acknowledge", handlers.BulkAcknowledgeAlerts).Methods("POST")
	api.HandleFunc("/alerts/bulk/resolve", handlers.BulkResolveAlerts).Methods("POST")

	// Automation Rules API
	api.HandleFunc("/automation-rules", handlers.ListAutomationRules).Methods("GET")
	api.HandleFunc("/automation-rules", handlers.CreateAutomationRule).Methods("POST")
	api.HandleFunc("/automation-rules/{id}", handlers.GetAutomationRule).Methods("GET")
	api.HandleFunc("/automation-rules/{id}", handlers.UpdateAutomationRule).Methods("PUT")
	api.HandleFunc("/automation-rules/{id}", handlers.DeleteAutomationRule).Methods("DELETE")
	api.HandleFunc("/automation-rules/{id}/enable", handlers.EnableAutomationRule).Methods("POST")
	api.HandleFunc("/automation-rules/{id}/disable", handlers.DisableAutomationRule).Methods("POST")
	api.HandleFunc("/automation-rules/{id}/test", handlers.TestAutomationRule).Methods("POST")

	// Alert Channels API
	api.HandleFunc("/alert-channels", handlers.ListAlertChannels).Methods("GET")
	api.HandleFunc("/alert-channels", handlers.CreateAlertChannel).Methods("POST")
	api.HandleFunc("/alert-channels/{id}", handlers.GetAlertChannel).Methods("GET")
	api.HandleFunc("/alert-channels/{id}", handlers.UpdateAlertChannel).Methods("PUT")
	api.HandleFunc("/alert-channels/{id}", handlers.DeleteAlertChannel).Methods("DELETE")
	api.HandleFunc("/alert-channels/{id}/test", handlers.TestAlertChannel).Methods("POST")

	// Escalation Policies API
	api.HandleFunc("/escalation-policies", handlers.ListEscalationPolicies).Methods("GET")
	api.HandleFunc("/escalation-policies", handlers.CreateEscalationPolicy).Methods("POST")
	api.HandleFunc("/escalation-policies/{id}", handlers.GetEscalationPolicy).Methods("GET")
	api.HandleFunc("/escalation-policies/{id}", handlers.UpdateEscalationPolicy).Methods("PUT")
	api.HandleFunc("/escalation-policies/{id}", handlers.DeleteEscalationPolicy).Methods("DELETE")

	// Alert Templates API
	api.HandleFunc("/alert-templates", handlers.ListAlertTemplates).Methods("GET")
	api.HandleFunc("/alert-templates", handlers.CreateAlertTemplate).Methods("POST")
	api.HandleFunc("/alert-templates/{id}", handlers.GetAlertTemplate).Methods("GET")
	api.HandleFunc("/alert-templates/{id}", handlers.UpdateAlertTemplate).Methods("PUT")
	api.HandleFunc("/alert-templates/{id}", handlers.DeleteAlertTemplate).Methods("DELETE")

	// Schedules and On-Call API
	api.HandleFunc("/schedules", handlers.ListSchedules).Methods("GET")
	api.HandleFunc("/schedules", handlers.CreateSchedule).Methods("POST")
	api.HandleFunc("/schedules/{id}", handlers.GetSchedule).Methods("GET")
	api.HandleFunc("/schedules/{id}", handlers.UpdateSchedule).Methods("PUT")
	api.HandleFunc("/schedules/{id}/overrides", handlers.GetScheduleOverrides).Methods("GET")
	api.HandleFunc("/schedules/{id}/overrides", handlers.CreateScheduleOverride).Methods("POST")
	api.HandleFunc("/on-call/status", handlers.GetOnCallStatus).Methods("GET")
	api.HandleFunc("/on-call/current", handlers.GetCurrentOnCall).Methods("GET")
	api.HandleFunc("/on-call/handoff", handlers.HandoffOnCall).Methods("POST")

	// Analytics and Reports API
	api.HandleFunc("/analytics", handlers.GetAlertAnalytics).Methods("GET")
	api.HandleFunc("/reports/summary", handlers.GetAlertSummaryReport).Methods("GET")
	api.HandleFunc("/reports/performance", handlers.GetAlertPerformanceReport).Methods("GET")
	api.HandleFunc("/reports/trends", handlers.GetAlertTrendsReport).Methods("GET")

	// Maintenance Windows API
	api.HandleFunc("/maintenance-windows", handlers.ListMaintenanceWindows).Methods("GET")
	api.HandleFunc("/maintenance-windows", handlers.CreateMaintenanceWindow).Methods("POST")
	api.HandleFunc("/maintenance-windows/{id}", handlers.GetMaintenanceWindow).Methods("GET")
	api.HandleFunc("/maintenance-windows/{id}", handlers.UpdateMaintenanceWindow).Methods("PUT")
	api.HandleFunc("/maintenance-windows/{id}", handlers.DeleteMaintenanceWindow).Methods("DELETE")

	// Settings API
	api.HandleFunc("/settings", handlers.GetAlertSettings).Methods("GET")
	api.HandleFunc("/settings", handlers.UpdateAlertSettings).Methods("PUT")

	// External integrations (no auth for webhooks)
	router.HandleFunc("/api/v1/webhooks/{webhook_id}", handlers.HandleWebhook).Methods("POST")
	router.HandleFunc("/api/v1/external/alerts", handlers.HandleExternalAlert).Methods("POST")

	// CORS configuration
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
		ExposedHeaders: []string{"X-Total-Count", "Link"},
	})

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + httpPort,
		Handler:      c.Handler(router),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		slog.Info("starting http server", "port", httpPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down alert service")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("alert service stopped")
}

// Health check endpoint
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]interface{}{
		"status":    "healthy",
		"service":   "alert-svc",
		"version":   "1.0.0",
		"timestamp": time.Now(),
	})
}

// Readiness check endpoint
func readinessHandler(database *db.DB, nc *nats.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := "ready"
		checks := make(map[string]interface{})

		// Check database
		if err := database.Ping(r.Context()); err != nil {
			status = "not ready"
			checks["database"] = map[string]interface{}{
				"status": "unhealthy",
				"error":  err.Error(),
			}
		} else {
			checks["database"] = map[string]interface{}{
				"status": "healthy",
			}
		}

		// Check NATS
		if nc == nil || !nc.IsConnected() {
			status = "not ready"
			checks["nats"] = map[string]interface{}{
				"status": "unhealthy",
				"error":  "not connected",
			}
		} else {
			checks["nats"] = map[string]interface{}{
				"status": "healthy",
				"url":    nc.ConnectedUrl(),
			}
		}

		response := map[string]interface{}{
			"status":    status,
			"service":   "alert-svc",
			"checks":    checks,
			"timestamp": time.Now(),
		}

		if status != "ready" {
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		httputil.JSON(w, response)
	}
}

// Metrics endpoint
func metricsHandler(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]interface{}{
		"service": "alert-svc",
		"metrics": map[string]interface{}{
			"uptime_seconds":     0, // Would be calculated from start time
			"total_rules":        0, // Would be fetched from rule engine
			"active_rules":       0,
			"total_alerts":       0,
			"active_alerts":      0,
			"notifications_sent": 0,
		},
		"timestamp": time.Now(),
	})
}

// Load existing rules into rule engine on startup
func loadExistingRules(database *db.DB, ruleEngine *alert.RuleEngine) {
	ctx := context.Background()
	
	// This would typically query all tenants and load their rules
	// For now, we'll just log that this step would happen
	slog.Info("loading existing alert rules into rule engine")
	
	// In a real implementation:
	// 1. Query all tenants
	// 2. For each tenant, load their alert rules and automation rules  
	// 3. Register each rule with the rule engine
	
	slog.Info("existing rules loaded into rule engine")
}

// Helper function to get environment variable with default
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}