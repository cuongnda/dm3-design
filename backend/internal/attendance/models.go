package attendance

import "time"

// Status values for AttendanceRecord.
const (
	StatusPending  = "pending"
	StatusOnTime   = "on_time"
	StatusLate     = "late"
	StatusAbsent   = "absent"
	StatusOnLeave  = "on_leave"
	StatusHalfDay  = "half_day"
	StatusHoliday  = "holiday"
)

// Clock-in/out methods.
const (
	MethodFace    = "face"
	MethodCard    = "card"
	MethodPin     = "pin"
	MethodMobile  = "mobile"
	MethodUnknown = "unknown"
)

// AttendanceRecord mirrors dm3_attendance.attendance_records.
// Fields that can be NULL in the DB are exposed as pointers so callers can
// distinguish "not set" from "zero value".
type AttendanceRecord struct {
	ID                 string     `json:"id"`
	TenantID           string     `json:"tenant_id"`
	SiteID             *string    `json:"site_id,omitempty"`
	UserID             string     `json:"user_id"`
	Date               time.Time  `json:"date"`
	ShiftID            *string    `json:"shift_id,omitempty"`
	ClockIn            *time.Time `json:"clock_in,omitempty"`
	ClockInDeviceID    *string    `json:"clock_in_device_id,omitempty"`
	ClockInMethod      *string    `json:"clock_in_method,omitempty"`
	ClockInPhotoRef    *string    `json:"clock_in_photo_ref,omitempty"`
	ClockOut           *time.Time `json:"clock_out,omitempty"`
	ClockOutDeviceID   *string    `json:"clock_out_device_id,omitempty"`
	ClockOutMethod     *string    `json:"clock_out_method,omitempty"`
	ClockOutPhotoRef   *string    `json:"clock_out_photo_ref,omitempty"`
	Status             string     `json:"status"`
	TotalHours         *float64   `json:"total_hours,omitempty"`
	RegularHours       *float64   `json:"regular_hours,omitempty"`
	OvertimeHours      *float64   `json:"overtime_hours,omitempty"`
	LateMinutes        int        `json:"late_minutes"`
	EarlyLeaveMinutes  int        `json:"early_leave_minutes"`
	BreakMinutes       *int       `json:"break_minutes,omitempty"`
	OvertimeApproved   bool       `json:"overtime_approved"`
	OvertimeApprovedBy *string    `json:"overtime_approved_by,omitempty"`
	ManualAdjustment   bool       `json:"manual_adjustment"`
	AdjustedBy         *string    `json:"adjusted_by,omitempty"`
	AdjustmentReason   *string    `json:"adjustment_reason,omitempty"`
	LeaveType          *string    `json:"leave_type,omitempty"`
	LeaveReferenceID   *string    `json:"leave_reference_id,omitempty"`
	Notes              *string    `json:"notes,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`

	// Joined/denormalised fields exposed to the UI (populated by ListRecords).
	UserName   string `json:"user_name,omitempty"`
	UserEmail  string `json:"user_email,omitempty"`
	ShiftName  string `json:"shift_name,omitempty"`
	ShiftStart string `json:"shift_start,omitempty"`
	ShiftEnd   string `json:"shift_end,omitempty"`
}

