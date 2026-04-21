package cctv

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// RegisterTungSonRoutes mounts TungSon VIID camera protocol endpoints.
// These routes do NOT require JWT auth — cameras authenticate by device_id lookup.
func RegisterTungSonRoutes(r chi.Router, h *TungSonHandlers) {
	r.Route("/VIID", func(r chi.Router) {
		r.Post("/System/Register", h.HandleRegister)
		r.Post("/System/Keepalive", h.HandleKeepalive)
		r.Get("/Extend/ExtendFaceList", h.HandleExtendFaceList)
		r.Post("/Extend/ExtendFaceRecognition", h.HandleFaceRecognition)
		r.Post("/Faces", h.HandleUnknownFace)
		r.Post("/Extend/ExtendConfirm", h.HandleExtendConfirm)
	})
}

// RegisterSyncRoutes mounts face sync management endpoints.
// Uses Group (not Route) to avoid conflict with existing /api/v1/cctv mount.
func RegisterSyncRoutes(r chi.Router, syncSvc *FaceSyncService, jwtSecret string) {
	r.Group(func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(authsvc.RequireCompany())
		// POST /api/v1/cctv/cameras/{id}/sync — trigger full resync for a camera
		r.With(authsvc.RequireWriteRole("manager", "primary_manager", "system_admin")).
			Post("/api/v1/cctv/cameras/{id}/sync", handleFullSync(syncSvc))
	})
}

// handleFullSync returns a handler that triggers a full face sync for a camera.
func handleFullSync(syncSvc *FaceSyncService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cameraID := chi.URLParam(r, "id")
		tenantID := authsvc.CompanyIDFromContext(r.Context())
		if tenantID == "" {
			httputil.Error(w, http.StatusForbidden, "company context required")
			return
		}

		if err := syncSvc.EnqueueFullSync(r.Context(), tenantID, cameraID); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "sync failed: "+err.Error())
			return
		}

		httputil.JSON(w, http.StatusOK, json.RawMessage(`{"status":"queued"}`))
	}
}
