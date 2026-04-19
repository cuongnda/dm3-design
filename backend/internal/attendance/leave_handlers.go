package attendance

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Leave Policies ─────────────────────────────────────────────────────────

// ListLeavePolicies returns leave policies for the caller's tenant.
func (h *AttendanceHandlers) ListLeavePolicies(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	activeOnly := r.URL.Query().Get("active") != "false"
	where := "tenant_id = $1::uuid"
	if activeOnly {
		where += " AND is_active = true"
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id::text, tenant_id::text, code, name, color, annual_quota_days,
		       requires_approval, deducts_attendance, paid, is_active,
		       created_at, updated_at
		  FROM dm3_attendance.leave_policies
		 WHERE `+where+`
		 ORDER BY name ASC`, tenantID)
	if err != nil {
		slog.Error("list leave policies", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list leave policies")
		return
	}
	defer rows.Close()

	policies := make([]LeavePolicy, 0)
	for rows.Next() {
		var p LeavePolicy
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.Code, &p.Name, &p.Color, &p.AnnualQuotaDays,
			&p.RequiresApproval, &p.DeductsAttendance, &p.Paid, &p.IsActive,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			slog.Error("scan leave policy", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan leave policy")
			return
		}
		policies = append(policies, p)
	}
	httputil.JSON(w, http.StatusOK, policies)
}

// leavePolicyPayload is the request body for create/update. Uses pointers for
// optional fields so PATCH can leave values untouched.
type leavePolicyPayload struct {
	Code              *string  `json:"code,omitempty"`
	Name              *string  `json:"name,omitempty"`
	Color             *string  `json:"color,omitempty"`
	AnnualQuotaDays   *float64 `json:"annual_quota_days,omitempty"`
	RequiresApproval  *bool    `json:"requires_approval,omitempty"`
	DeductsAttendance *bool    `json:"deducts_attendance,omitempty"`
	Paid              *bool    `json:"paid,omitempty"`
	IsActive          *bool    `json:"is_active,omitempty"`
}

// CreateLeavePolicy inserts a new policy. The (tenant_id, code) uniqueness
// violation is translated to 409 so the UI can surface a clean message.
func (h *AttendanceHandlers) CreateLeavePolicy(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var p leavePolicyPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if p.Code == nil || strings.TrimSpace(*p.Code) == "" {
		httputil.Error(w, http.StatusBadRequest, "code is required")
		return
	}
	if p.Name == nil || strings.TrimSpace(*p.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	color := "#3B82F6"
	if p.Color != nil && *p.Color != "" {
		color = *p.Color
	}
	quota := 0.0
	if p.AnnualQuotaDays != nil {
		quota = *p.AnnualQuotaDays
	}
	requiresApproval := true
	if p.RequiresApproval != nil {
		requiresApproval = *p.RequiresApproval
	}
	deducts := true
	if p.DeductsAttendance != nil {
		deducts = *p.DeductsAttendance
	}
	paid := true
	if p.Paid != nil {
		paid = *p.Paid
	}
	active := true
	if p.IsActive != nil {
		active = *p.IsActive
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_attendance.leave_policies (
			tenant_id, code, name, color, annual_quota_days,
			requires_approval, deducts_attendance, paid, is_active
		) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id::text`,
		tenantID, strings.TrimSpace(*p.Code), strings.TrimSpace(*p.Name),
		color, quota, requiresApproval, deducts, paid, active,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "leave_policies_code_uniq") {
			httputil.Error(w, http.StatusConflict, "a policy with that code already exists")
			return
		}
		slog.Error("create leave policy", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create leave policy")
		return
	}
	h.audit.LogFromRequest(r, "attendance.leave_policy_created", "leave_policy", id,
		strings.TrimSpace(*p.Name), "success", nil, map[string]any{
			"code":               strings.TrimSpace(*p.Code),
			"annual_quota_days":  quota,
			"requires_approval":  requiresApproval,
			"deducts_attendance": deducts,
			"paid":               paid,
			"is_active":          active,
		})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// UpdateLeavePolicy applies a partial update. Only provided fields are changed
// (COALESCE pattern). Code remains editable but uniqueness is enforced.
func (h *AttendanceHandlers) UpdateLeavePolicy(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "id required")
		return
	}

	var p leavePolicyPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ct, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_attendance.leave_policies
		   SET code               = COALESCE(NULLIF($3, ''), code),
		       name               = COALESCE(NULLIF($4, ''), name),
		       color              = COALESCE(NULLIF($5, ''), color),
		       annual_quota_days  = COALESCE($6, annual_quota_days),
		       requires_approval  = COALESCE($7, requires_approval),
		       deducts_attendance = COALESCE($8, deducts_attendance),
		       paid               = COALESCE($9, paid),
		       is_active          = COALESCE($10, is_active)
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, tenantID, p.Code, p.Name, p.Color, p.AnnualQuotaDays,
		p.RequiresApproval, p.DeductsAttendance, p.Paid, p.IsActive,
	)
	if err != nil {
		if strings.Contains(err.Error(), "leave_policies_code_uniq") {
			httputil.Error(w, http.StatusConflict, "a policy with that code already exists")
			return
		}
		slog.Error("update leave policy", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to update leave policy")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "leave policy not found")
		return
	}
	name := ""
	if p.Name != nil {
		name = *p.Name
	}
	h.audit.LogFromRequest(r, "attendance.leave_policy_updated", "leave_policy", id,
		name, "success", nil, p)
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteLeavePolicy soft-deletes by flipping is_active off. A hard delete would
// violate the FK from leave_requests (ON DELETE RESTRICT), which is intentional
// — historical requests must keep their policy reference.
func (h *AttendanceHandlers) DeleteLeavePolicy(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "id required")
		return
	}

	ct, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_attendance.leave_policies
		   SET is_active = false
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, tenantID)
	if err != nil {
		slog.Error("archive leave policy", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to archive leave policy")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "leave policy not found")
		return
	}
	h.audit.LogFromRequest(r, "attendance.leave_policy_archived", "leave_policy", id,
		"", "success", nil, map[string]any{"is_active": false})
	w.WriteHeader(http.StatusNoContent)
}

