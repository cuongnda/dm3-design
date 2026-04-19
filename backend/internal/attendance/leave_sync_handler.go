package attendance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── HR webhook: POST /api/v1/attendance/leave/sync ─────────────────────────
//
// Lets an external HR / payroll system push leave records into DM3 so the
// attendance rollup (BR-ATT-003 on_leave status, BR-ATT-004 absent detection)
// stays aligned with what managers approved off-platform. Upsert is keyed by
// (tenant_id, external_id) — callers own the external_id and can safely retry.
//
// Design notes:
//   - Policy resolution is by *code* not UUID: HR systems track their own
//     leave-type catalog and should not need to learn our primary keys.
//   - Balance bookkeeping matches the interactive flow: approved rows consume
//     used_days; pending rows consume pending_days. We use ensureBalanceRow +
//     confirmBalance/reserveBalance so capped policies still block overdraw.
//   - Status "cancelled" releases previously-reserved capacity.
//   - Per-request failures are collected in the response rather than aborting
//     the whole batch; the HR integration can retry only the rows that failed.

type leaveSyncRequest struct {
	// ExternalID is the HR system's authoritative identifier for this record.
	// Callers must keep it stable so retries dedupe to the same row.
	ExternalID string `json:"external_id"`

	UserID     string  `json:"user_id"`
	PolicyCode string  `json:"policy_code"`
	StartDate  string  `json:"start_date"` // YYYY-MM-DD
	EndDate    string  `json:"end_date"`
	Days       float64 `json:"days,omitempty"`
	HalfDay    bool    `json:"half_day,omitempty"`
	Reason     *string `json:"reason,omitempty"`
	Status     string  `json:"status,omitempty"` // pending|approved|rejected|cancelled
}

type leaveSyncPayload struct {
	Requests []leaveSyncRequest `json:"requests"`
}

type leaveSyncRowResult struct {
	ExternalID string `json:"external_id"`
	ID         string `json:"id,omitempty"`     // our UUID for the resulting row
	Status     string `json:"status,omitempty"` // created|updated|unchanged|failed
	Error      string `json:"error,omitempty"`
}

type leaveSyncResponse struct {
	Processed int                  `json:"processed"`
	Created   int                  `json:"created"`
	Updated   int                  `json:"updated"`
	Failed    int                  `json:"failed"`
	Results   []leaveSyncRowResult `json:"results"`
}

// SyncLeaveRequests processes a batch of HR leave records idempotently.
func (h *AttendanceHandlers) SyncLeaveRequests(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var body leaveSyncPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(body.Requests) == 0 {
		httputil.Error(w, http.StatusBadRequest, "requests array is required")
		return
	}
	if len(body.Requests) > 500 {
		httputil.Error(w, http.StatusBadRequest, "batch too large (max 500)")
		return
	}

	resp := leaveSyncResponse{Results: make([]leaveSyncRowResult, 0, len(body.Requests))}

	for _, req := range body.Requests {
		res := h.applyLeaveSyncRow(r.Context(), tenantID, req)
		resp.Results = append(resp.Results, res)
		resp.Processed++
		switch res.Status {
		case "created":
			resp.Created++
		case "updated":
			resp.Updated++
		case "failed":
			resp.Failed++
		}
	}

	h.audit.LogFromRequest(r, "attendance.leave_synced", "leave_requests",
		tenantID, "", "success", nil, map[string]any{
			"processed": resp.Processed,
			"created":   resp.Created,
			"updated":   resp.Updated,
			"failed":    resp.Failed,
		})

	httputil.JSON(w, http.StatusOK, resp)
}

// validateLeaveSyncRow pins the pure-validation branches of the HR webhook so
// they can be unit-tested without a DB. Returns the resolved (start, end,
// days, status) quadruple on success, or a failure reason the caller should
// surface in leaveSyncRowResult.Error.
//
// Default behaviours:
//   - status "" → LeaveApproved (HR systems typically push already-approved rows)
//   - days <= 0 + half_day → 0.5
//   - days <= 0 + multi-day → inclusive day count between start and end
func validateLeaveSyncRow(req leaveSyncRequest) (start, end time.Time, days float64, status, failReason string) {
	if strings.TrimSpace(req.ExternalID) == "" {
		return time.Time{}, time.Time{}, 0, "", "external_id is required"
	}
	if strings.TrimSpace(req.UserID) == "" {
		return time.Time{}, time.Time{}, 0, "", "user_id is required"
	}
	if strings.TrimSpace(req.PolicyCode) == "" {
		return time.Time{}, time.Time{}, 0, "", "policy_code is required"
	}
	var err error
	start, err = time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		return time.Time{}, time.Time{}, 0, "", "start_date must be YYYY-MM-DD"
	}
	end, err = time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		return time.Time{}, time.Time{}, 0, "", "end_date must be YYYY-MM-DD"
	}
	if end.Before(start) {
		return time.Time{}, time.Time{}, 0, "", "end_date must be on/after start_date"
	}
	if req.HalfDay && !start.Equal(end) {
		return time.Time{}, time.Time{}, 0, "", "half_day is only valid when start_date == end_date"
	}

	status = strings.ToLower(strings.TrimSpace(req.Status))
	if status == "" {
		status = LeaveApproved
	}
	switch status {
	case LeavePending, LeaveApproved, LeaveRejected, LeaveCancelled:
	default:
		return time.Time{}, time.Time{}, 0, "", "status must be pending|approved|rejected|cancelled"
	}

	days = req.Days
	if days <= 0 {
		if req.HalfDay {
			days = 0.5
		} else {
			days = float64(end.Sub(start).Hours()/24) + 1
		}
	}
	return start, end, days, status, ""
}

