package attendance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// uuidRegex matches a canonical UUID in string form.
var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// AccessEventConsumer subscribes to device access events on the DEVICES stream
// and upserts attendance_records. Sprint 1 scope: first event of the day =
// clock_in, latest event = clock_out; status stays `pending` until Sprint 3's
// status calculator runs. We still write records so the daily view has rows.
type AccessEventConsumer struct {
	db    *db.DB
	nats  *natsutil.Client
	audit *audit.Logger
}

// NewAccessEventConsumer constructs a consumer. auditLog may be nil in tests —
// the clash detector just skips audit emission in that case.
func NewAccessEventConsumer(database *db.DB, natsClient *natsutil.Client, auditLog *audit.Logger) *AccessEventConsumer {
	return &AccessEventConsumer{db: database, nats: natsClient, audit: auditLog}
}

type deviceEvent struct {
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

type accessLogData struct {
	EventID    string `json:"event_id"`
	DoorID     string `json:"door_id"`
	IdentityID string `json:"identity_id"`
	UserID     string `json:"user_id"`
	Method     string `json:"method"`
	Decision   string `json:"decision"` // granted | denied
	PhotoRef   string `json:"photo_ref"`
}

// Start subscribes to `dm3.devices.*.*.evt` on DEVICES with queue group
// "attend-svc-access-events".
func (c *AccessEventConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handle(ctx, subject, data)
	}
	const filter = "dm3.devices.*.*.evt"
	if err := c.nats.Subscribe(ctx, "DEVICES", "attend-svc-access-events", filter, handler); err != nil {
		return fmt.Errorf("attendance: subscribe access events: %w", err)
	}
	slog.Info("attendance access-event consumer started", "subject", filter)
	return nil
}

func (c *AccessEventConsumer) handle(ctx context.Context, subject string, data []byte) error {
	var evt deviceEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("attendance: bad envelope", "error", err, "subject", subject)
		return nil
	}
	if evt.Type != "access.log" {
		return nil
	}

	// subject: dm3.devices.{tenant_id}.{device_id}.evt
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 || !uuidRegex.MatchString(parts[2]) {
		slog.Warn("attendance: bad subject", "subject", subject)
		return nil
	}
	tenantID := parts[2]
	srcDeviceID := evt.Src
	if srcDeviceID == "" {
		srcDeviceID = parts[3]
	}

	var payload accessLogData
	if err := json.Unmarshal(evt.Data, &payload); err != nil {
		slog.Warn("attendance: bad access.log payload", "error", err)
		return nil
	}

	// Only count granted entries toward attendance. Denied attempts and
	// door-forced events are audit material, not clock-in signals.
	if payload.Decision != "" && payload.Decision != "granted" {
		return nil
	}

	enabled, err := c.tenantHasPlugin(ctx, tenantID)
	if err != nil {
		return err
	}
	if !enabled {
		return nil
	}

	userID := firstNonEmpty(payload.UserID, payload.IdentityID)
	if !uuidRegex.MatchString(userID) {
		return nil // device event without a mapped user — nothing to attribute
	}

	// Tenants opt individual devices into attendance via
	// dm3_attendance.attendance_devices. A device can grant access without
	// counting as a clock-in signal (e.g. a parking barrier); skip those so
	// we do not accidentally manufacture records from every door-open event.
	registered, err := c.deviceRegistered(ctx, tenantID, srcDeviceID)
	if err != nil {
		return err
	}
	if !registered {
		return nil
	}

	// Site maps to the access point's zone (DM3 core schema has no sites table,
	// so root zones play that role). The mapping is best-effort; a missing
	// zone results in a NULL site_id on the record, which the UI tolerates.
	siteID, err := c.resolveSiteID(ctx, tenantID, srcDeviceID)
	if err != nil {
		slog.Error("attendance: resolve site", "error", err)
		return err
	}

	eventTS := time.UnixMilli(evt.TS)
	// Cross-midnight shifts are handled in Sprint 3; for now date = event date
	// in UTC. Tenants in non-UTC offsets still get coherent daily rollups
	// because clock_in/clock_out carry the raw timestamp.
	date := eventTS.UTC().Truncate(24 * time.Hour)

	method := firstNonEmpty(payload.Method, MethodUnknown)
	photoRef := payload.PhotoRef

	if err := c.upsertRecord(ctx, tenantID, siteID, userID, srcDeviceID, date, eventTS, method, photoRef); err != nil {
		return err
	}
	// After the raw upsert lands, re-evaluate status/late/OT/hours against the
	// tenant's default shift so downstream queries see authoritative values
	// without waiting for a manager to touch the row.
	if err := c.applyRules(ctx, tenantID, userID, date); err != nil {
		return err
	}
	// BR-ATT-009: if this user has an approved leave covering the event date,
	// the rule-derived status lies — flip the row to on_leave and emit audit
	// so managers notice an unexpected clock-in-during-leave clash.
	return c.reconcileLeaveClash(ctx, tenantID, userID, date)
}

