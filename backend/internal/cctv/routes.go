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

// RegisterPublicRoutes mounts anonymous endpoints that third-party systems
// post to without a DM3 JWT. Tenancy is established via payload-embedded
// credentials (e.g. Hanet's MD5(client_secret + id) hash). Mount OUTSIDE
// the JWT middleware chain — the handlers do their own auth.
func RegisterPublicRoutes(r chi.Router, h *CCTVHandlers) {
	r.Post("/api/v1/cctv/hanet/webhook", h.ReceiveHanetWebhook)
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
		r.Get("/cameras/{id}/delete-preview", h.DeleteCameraPreview)
		r.Get("/clips", h.ListClips)
		r.Get("/clips/{id}", h.GetClip)
		r.Get("/clips/{id}/playback", h.GetClipPlayback)
		r.Get("/settings", h.GetSettings)
		r.Get("/event-rules", h.ListEventRules)
		// Hanet places passthrough — proxies to {server}/place/getPlaces
		// using the tenant's saved access token. Guarded by plugin + tenant
		// middleware above; refresh-on-401 handled inside the handler.
		r.Get("/hanet/places", h.ListHanetPlaces)

		// Camera management writes — CRUD, settings, and connection testing
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWritePermission("cctv.camera.manage"))
			pr.Post("/cameras", h.CreateCamera)
			pr.Put("/cameras/{id}", h.UpdateCamera)
			pr.Delete("/cameras/{id}", h.DeleteCamera)
			pr.Post("/cameras/{id}/test-connection", h.TestCameraConnection)
			pr.Put("/settings", h.UpdateSettings)
			pr.Post("/event-rules", h.CreateEventRule)
			pr.Put("/event-rules/{id}", h.UpdateEventRule)
			pr.Delete("/event-rules/{id}", h.DeleteEventRule)
		})

		// Clip export writes — create and delete clips
		r.Group(func(pr chi.Router) {
			pr.Use(authsvc.RequireWritePermission("cctv.clip.export"))
			pr.Post("/clips", h.CreateClip)
			pr.Delete("/clips/{id}", h.DeleteClip)
		})
	})
}