// ─── Leave Requests ─────────────────────────────────────────────────────────

type leaveRequestPayload struct {
	UserID        string  `json:"user_id"`
	PolicyID      string  `json:"policy_id"`
	StartDate     string  `json:"start_date"` // YYYY-MM-DD
	EndDate       string  `json:"end_date"`
	Days          float64 `json:"days"`
	HalfDay       bool    `json:"half_day"`
	Reason        *string `json:"reason"`
	AttachmentRef *string `json:"attachment_ref"`
}

type leaveReviewPayload struct {
	Note *string `json:"note"`
}

// ListLeaveRequests returns leave requests for the caller's tenant.
// Filters: status, user_id, policy_id, search (name/email), from/to (date window).
func (h *AttendanceHandlers) ListLeaveRequests(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	args := []any{tenantID}
	where := "lr.tenant_id = $1::uuid"
	idx := 2

	if status := r.URL.Query().Get("status"); status != "" {
		where += " AND lr.status = $" + strconv.Itoa(idx)
		args = append(args, status)
		idx++
	}
	if userID := r.URL.Query().Get("user_id"); userID != "" {
		where += " AND lr.user_id = $" + strconv.Itoa(idx) + "::uuid"
		args = append(args, userID)
		idx++
	}
	if policyID := r.URL.Query().Get("policy_id"); policyID != "" {
		where += " AND lr.policy_id = $" + strconv.Itoa(idx) + "::uuid"
		args = append(args, policyID)
		idx++
	}
	if from := r.URL.Query().Get("from"); from != "" {
		where += " AND lr.end_date >= $" + strconv.Itoa(idx) + "::date"
		args = append(args, from)
		idx++
	}
	if to := r.URL.Query().Get("to"); to != "" {
		where += " AND lr.start_date <= $" + strconv.Itoa(idx) + "::date"
		args = append(args, to)
		idx++
	}
	if search := r.URL.Query().Get("search"); search != "" {
		where += " AND (u.first_name ILIKE $" + strconv.Itoa(idx) + " OR u.last_name ILIKE $" + strconv.Itoa(idx) + " OR u.email ILIKE $" + strconv.Itoa(idx) + ")"
		args = append(args, "%"+search+"%")
		idx++
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	if err := h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		  FROM dm3_attendance.leave_requests lr
		  LEFT JOIN dm3_identity.users u ON u.id = lr.user_id
		 WHERE `+where, args...).Scan(&total); err != nil {
		slog.Error("count leave requests", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to count leave requests")
		return
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT lr.id::text, lr.tenant_id::text, lr.user_id::text, lr.policy_id::text,
		       lr.start_date, lr.end_date, lr.days, lr.half_day, lr.reason,
		       lr.attachment_ref, lr.status, lr.reviewed_by::text, lr.reviewed_at,
		       lr.review_note, lr.cancelled_at, lr.created_at, lr.updated_at,
		       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), ''), COALESCE(u.email, ''),
		       COALESCE(p.code, ''), COALESCE(p.name, ''), COALESCE(p.color, '')
		  FROM dm3_attendance.leave_requests lr
		  LEFT JOIN dm3_identity.users u ON u.id = lr.user_id
		  LEFT JOIN dm3_attendance.leave_policies p ON p.id = lr.policy_id
		 WHERE `+where+`
		 ORDER BY lr.created_at DESC
		 LIMIT $`+strconv.Itoa(idx)+` OFFSET $`+strconv.Itoa(idx+1), listArgs...)
	if err != nil {
		slog.Error("list leave requests", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list leave requests")
		return
	}
	defer rows.Close()

	requests := make([]LeaveRequest, 0)
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
			slog.Error("scan leave request", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan leave request")
			return
		}
		lr.ReviewedBy = reviewedBy
		requests = append(requests, lr)
	}

	httputil.Paginated(w, requests, total, page, limit)
}

