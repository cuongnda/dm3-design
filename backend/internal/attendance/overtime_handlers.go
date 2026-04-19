package attendance

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// Overtime review status derived from (overtime_approved, overtime_approved_by).
// Not stored as its own column to keep the existing attendance_records schema.
//
//	pending  → overtime_hours > 0 AND overtime_approved_by IS NULL
//	approved → overtime_approved = true
//	rejected → overtime_approved = false AND overtime_approved_by IS NOT NULL
const (
	OvertimePending  = "pending"
	OvertimeApproved = "approved"
	OvertimeRejected = "rejected"
)

// OvertimeEntry is the UI-facing shape for overtime review.
type OvertimeEntry struct {
	RecordID         string     `json:"record_id"`
	TenantID         string     `json:"tenant_id"`
	UserID           string     `json:"user_id"`
	UserName         string     `json:"user_name"`
	UserEmail        string     `json:"user_email"`
	Date             time.Time  `json:"date"`
	ShiftName        string     `json:"shift_name,omitempty"`
	ClockIn          *time.Time `json:"clock_in,omitempty"`
	ClockOut         *time.Time `json:"clock_out,omitempty"`
	OvertimeHours    float64    `json:"overtime_hours"`
	OvertimeApproved bool       `json:"overtime_approved"`
	ReviewedBy       *string    `json:"reviewed_by,omitempty"`
	ReviewNote       *string    `json:"review_note,omitempty"`
	Status           string     `json:"status"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// ListOvertime returns records with overtime_hours > 0, filterable by status
// (pending | approved | rejected), date range, and user search.
// Default status = pending so the review queue loads first.
func (h *AttendanceHandlers) ListOvertime(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = OvertimePending
	}
	from := q.Get("from")
	to := q.Get("to")
	search := q.Get("search")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	args := []any{tenantID}
	where := `ar.tenant_id = $1::uuid AND ar.overtime_hours IS NOT NULL AND ar.overtime_hours > 0`
	idx := 2

	switch status {
	case OvertimePending:
		where += ` AND ar.overtime_approved = false AND ar.overtime_approved_by IS NULL`
	case OvertimeApproved:
		where += ` AND ar.overtime_approved = true`
	case OvertimeRejected:
		where += ` AND ar.overtime_approved = false AND ar.overtime_approved_by IS NOT NULL`
	case "all":
		// no filter
	default:
		httputil.Error(w, http.StatusBadRequest, "invalid status")
		return
	}

	if from != "" {
		if _, err := time.Parse("2006-01-02", from); err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid from (expected YYYY-MM-DD)")
			return
		}
		where += ` AND ar.date >= $` + strconv.Itoa(idx) + `::date`
		args = append(args, from)
		idx++
	}
	if to != "" {
		if _, err := time.Parse("2006-01-02", to); err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid to (expected YYYY-MM-DD)")
			return
		}
		where += ` AND ar.date <= $` + strconv.Itoa(idx) + `::date`
		args = append(args, to)
		idx++
	}
	if search != "" {
		where += ` AND (u.first_name ILIKE $` + strconv.Itoa(idx) + ` OR u.last_name ILIKE $` + strconv.Itoa(idx) + ` OR u.email ILIKE $` + strconv.Itoa(idx) + `)`
		args = append(args, "%"+search+"%")
		idx++
	}

	var total int64
	countSQL := `
		SELECT COUNT(*)
		  FROM dm3_attendance.attendance_records ar
		  LEFT JOIN dm3_identity.users u ON u.id = ar.user_id AND u.tenant_id = ar.tenant_id
		 WHERE ` + where
	if err := h.db.Pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		slog.Error("count overtime", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to count overtime")
		return
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	listSQL := `
		SELECT
			ar.id::text, ar.tenant_id::text, ar.user_id::text,
			COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), '') AS user_name,
			COALESCE(u.email, '') AS user_email,
			ar.date,
			COALESCE(s.name, '') AS shift_name,
			ar.clock_in, ar.clock_out,
			ar.overtime_hours, ar.overtime_approved, ar.overtime_approved_by::text,
			ar.overtime_review_note,
			ar.updated_at
		  FROM dm3_attendance.attendance_records ar
		  LEFT JOIN dm3_identity.users u ON u.id = ar.user_id AND u.tenant_id = ar.tenant_id
		  LEFT JOIN dm3_attendance.shifts s ON s.id = ar.shift_id AND s.tenant_id = ar.tenant_id
		 WHERE ` + where + `
		 ORDER BY ar.date DESC, ar.clock_out DESC NULLS LAST
		 LIMIT $` + strconv.Itoa(idx) + ` OFFSET $` + strconv.Itoa(idx+1)

	rows, err := h.db.Pool.Query(r.Context(), listSQL, listArgs...)
	if err != nil {
		slog.Error("list overtime", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list overtime")
		return
	}
	defer rows.Close()

	entries := make([]OvertimeEntry, 0)
	for rows.Next() {
		var e OvertimeEntry
		var reviewedBy *string
		var reviewNote *string
		if err := rows.Scan(
			&e.RecordID, &e.TenantID, &e.UserID,
			&e.UserName, &e.UserEmail,
			&e.Date, &e.ShiftName,
			&e.ClockIn, &e.ClockOut,
			&e.OvertimeHours, &e.OvertimeApproved, &reviewedBy,
			&reviewNote,
			&e.UpdatedAt,
		); err != nil {
			slog.Error("scan overtime", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan overtime")
			return
		}
		e.ReviewedBy = reviewedBy
		e.ReviewNote = reviewNote
		switch {
		case e.OvertimeApproved:
			e.Status = OvertimeApproved
		case reviewedBy != nil && *reviewedBy != "":
			e.Status = OvertimeRejected
		default:
			e.Status = OvertimePending
		}
		entries = append(entries, e)
	}
	if rows.Err() != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to iterate overtime")
		return
	}

	httputil.Paginated(w, entries, total, page, limit)
}

type overtimeReviewPayload struct {
	Note *string `json:"note"`
}

// overtimeRequestPayload is the self-service OT request shape.
type overtimeRequestPayload struct {
	Date   string  `json:"date"`
	Hours  float64 `json:"hours"`
	Reason string  `json:"reason"`
	UserID string  `json:"user_id,omitempty"` // optional override (manager requesting on behalf of user)
}

// validateOvertimeRequestPayload pins the pure-validation branches shared by
// RequestOvertime and RequestMeOvertime. Keeps admin/self-service paths from
// drifting on hours bounds, date format, or reason presence.
//
// Hours bounds: strictly >0 and <=24. 24 exactly is permitted because some
// compressed-shift schedules legitimately submit a full day of OT for a
// missed/rescheduled regular shift.
func validateOvertimeRequestPayload(p overtimeRequestPayload) (date time.Time, httpErr *httpError) {
	if p.Hours <= 0 || p.Hours > 24 {
		return time.Time{}, &httpError{http.StatusBadRequest, "hours must be between 0 and 24"}
	}
	if p.Reason == "" {
		return time.Time{}, &httpError{http.StatusBadRequest, "reason required"}
	}
	d, err := time.Parse("2006-01-02", p.Date)
	if err != nil {
		return time.Time{}, &httpError{http.StatusBadRequest, "invalid date (expected YYYY-MM-DD)"}
	}
	return d, nil
}

// RequestOvertime is the management OT request endpoint. Gated by
// RequireWriteRole on /overtime/request in cmd/attend-svc/main.go, so only
// managers/admins can hit it — they use it to request OT on behalf of any
// tenant user (p.UserID). Self-service employees use POST /me/overtime/request
// (RequestMeOvertime), which forces user_id = claims.Sub.
//
// The attendance record for (tenant,user,date) is upserted with:
//   - overtime_hours     = requested amount
//   - overtime_approved  = false (approval flow below picks it up)
//   - manual_adjustment  = true (so computeRecord does not overwrite on later clock-in)
//   - notes              = reason, prefixed with "[OT request]"
//
// Emits an audit entry (attendance.overtime_requested) so the trail reflects
// who asked for what before the reviewer approves/rejects.
func (h *AttendanceHandlers) RequestOvertime(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "missing actor")
		return
	}

	var p overtimeRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	date, vErr := validateOvertimeRequestPayload(p)
	if vErr != nil {
		httputil.Error(w, vErr.code, vErr.msg)
		return
	}

	// Route-level RequireWriteRole already restricts this endpoint to managers,
	// so any caller here is already authorized to act on behalf of another user.
	targetUserID := p.UserID
	if targetUserID == "" {
		targetUserID = claims.Sub
	}

	note := "[OT request] " + p.Reason
	var recordID string
	if err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_attendance.attendance_records
			(tenant_id, user_id, date, overtime_hours, overtime_approved,
			 manual_adjustment, adjusted_by, adjustment_reason, notes, status)
		VALUES ($1::uuid, $2::uuid, $3::date, $4, false,
			true, $5::uuid, $6, $6, 'pending')
		ON CONFLICT (tenant_id, user_id, date) DO UPDATE SET
			overtime_hours    = EXCLUDED.overtime_hours,
			overtime_approved = false,
			manual_adjustment = true,
			adjusted_by       = EXCLUDED.adjusted_by,
			adjustment_reason = EXCLUDED.adjustment_reason,
			notes             = EXCLUDED.notes,
			updated_at        = NOW()
		RETURNING id::text
	`, tenantID, targetUserID, date, p.Hours, claims.Sub, note).Scan(&recordID); err != nil {
		slog.Error("overtime request", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create overtime request")
		return
	}

	h.audit.LogFromRequest(r, "attendance.overtime_requested", "attendance_record", recordID, "", "success", nil, map[string]any{
		"user_id": targetUserID,
		"date":    p.Date,
		"hours":   p.Hours,
		"reason":  p.Reason,
	})

	httputil.JSON(w, http.StatusCreated, map[string]any{
		"id":             recordID,
		"user_id":        targetUserID,
		"date":           p.Date,
		"overtime_hours": p.Hours,
		"status":         OvertimePending,
	})
}