// applyRules loads the record plus its shift and persists the computed status,
// lateness, break, and overtime fields. Manual adjustments (manual_adjustment
// = true) are left alone so manager edits survive a late event replay.
func (c *AccessEventConsumer) applyRules(ctx context.Context, tenantID, userID string, date time.Time) error {
	ruleCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var (
		recordID       string
		shiftID        *string
		clockIn        *time.Time
		clockOut       *time.Time
		manualOverride bool
	)
	err := c.db.Pool.QueryRow(ruleCtx, `
		SELECT id::text, shift_id::text, clock_in, clock_out, manual_adjustment
		  FROM dm3_attendance.attendance_records
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND date = $3
	`, tenantID, userID, date).Scan(&recordID, &shiftID, &clockIn, &clockOut, &manualOverride)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if manualOverride {
		return nil
	}

	shift, err := loadShift(ruleCtx, c.db.Pool, tenantID, shiftID)
	if err != nil {
		return fmt.Errorf("attendance: load shift for rules: %w", err)
	}

	calc := computeRecord(clockIn, clockOut, shift)

	// Preserve whatever status/OT the row already has when we can't derive
	// richer info (e.g. no clock_in yet). computeRecord returns pending in
	// that case, which matches the column default.
	_, err = c.db.Pool.Exec(ruleCtx, `
		UPDATE dm3_attendance.attendance_records SET
			shift_id            = COALESCE(shift_id, $1),
			status              = $2,
			late_minutes        = $3,
			early_leave_minutes = $4,
			total_hours         = CASE WHEN $5::boolean THEN $6 ELSE total_hours END,
			regular_hours       = CASE WHEN $5::boolean THEN $7 ELSE regular_hours END,
			overtime_hours      = CASE WHEN $5::boolean THEN $8 ELSE overtime_hours END,
			break_minutes       = CASE WHEN $5::boolean THEN $9 ELSE break_minutes END,
			updated_at          = now()
		 WHERE id = $10::uuid AND tenant_id = $11::uuid AND manual_adjustment = false
	`,
		optionalShiftID(shift),
		calc.Status, calc.LateMinutes, calc.EarlyLeaveMinutes,
		clockOut != nil, // only overwrite hours once the session is closed
		calc.TotalHours, calc.RegularHours, calc.OvertimeHours, calc.BreakMinutes,
		recordID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("attendance: apply rules: %w", err)
	}
	return nil
}