// CreateLeaveRequest inserts a pending leave request on behalf of any user in
// the tenant. Management-only path; self-service employees use POST /me/leave.
func (h *AttendanceHandlers) CreateLeaveRequest(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var req leaveRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if strings.TrimSpace(req.UserID) == "" {
		httputil.Error(w, http.StatusBadRequest, "user_id is required")
		return
	}

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
			"source":     "admin",
		})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id, "status": "pending"})
}

// validateLeaveRequestPayload performs the pure (no-DB) validation and day-math
// for a leave request payload. Extracted so unit tests can cover the
// invariants — half-day semantics, inclusive day counting, date parsing —
// without a live database. Returns the parsed start date and canonical day
// count, or an httpError with the caller-facing status/message.
func validateLeaveRequestPayload(req leaveRequestPayload) (start time.Time, days float64, httpErr *httpError) {
	if strings.TrimSpace(req.PolicyID) == "" {
		return time.Time{}, 0, &httpError{http.StatusBadRequest, "policy_id is required"}
	}
	start, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		return time.Time{}, 0, &httpError{http.StatusBadRequest, "start_date must be YYYY-MM-DD"}
	}
	end, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		return time.Time{}, 0, &httpError{http.StatusBadRequest, "end_date must be YYYY-MM-DD"}
	}
	if end.Before(start) {
		return time.Time{}, 0, &httpError{http.StatusBadRequest, "end_date must be on/after start_date"}
	}
	if req.HalfDay && !start.Equal(end) {
		return time.Time{}, 0, &httpError{http.StatusBadRequest, "half_day is only valid when start_date == end_date"}
	}

	days = req.Days
	if days <= 0 {
		if req.HalfDay {
			// Single-day half-day leave is 0.5 days, not inclusive-scaled.
			days = 0.5
		} else {
			days = float64(end.Sub(start).Hours()/24) + 1
		}
	}
	return start, days, nil
}

