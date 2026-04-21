package cctv

import (
	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
)

// RegisterStreamProxyRoutes mounts WHEP/HLS proxy routes that forward to MediaMTX.
// Uses AssetAuthMiddleware (supports ?token= query param since browsers can't set
// Authorization headers on WebRTC/media requests).
func RegisterStreamProxyRoutes(r chi.Router, h *CCTVHandlers, jwtSecret string) {
	r.Group(func(pr chi.Router) {
		pr.Use(authsvc.AssetAuthMiddleware(jwtSecret))
		pr.Use(authsvc.RequireCompany())
		pr.Post("/cctv/whep/{id}/whep", h.ProxyWHEP)
		pr.Get("/cctv/hls/{id}/*", h.ProxyHLS)
	})
}

// RegisterRoutes mounts all CCTV API routes under /api/v1/cctv on the given router.
// It uses authsvc middlewares for JWT validation, company scoping, and plugin gating.
func RegisterRoutes(r chi.Router, h *CCTVHandlers, jwtSecret string) {
	r.Route("/api/v1/cctv", func(r chi.Router) {
		r.Use(authsvc.AuthMiddleware(jwtSecret))
		r.Use(authsvc.RequireCompany())
		r.Use(authsvc.RequirePlugin("cctv"))

		// Read endpoints — any authenticated user in tenant
		r.Get("/cameras", h.ListCameras)
		r.Get("/cameras/{id}", h.GetCamera)
		r.Get("/cameras/{id}/whep", h.GetWHEPEndpoint)
		r.Get("/clips", h.ListClips)
		r.Get("/clips/{id}", h.GetClip)
		r.Get("/clips/{id}/playback", h.GetClipPlayback)
		r.Get("/settings", h.GetSettings)

		// Operator+ writes
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("operator", "manager", "primary_manager", "system_admin"))
			pr.Post("/cameras/{id}/test-connection", h.TestCameraConnection)
			pr.Post("/clips", h.CreateClip)
			pr.Delete("/clips/{id}", h.DeleteClip)
		})

		// Manager+ writes
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWriteRole("manager", "primary_manager", "system_admin"))
			pr.Post("/cameras", h.CreateCamera)
			pr.Put("/cameras/{id}", h.UpdateCamera)
			pr.Delete("/cameras/{id}", h.DeleteCamera)
			pr.Put("/settings", h.UpdateSettings)
		})
	})
}
