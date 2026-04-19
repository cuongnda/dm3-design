package attendance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ErrInsufficientBalance is returned by reserveBalance when a capped policy
// (annual_quota_days > 0) cannot cover the requested days.
var ErrInsufficientBalance = errors.New("insufficient leave balance")

// ensureBalanceRow upserts a zero-initialised row for (tenant, user, policy,
// year) seeded with policy.annual_quota_days as entitlement. Safe to call on
// every balance mutation — uses ON CONFLICT DO NOTHING so an existing row's
// hand-adjusted entitlement is preserved.
func ensureBalanceRow(ctx context.Context, tx pgx.Tx, tenantID, userID, policyID string, year int) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO dm3_attendance.leave_balances (
			tenant_id, user_id, policy_id, year, entitled_days
		)
		SELECT $1::uuid, $2::uuid, $3::uuid, $4,
		       COALESCE((SELECT annual_quota_days FROM dm3_attendance.leave_policies
		                  WHERE id = $3::uuid AND tenant_id = $1::uuid), 0)
		ON CONFLICT (tenant_id, user_id, policy_id, year) DO NOTHING
	`, tenantID, userID, policyID, year)
	return err
}

// reserveBalance increments pending_days; fails if the capped quota is
// exceeded. Capped = annual_quota_days > 0 on the underlying policy.
func reserveBalance(ctx context.Context, tx pgx.Tx, tenantID, userID, policyID string, year int, days float64) error {
	if err := ensureBalanceRow(ctx, tx, tenantID, userID, policyID, year); err != nil {
		return fmt.Errorf("ensure balance: %w", err)
	}

	var quota float64
	err := tx.QueryRow(ctx, `
		SELECT annual_quota_days FROM dm3_attendance.leave_policies
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		policyID, tenantID).Scan(&quota)
	if err != nil {
		return fmt.Errorf("load policy: %w", err)
	}

	if quota > 0 {
		var remaining float64
		err = tx.QueryRow(ctx, `
			SELECT entitled_days + carried_over - used_days - pending_days
			  FROM dm3_attendance.leave_balances
			 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
			   AND policy_id = $3::uuid AND year = $4`,
			tenantID, userID, policyID, year).Scan(&remaining)
		if err != nil {
			return fmt.Errorf("load balance: %w", err)
		}
		if remaining < days {
			return ErrInsufficientBalance
		}
	}

	_, err = tx.Exec(ctx, `
		UPDATE dm3_attendance.leave_balances
		   SET pending_days = pending_days + $5,
		       updated_at = now()
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
		   AND policy_id = $3::uuid AND year = $4`,
		tenantID, userID, policyID, year, days)
	return err
}

