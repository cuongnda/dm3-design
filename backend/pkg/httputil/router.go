package httputil

import (
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/duali/dm3-backend/internal/middleware"
)

func NewRouter() chi.Router {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logging)
	r.Use(middleware.CORS())
	r.Use(chimw.Recoverer)
	return r
}
