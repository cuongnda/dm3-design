package attendance

import (
	"net/http"
	"testing"
)

// TestValidateOvertimeRequestPayload pins the pure-validation branches shared
// by RequestOvertime (admin) and RequestMeOvertime (self-service). The two
// paths must stay byte-identical on these checks — drift here would mean a
// rejection on one endpoint sneaking through the other.
func TestValidateOvertimeRequestPayload(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		p        overtimeRequestPayload
		wantCode int    // 0 = success
		wantMsg  string // substring match, ignored when wantCode == 0
	}{
		{
			name: "zero hours rejected",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  0,
				Reason: "late project work",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "hours",
		},
		{
			name: "negative hours rejected",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  -1,
				Reason: "late project work",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "hours",
		},
		{
			name: "hours above 24 rejected",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  24.1,
				Reason: "late project work",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "hours",
		},
		{
			name: "hours exactly 24 accepted (full-day compressed shift)",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  24,
				Reason: "rescheduled full shift",
			},
		},
		{
			name: "fractional hours accepted",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  1.5,
				Reason: "late project work",
			},
		},
		{
			name: "missing reason rejected",
			p: overtimeRequestPayload{
				Date:  "2026-01-05",
				Hours: 2,
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "reason",
		},
		{
			name: "invalid date format rejected",
			p: overtimeRequestPayload{
				Date:   "05/01/2026",
				Hours:  2,
				Reason: "late project work",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "date",
		},
		{
			name: "missing date rejected",
			p: overtimeRequestPayload{
				Hours:  2,
				Reason: "late project work",
			},
			wantCode: http.StatusBadRequest,
			wantMsg:  "date",
		},
		{
			name: "admin-style payload with user_id still validates",
			p: overtimeRequestPayload{
				Date:   "2026-01-05",
				Hours:  3,
				Reason: "staffed the late shift",
				UserID: "00000000-0000-0000-0000-000000000001",
			},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			date, httpErr := validateOvertimeRequestPayload(tc.p)
			if tc.wantCode != 0 {
				if httpErr == nil {
					t.Fatalf("expected error with code %d, got success", tc.wantCode)
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
			if date.IsZero() {
				t.Error("expected non-zero date on success")
			}
		})
	}
}

// TestValidateLeaveSyncRow pins the pure-validation branches of the HR webhook
// (POST /attendance/leave/sync). These invariants guard the integration
// boundary: a bug here could let an HR system smuggle in a half-day leave
// over a multi-day range, or credit a balance against a missing policy.
func TestValidateLeaveSyncRow(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		req        leaveSyncRequest
		wantFail   string  // substring match for failReason; "" means success
		wantDays   float64 // checked only on success
		wantStatus string  // checked only on success
	}{
		{
			name: "missing external_id rejected",
			req: leaveSyncRequest{
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
			},
			wantFail: "external_id",
		},
		{
			name: "whitespace-only external_id rejected",
			req: leaveSyncRequest{
				ExternalID: "   ",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
			},
			wantFail: "external_id",
		},
		{
			name: "missing user_id rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
			},
			wantFail: "user_id",
		},
		{
			name: "missing policy_code rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
			},
			wantFail: "policy_code",
		},
		{
			name: "invalid start_date rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "not-a-date",
				EndDate:    "2026-01-05",
			},
			wantFail: "start_date",
		},
		{
			name: "invalid end_date rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "nope",
			},
			wantFail: "end_date",
		},
		{
			name: "end_date before start rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-10",
				EndDate:    "2026-01-05",
			},
			wantFail: "on/after",
		},
		{
			name: "half_day on multi-day range rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-07",
				HalfDay:    true,
			},
			wantFail: "half_day",
		},
		{
			name: "unknown status rejected",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
				Status:     "mystery",
			},
			wantFail: "status",
		},
		{
			name: "empty status defaults to approved",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
			},
			wantDays:   1,
			wantStatus: LeaveApproved,
		},
		{
			name: "uppercase status is normalised",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
				Status:     "PENDING",
			},
			wantDays:   1,
			wantStatus: LeavePending,
		},
		{
			name: "single-day half_day yields 0.5 days",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
				HalfDay:    true,
			},
			wantDays:   0.5,
			wantStatus: LeaveApproved,
		},
		{
			name: "multi-day range yields inclusive day count",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-09",
			},
			wantDays:   5,
			wantStatus: LeaveApproved,
		},
		{
			name: "caller-supplied positive days is honoured",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-09",
				Days:       3, // 5 calendar days, only 3 working
				Status:     "approved",
			},
			wantDays:   3,
			wantStatus: LeaveApproved,
		},
		{
			name: "caller-supplied zero days falls back to computed",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-07",
				Days:       0,
			},
			wantDays:   3,
			wantStatus: LeaveApproved,
		},
		{
			name: "cancelled status accepted",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
				Status:     "cancelled",
			},
			wantDays:   1,
			wantStatus: LeaveCancelled,
		},
		{
			name: "rejected status accepted",
			req: leaveSyncRequest{
				ExternalID: "hr-1",
				UserID:     "u",
				PolicyCode: "ANNUAL",
				StartDate:  "2026-01-05",
				EndDate:    "2026-01-05",
				Status:     "rejected",
			},
			wantDays:   1,
			wantStatus: LeaveRejected,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			start, end, days, status, failReason := validateLeaveSyncRow(tc.req)
			if tc.wantFail != "" {
				if failReason == "" {
					t.Fatalf("expected failure containing %q, got success", tc.wantFail)
				}
				if !containsFold(failReason, tc.wantFail) {
					t.Errorf("expected failure to contain %q, got %q", tc.wantFail, failReason)
				}
				return
			}
			if failReason != "" {
				t.Fatalf("expected success, got failure %q", failReason)
			}
			if days != tc.wantDays {
				t.Errorf("expected days=%.2f, got %.2f", tc.wantDays, days)
			}
			if status != tc.wantStatus {
				t.Errorf("expected status=%q, got %q", tc.wantStatus, status)
			}
			if start.IsZero() || end.IsZero() {
				t.Errorf("expected non-zero start/end on success")
			}
			if end.Before(start) {
				t.Errorf("end (%s) unexpectedly before start (%s)", end, start)
			}
		})
	}
}
