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

	"duall-master/internal/config"
	"duall-master/internal/middleware"
	"duall-master/internal/video"
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

	// NATS connection for device events and notifications
	nc, err := natsutil.Connect(cfg.NATSURL)
	if err != nil {
		slog.Error("failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()

	// Initialize video handlers
	handlers := video.NewHandlers(database, nc)

	// Start NATS consumers for device events
	go handlers.StartVideoConsumers(ctx)

	// Start background jobs
	go handlers.StartVideoJobs()

	// HTTP router
	r := mux.NewRouter()
	r.Use(middleware.CORS())
	r.Use(middleware.Logging())

	// Health check
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Video API endpoints
	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(middleware.Auth(cfg.JWTSecret))

	// Camera management
	api.HandleFunc("/video/cameras", handlers.ListCameras).Methods("GET")
	api.HandleFunc("/video/cameras", handlers.CreateCamera).Methods("POST")
	api.HandleFunc("/video/cameras/{id}", handlers.GetCamera).Methods("GET")
	api.HandleFunc("/video/cameras/{id}", handlers.UpdateCamera).Methods("PUT")
	api.HandleFunc("/video/cameras/{id}", handlers.DeleteCamera).Methods("DELETE")
	api.HandleFunc("/video/cameras/{id}/test", handlers.TestCamera).Methods("POST")
	
	// Camera status and control
	api.HandleFunc("/video/cameras/{id}/start", handlers.StartCamera).Methods("POST")
	api.HandleFunc("/video/cameras/{id}/stop", handlers.StopCamera).Methods("POST")
	api.HandleFunc("/video/cameras/{id}/restart", handlers.RestartCamera).Methods("POST")
	api.HandleFunc("/video/cameras/{id}/snapshot", handlers.TakeSnapshot).Methods("POST")
	api.HandleFunc("/video/cameras/{id}/ptz", handlers.PTZControl).Methods("POST")
	
	// Live streaming
	api.HandleFunc("/video/cameras/{id}/stream", handlers.GetStreamInfo).Methods("GET")
	api.HandleFunc("/video/cameras/{id}/stream/start", handlers.StartStream).Methods("POST")
	api.HandleFunc("/video/cameras/{id}/stream/stop", handlers.StopStream).Methods("POST")
	
	// Recording management
	api.HandleFunc("/video/recordings", handlers.ListRecordings).Methods("GET")
	api.HandleFunc("/video/recordings", handlers.StartRecording).Methods("POST")
	api.HandleFunc("/video/recordings/{id}", handlers.GetRecording).Methods("GET")
	api.HandleFunc("/video/recordings/{id}", handlers.StopRecording).Methods("PUT")
	api.HandleFunc("/video/recordings/{id}", handlers.DeleteRecording).Methods("DELETE")
	api.HandleFunc("/video/recordings/{id}/download", handlers.DownloadRecording).Methods("GET")
	
	// Motion detection
	api.HandleFunc("/video/motion-zones", handlers.ListMotionZones).Methods("GET")
	api.HandleFunc("/video/motion-zones", handlers.CreateMotionZone).Methods("POST")
	api.HandleFunc("/video/motion-zones/{id}", handlers.UpdateMotionZone).Methods("PUT")
	api.HandleFunc("/video/motion-zones/{id}", handlers.DeleteMotionZone).Methods("DELETE")
	
	// Events and alerts
	api.HandleFunc("/video/events", handlers.ListVideoEvents).Methods("GET")
	api.HandleFunc("/video/events/{id}", handlers.GetVideoEvent).Methods("GET")
	api.HandleFunc("/video/events/{id}/acknowledge", handlers.AcknowledgeEvent).Methods("POST")
	
	// Analytics
	api.HandleFunc("/video/analytics", handlers.GetVideoAnalytics).Methods("GET")
	api.HandleFunc("/video/analytics/cameras/{id}", handlers.GetCameraAnalytics).Methods("GET")
	
	// Storage management
	api.HandleFunc("/video/storage/status", handlers.GetStorageStatus).Methods("GET")
	api.HandleFunc("/video/storage/cleanup", handlers.CleanupStorage).Methods("POST")
	
	// Settings
	api.HandleFunc("/video/settings", handlers.GetVideoSettings).Methods("GET")
	api.HandleFunc("/video/settings", handlers.UpdateVideoSettings).Methods("PUT")
	
	// Public endpoints for streaming (WebRTC, HLS)
	public := r.PathPrefix("/api/v1/public/video").Subrouter()
	
	// WebRTC signaling
	public.HandleFunc("/webrtc/{camera_id}/offer", handlers.WebRTCOffer).Methods("POST")
	public.HandleFunc("/webrtc/{camera_id}/answer", handlers.WebRTCAnswer).Methods("POST")
	public.HandleFunc("/webrtc/{camera_id}/ice", handlers.WebRTCICE).Methods("POST")
	
	// HLS streaming
	public.HandleFunc("/hls/{camera_id}/playlist.m3u8", handlers.HLSPlaylist).Methods("GET")
	public.HandleFunc("/hls/{camera_id}/{segment}.ts", handlers.HLSSegment).Methods("GET")
	
	// Live thumbnails
	public.HandleFunc("/thumbnails/{camera_id}/live.jpg", handlers.LiveThumbnail).Methods("GET")
	
	// MJPEG stream
	public.HandleFunc("/mjpeg/{camera_id}", handlers.MJPEGStream).Methods("GET")

	// HTTP server
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		slog.Info("video service starting", "port", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	slog.Info("shutting down video service...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	
	// Cleanup video resources
	handlers.Cleanup()
	
	slog.Info("video service stopped")
}