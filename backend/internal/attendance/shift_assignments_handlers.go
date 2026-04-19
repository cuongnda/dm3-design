package attendance

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// shiftAssignPayload is the bulk-assign request body. effective_until can be
// omitted for an open-ended assignment. All user_ids must share the tenant;
// that is enforced implicitly because we insert with the caller's tenant_id
// and do not accept a tenant override.
type shiftAssignPayload struct {
	ShiftID        string   `json:"shift_id"`
	UserIDs        []string `json:"user_ids"`
	EffectiveFrom  string   `json:"effective_from"` // YYYY-MM-DD
	EffectiveUntil *string  `json:"effective_until,omitempty"`
	ReplaceActive  bool     `json:"replace_active,omitempty"` // if true, close open-ended prior assignments the day before
}

// BulkAssignShift inserts shift_assignments rows for every (tenant, user_id,
// shift_id) tuple in one transaction. It is idempotent by (tenant, user,
// shift, effective_from) — re-submitting the same window silently updates
// the effective_until end.
//
// Emits one audit entry per user so the trail stays granular.
func (h *AttendanceHandlers) BulkAssignShift(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var p shiftAssignPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if p.ShiftID == "" {
		httputil.Error(w, http.StatusBadRequest, "shift_id is required")
		return
	}
	if len(p.UserIDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "user_ids required")
		return
	}
	if len(p.UserIDs) > 1000 {
		httputil.Error(w, http.StatusBadRequest, "user_ids cannot exceed 1000 entries")
		return
	}
	from, err := time.Parse("2006-01-02", p.EffectiveFrom)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid effective_from (expected YYYY-MM-DD)")
		return
	}
	var until *time.Time
	if p.EffectiveUntil != nil && *p.EffectiveUntil != "" {
		u, err := time.Parse("2006-01-02", *p.EffectiveUntil)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid effective_until (expected YYYY-MM-DD)")
			return
		}
		if u.Before(from) {
			httputil.Error(w, http.StatusBadRequest, "effective_until must be on or after effective_from")
			return
		}
		until = &u
	}

	// Verify shift belongs to tenant (cheap guard against cross-tenant writes).
	var shiftName string
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT name
		  FROM dm3_attendance.shifts
		 WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'
	`, p.ShiftID, tenantID).Scan(&shiftName)
	if err != nil {
		if err == pgx.ErrNoRows {
			httputil.Error(w, http.StatusNotFound, "shift not found")
			return
		}
		slog.Error("assign shift: shift lookup", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to verify shift")
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("assign shift: begin tx", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	if p.ReplaceActive {
		// Close any currently-open assignments (effective_until IS NULL) for
		// these users one day before the new window. This prevents overlaps
		// when moving everyone to a new shift mid-stream.
		priorDay := from.AddDate(0, 0, -1)
		_, err = tx.Exec(r.Context(), `
			UPDATE dm3_attendance.shift_assignments
			   SET effective_until = $1::date
			 WHERE tenant_id     = $2::uuid
			   AND user_id       = ANY($3::uuid[])
			   AND effective_until IS NULL
			   AND effective_from <= $1::date
		`, priorDay, tenantID, p.UserIDs)
		if err != nil {
			slog.Error("assign shift: close open", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to close existing assignments")
			return
		}
	}

	// Upsert per-user. The schema has no unique constraint across the natural
	// key, so we emulate idempotency: if a row exists for (tenant,user,shift,
	// effective_from) we update its end date; otherwise we insert.
	assigned := 0
	for _, userID := range p.UserIDs {
		var existingID string
		err = tx.QueryRow(r.Context(), `
			SELECT id::text
			  FROM dm3_attendance.shift_assignments
			 WHERE tenant_id      = $1::uuid
			   AND user_id        = $2::uuid
			   AND shift_id       = $3::uuid
			   AND effective_from = $4::date
			 LIMIT 1
		`, tenantID, userID, p.ShiftID, from).Scan(&existingID)
		switch {
		case err == pgx.ErrNoRows:
			if _, err = tx.Exec(r.Context(), `
				INSERT INTO dm3_attendance.shift_assignments
					(tenant_id, user_id, shift_id, effective_from, effective_until)
				VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date)
			`, tenantID, userID, p.ShiftID, from, until); err != nil {
				slog.Error("assign shift: insert", "error", err, "user_id", userID)
				httputil.Error(w, http.StatusInternalServerError, "failed to insert assignment")
				return
			}
		case err == nil:
			if _, err = tx.Exec(r.Context(), `
				UPDATE dm3_attendance.shift_assignments
				   SET effective_until = $1::date
				 WHERE id = $2::uuid
			`, until, existingID); err != nil {
				slog.Error("assign shift: update", "error", err, "user_id", userID)
				httputil.Error(w, http.StatusInternalServerError, "failed to update assignment")
				return
			}
		default:
			slog.Error("assign shift: lookup", "error", err, "user_id", userID)
			httputil.Error(w, http.StatusInternalServerError, "failed to query assignment")
			return
		}
		assigned++
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("assign shift: commit", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to commit assignments")
		return
	}

	// Audit per user so each assignment lands as its own reviewable entry.
	for _, userID := range p.UserIDs {
		h.audit.LogFromRequest(r, "attendance.shift_assigned", "shift_assignment", p.ShiftID, shiftName, "success", nil, map[string]any{
			"user_id":         userID,
			"shift_id":        p.ShiftID,
			"effective_from":  p.EffectiveFrom,
			"effective_until": p.EffectiveUntil,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"shift_id":        p.ShiftID,
		"assigned_count":  assigned,
		"effective_from":  p.EffectiveFrom,
		"effective_until": p.EffectiveUntil,
	})
}