// createLeaveRequest is the shared implementation used by both the admin path
// (CreateLeaveRequest) and the self-service path (CreateMeLeaveRequest).
// Returns the new request id and the canonical days count, or an httpError
// with the caller-facing status code and message. All tenant- and balance-
// level checks live here so the two callers can't diverge on invariants.
//
// Half-day semantics: half_day is only meaningful on a single-day range.
// Multi-day ranges with half_day are rejected explicitly rather than silently
// producing fractional-day totals.
func (h *AttendanceHandlers) createLeaveRequest(
	r *http.Request,
	tenantID string,
	req leaveRequestPayload,
) (id string, days float64, httpErr *httpError) {
	start, days, httpErr := validateLeaveRequestPayload(req)
	if httpErr != nil {
		return "", 0, httpErr
	}

	year := balanceYear(start)
	err := withTx(r.Context(), h.db.Pool, func(tx pgx.Tx) error {
		if err := reserveBalance(r.Context(), tx, tenantID, req.UserID, req.PolicyID, year, days); err != nil {
			return err
		}
		return tx.QueryRow(r.Context(), `
			INSERT INTO dm3_attendance.leave_requests (
				tenant_id, user_id, policy_id, start_date, end_date, days,
				half_day, reason, attachment_ref, status
			) VALUES (
				$1::uuid, $2::uuid, $3::uuid, $4::date, $5::date, $6,
				$7, NULLIF($8,''), NULLIF($9,''), 'pending'
			) RETURNING id::text`,
			tenantID, req.UserID, req.PolicyID,
			req.StartDate, req.EndDate, days,
			req.HalfDay, nullStr(req.Reason), nullStr(req.AttachmentRef),
		).Scan(&id)
	})
	if errors.Is(err, ErrInsufficientBalance) {
		return "", 0, &httpError{http.StatusConflict, "insufficient leave balance"}
	}
	if err != nil {
		slog.Error("create leave request", "error", err)
		return "", 0, &httpError{http.StatusInternalServerError, "failed to create leave request"}
	}
	return id, days, nil
}

// ApproveLeaveRequest marks a pending request approved.
func (h *AttendanceHandlers) ApproveLeaveRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewLeaveRequest(w, r, LeaveApproved)
}

// RejectLeaveRequest marks a pending request rejected.
func (h *AttendanceHandlers) RejectLeaveRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewLeaveRequest(w, r, LeaveRejected)
}

func (h *AttendanceHandlers) reviewLeaveRequest(w http.ResponseWriter, r *http.Request, newStatus string) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing reviewer identity")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "request id required")
		return
	}

	var payload leaveReviewPayload
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}

	var (
		userID    string
		policyID  string
		startDate time.Time
		days      float64
	)
	err := withTx(r.Context(), h.db.Pool, func(tx pgx.Tx) error {
		// Lock the pending row so balance arithmetic is race-free.
		err := tx.QueryRow(r.Context(), `
			SELECT user_id::text, policy_id::text, start_date, days
			  FROM dm3_attendance.leave_requests
			 WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'pending'
			 FOR UPDATE`,
			id, tenantID).Scan(&userID, &policyID, &startDate, &days)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(r.Context(), `
			UPDATE dm3_attendance.leave_requests
			   SET status = $1,
			       reviewed_by = $2::uuid,
			       reviewed_at = now(),
			       review_note = NULLIF($3,'')
			 WHERE id = $4::uuid
			   AND tenant_id = $5::uuid`,
			newStatus, claims.Sub, nullStr(payload.Note), id, tenantID); err != nil {
			return err
		}

		year := balanceYear(startDate)
		if newStatus == LeaveApproved {
			return confirmBalance(r.Context(), tx, tenantID, userID, policyID, year, days)
		}
		return releasePending(r.Context(), tx, tenantID, userID, policyID, year, days)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "leave request not found or not pending")
		return
	}
	if err != nil {
		slog.Error("review leave request", "error", err, "status", newStatus)
		httputil.Error(w, http.StatusInternalServerError, "failed to review leave request")
		return
	}
	action := "attendance.leave_approved"
	if newStatus == LeaveRejected {
		action = "attendance.leave_rejected"
	}
	h.audit.LogFromRequest(r, action, "leave_request", id,
		"", "success",
		map[string]any{"status": "pending"},
		map[string]any{
			"status":    newStatus,
			"user_id":   userID,
			"policy_id": policyID,
			"days":      days,
			"note":      nullStr(payload.Note),
		})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": newStatus})
}

// CancelLeaveRequest cancels a pending/approved request on behalf of any user
// in the tenant. Management-only path (gated by RequireWriteRole on the
// /leave/requests/* routes in cmd/attend-svc/main.go); self-service employees
// use POST /me/leave/requests/{id}/cancel, which forces user_id = claims.Sub.
func (h *AttendanceHandlers) CancelLeaveRequest(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
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
			   AND status IN ('pending','approved')
			 FOR UPDATE`,
			id, tenantID).Scan(&userID, &policyID, &startDate, &days, &prevStat)
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
		slog.Error("cancel leave request", "error", err)
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
		})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}