// ApproveOvertime flips overtime_approved=true and stamps the reviewer.
// Only pending entries (overtime_approved_by IS NULL) or already-rejected
// entries can transition to approved — already-approved is a no-op 200.
func (h *AttendanceHandlers) ApproveOvertime(w http.ResponseWriter, r *http.Request) {
	h.reviewOvertime(w, r, true)
}

// RejectOvertime stamps the reviewer with overtime_approved=false so the UI
// can distinguish "pending review" from "reviewed and denied".
func (h *AttendanceHandlers) RejectOvertime(w http.ResponseWriter, r *http.Request) {
	h.reviewOvertime(w, r, false)
}

func (h *AttendanceHandlers) reviewOvertime(w http.ResponseWriter, r *http.Request, approve bool) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "missing actor")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "missing id")
		return
	}

	var payload overtimeReviewPayload
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid payload")
			return
		}
	}

	// Look up the record's owner before mutating so we can enforce the
	// department-scope rule. Scoped to tenant + non-zero overtime so we
	// fail-fast with 404 for records that don't exist or have no OT to
	// review, matching the prior single-statement behaviour.
	var targetUserID string
	if err := h.db.Pool.QueryRow(r.Context(), `
		SELECT user_id::text
		  FROM dm3_attendance.attendance_records
		 WHERE id        = $1::uuid
		   AND tenant_id = $2::uuid
		   AND overtime_hours IS NOT NULL
		   AND overtime_hours > 0
	`, id, tenantID).Scan(&targetUserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "overtime record not found")
			return
		}
		slog.Error("lookup overtime owner", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to review overtime")
		return
	}

	if err := ensureDepartmentManagerOfUser(
		r.Context(), h.db.Pool, tenantID, claims.Sub, targetUserID, claims.Roles,
	); err != nil {
		if errors.Is(err, errCrossDepartmentReview) {
			httputil.Error(w, http.StatusForbidden, "reviewer is not the department manager of this user")
			return
		}
		slog.Error("overtime scope check", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to review overtime")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_attendance.attendance_records
		   SET overtime_approved     = $1,
		       overtime_approved_by  = $2::uuid,
		       overtime_review_note  = NULLIF($5,''),
		       updated_at            = NOW()
		 WHERE id        = $3::uuid
		   AND tenant_id = $4::uuid
		   AND overtime_hours IS NOT NULL
		   AND overtime_hours > 0
	`, approve, claims.Sub, id, tenantID, nullStr(payload.Note))
	if err != nil {
		slog.Error("review overtime", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to review overtime")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "overtime record not found")
		return
	}

	status := OvertimeRejected
	action := "attendance.overtime_rejected"
	if approve {
		status = OvertimeApproved
		action = "attendance.overtime_approved"
	}
	h.audit.LogFromRequest(r, action, "attendance_record", id, "", "success", nil, map[string]any{
		"status": status,
		"note":   nullStr(payload.Note),
	})
	httputil.JSON(w, http.StatusOK, map[string]string{"id": id, "status": status})
}
