package attendance

import (
	"net/http"
	"strconv"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// AttendanceHandlers bundles the dependencies used by attend-svc HTTP routes.
// Sprint 1 only wires read-side endpoints; later sprints add shift/assignment
// mutations and the status calculator background job.
type AttendanceHandlers struct {
	db    *db.DB
	audit *audit.Logger
	nats  *natsutil.Client
}

// NewAttendanceHandlers constructs a handler group.
func NewAttendanceHandlers(database *db.DB, auditLog *audit.Logger, natsClient *natsutil.Client) *AttendanceHandlers {
	return &AttendanceHandlers{db: database, audit: auditLog, nats: natsClient}
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
