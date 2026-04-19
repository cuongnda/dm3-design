package attendance

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// loadShift returns the explicit shift if a non-empty id is provided,
// otherwise the tenant's active default shift. (nil, nil) means the tenant
// has no matching shift — callers must tolerate that because small tenants
// can run attendance without shifts entirely.
//
// Lives in its own file so both the HTTP handlers and the access-event
// consumer can call it without a circular dependency on AttendanceHandlers.
func loadShift(ctx context.Context, pool *pgxpool.Pool, tenantID string, explicitID *string) (*Shift, error) {
	where := `tenant_id = $1::uuid AND status = 'active' AND is_default = true`
	args := []any{tenantID}
	if explicitID != nil && *explicitID != "" {
		where = `tenant_id = $1::uuid AND id = $2::uuid`
		args = []any{tenantID, *explicitID}
	}

	var s Shift
	var siteIDStr, code, breakStart, breakEnd *string
	err := pool.QueryRow(ctx, `
		SELECT id::text, tenant_id::text, site_id::text, name, code,
		       to_char(start_time, 'HH24:MI:SS'), to_char(end_time, 'HH24:MI:SS'),
		       grace_period_minutes, early_leave_threshold,
		       to_char(break_start, 'HH24:MI:SS'), to_char(break_end, 'HH24:MI:SS'),
		       break_deducted, overtime_threshold_minutes, max_overtime_hours,
		       working_days, color, is_default, status, created_at, updated_at
		  FROM dm3_attendance.shifts
		 WHERE `+where+` LIMIT 1`, args...).Scan(
		&s.ID, &s.TenantID, &siteIDStr, &s.Name, &code,
		&s.StartTime, &s.EndTime,
		&s.GracePeriodMinutes, &s.EarlyLeaveThreshold,
		&breakStart, &breakEnd,
		&s.BreakDeducted, &s.OvertimeThresholdMinutes, &s.MaxOvertimeHours,
		&s.WorkingDays, &s.Color, &s.IsDefault, &s.Status, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	s.SiteID = siteIDStr
	s.Code = code
	s.BreakStart = breakStart
	s.BreakEnd = breakEnd
	return &s, nil
}
