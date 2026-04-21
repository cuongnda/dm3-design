package cctv

import "github.com/go-chi/chi/v5"

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
