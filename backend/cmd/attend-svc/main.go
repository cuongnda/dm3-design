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

	"duall-master/internal/attend"
	"duall-master/internal/config"
	"duall-master/internal/middleware"
	"duall-master/pkg/db"
	"duall-master/pkg/natsutil"

	"github.com/gorilla/mux"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	// Database connection
	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	// NATS connection for consuming access events
	nc, err := natsutil.Connect(cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	// Initialize attendance handlers
	handlers := attend.NewHandlers(database, nc)

	// Start NATS consumers for access events
	go handlers.StartAttendanceConsumers(ctx)

	// Start background jobs
	go handlers.StartAttendanceJobs()

	// HTTP router
	r := mux.NewRouter()
	r.Use(middleware.CORS())
	r.Use(middleware.Logging())

	// Health check
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Attendance API endpoints
	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.Auth(cfg.JWTSecret))

	// Attendance records
	api.HandleFunc("/attendance", handlers.ListAttendance).Methods("GET")
	api.HandleFunc("/attendance", handlers.CreateAttendance).Methods("POST")
	api.HandleFunc("/attendance/{id}", handlers.GetAttendance).Methods("GET")
	api.HandleFunc("/attendance/{id}", handlers.UpdateAttendance).Methods("PUT")
	api.HandleFunc("/attendance/{id}", handlers.DeleteAttendance).Methods("DELETE")
	
	// Manual clock in/out
	api.HandleFunc("/attendance/clock-in", handlers.ClockIn).Methods("POST")
	api.HandleFunc("/attendance/clock-out", handlers.ClockOut).Methods("POST")
	api.HandleFunc("/attendance/break-start", handlers.StartBreak).Methods("POST")
	api.HandleFunc("/attendance/break-end", handlers.EndBreak).Methods("POST")
	
	// Attendance management
	api.HandleFunc("/attendance/{id}/approve", handlers.ApproveAttendance).Methods("POST")
	api.HandleFunc("/attendance/{id}/reject", handlers.RejectAttendance).Methods("POST")
	api.HandleFunc("/attendance/bulk-approve", handlers.BulkApproveAttendance).Methods("POST")
	
	// Shifts management
	api.HandleFunc("/attendance/shifts", handlers.ListShifts).Methods("GET")
	api.HandleFunc("/attendance/shifts", handlers.CreateShift).Methods("POST")
	api.HandleFunc("/attendance/shifts/{id}", handlers.GetShift).Methods("GET")
	api.HandleFunc("/attendance/shifts/{id}", handlers.UpdateShift).Methods("PUT")
	api.HandleFunc("/attendance/shifts/{id}", handlers.DeleteShift).Methods("DELETE")
	
	// Shift assignments
	api.HandleFunc("/attendance/shift-assignments", handlers.ListShiftAssignments).Methods("GET")
	api.HandleFunc("/attendance/shift-assignments", handlers.CreateShiftAssignment).Methods("POST")
	api.HandleFunc("/attendance/shift-assignments/{id}", handlers.UpdateShiftAssignment).Methods("PUT")
	api.HandleFunc("/attendance/shift-assignments/{id}", handlers.DeleteShiftAssignment).Methods("DELETE")
	
	// Leave management
	api.HandleFunc("/attendance/leave-requests", handlers.ListLeaveRequests).Methods("GET")
	api.HandleFunc("/attendance/leave-requests", handlers.CreateLeaveRequest).Methods("POST")
	api.HandleFunc("/attendance/leave-requests/{id}", handlers.GetLeaveRequest).Methods("GET")
	api.HandleFunc("/attendance/leave-requests/{id}/approve", handlers.ApproveLeaveRequest).Methods("POST")
	api.HandleFunc("/attendance/leave-requests/{id}/reject", handlers.RejectLeaveRequest).Methods("POST")
	
	// Overtime management
	api.HandleFunc("/attendance/overtime", handlers.ListOvertime).Methods("GET")
	api.HandleFunc("/attendance/overtime", handlers.CreateOvertimeRequest).Methods("POST")
	api.HandleFunc("/attendance/overtime/{id}/approve", handlers.ApproveOvertime).Methods("POST")
	
	// Reports
	api.HandleFunc("/attendance/reports/daily", handlers.GetDailyReport).Methods("GET")
	api.HandleFunc("/attendance/reports/weekly", handlers.GetWeeklyReport).Methods("GET")
	api.HandleFunc("/attendance/reports/monthly", handlers.GetMonthlyReport).Methods("GET")
	api.HandleFunc("/attendance/reports/payroll", handlers.GetPayrollReport).Methods("GET")
	api.HandleFunc("/attendance/reports/summary", handlers.GetAttendanceSummary).Methods("GET")
	
	// Statistics
	api.HandleFunc("/attendance/stats", handlers.GetAttendanceStats).Methods("GET")
	api.HandleFunc("/attendance/stats/person/{person_id}", handlers.GetPersonAttendanceStats).Methods("GET")
	
	// Settings
	api.HandleFunc("/attendance/settings", handlers.GetAttendanceSettings).Methods("GET")
	api.HandleFunc("/attendance/settings", handlers.UpdateAttendanceSettings).Methods("PUT")
	
	// Public endpoints for mobile app/kiosk
	public := r.PathPrefix("/api/v1/public/attendance").Subrouter()
	public.HandleFunc("/clock-in", handlers.PublicClockIn).Methods("POST")
	public.HandleFunc("/clock-out", handlers.PublicClockOut).Methods("POST")
	public.HandleFunc("/status/{person_id}", handlers.GetAttendanceStatus).Methods("GET")

	// HTTP server
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		slog.Info("attendance service starting", "port", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	slog.Info("shutting down attendance service...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("attendance service stopped")
}