// applyLeaveSyncRow handles a single record. All DB work for one record runs in
// a serializable transaction so balance bookkeeping is race-free even across
// concurrent webhook deliveries.
func (h *AttendanceHandlers) applyLeaveSyncRow(ctx context.Context, tenantID string, req leaveSyncRequest) leaveSyncRowResult {
	res := leaveSyncRowResult{ExternalID: req.ExternalID}

	start, _, days, status, failReason := validateLeaveSyncRow(req)
	if failReason != "" {
		res.Status, res.Error = "failed", failReason
		return res
	}
	var err error

	err = withTx(ctx, h.db.Pool, func(tx pgx.Tx) error {
		// 1. Resolve policy_code → policy_id for this tenant.
		var policyID string
		err := tx.QueryRow(ctx, `
			SELECT id::text FROM dm3_attendance.leave_policies
			 WHERE tenant_id = $1::uuid AND code = $2 AND is_active = true`,
			tenantID, strings.TrimSpace(req.PolicyCode)).Scan(&policyID)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("policy_code %q not found", req.PolicyCode)
		}
		if err != nil {
			return fmt.Errorf("resolve policy: %w", err)
		}

		// 2. Look up any existing row by external_id so we know if we're
		//    creating or updating (and what balance adjustment to reverse).
		var (
			existingID     string
			existingStatus string
			existingDays   float64
			existingStart  time.Time
			existingPolicy string
			existingUser   string
			exists         bool
		)
		err = tx.QueryRow(ctx, `
			SELECT id::text, status, days, start_date, policy_id::text, user_id::text
			  FROM dm3_attendance.leave_requests
			 WHERE tenant_id = $1::uuid AND external_id = $2
			 FOR UPDATE`,
			tenantID, req.ExternalID).Scan(
			&existingID, &existingStatus, &existingDays, &existingStart,
			&existingPolicy, &existingUser)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("lookup existing: %w", err)
		}
		exists = err == nil

		// 3. If there was a prior row that consumed balance, reverse it first
		//    so downstream reservation/confirmation sees a clean slate.
		if exists {
			prevYear := balanceYear(existingStart)
			switch existingStatus {
			case LeaveApproved:
				if err := releaseUsed(ctx, tx, tenantID, existingUser, existingPolicy, prevYear, existingDays); err != nil {
					return fmt.Errorf("release used: %w", err)
				}
			case LeavePending:
				if err := releasePending(ctx, tx, tenantID, existingUser, existingPolicy, prevYear, existingDays); err != nil {
					return fmt.Errorf("release pending: %w", err)
				}
			}
		}

		// 4. Apply the new balance bookkeeping for the inbound record.
		year := balanceYear(start)
		switch status {
		case LeavePending:
			if err := reserveBalance(ctx, tx, tenantID, req.UserID, policyID, year, days); err != nil {
				return err
			}
		case LeaveApproved:
			if err := ensureBalanceRow(ctx, tx, tenantID, req.UserID, policyID, year); err != nil {
				return err
			}
			// Confirm moves pending→used. For HR-sourced approvals we skip the
			// pending step and bump used_days directly.
			if _, err := tx.Exec(ctx, `
				UPDATE dm3_attendance.leave_balances
				   SET used_days  = used_days + $5,
				       updated_at = now()
				 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
				   AND policy_id = $3::uuid AND year = $4`,
				tenantID, req.UserID, policyID, year, days); err != nil {
				return fmt.Errorf("credit used: %w", err)
			}
		}

		// 5. Upsert the leave_requests row.
		reasonArg := nullStr(req.Reason)
		reviewedAt := any(nil)
		cancelledAt := any(nil)
		if status == LeaveApproved || status == LeaveRejected {
			reviewedAt = time.Now().UTC()
		}
		if status == LeaveCancelled {
			cancelledAt = time.Now().UTC()
		}

		if exists {
			if _, err := tx.Exec(ctx, `
				UPDATE dm3_attendance.leave_requests
				   SET user_id     = $3::uuid,
				       policy_id   = $4::uuid,
				       start_date  = $5::date,
				       end_date    = $6::date,
				       days        = $7,
				       half_day    = $8,
				       reason      = NULLIF($9,''),
				       status      = $10,
				       reviewed_at = COALESCE($11::timestamptz, reviewed_at),
				       cancelled_at = COALESCE($12::timestamptz, cancelled_at)
				 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
				existingID, tenantID,
				req.UserID, policyID, req.StartDate, req.EndDate,
				days, req.HalfDay, reasonArg, status,
				reviewedAt, cancelledAt); err != nil {
				return fmt.Errorf("update leave: %w", err)
			}
			res.ID = existingID
			res.Status = "updated"
			return nil
		}

		if err := tx.QueryRow(ctx, `
			INSERT INTO dm3_attendance.leave_requests (
				tenant_id, user_id, policy_id, start_date, end_date, days,
				half_day, reason, status, external_id,
				reviewed_at, cancelled_at
			) VALUES (
				$1::uuid, $2::uuid, $3::uuid, $4::date, $5::date, $6,
				$7, NULLIF($8,''), $9, $10,
				$11::timestamptz, $12::timestamptz
			) RETURNING id::text`,
			tenantID, req.UserID, policyID,
			req.StartDate, req.EndDate, days,
			req.HalfDay, reasonArg, status, req.ExternalID,
			reviewedAt, cancelledAt,
		).Scan(&res.ID); err != nil {
			return fmt.Errorf("insert leave: %w", err)
		}
		res.Status = "created"
		return nil
	})

	if errors.Is(err, ErrInsufficientBalance) {
		res.Status, res.Error = "failed", "insufficient leave balance"
		return res
	}
	if err != nil {
		slog.Error("leave sync row", "external_id", req.ExternalID, "error", err)
		res.Status, res.Error = "failed", err.Error()
	}
	return res
}