// Shift mirrors dm3_attendance.shifts.
type Shift struct {
	ID                       string    `json:"id"`
	TenantID                 string    `json:"tenant_id"`
	SiteID                   *string   `json:"site_id,omitempty"`
	Name                     string    `json:"name"`
	Code                     *string   `json:"code,omitempty"`
	StartTime                string    `json:"start_time"` // HH:MM:SS
	EndTime                  string    `json:"end_time"`
	GracePeriodMinutes       int       `json:"grace_period_minutes"`
	EarlyLeaveThreshold      int       `json:"early_leave_threshold"`
	BreakStart               *string   `json:"break_start,omitempty"`
	BreakEnd                 *string   `json:"break_end,omitempty"`
	BreakDeducted            bool      `json:"break_deducted"`
	OvertimeThresholdMinutes int       `json:"overtime_threshold_minutes"`
	MaxOvertimeHours         float64   `json:"max_overtime_hours"`
	WorkingDays              []int32   `json:"working_days"`
	Color                    string    `json:"color"`
	IsDefault                bool      `json:"is_default"`
	Status                   string    `json:"status"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// Leave request statuses.
const (
	LeavePending   = "pending"
	LeaveApproved  = "approved"
	LeaveRejected  = "rejected"
	LeaveCancelled = "cancelled"
)

// LeavePolicy mirrors dm3_attendance.leave_policies.
type LeavePolicy struct {
	ID                 string    `json:"id"`
	TenantID           string    `json:"tenant_id"`
	Code               string    `json:"code"`
	Name               string    `json:"name"`
	Color              string    `json:"color"`
	AnnualQuotaDays    float64   `json:"annual_quota_days"`
	RequiresApproval   bool      `json:"requires_approval"`
	DeductsAttendance  bool      `json:"deducts_attendance"`
	Paid               bool      `json:"paid"`
	IsActive           bool      `json:"is_active"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// LeaveRequest mirrors dm3_attendance.leave_requests.
type LeaveRequest struct {
	ID            string     `json:"id"`
	TenantID      string     `json:"tenant_id"`
	UserID        string     `json:"user_id"`
	PolicyID      string     `json:"policy_id"`
	StartDate     time.Time  `json:"start_date"`
	EndDate       time.Time  `json:"end_date"`
	Days          float64    `json:"days"`
	HalfDay       bool       `json:"half_day"`
	Reason        *string    `json:"reason,omitempty"`
	AttachmentRef *string    `json:"attachment_ref,omitempty"`
	Status        string     `json:"status"`
	ReviewedBy    *string    `json:"reviewed_by,omitempty"`
	ReviewedAt    *time.Time `json:"reviewed_at,omitempty"`
	ReviewNote    *string    `json:"review_note,omitempty"`
	CancelledAt   *time.Time `json:"cancelled_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`

	// Joined fields for the UI.
	UserName   string `json:"user_name,omitempty"`
	UserEmail  string `json:"user_email,omitempty"`
	PolicyCode string `json:"policy_code,omitempty"`
	PolicyName string `json:"policy_name,omitempty"`
	PolicyColor string `json:"policy_color,omitempty"`
}

// LeaveBalance mirrors dm3_attendance.leave_balances. Remaining is derived so
// the UI does not have to do the arithmetic — callers can trust that
// Remaining = Entitled + CarriedOver - Used - Pending.
type LeaveBalance struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	UserID       string    `json:"user_id"`
	PolicyID     string    `json:"policy_id"`
	Year         int       `json:"year"`
	EntitledDays float64   `json:"entitled_days"`
	UsedDays     float64   `json:"used_days"`
	PendingDays  float64   `json:"pending_days"`
	CarriedOver  float64   `json:"carried_over"`
	RemainingDays float64  `json:"remaining_days"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Joined policy fields for the UI.
	PolicyCode  string `json:"policy_code,omitempty"`
	PolicyName  string `json:"policy_name,omitempty"`
	PolicyColor string `json:"policy_color,omitempty"`
}

// Holiday mirrors dm3_attendance.holidays.
type Holiday struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Date        time.Time `json:"date"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	IsPaid      bool      `json:"is_paid"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AttendanceSettings mirrors dm3_attendance.attendance_settings (one row per tenant).
type AttendanceSettings struct {
	TenantID                    string    `json:"tenant_id"`
	DefaultGraceMinutes         int       `json:"default_grace_minutes"`
	DefaultEarlyLeaveThreshold  int       `json:"default_early_leave_threshold"`
	OvertimeThresholdMinutes    int       `json:"overtime_threshold_minutes"`
	OvertimeRequiresApproval    bool      `json:"overtime_requires_approval"`
	AutoClockoutHours           int       `json:"auto_clockout_hours"`
	WorkweekStart               int       `json:"workweek_start"`
	Timezone                    string    `json:"timezone"`
	CarryoverEnabled            bool      `json:"carryover_enabled"`
	CarryoverMaxDays            float64   `json:"carryover_max_days"`
	CreatedAt                   time.Time `json:"created_at"`
	UpdatedAt                   time.Time `json:"updated_at"`
}