// confirmBalance moves `days` from pending → used (approve path).
func confirmBalance(ctx context.Context, tx pgx.Tx, tenantID, userID, policyID string, year int, days float64) error {
	if err := ensureBalanceRow(ctx, tx, tenantID, userID, policyID, year); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE dm3_attendance.leave_balances
		   SET pending_days = GREATEST(0, pending_days - $5),
		       used_days    = used_days + $5,
		       updated_at   = now()
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
		   AND policy_id = $3::uuid AND year = $4`,
		tenantID, userID, policyID, year, days)
	return err
}

// releasePending decrements pending_days (reject / cancel-while-pending).
func releasePending(ctx context.Context, tx pgx.Tx, tenantID, userID, policyID string, year int, days float64) error {
	_, err := tx.Exec(ctx, `
		UPDATE dm3_attendance.leave_balances
		   SET pending_days = GREATEST(0, pending_days - $5),
		       updated_at   = now()
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
		   AND policy_id = $3::uuid AND year = $4`,
		tenantID, userID, policyID, year, days)
	return err
}

// releaseUsed decrements used_days (cancel-after-approval).
func releaseUsed(ctx context.Context, tx pgx.Tx, tenantID, userID, policyID string, year int, days float64) error {
	_, err := tx.Exec(ctx, `
		UPDATE dm3_attendance.leave_balances
		   SET used_days  = GREATEST(0, used_days - $5),
		       updated_at = now()
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
		   AND policy_id = $3::uuid AND year = $4`,
		tenantID, userID, policyID, year, days)
	return err
}

// withTx runs fn inside a Serializable transaction — balance arithmetic is a
// classic read-modify-write race, so snapshot isolation isn't enough.
func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// balanceYear is the "effective year" for a leave request — we charge the
// request to the year of its start_date. Spanning year boundaries is rare
// enough that HR can split the request manually.
func balanceYear(start time.Time) int { return start.Year() }

// ─── HTTP handler ───────────────────────────────────────────────────────────

// ListLeaveBalances returns balances for the caller's tenant, optionally
// filtered by user_id and year. If no rows exist yet for (user, policy, year),
// they are lazily seeded from policy.annual_quota_days so the UI always has a
// full picture.
func (h *AttendanceHandlers) ListLeaveBalances(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	userID := r.URL.Query().Get("user_id")
	yearStr := r.URL.Query().Get("year")
	year := time.Now().Year()
	if yearStr != "" {
		if v, err := strconv.Atoi(yearStr); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}

	// If user_id is provided, lazily seed rows for every active policy so the
	// UI can render a complete grid instead of empty states.
	if userID != "" {
		err := withTx(r.Context(), h.db.Pool, func(tx pgx.Tx) error {
			rows, err := tx.Query(r.Context(), `
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
				if err := ensureBalanceRow(r.Context(), tx, tenantID, userID, pid, year); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			slog.Error("seed leave balances", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to prepare balances")
			return
		}
	}

	args := []any{tenantID, year}
	where := "lb.tenant_id = $1::uuid AND lb.year = $2"
	if userID != "" {
		args = append(args, userID)
		where += " AND lb.user_id = $3::uuid"
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT lb.id::text, lb.tenant_id::text, lb.user_id::text, lb.policy_id::text,
		       lb.year, lb.entitled_days, lb.used_days, lb.pending_days, lb.carried_over,
		       lb.updated_at,
		       lp.code, lp.name, lp.color
		  FROM dm3_attendance.leave_balances lb
		  JOIN dm3_attendance.leave_policies lp
		    ON lp.id = lb.policy_id AND lp.tenant_id = lb.tenant_id
		 WHERE `+where+`
		 ORDER BY lp.code ASC`, args...)
	if err != nil {
		slog.Error("list leave balances", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list balances")
		return
	}
	defer rows.Close()

	out := make([]LeaveBalance, 0, 8)
	for rows.Next() {
		var b LeaveBalance
		if err := rows.Scan(&b.ID, &b.TenantID, &b.UserID, &b.PolicyID,
			&b.Year, &b.EntitledDays, &b.UsedDays, &b.PendingDays, &b.CarriedOver,
			&b.UpdatedAt, &b.PolicyCode, &b.PolicyName, &b.PolicyColor); err != nil {
			slog.Error("scan leave balance", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to decode balances")
			return
		}
		b.RemainingDays = round2(b.EntitledDays + b.CarriedOver - b.UsedDays - b.PendingDays)
		out = append(out, b)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{"items": out})
}

// AdjustLeaveBalance lets an admin bump entitled_days or carried_over — used
// for off-cycle grants or year-end carry-over. Body: {entitled_days?, carried_over?}.
func (h *AttendanceHandlers) AdjustLeaveBalance(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var body struct {
		UserID       string   `json:"user_id"`
		PolicyID     string   `json:"policy_id"`
		Year         int      `json:"year"`
		EntitledDays *float64 `json:"entitled_days,omitempty"`
		CarriedOver  *float64 `json:"carried_over,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.UserID == "" || body.PolicyID == "" {
		httputil.Error(w, http.StatusBadRequest, "user_id and policy_id are required")
		return
	}
	if body.Year == 0 {
		body.Year = time.Now().Year()
	}
	if body.EntitledDays == nil && body.CarriedOver == nil {
		httputil.Error(w, http.StatusBadRequest, "at least one of entitled_days or carried_over required")
		return
	}

	err := withTx(r.Context(), h.db.Pool, func(tx pgx.Tx) error {
		if err := ensureBalanceRow(r.Context(), tx, tenantID, body.UserID, body.PolicyID, body.Year); err != nil {
			return err
		}
		// COALESCE keeps the existing value when the pointer is nil.
		var entArg, carArg any
		if body.EntitledDays != nil {
			entArg = *body.EntitledDays
		}
		if body.CarriedOver != nil {
			carArg = *body.CarriedOver
		}
		_, err := tx.Exec(r.Context(), `
			UPDATE dm3_attendance.leave_balances
			   SET entitled_days = COALESCE($5::numeric, entitled_days),
			       carried_over  = COALESCE($6::numeric, carried_over),
			       updated_at    = now()
			 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
			   AND policy_id = $3::uuid AND year = $4`,
			tenantID, body.UserID, body.PolicyID, body.Year, entArg, carArg)
		return err
	})
	if err != nil {
		slog.Error("adjust leave balance", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to adjust balance")
		return
	}
	h.audit.LogFromRequest(r, "attendance.balance_adjusted", "leave_balance", body.UserID,
		"", "success", nil, map[string]any{
			"user_id":       body.UserID,
			"policy_id":     body.PolicyID,
			"year":          body.Year,
			"entitled_days": body.EntitledDays,
			"carried_over":  body.CarriedOver,
		})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
