package attendance

import (
	"context"
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

// me_leave_handlers.go implements /me/leave — the self-service counterpart to
// /me/attendance. All queries are tenant-scoped *and* user-scoped via
// claims.Sub so an employee can only see their own leave balances and
// requests. Like ListLeaveBalances, we lazily seed one balance row per active
// policy on first read so the UI always has a complete grid.

// MeLeaveSummary aggregates the current year's leave totals so the UI can
// render a single "X of Y days taken" strip without extra arithmetic.
type MeLeaveSummary struct {
	Year            int     `json:"year"`
	EntitledDays    float64 `json:"entitled_days"`
	CarriedOver     float64 `json:"carried_over"`
	UsedDays        float64 `json:"used_days"`
	PendingDays     float64 `json:"pending_days"`
	RemainingDays   float64 `json:"remaining_days"`
	PendingRequests int     `json:"pending_requests"`
	UpcomingCount   int     `json:"upcoming_count"`
}

// MeLeaveResponse is the envelope returned by GET /me/leave.
type MeLeaveResponse struct {
	UserID   string         `json:"user_id"`
	Year     int            `json:"year"`
	Summary  MeLeaveSummary `json:"summary"`
	Balances []LeaveBalance `json:"balances"`
	Requests []LeaveRequest `json:"requests"`
	Upcoming []LeaveRequest `json:"upcoming"`
}

// MeLeave returns the authenticated user's own balances and requests for the
// chosen year (defaults to current year). "Upcoming" is the subset of
// approved/pending requests whose end_date is today or later.
func (h *AttendanceHandlers) MeLeave(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if tenantID == "" || claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing auth context")
		return
	}
	userID := claims.Sub

	year := time.Now().Year()
	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		if v, err := strconv.Atoi(yearStr); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}

	if err := h.seedMeLeaveBalances(r.Context(), tenantID, userID, year); err != nil {
		slog.Error("seed me leave balances", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to prepare balances")
		return
	}

	balances, err := h.fetchMeLeaveBalances(r.Context(), tenantID, userID, year)
	if err != nil {
		slog.Error("list me leave balances", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list balances")
		return
	}

	requests, err := h.fetchMeLeaveRequests(r.Context(), tenantID, userID, year)
	if err != nil {
		slog.Error("list me leave requests", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list leave requests")
		return
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	upcoming := make([]LeaveRequest, 0)
	pendingReqs := 0
	for _, lr := range requests {
		if lr.Status == "pending" {
			pendingReqs++
		}
		if (lr.Status == "approved" || lr.Status == "pending") && !lr.EndDate.Before(today) {
			upcoming = append(upcoming, lr)
		}
	}

	summary := MeLeaveSummary{
		Year:            year,
		PendingRequests: pendingReqs,
		UpcomingCount:   len(upcoming),
	}
	for _, b := range balances {
		summary.EntitledDays += b.EntitledDays
		summary.CarriedOver += b.CarriedOver
		summary.UsedDays += b.UsedDays
		summary.PendingDays += b.PendingDays
		summary.RemainingDays += b.RemainingDays
	}

	httputil.JSON(w, http.StatusOK, MeLeaveResponse{
		UserID:   userID,
		Year:     year,
		Summary:  summary,
		Balances: balances,
		Requests: requests,
		Upcoming: upcoming,
	})
}

// seedMeLeaveBalances ensures there's a balance row for every active policy
// for this user/year. Mirrors ListLeaveBalances' lazy-seed behaviour so the
// employee always sees a complete grid.
func (h *AttendanceHandlers) seedMeLeaveBalances(
	ctx context.Context,
	tenantID, userID string,
	year int,
) error {
	return withTx(ctx, h.db.Pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id::text FROM dm3_attendance.leave_policies
			 WHERE tenant_id = $1::uuid AND is_active = true`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		var policyIDs []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return err
			}
			policyIDs = append(policyIDs, id)
		}
		for _, pid := range policyIDs {
			if err := ensureBalanceRow(ctx, tx, tenantID, userID, pid, year); err != nil {
				return err
			}
		}
		return nil
	})
}

// fetchMeLeaveBalances mirrors ListLeaveBalances' SELECT but scopes strictly
// to the given user so the caller can't leak other users' rows.
func (h *AttendanceHandlers) fetchMeLeaveBalances(
	ctx context.Context,
	tenantID, userID string,
	year int,
) ([]LeaveBalance, error) {
	rows, err := h.db.Pool.Query(ctx, `
		SELECT lb.id::text, lb.tenant_id::text, lb.user_id::text, lb.policy_id::text,
		       lb.year, lb.entitled_days, lb.used_days, lb.pending_days, lb.carried_over,
		       lb.updated_at,
		       lp.code, lp.name, lp.color
		  FROM dm3_attendance.leave_balances lb
		  JOIN dm3_attendance.leave_policies lp
		    ON lp.id = lb.policy_id AND lp.tenant_id = lb.tenant_id
		 WHERE lb.tenant_id = $1::uuid AND lb.user_id = $2::uuid AND lb.year = $3
		 ORDER BY lp.code ASC`, tenantID, userID, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]LeaveBalance, 0, 8)
	for rows.Next() {
		var b LeaveBalance
		if err := rows.Scan(&b.ID, &b.TenantID, &b.UserID, &b.PolicyID,
			&b.Year, &b.EntitledDays, &b.UsedDays, &b.PendingDays, &b.CarriedOver,
			&b.UpdatedAt, &b.PolicyCode, &b.PolicyName, &b.PolicyColor); err != nil {
			return nil, err
		}
		b.RemainingDays = round2(b.EntitledDays + b.CarriedOver - b.UsedDays - b.PendingDays)
		out = append(out, b)
	}
	return out, rows.Err()
}

// fetchMeLeaveRequests returns the caller's leave requests whose date window
// touches the given year, sorted newest-first. Reuses the same joins as
// ListLeaveRequests so the UI can reuse LeaveRequestDTO.
func (h *AttendanceHandlers) fetchMeLeaveRequests(
	ctx context.Context,
	tenantID, userID string,
	year int,
) ([]LeaveRequest, error) {
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year, 12, 31, 23, 59, 59, 0, time.UTC)

	rows, err := h.db.Pool.Query(ctx, `
		SELECT lr.id::text, lr.tenant_id::text, lr.user_id::text, lr.policy_id::text,
		       lr.start_date, lr.end_date, lr.days, lr.half_day, lr.reason,
		       lr.attachment_ref, lr.status, lr.reviewed_by::text, lr.reviewed_at,
		       lr.review_note, lr.cancelled_at, lr.created_at, lr.updated_at,
		       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), ''), COALESCE(u.email, ''),
		       COALESCE(p.code, ''), COALESCE(p.name, ''), COALESCE(p.color, '')
		  FROM dm3_attendance.leave_requests lr
		  LEFT JOIN dm3_identity.users u ON u.id = lr.user_id
		  LEFT JOIN dm3_attendance.leave_policies p ON p.id = lr.policy_id
		 WHERE lr.tenant_id = $1::uuid AND lr.user_id = $2::uuid
		   AND lr.end_date >= $3::date AND lr.start_date <= $4::date
		 ORDER BY lr.start_date DESC, lr.created_at DESC
		 LIMIT 200`, tenantID, userID, yearStart, yearEnd)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]LeaveRequest, 0, 32)
	for rows.Next() {
		var lr LeaveRequest
		var reviewedBy *string
		if err := rows.Scan(
			&lr.ID, &lr.TenantID, &lr.UserID, &lr.PolicyID,
			&lr.StartDate, &lr.EndDate, &lr.Days, &lr.HalfDay, &lr.Reason,
			&lr.AttachmentRef, &lr.Status, &reviewedBy, &lr.ReviewedAt,
			&lr.ReviewNote, &lr.CancelledAt, &lr.CreatedAt, &lr.UpdatedAt,
			&lr.UserName, &lr.UserEmail,
			&lr.PolicyCode, &lr.PolicyName, &lr.PolicyColor,
		); err != nil {
			return nil, err
		}
		lr.ReviewedBy = reviewedBy
		out = append(out, lr)
	}
	return out, rows.Err()
}

// ─── Self-service writes ────────────────────────────────────────────────────
//
// The handlers below are the self-service counterpart to the admin leave /
// overtime endpoints. They force user_id = claims.Sub on write so an
// authenticated employee cannot submit leave or overtime on behalf of
// someone else. Cancellation additionally requires the request to belong
// to the caller.

// CreateMeLeaveRequest submits a leave request for the authenticated user.
// Ignores any caller-supplied user_id and binds to claims.Sub. Reuses the
// shared createLeaveRequest helper so half-day and balance invariants stay
// identical to the admin path.
func (h *AttendanceHandlers) CreateMeLeaveRequest(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if tenantID == "" || claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing auth context")
		return
	}

	var req leaveRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.UserID = claims.Sub

	id, days, httpErr := h.createLeaveRequest(r, tenantID, req)
	if httpErr != nil {
		httputil.Error(w, httpErr.code, httpErr.msg)
		return
	}

	h.audit.LogFromRequest(r, "attendance.leave_requested", "leave_request", id,
		"", "success", nil, map[string]any{
			"user_id":    req.UserID,
			"policy_id":  req.PolicyID,
			"start_date": req.StartDate,
			"end_date":   req.EndDate,
			"days":       days,
			"half_day":   req.HalfDay,
			"source":     "self",
		})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id, "status": "pending"})
}

// CancelMeLeaveRequest lets the caller cancel their OWN pending/approved
// request. Unlike the admin CancelLeaveRequest, this refuses to act on a
// request that does not belong to claims.Sub so one employee can't cancel
// another's leave.
func (h *AttendanceHandlers) CancelMeLeaveRequest(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if tenantID == "" || claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing auth context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "request id required")
		return
	}

	var (
		userID    string
		policyID  string
		startDate time.Time
		days      float64
		prevStat  string
	)
	err := withTx(r.Context(), h.db.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT user_id::text, policy_id::text, start_date, days, status
			  FROM dm3_attendance.leave_requests
			 WHERE id = $1::uuid AND tenant_id = $2::uuid
			   AND user_id = $3::uuid
			   AND status IN ('pending','approved')
			 FOR UPDATE`,
			id, tenantID, claims.Sub).Scan(&userID, &policyID, &startDate, &days, &prevStat)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(r.Context(), `
			UPDATE dm3_attendance.leave_requests
			   SET status = 'cancelled',
			       cancelled_at = now()
			 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			id, tenantID); err != nil {
			return err
		}

		year := balanceYear(startDate)
		if prevStat == LeaveApproved {
			return releaseUsed(r.Context(), tx, tenantID, userID, policyID, year, days)
		}
		return releasePending(r.Context(), tx, tenantID, userID, policyID, year, days)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "leave request not found or not cancellable")
		return
	}
	if err != nil {
		slog.Error("cancel me leave request", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to cancel leave request")
		return
	}
	h.audit.LogFromRequest(r, "attendance.leave_cancelled", "leave_request", id,
		"", "success",
		map[string]any{"status": prevStat},
		map[string]any{
			"status":    "cancelled",
			"user_id":   userID,
			"policy_id": policyID,
			"days":      days,
			"source":    "self",
		})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// RequestMeOvertime submits an overtime request for the authenticated user.
// Always binds the target to claims.Sub, regardless of any user_id in the
// payload, so self-service can't be abused to OT-request another user.
// Mirrors the core INSERT/UPDATE logic in RequestOvertime.
func (h *AttendanceHandlers) RequestMeOvertime(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if tenantID == "" || claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing auth context")
		return
	}

	var p overtimeRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if p.Hours <= 0 || p.Hours > 24 {
		httputil.Error(w, http.StatusBadRequest, "hours must be between 0 and 24")
		return
	}
	if p.Reason == "" {
		httputil.Error(w, http.StatusBadRequest, "reason required")
		return
	}
	date, err := time.Parse("2006-01-02", p.Date)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid date (expected YYYY-MM-DD)")
		return
	}

	targetUserID := claims.Sub
	note := "[OT request] " + p.Reason
	var recordID string
	err = h.db.Pool.QueryRow(r.Context(), `
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
	`, tenantID, targetUserID, date, p.Hours, claims.Sub, note).Scan(&recordID)
	if err != nil {
		slog.Error("me overtime request", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create overtime request")
		return
	}

	h.audit.LogFromRequest(r, "attendance.overtime_requested", "attendance_record", recordID, "", "success", nil, map[string]any{
		"user_id": targetUserID,
		"date":    p.Date,
		"hours":   p.Hours,
		"reason":  p.Reason,
		"source":  "self",
	})

	httputil.JSON(w, http.StatusCreated, map[string]any{
		"id":             recordID,
		"user_id":        targetUserID,
		"date":           p.Date,
		"overtime_hours": p.Hours,
		"status":         OvertimePending,
	})
}
