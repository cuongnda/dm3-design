package attendance

import (
	"net/http"
	"strconv"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// AttendanceHandlers bundles the dependencies used by attend-svc HTTP routes.
// Sprint 1 only wires read-side endpoints; later sprints add shift/assignment
// mutations and the status calculator background job.
//
// store is optional — monthly-report export requires it, but the rest of the
// service works without MinIO configured (useful in CI/tests).
type AttendanceHandlers struct {
	db    *db.DB
	audit *audit.Logger
	nats  *natsutil.Client
	store objectstore.Store
}

// NewAttendanceHandlers constructs a handler group.
func NewAttendanceHandlers(database *db.DB, auditLog *audit.Logger, natsClient *natsutil.Client) *AttendanceHandlers {
	return &AttendanceHandlers{db: database, audit: auditLog, nats: natsClient}
}

// WithObjectStore attaches a MinIO-backed object store so report-export
// endpoints can persist generated files. Pass nil to leave it unset.
func (h *AttendanceHandlers) WithObjectStore(s objectstore.Store) *AttendanceHandlers {
	h.store = s
	return h
}

// parsePagination pulls page/limit query params with sane defaults. Matches
// the convention used by visitor/parking handlers so the UI can paginate
// uniformly.
func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	return page, limit
}
