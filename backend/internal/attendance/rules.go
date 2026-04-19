package attendance

import (
	"fmt"
	"math"
	"time"
)

// AttendanceCalc is the derived set of business-rule fields for one record.
// It is the output of computeRecord — the single source of truth for status,
// lateness, break deduction, and overtime hours. Both Clockout and the manual
// adjustment handler funnel through this so the rules cannot drift.
type AttendanceCalc struct {
	Status            string
	LateMinutes       int
	EarlyLeaveMinutes int
	TotalHours        float64
	RegularHours      float64
	OvertimeHours     float64
	BreakMinutes      int
}

// computeRecord derives attendance fields from a clock-in/out pair against a
// shift definition.
//
// Business rules implemented:
//   - BR-003 late: late_minutes = clock_in − shift_start when over grace
//   - BR-005 overtime: OT = min(max_ot, clock_out − shift_end − threshold)
//   - BR-006 break: subtract break window overlap when break_deducted is on
//   - BR-011 cross-midnight: if shift.end ≤ shift.start, end is next day
//
// Absence (BR-004) is not decided here — that's the nightly cron's job. This
// function returns `pending` until clock_in exists.
func computeRecord(clockIn, clockOut *time.Time, shift *Shift) AttendanceCalc {
	calc := AttendanceCalc{Status: StatusPending}
	if clockIn == nil {
		return calc
	}

	if shift == nil {
		// No shift attached — best we can do is total = clock_out − clock_in.
		calc.Status = StatusOnTime
		if clockOut != nil {
			total := clockOut.Sub(*clockIn).Hours()
			if total < 0 {
				total = 0
			}
			calc.TotalHours = round2(total)
			calc.RegularHours = calc.TotalHours
		}
		return calc
	}

	shiftStart, err := parseTimeOfDay(shift.StartTime)
	if err != nil {
		return calc
	}
	shiftEnd, err := parseTimeOfDay(shift.EndTime)
	if err != nil {
		return calc
	}

	// Anchor shift times to the clock-in day (UTC). Multi-tenant TZ will be
	// layered in once AttendanceSettings.Timezone is wired through here.
	day := time.Date(clockIn.Year(), clockIn.Month(), clockIn.Day(), 0, 0, 0, 0, clockIn.Location())
	shiftStartAt := day.Add(shiftStart)
	shiftEndAt := day.Add(shiftEnd)
	if !shiftEndAt.After(shiftStartAt) {
		// BR-011 cross-midnight
		shiftEndAt = shiftEndAt.Add(24 * time.Hour)
	}

	// BR-003 lateness
	graceCutoff := shiftStartAt.Add(time.Duration(shift.GracePeriodMinutes) * time.Minute)
	if clockIn.After(graceCutoff) {
		calc.LateMinutes = int(math.Round(clockIn.Sub(shiftStartAt).Minutes()))
		calc.Status = StatusLate
	} else {
		calc.Status = StatusOnTime
	}

	if clockOut == nil {
		return calc
	}

	// Early leave — if user left before (shift_end − early_leave_threshold).
	earlyCutoff := shiftEndAt.Add(-time.Duration(shift.EarlyLeaveThreshold) * time.Minute)
	if clockOut.Before(earlyCutoff) {
		diff := int(math.Round(shiftEndAt.Sub(*clockOut).Minutes()))
		if diff > 0 {
			calc.EarlyLeaveMinutes = diff
		}
	}

	workedMin := int(math.Round(clockOut.Sub(*clockIn).Minutes()))
	if workedMin < 0 {
		workedMin = 0
	}

	// BR-006 break deduction
	if shift.BreakDeducted && shift.BreakStart != nil && shift.BreakEnd != nil {
		bs, e1 := parseTimeOfDay(*shift.BreakStart)
		be, e2 := parseTimeOfDay(*shift.BreakEnd)
		if e1 == nil && e2 == nil && be > bs {
			breakStartAt := day.Add(bs)
			breakEndAt := day.Add(be)
			// Align the break window to the same "shift day" frame — if break
			// sits before shift_start on the clock we assume it belongs to the
			// later half of a cross-midnight shift.
			if breakStartAt.Before(shiftStartAt) {
				breakStartAt = breakStartAt.Add(24 * time.Hour)
				breakEndAt = breakEndAt.Add(24 * time.Hour)
			}
			overlapStart := maxTime(breakStartAt, *clockIn)
			overlapEnd := minTime(breakEndAt, *clockOut)
			if overlapEnd.After(overlapStart) {
				mins := int(math.Round(overlapEnd.Sub(overlapStart).Minutes()))
				if mins > 0 {
					calc.BreakMinutes = mins
					workedMin -= mins
					if workedMin < 0 {
						workedMin = 0
					}
				}
			}
		}
	}

	// BR-005 overtime — everything past shift_end + threshold counts up to cap.
	otThreshold := time.Duration(shift.OvertimeThresholdMinutes) * time.Minute
	if clockOut.After(shiftEndAt.Add(otThreshold)) {
		otMinRaw := int(math.Round(clockOut.Sub(shiftEndAt).Minutes()))
		otMin := otMinRaw
		if shift.MaxOvertimeHours > 0 {
			cap := int(shift.MaxOvertimeHours * 60)
			if otMin > cap {
				otMin = cap
			}
		}
		if otMin > 0 {
			calc.OvertimeHours = round2(float64(otMin) / 60.0)
		}
	}

	total := round2(float64(workedMin) / 60.0)
	calc.TotalHours = total
	reg := round2(total - calc.OvertimeHours)
	if reg < 0 {
		reg = 0
	}
	calc.RegularHours = reg
	return calc
}

// parseTimeOfDay accepts HH:MM or HH:MM:SS and returns a since-midnight duration.
func parseTimeOfDay(s string) (time.Duration, error) {
	for _, layout := range []string{"15:04:05", "15:04"} {
		t, err := time.Parse(layout, s)
		if err == nil {
			return time.Duration(t.Hour())*time.Hour +
				time.Duration(t.Minute())*time.Minute +
				time.Duration(t.Second())*time.Second, nil
		}
	}
	return 0, fmt.Errorf("invalid time of day: %q", s)
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
