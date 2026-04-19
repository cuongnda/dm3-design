package attendance

import (
	"testing"
	"time"
)

// TestParseTimeOfDay pins the HH:MM / HH:MM:SS parser. It's called on every
// clock-in and every break-window deduction, so drift here would corrupt
// payroll-visible totals.
func TestParseTimeOfDay(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		in      string
		want    time.Duration
		wantErr bool
	}{
		{name: "HH:MM", in: "09:30", want: 9*time.Hour + 30*time.Minute},
		{name: "HH:MM:SS", in: "09:30:15", want: 9*time.Hour + 30*time.Minute + 15*time.Second},
		{name: "midnight", in: "00:00", want: 0},
		{name: "end of day", in: "23:59:59", want: 23*time.Hour + 59*time.Minute + 59*time.Second},
		{name: "empty rejected", in: "", wantErr: true},
		{name: "garbage rejected", in: "not-a-time", wantErr: true},
		{name: "out of range rejected", in: "25:00", wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseTimeOfDay(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("parseTimeOfDay(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// newTestShift returns a canonical 09:00–17:00 shift with common defaults.
// Tests mutate individual fields before calling computeRecord to isolate the
// invariant they care about.
func newTestShift() *Shift {
	return &Shift{
		StartTime:                "09:00:00",
		EndTime:                  "17:00:00",
		GracePeriodMinutes:       10,
		EarlyLeaveThreshold:      10,
		OvertimeThresholdMinutes: 15,
		MaxOvertimeHours:         4,
	}
}

func timePtr(t time.Time) *time.Time { return &t }

func dayAt(h, m int) time.Time {
	return time.Date(2026, 1, 5, h, m, 0, 0, time.UTC)
}

// TestComputeRecord_NilClockIn pins BR-004's contract: without a clock-in
// we stay pending and never invent totals.
func TestComputeRecord_NilClockIn(t *testing.T) {
	t.Parallel()
	got := computeRecord(nil, nil, newTestShift())
	if got.Status != StatusPending {
		t.Errorf("expected pending, got %q", got.Status)
	}
	if got.TotalHours != 0 || got.RegularHours != 0 {
		t.Errorf("expected zero hours with nil clock-in, got %+v", got)
	}
}

// TestComputeRecord_NoShift covers the shift-less path: raw clock-in/out
// duration with no rule-based adjustments. If this drifts, contract hires
// or unshifted users get bogus totals.
func TestComputeRecord_NoShift(t *testing.T) {
	t.Parallel()

	in := dayAt(9, 0)
	out := dayAt(17, 30)

	got := computeRecord(&in, &out, nil)
	if got.Status != StatusOnTime {
		t.Errorf("expected on_time, got %q", got.Status)
	}
	if got.TotalHours != 8.5 {
		t.Errorf("expected 8.5h total, got %.2f", got.TotalHours)
	}
	if got.RegularHours != 8.5 {
		t.Errorf("expected 8.5h regular, got %.2f", got.RegularHours)
	}
	if got.OvertimeHours != 0 {
		t.Errorf("expected 0h overtime without shift, got %.2f", got.OvertimeHours)
	}
}

// TestComputeRecord_NoShift_NegativeSpanClamped guards against clock drift
// or manual-edit bugs producing negative totals that would underflow payroll.
func TestComputeRecord_NoShift_NegativeSpanClamped(t *testing.T) {
	t.Parallel()
	in := dayAt(10, 0)
	out := dayAt(9, 0)
	got := computeRecord(&in, &out, nil)
	if got.TotalHours != 0 {
		t.Errorf("expected clamp to 0 on negative span, got %.2f", got.TotalHours)
	}
}

// TestComputeRecord_LateGrace pins BR-003: lateness only triggers beyond
// the grace window, and when it does, late_minutes is measured from
// shift_start (not from the grace cutoff).
func TestComputeRecord_LateGrace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		clockIn    time.Time
		wantStatus string
		wantLate   int
	}{
		{"inside grace", dayAt(9, 5), StatusOnTime, 0},
		{"exactly at grace boundary", dayAt(9, 10), StatusOnTime, 0},
		{"one minute past grace", dayAt(9, 11), StatusLate, 11},
		{"thirty minutes late", dayAt(9, 30), StatusLate, 30},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := computeRecord(&tc.clockIn, nil, newTestShift())
			if got.Status != tc.wantStatus {
				t.Errorf("status: want %q, got %q", tc.wantStatus, got.Status)
			}
			if got.LateMinutes != tc.wantLate {
				t.Errorf("late_minutes: want %d, got %d", tc.wantLate, got.LateMinutes)
			}
		})
	}
}

// TestComputeRecord_EarlyLeave pins the symmetric early-leave rule. A user
// who clocks out before (shift_end − threshold) accumulates early_leave
// minutes measured from shift_end.
func TestComputeRecord_EarlyLeave(t *testing.T) {
	t.Parallel()

	in := dayAt(9, 0)
	tests := []struct {
		name      string
		clockOut  time.Time
		wantEarly int
	}{
		{"leaves exactly at end", dayAt(17, 0), 0},
		{"leaves inside threshold", dayAt(16, 55), 0},
		{"leaves at threshold boundary", dayAt(16, 50), 0},
		{"leaves past threshold", dayAt(16, 30), 30},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := computeRecord(&in, &tc.clockOut, newTestShift())
			if got.EarlyLeaveMinutes != tc.wantEarly {
				t.Errorf("early_leave_minutes: want %d, got %d", tc.wantEarly, got.EarlyLeaveMinutes)
			}
		})
	}
}

