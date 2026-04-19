package attendance

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"
)

// StartBackgroundJobs launches the attendance cron loop. Runs once on boot
// (catch-up for days the service was offline) and every hour thereafter.
//
// Jobs included:
//   - markAbsent: BR-004 — users assigned to a shift but without a clock-in
//     for a finished workday are flipped from pending → absent.
//
// The goroutine is wrapped in a recover so a panic inside a single sweep
// (e.g. from a malformed shift row or DB driver quirk) takes down just that
// iteration instead of the whole attend-svc process.
func (h *AttendanceHandlers) StartBackgroundJobs(ctx context.Context) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("attendance cron goroutine panicked",
					"recover", r,
					"stack", string(debug.Stack()))
			}
		}()
		h.runCronSafely(ctx, "initial")
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.runCronSafely(ctx, "tick")
			}
		}
	}()
}

// runCronSafely invokes runCronOnce with panic recovery so a single bad
// iteration cannot escape the goroutine. The outer goroutine's recover is a
// last-resort — this keeps the loop alive for the next tick.
func (h *AttendanceHandlers) runCronSafely(ctx context.Context, reason string) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("attendance cron sweep panicked",
				"reason", reason,
				"recover", r,
				"stack", string(debug.Stack()))
		}
	}()
	if err := h.runCronOnce(ctx); err != nil {
		slog.Error("attendance cron sweep", "reason", reason, "error", err)
	}
}

func (h *AttendanceHandlers) runCronOnce(ctx context.Context) error {
	jobCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	if err := h.markAbsent(jobCtx); err != nil {
		return err
	}
	// BR-ATT rollup: keep the current + previous month fresh so reports
	// and CSV/XLSX exports never have to rescan attendance_records. Logged
	// but non-fatal — an error here should not keep markAbsent from
	// running on the next tick.
	if err := h.rebuildMonthlySummaryCurrentAndPrev(jobCtx); err != nil {
		slog.Error("attendance cron: monthly summary rollup", "error", err)
	}
	return nil
}

// markAbsent flips pending rows to absent for completed workdays where there
// is still no clock_in. Completion is defined as shift_end + 2h (grace for
// late-arriving events). The write is tenant-agnostic because the WHERE clause
// is strictly scoped by the join against a shift in the same tenant.
//
// We only touch rows with manual_adjustment = false so manager edits survive.
func (h *AttendanceHandlers) markAbsent(ctx context.Context) error {
	// The DB side does the heavy lifting so we do not paginate millions of
	// rows through Go memory. Shift.end_time is anchored to ar.date; if the
	// shift spans midnight we add a day.
	// NOT EXISTS on holidays short-circuits BR-004 for tenant-configured
	// closures — otherwise every employee would look absent on Tết.
	const sql = `
		UPDATE dm3_attendance.attendance_records ar
		   SET status = 'absent',
		       updated_at = now()
		  FROM dm3_attendance.shifts s
		 WHERE ar.shift_id = s.id
		   AND ar.tenant_id = s.tenant_id
		   AND ar.status = 'pending'
		   AND ar.manual_adjustment = false
		   AND ar.clock_in IS NULL
		   AND NOT EXISTS (
		     SELECT 1 FROM dm3_attendance.holidays h
		      WHERE h.tenant_id = ar.tenant_id AND h.date = ar.date
		   )
		   AND (
		     ar.date
		       + s.end_time
		       + CASE WHEN s.end_time <= s.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
		       + INTERVAL '2 hours'
		   ) < now()
	`
	tag, err := h.db.Pool.Exec(ctx, sql)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		slog.Info("attendance: marked absent", "rows", tag.RowsAffected())
	}
	return nil
}
