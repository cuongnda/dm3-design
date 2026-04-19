package attendance

import (
	"net/http"
	"testing"
)

// TestValidateLeaveRequestPayload pins the pure-validation branches of the
// shared leave-request create path. Anything involving the DB (reserveBalance,
// INSERT) is exercised by automation tests; these tests guard the semantic
// invariants that the admin and self-service handlers must agree on.
func TestValidateLeaveRequestPayload(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		req      leaveRequestPayload
		wantCode int    // 0 = success
		wantMsg  string // substring match, ignored when wantCode == 0
		wantDays float64
	}{
		{
			name: "missing policy_id rejected",
			req: leaveRequestPayload{
				UserID:    "u",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-05",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "policy_id",
		},
		{
			name: "bad start_date format rejected",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "not-a-date",
				EndDate:   "2026-01-05",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "start_date",
		},
		{
			name: "bad end_date format rejected",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "nope",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "end_date",
		},
		{
			name: "end_date before start rejected",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-10",
				EndDate:   "2026-01-05",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "on/after",
		},
		{
			name: "half_day on multi-day range rejected",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-07",
				HalfDay:   true,
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "half_day",
		},
		{
			name: "single-day half_day yields 0.5 days",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-05",
				HalfDay:   true,
			},
			wantDays: 0.5,
		},
		{
			name: "single-day non-half yields 1 day (inclusive)",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-05",
			},
			wantDays: 1,
		},
		{
			name: "multi-day yields inclusive count",
			// 2026-01-05 through 2026-01-09 inclusive = 5 days
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-09",
			},
			wantDays: 5,
		},
		{
			name: "caller-supplied days value is honoured when positive",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-09",
				Days:      3, // caller says only 3 working days in that span
			},
			wantDays: 3,
		},
		{
			name: "caller-supplied zero days falls back to computed",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-07",
				Days:      0,
			},
			wantDays: 3,
		},
		{
			name: "negative caller-supplied days falls back to computed",
			req: leaveRequestPayload{
				PolicyID:  "p",
				StartDate: "2026-01-05",
				EndDate:   "2026-01-05",
				Days:      -1,
			},
			wantDays: 1,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			start, days, httpErr := validateLeaveRequestPayload(tc.req)
			if tc.wantCode != 0 {
				if httpErr == nil {
					t.Fatalf("expected error with code %d, got success (days=%.2f)", tc.wantCode, days)
				}
				if httpErr.code != tc.wantCode {
					t.Errorf("expected code %d, got %d", tc.wantCode, httpErr.code)
				}
				if tc.wantMsg != "" && !containsFold(httpErr.msg, tc.wantMsg) {
					t.Errorf("expected message to contain %q, got %q", tc.wantMsg, httpErr.msg)
				}
				return
			}
			if httpErr != nil {
				t.Fatalf("expected success, got error %+v", httpErr)
			}
			if days != tc.wantDays {
				t.Errorf("expected days=%.2f, got %.2f", tc.wantDays, days)
			}
			if start.IsZero() {
				t.Errorf("expected non-zero start date on success")
			}
		})
	}
}

// containsFold is a tiny case-insensitive substring helper to keep the test
// message checks tolerant to capitalization drift.
func containsFold(haystack, needle string) bool {
	if len(needle) == 0 {
		return true
	}
	if len(haystack) < len(needle) {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := 0; j < len(needle); j++ {
			a := haystack[i+j]
			b := needle[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