// TestComputeRecord_Overtime pins BR-005: overtime only accrues past
// (shift_end + threshold), and it's capped at MaxOvertimeHours. A zero
// cap means unlimited.
func TestComputeRecord_Overtime(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		shiftMut func(*Shift)
		clockOut time.Time
		wantOT   float64
	}{
		{
			name:     "inside threshold — no OT",
			clockOut: dayAt(17, 10),
			wantOT:   0,
		},
		{
			name:     "just past threshold",
			clockOut: dayAt(17, 30),
			wantOT:   0.5,
		},
		{
			name:     "OT capped at 4h",
			clockOut: dayAt(23, 0), // 6h over, cap 4h
			wantOT:   4,
		},
		{
			name: "zero cap means uncapped",
			shiftMut: func(s *Shift) {
				s.MaxOvertimeHours = 0
			},
			clockOut: dayAt(23, 0),
			wantOT:   6,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			shift := newTestShift()
			if tc.shiftMut != nil {
				tc.shiftMut(shift)
			}
			in := dayAt(9, 0)
			got := computeRecord(&in, &tc.clockOut, shift)
			if got.OvertimeHours != tc.wantOT {
				t.Errorf("overtime_hours: want %.2f, got %.2f", tc.wantOT, got.OvertimeHours)
			}
		})
	}
}

// TestComputeRecord_BreakDeduction pins BR-006: when break_deducted is on,
// the overlap between the break window and the worked span is subtracted
// from total hours.
func TestComputeRecord_BreakDeduction(t *testing.T) {
	t.Parallel()

	bs, be := "12:00:00", "13:00:00"
	shift := newTestShift()
	shift.BreakDeducted = true
	shift.BreakStart = &bs
	shift.BreakEnd = &be

	in := dayAt(9, 0)
	out := dayAt(17, 0)

	got := computeRecord(&in, &out, shift)
	// 8h worked − 1h break = 7h total
	if got.TotalHours != 7 {
		t.Errorf("expected 7h total after break, got %.2f", got.TotalHours)
	}
	if got.BreakMinutes != 60 {
		t.Errorf("expected 60m break, got %d", got.BreakMinutes)
	}
}

// TestComputeRecord_BreakNotDeducted_FlagOff confirms the break window is
// only subtracted when break_deducted is true — some shifts pay through
// the break.
func TestComputeRecord_BreakNotDeducted_FlagOff(t *testing.T) {
	t.Parallel()

	bs, be := "12:00:00", "13:00:00"
	shift := newTestShift()
	shift.BreakDeducted = false
	shift.BreakStart = &bs
	shift.BreakEnd = &be

	in := dayAt(9, 0)
	out := dayAt(17, 0)

	got := computeRecord(&in, &out, shift)
	if got.TotalHours != 8 {
		t.Errorf("expected full 8h (break not deducted), got %.2f", got.TotalHours)
	}
	if got.BreakMinutes != 0 {
		t.Errorf("expected 0m break, got %d", got.BreakMinutes)
	}
}

// TestComputeRecord_BreakOutsideWorked makes sure we don't deduct a break
// the user never actually took (e.g. they clocked out before the break).
func TestComputeRecord_BreakOutsideWorked(t *testing.T) {
	t.Parallel()

	bs, be := "12:00:00", "13:00:00"
	shift := newTestShift()
	shift.BreakDeducted = true
	shift.BreakStart = &bs
	shift.BreakEnd = &be

	in := dayAt(9, 0)
	out := dayAt(11, 30) // left before break
	got := computeRecord(&in, &out, shift)
	if got.BreakMinutes != 0 {
		t.Errorf("expected no break deducted, got %d", got.BreakMinutes)
	}
	if got.TotalHours != 2.5 {
		t.Errorf("expected 2.5h total, got %.2f", got.TotalHours)
	}
}

// TestComputeRecord_CrossMidnight pins BR-011: when end ≤ start, end rolls
// to the next day. Without this, night-shift workers would get negative
// hours or a perpetually "late" status.
func TestComputeRecord_CrossMidnight(t *testing.T) {
	t.Parallel()

	shift := newTestShift()
	shift.StartTime = "22:00:00"
	shift.EndTime = "06:00:00"

	in := time.Date(2026, 1, 5, 22, 0, 0, 0, time.UTC)
	out := time.Date(2026, 1, 6, 6, 0, 0, 0, time.UTC)

	got := computeRecord(&in, &out, shift)
	if got.Status != StatusOnTime {
		t.Errorf("expected on_time, got %q", got.Status)
	}
	if got.TotalHours != 8 {
		t.Errorf("expected 8h across midnight, got %.2f", got.TotalHours)
	}
}

// TestComputeRecord_RegularAndOvertimeSplit pins the payroll invariant
// that regular + overtime ≈ total (within rounding). Regressing this
// would mean a worker either loses OT hours or gets paid them twice.
func TestComputeRecord_RegularAndOvertimeSplit(t *testing.T) {
	t.Parallel()

	shift := newTestShift()
	in := dayAt(9, 0)
	out := dayAt(19, 30) // 10.5h worked, 2.5h OT expected

	got := computeRecord(&in, &out, shift)
	if got.TotalHours != 10.5 {
		t.Errorf("total_hours: want 10.5, got %.2f", got.TotalHours)
	}
	if got.OvertimeHours != 2.5 {
		t.Errorf("overtime_hours: want 2.5, got %.2f", got.OvertimeHours)
	}
	if got.RegularHours != 8 {
		t.Errorf("regular_hours: want 8, got %.2f", got.RegularHours)
	}
}
