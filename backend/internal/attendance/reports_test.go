package attendance

import (
	"testing"
)

// TestComputeLaborLawAdvisories covers BR-ATT-007 threshold bands across the
// three advisory codes (weekly_cap, monthly_ot, annual_ot) and the two
// severity levels (warning at 80%, violation over 100%). The monthly cap is
// pro-rated by window length, so the tests exercise both a 7-day window and
// a full 365-day window.
func TestComputeLaborLawAdvisories(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		row         ReportUserRow
		days        int
		wantCodes   map[string]string // code -> severity
		wantNone    bool
	}{
		{
			name:     "zero days returns nil",
			row:      ReportUserRow{RegularHours: 100, OvertimeHours: 100},
			days:     0,
			wantNone: true,
		},
		{
			name:     "under all thresholds produces no advisory",
			row:      ReportUserRow{RegularHours: 30, OvertimeHours: 5},
			days:     7,
			wantNone: true,
		},
		{
			name: "weekly warning at 80 percent of 48h cap",
			// 40h regular + 0 OT over 7 days = 40h/week = 83% of 48h cap.
			row:       ReportUserRow{RegularHours: 40, OvertimeHours: 0},
			days:      7,
			wantCodes: map[string]string{"weekly_cap": "warning"},
		},
		{
			name: "weekly violation above 48h cap",
			// 50h regular + 5h OT over 7 days = 55h/week > 48h.
			row:       ReportUserRow{RegularHours: 50, OvertimeHours: 5},
			days:      7,
			wantCodes: map[string]string{"weekly_cap": "violation"},
		},
		{
			name: "monthly OT warning at 80 percent",
			// 33h OT over 30 days → monthly cap = 40h, 33/40 = 82%.
			// Regular hours kept low to avoid weekly_cap firing.
			row:       ReportUserRow{RegularHours: 20, OvertimeHours: 33},
			days:      30,
			wantCodes: map[string]string{"monthly_ot": "warning"},
		},
		{
			name: "monthly OT violation above cap",
			// 60h OT over 30 days → monthly cap = 40h, 60 > 40.
			row:       ReportUserRow{RegularHours: 20, OvertimeHours: 60},
			days:      30,
			wantCodes: map[string]string{"monthly_ot": "violation"},
		},
		{
			name: "annual OT warning approaching 200h",
			// 170h OT over 365 days. monthly cap pro-rated = 40 * (365/30) ≈ 486h
			// so monthly does NOT fire. 170 > 200*0.8 = 160 → annual warning.
			// Regular hours = 0 → weekly avg = 170/(365/7) ≈ 3.26 → below 48h.
			row:       ReportUserRow{RegularHours: 0, OvertimeHours: 170},
			days:      365,
			wantCodes: map[string]string{"annual_ot": "warning"},
		},
		{
			name: "annual OT violation above 200h",
			// 250h OT over 365 days. Monthly cap pro-rated ≈ 486h so only annual
			// fires. Keep regular low to avoid weekly_cap.
			row:       ReportUserRow{RegularHours: 0, OvertimeHours: 250},
			days:      365,
			wantCodes: map[string]string{"annual_ot": "violation"},
		},
		{
			name: "short window below one week still computed as one week",
			// 40h regular over 3 days should NOT blow up weekly_cap false-
			// positive: weeks clamped to 1 → 40/1 = 40 = warning (40 > 48*0.8).
			row:       ReportUserRow{RegularHours: 40, OvertimeHours: 0},
			days:      3,
			wantCodes: map[string]string{"weekly_cap": "warning"},
		},
		{
			name: "short window monthly clamped to at least one month",
			// 35h OT over 5 days: months clamp to 1 → monthly cap = 40h.
			// 35 > 32 (80%) → warning, not violation.
			// Weekly avg = 35/1 = 35 < 48, no weekly advisory.
			row:       ReportUserRow{RegularHours: 0, OvertimeHours: 35},
			days:      5,
			wantCodes: map[string]string{"monthly_ot": "warning"},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := computeLaborLawAdvisories(tc.row, tc.days)
			if tc.wantNone {
				if got != nil {
					t.Fatalf("expected no advisories, got %+v", got)
				}
				return
			}
			if len(got) != len(tc.wantCodes) {
				t.Fatalf("expected %d advisories, got %d: %+v", len(tc.wantCodes), len(got), got)
			}
			for _, a := range got {
				want, ok := tc.wantCodes[a.Code]
				if !ok {
					t.Errorf("unexpected advisory code %q (severity=%s, value=%.2f)",
						a.Code, a.Severity, a.Value)
					continue
				}
				if a.Severity != want {
					t.Errorf("advisory %q: expected severity %q, got %q (value=%.2f, threshold=%.2f)",
						a.Code, want, a.Severity, a.Value, a.Threshold)
				}
				if a.Message == "" {
					t.Errorf("advisory %q: message must be non-empty", a.Code)
				}
				if a.Threshold <= 0 {
					t.Errorf("advisory %q: threshold must be positive, got %.2f", a.Code, a.Threshold)
				}
			}
		})
	}
}

// TestLaborLawAdvisoryBoundaries verifies exact boundary behaviour: a value at
// the threshold itself does NOT fire, a value strictly above does. This pins
// the `>` (not `>=`) semantics so future edits don't silently flip to >=.
func TestLaborLawAdvisoryBoundaries(t *testing.T) {
	t.Parallel()

	// Exactly 48h/week (48 regular + 0 OT over 7 days) → avgWeekly == 48.
	// `> 48` is false, but `> 48*0.8 = 38.4` is true → should be warning only.
	row := ReportUserRow{RegularHours: 48, OvertimeHours: 0}
	got := computeLaborLawAdvisories(row, 7)
	if len(got) != 1 {
		t.Fatalf("expected 1 advisory at exactly-cap, got %d: %+v", len(got), got)
	}
	if got[0].Code != "weekly_cap" || got[0].Severity != "warning" {
		t.Errorf("at-cap should produce weekly warning, got %+v", got[0])
	}

	// Exactly 200h OT over 365 days: annual should be warning (>160), not
	// violation (not >200). Monthly cap pro-rated ≈ 486h so monthly doesn't
	// fire. Regular=0 keeps weekly silent.
	row = ReportUserRow{RegularHours: 0, OvertimeHours: 200}
	got = computeLaborLawAdvisories(row, 365)
	if len(got) != 1 {
		t.Fatalf("expected 1 advisory at annual cap, got %d: %+v", len(got), got)
	}
	if got[0].Code != "annual_ot" || got[0].Severity != "warning" {
		t.Errorf("at-cap annual should produce warning, got %+v", got[0])
	}
}