// reconcileLeaveClash checks whether the user has an approved leave covering
// the event date. If yes:
//   - stamp leave_type / leave_reference_id on the attendance row so the UI
//     can render "user was on leave but still clocked in"
//   - flip status to on_leave (the row is considered authoritative-on-leave
//     for reporting purposes; manual_adjustment=true rows are left alone so
//     manager overrides survive).
//   - emit an audit entry tagged "attendance.leave_clash_detected" so the
//     clash shows up in the audit trail for review.
//
// Skipped silently when there is no approved leave.
func (c *AccessEventConsumer) reconcileLeaveClash(ctx context.Context, tenantID, userID string, date time.Time) error {
	qCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var (
		requestID  string
		policyCode string
	)
	err := c.db.Pool.QueryRow(qCtx, `
		SELECT lr.id::text, lp.code
		  FROM dm3_attendance.leave_requests lr
		  JOIN dm3_attendance.leave_policies lp
		    ON lp.id = lr.policy_id AND lp.tenant_id = lr.tenant_id
		 WHERE lr.tenant_id = $1::uuid
		   AND lr.user_id   = $2::uuid
		   AND lr.status    = 'approved'
		   AND $3::date BETWEEN lr.start_date AND lr.end_date
		 ORDER BY lr.created_at DESC
		 LIMIT 1
	`, tenantID, userID, date).Scan(&requestID, &policyCode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("attendance: scan leave clash: %w", err)
	}

	ct, err := c.db.Pool.Exec(qCtx, `
		UPDATE dm3_attendance.attendance_records
		   SET status              = $1,
		       leave_type          = $2,
		       leave_reference_id  = $3,
		       updated_at          = now()
		 WHERE tenant_id = $4::uuid
		   AND user_id   = $5::uuid
		   AND date      = $6
		   AND manual_adjustment = false
		   AND (status, COALESCE(leave_reference_id, '')) IS DISTINCT FROM ($1, $3)
	`, StatusOnLeave, policyCode, requestID, tenantID, userID, date)
	if err != nil {
		return fmt.Errorf("attendance: apply leave clash: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return nil
	}

	if c.audit != nil {
		c.audit.Log(audit.Entry{
			TenantID:   tenantID,
			Action:     "attendance.leave_clash_detected",
			EntityType: "attendance_record",
			EntityID:   userID,
			Status:     "success",
			Metadata: map[string]any{
				"date":               date.Format("2006-01-02"),
				"leave_reference_id": requestID,
				"leave_type":         policyCode,
			},
		})
	}
	return nil
}

// optionalShiftID returns s.ID as any or nil when the shift is missing, so
// COALESCE(shift_id, $1) plays nicely with pgx.
func optionalShiftID(s *Shift) any {
	if s == nil {
		return nil
	}
	return s.ID
}

// upsertRecord creates a pending attendance record or updates an existing one.
// The first event of the day populates clock_in; every subsequent event with
// a greater timestamp than the existing clock_out updates clock_out.
func (c *AccessEventConsumer) upsertRecord(ctx context.Context, tenantID, siteID, userID, deviceID string, date, eventTS time.Time, method, photoRef string) error {
	dbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var photoRefPtr *string
	if photoRef != "" {
		photoRefPtr = &photoRef
	}
	var devicePtr *string
	if uuidRegex.MatchString(deviceID) {
		devicePtr = &deviceID
	}
	var sitePtr *string
	if uuidRegex.MatchString(siteID) {
		sitePtr = &siteID
	}

	// ON CONFLICT: if the row exists, advance clock_out when eventTS is later,
	// or set clock_in when it is earlier than the existing clock_in (late
	// arriving event replay). The unique index enforces (tenant, user, date).
	_, err := c.db.Pool.Exec(dbCtx, `
		INSERT INTO dm3_attendance.attendance_records
			(tenant_id, site_id, user_id, date, clock_in, clock_in_device_id, clock_in_method, clock_in_photo_ref,
			 clock_out, clock_out_device_id, clock_out_method, clock_out_photo_ref, status)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4,
			$5, $6::uuid, $7, $8,
			$5, $6::uuid, $7, $8,
			'pending')
		ON CONFLICT (tenant_id, user_id, date) DO UPDATE SET
			clock_in            = LEAST(dm3_attendance.attendance_records.clock_in, EXCLUDED.clock_in),
			clock_in_device_id  = COALESCE(
				CASE WHEN EXCLUDED.clock_in <= dm3_attendance.attendance_records.clock_in THEN EXCLUDED.clock_in_device_id END,
				dm3_attendance.attendance_records.clock_in_device_id),
			clock_in_method     = COALESCE(
				CASE WHEN EXCLUDED.clock_in <= dm3_attendance.attendance_records.clock_in THEN EXCLUDED.clock_in_method END,
				dm3_attendance.attendance_records.clock_in_method),
			clock_in_photo_ref  = COALESCE(
				CASE WHEN EXCLUDED.clock_in <= dm3_attendance.attendance_records.clock_in THEN EXCLUDED.clock_in_photo_ref END,
				dm3_attendance.attendance_records.clock_in_photo_ref),
			clock_out           = GREATEST(dm3_attendance.attendance_records.clock_out, EXCLUDED.clock_out),
			clock_out_device_id = COALESCE(
				CASE WHEN EXCLUDED.clock_out >= dm3_attendance.attendance_records.clock_out THEN EXCLUDED.clock_out_device_id END,
				dm3_attendance.attendance_records.clock_out_device_id),
			clock_out_method    = COALESCE(
				CASE WHEN EXCLUDED.clock_out >= dm3_attendance.attendance_records.clock_out THEN EXCLUDED.clock_out_method END,
				dm3_attendance.attendance_records.clock_out_method),
			clock_out_photo_ref = COALESCE(
				CASE WHEN EXCLUDED.clock_out >= dm3_attendance.attendance_records.clock_out THEN EXCLUDED.clock_out_photo_ref END,
				dm3_attendance.attendance_records.clock_out_photo_ref),
			updated_at = now()
	`, tenantID, sitePtr, userID, date, eventTS, devicePtr, method, photoRefPtr)
	if err != nil {
		slog.Error("attendance: upsert record failed", "error", err, "tenant_id", tenantID, "user_id", userID, "date", date)
		return err
	}
	return nil
}

// deviceRegistered reports whether srcDeviceID is listed in
// dm3_attendance.attendance_devices for this tenant. Returns false for
// non-UUID source ids so malformed events are ignored.
func (c *AccessEventConsumer) deviceRegistered(ctx context.Context, tenantID, srcDeviceID string) (bool, error) {
	if !uuidRegex.MatchString(srcDeviceID) {
		return false, nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var ok bool
	err := c.db.Pool.QueryRow(lookupCtx, `
		SELECT EXISTS (
			SELECT 1 FROM dm3_attendance.attendance_devices
			 WHERE tenant_id = $1::uuid AND device_id = $2::uuid
		)`, tenantID, srcDeviceID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("attendance: check registered device: %w", err)
	}
	return ok, nil
}

func (c *AccessEventConsumer) tenantHasPlugin(ctx context.Context, tenantID string) (bool, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var enabled bool
	err := c.db.Pool.QueryRow(lookupCtx,
		`SELECT 'attendance' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
		tenantID,
	).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return enabled, nil
}

// resolveSiteID returns the logical site for an access event. DM3 core schema
// has no `sites` table — root zones act as logical sites. We walk
// device → access_device → access_point → zone and treat zone_id as site_id.
// Returns "" when no mapping exists; the caller stores NULL in that case.
func (c *AccessEventConsumer) resolveSiteID(ctx context.Context, tenantID, srcDeviceID string) (string, error) {
	if !uuidRegex.MatchString(srcDeviceID) {
		return "", nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var siteID *string
	err := c.db.Pool.QueryRow(lookupCtx, `
		SELECT ap.zone_id::text
		  FROM dm3_access.access_points ap
		  JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id AND apd.tenant_id = ap.tenant_id
		  JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id AND ad.tenant_id = apd.tenant_id
		 WHERE ad.device_id = $1::uuid AND ap.tenant_id = $2::uuid
		 LIMIT 1
	`, srcDeviceID, tenantID).Scan(&siteID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if siteID == nil {
		return "", nil
	}
	return *siteID, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
