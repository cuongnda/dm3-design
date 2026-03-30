package attend

import (
	"time"

	"github.com/google/uuid"
)

// AttendanceRecord represents a work attendance record for a person
type AttendanceRecord struct {
	ID              uuid.UUID              `json:"id" db:"id"`
	TenantID        uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	PersonID        uuid.UUID              `json:"person_id" db:"person_id"`
	PersonName      string                 `json:"person_name" db:"person_name"`
	Date            time.Time              `json:"date" db:"date"`
	ShiftID         *uuid.UUID             `json:"shift_id,omitempty" db:"shift_id"`
	ShiftName       *string                `json:"shift_name,omitempty" db:"shift_name"`
	ClockInTime     *time.Time             `json:"clock_in_time,omitempty" db:"clock_in_time"`
	ClockOutTime    *time.Time             `json:"clock_out_time,omitempty" db:"clock_out_time"`
	ClockInMethod   *string                `json:"clock_in_method,omitempty" db:"clock_in_method"` // door, mobile, manual, web
	ClockOutMethod  *string                `json:"clock_out_method,omitempty" db:"clock_out_method"`
	ClockInLocation *string                `json:"clock_in_location,omitempty" db:"clock_in_location"` // door name or device
	ClockOutLocation *string               `json:"clock_out_location,omitempty" db:"clock_out_location"`
	BreakMinutes    int                    `json:"break_minutes" db:"break_minutes"`
	WorkedMinutes   int                    `json:"worked_minutes" db:"worked_minutes"` // calculated
	RegularMinutes  int                    `json:"regular_minutes" db:"regular_minutes"` // within shift hours
	OvertimeMinutes int                    `json:"overtime_minutes" db:"overtime_minutes"` // beyond shift hours
	Status          string                 `json:"status" db:"status"` // present, absent, late, early_leave, partial
	ApprovalStatus  string                 `json:"approval_status" db:"approval_status"` // pending, approved, rejected
	Notes           *string                `json:"notes,omitempty" db:"notes"`
	Metadata        map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt       time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at" db:"updated_at"`
	ApprovedBy      *uuid.UUID             `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt      *time.Time             `json:"approved_at,omitempty" db:"approved_at"`
}

// BreakRecord represents a break taken during work
type BreakRecord struct {
	ID           uuid.UUID  `json:"id" db:"id"`
	TenantID     uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	AttendanceID uuid.UUID  `json:"attendance_id" db:"attendance_id"`
	PersonID     uuid.UUID  `json:"person_id" db:"person_id"`
	BreakType    string     `json:"break_type" db:"break_type"` // lunch, coffee, rest, etc.
	StartTime    time.Time  `json:"start_time" db:"start_time"`
	EndTime      *time.Time `json:"end_time,omitempty" db:"end_time"`
	Minutes      int        `json:"minutes" db:"minutes"` // calculated duration
	IsPaid       bool       `json:"is_paid" db:"is_paid"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
}

// Shift represents a work shift definition
type Shift struct {
	ID                uuid.UUID `json:"id" db:"id"`
	TenantID          uuid.UUID `json:"tenant_id" db:"tenant_id"`
	Name              string    `json:"name" db:"name"`
	StartTime         string    `json:"start_time" db:"start_time"` // HH:MM format
	EndTime           string    `json:"end_time" db:"end_time"`     // HH:MM format
	WorkDays          []int     `json:"work_days" db:"work_days"`   // [1,2,3,4,5] = Mon-Fri
	BreakMinutes      int       `json:"break_minutes" db:"break_minutes"` // default break allowance
	GracePeriodMinutes int      `json:"grace_period_minutes" db:"grace_period_minutes"` // late tolerance
	Color             string    `json:"color" db:"color"` // UI color
	IsActive          bool      `json:"is_active" db:"is_active"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// ShiftAssignment represents a person's assignment to a shift
type ShiftAssignment struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	TenantID  uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	PersonID  uuid.UUID  `json:"person_id" db:"person_id"`
	PersonName string    `json:"person_name" db:"person_name"`
	ShiftID   uuid.UUID  `json:"shift_id" db:"shift_id"`
	ShiftName string     `json:"shift_name" db:"shift_name"`
	StartDate time.Time  `json:"start_date" db:"start_date"`
	EndDate   *time.Time `json:"end_date,omitempty" db:"end_date"` // null = ongoing
	IsActive  bool       `json:"is_active" db:"is_active"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
}

// LeaveRequest represents a leave/absence request
type LeaveRequest struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	PersonID     uuid.UUID              `json:"person_id" db:"person_id"`
	PersonName   string                 `json:"person_name" db:"person_name"`
	LeaveType    string                 `json:"leave_type" db:"leave_type"` // annual, sick, personal, emergency, etc.
	StartDate    time.Time              `json:"start_date" db:"start_date"`
	EndDate      time.Time              `json:"end_date" db:"end_date"`
	TotalDays    float64                `json:"total_days" db:"total_days"` // can be partial days
	Reason       string                 `json:"reason" db:"reason"`
	Status       string                 `json:"status" db:"status"` // pending, approved, rejected, cancelled
	ApprovedBy   *uuid.UUID             `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt   *time.Time             `json:"approved_at,omitempty" db:"approved_at"`
	RejectedBy   *uuid.UUID             `json:"rejected_by,omitempty" db:"rejected_by"`
	RejectedAt   *time.Time             `json:"rejected_at,omitempty" db:"rejected_at"`
	RejectionReason *string             `json:"rejection_reason,omitempty" db:"rejection_reason"`
	Metadata     map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
}

// OvertimeRequest represents an overtime work request
type OvertimeRequest struct {
	ID          uuid.UUID              `json:"id" db:"id"`
	TenantID    uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	PersonID    uuid.UUID              `json:"person_id" db:"person_id"`
	PersonName  string                 `json:"person_name" db:"person_name"`
	Date        time.Time              `json:"date" db:"date"`
	StartTime   time.Time              `json:"start_time" db:"start_time"`
	EndTime     time.Time              `json:"end_time" db:"end_time"`
	Minutes     int                    `json:"minutes" db:"minutes"` // requested overtime duration
	Reason      string                 `json:"reason" db:"reason"`
	Status      string                 `json:"status" db:"status"` // pending, approved, rejected
	ApprovedBy  *uuid.UUID             `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt  *time.Time             `json:"approved_at,omitempty" db:"approved_at"`
	ActualMinutes *int                 `json:"actual_minutes,omitempty" db:"actual_minutes"` // actual overtime worked
	Metadata    map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
}

// AttendanceSettings represents tenant-wide attendance configuration
type AttendanceSettings struct {
	ID                    uuid.UUID `json:"id" db:"id"`
	TenantID              uuid.UUID `json:"tenant_id" db:"tenant_id"`
	WorkingDaysPerWeek    int       `json:"working_days_per_week" db:"working_days_per_week"`
	WorkingHoursPerDay    float64   `json:"working_hours_per_day" db:"working_hours_per_day"`
	OvertimeRate          float64   `json:"overtime_rate" db:"overtime_rate"` // multiplier (1.5 = 150%)
	LateThresholdMinutes  int       `json:"late_threshold_minutes" db:"late_threshold_minutes"`
	EarlyLeaveThresholdMinutes int  `json:"early_leave_threshold_minutes" db:"early_leave_threshold_minutes"`
	RequireApproval       bool      `json:"require_approval" db:"require_approval"`
	AutoClockOut          bool      `json:"auto_clock_out" db:"auto_clock_out"` // auto clock out at shift end
	AutoClockOutTime      *string   `json:"auto_clock_out_time,omitempty" db:"auto_clock_out_time"` // HH:MM
	TrackBreaks           bool      `json:"track_breaks" db:"track_breaks"`
	MaxBreakMinutes       int       `json:"max_break_minutes" db:"max_break_minutes"`
	RoundingMinutes       int       `json:"rounding_minutes" db:"rounding_minutes"` // round to nearest X minutes
	WeekStartDay          int       `json:"week_start_day" db:"week_start_day"` // 0=Sunday, 1=Monday
	TimezoneOffset        string    `json:"timezone_offset" db:"timezone_offset"` // e.g. "+07:00"
	CreatedAt             time.Time `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time `json:"updated_at" db:"updated_at"`
}

// Request/Response types

type ClockInRequest struct {
	PersonID   uuid.UUID              `json:"person_id" validate:"required"`
	Method     string                 `json:"method"` // door, mobile, manual, web
	Location   *string                `json:"location,omitempty"`
	DeviceID   *string                `json:"device_id,omitempty"`
	Timestamp  *time.Time             `json:"timestamp,omitempty"` // defaults to now()
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type ClockOutRequest struct {
	PersonID   uuid.UUID              `json:"person_id" validate:"required"`
	Method     string                 `json:"method"`
	Location   *string                `json:"location,omitempty"`
	DeviceID   *string                `json:"device_id,omitempty"`
	Timestamp  *time.Time             `json:"timestamp,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type BreakRequest struct {
	PersonID     uuid.UUID `json:"person_id" validate:"required"`
	BreakType    string    `json:"break_type"`
	AttendanceID *uuid.UUID `json:"attendance_id,omitempty"`
}

type CreateShiftRequest struct {
	Name               string `json:"name" validate:"required"`
	StartTime          string `json:"start_time" validate:"required"` // HH:MM
	EndTime            string `json:"end_time" validate:"required"`
	WorkDays           []int  `json:"work_days"`
	BreakMinutes       int    `json:"break_minutes"`
	GracePeriodMinutes int    `json:"grace_period_minutes"`
	Color              string `json:"color"`
}

type UpdateShiftRequest struct {
	Name               *string `json:"name,omitempty"`
	StartTime          *string `json:"start_time,omitempty"`
	EndTime            *string `json:"end_time,omitempty"`
	WorkDays           *[]int  `json:"work_days,omitempty"`
	BreakMinutes       *int    `json:"break_minutes,omitempty"`
	GracePeriodMinutes *int    `json:"grace_period_minutes,omitempty"`
	Color              *string `json:"color,omitempty"`
	IsActive           *bool   `json:"is_active,omitempty"`
}

type CreateShiftAssignmentRequest struct {
	PersonID  uuid.UUID  `json:"person_id" validate:"required"`
	ShiftID   uuid.UUID  `json:"shift_id" validate:"required"`
	StartDate time.Time  `json:"start_date" validate:"required"`
	EndDate   *time.Time `json:"end_date,omitempty"`
}

type CreateLeaveRequestRequest struct {
	LeaveType string    `json:"leave_type" validate:"required"`
	StartDate time.Time `json:"start_date" validate:"required"`
	EndDate   time.Time `json:"end_date" validate:"required"`
	Reason    string    `json:"reason" validate:"required"`
}

type CreateOvertimeRequestRequest struct {
	Date      time.Time `json:"date" validate:"required"`
	StartTime time.Time `json:"start_time" validate:"required"`
	EndTime   time.Time `json:"end_time" validate:"required"`
	Reason    string    `json:"reason" validate:"required"`
}

type AttendanceListQuery struct {
	PersonID   *string `query:"person_id"`
	ShiftID    *string `query:"shift_id"`
	Status     *string `query:"status"`
	DateFrom   *string `query:"date_from"`
	DateTo     *string `query:"date_to"`
	Department *string `query:"department"`
	Limit      int     `query:"limit"`
	Offset     int     `query:"offset"`
	OrderBy    *string `query:"order_by"`
	OrderDir   *string `query:"order_dir"`
}

// Response types

type AttendanceStatsResponse struct {
	TenantID              uuid.UUID               `json:"tenant_id"`
	TotalEmployees        int64                   `json:"total_employees"`
	PresentToday          int64                   `json:"present_today"`
	AbsentToday           int64                   `json:"absent_today"`
	LateToday             int64                   `json:"late_today"`
	OnBreak               int64                   `json:"on_break"`
	WorkingNow            int64                   `json:"working_now"`
	PendingApprovals      int64                   `json:"pending_approvals"`
	ByStatus              map[string]int64        `json:"by_status"`
	ByShift               map[string]int64        `json:"by_shift"`
	AverageWorkingHours   float64                 `json:"average_working_hours"`
	TotalOvertimeHours    float64                 `json:"total_overtime_hours"`
	AttendanceRate        float64                 `json:"attendance_rate"` // present / (present + absent)
	PunctualityRate       float64                 `json:"punctuality_rate"` // on-time / present
}

type PersonAttendanceStats struct {
	PersonID            uuid.UUID `json:"person_id"`
	PersonName          string    `json:"person_name"`
	TotalDays           int64     `json:"total_days"`
	PresentDays         int64     `json:"present_days"`
	AbsentDays          int64     `json:"absent_days"`
	LateDays            int64     `json:"late_days"`
	EarlyLeaveDays      int64     `json:"early_leave_days"`
	TotalWorkedHours    float64   `json:"total_worked_hours"`
	TotalOvertimeHours  float64   `json:"total_overtime_hours"`
	AttendanceRate      float64   `json:"attendance_rate"`
	PunctualityRate     float64   `json:"punctuality_rate"`
	AverageArrivalTime  *string   `json:"average_arrival_time,omitempty"`
	AverageDepartureTime *string  `json:"average_departure_time,omitempty"`
}

type DailyAttendanceReport struct {
	Date           string                       `json:"date"`
	TotalEmployees int64                        `json:"total_employees"`
	Present        int64                        `json:"present"`
	Absent         int64                        `json:"absent"`
	Late           int64                        `json:"late"`
	EarlyLeave     int64                        `json:"early_leave"`
	TotalHours     float64                      `json:"total_hours"`
	OvertimeHours  float64                      `json:"overtime_hours"`
	ByShift        map[string]ShiftAttendance   `json:"by_shift"`
	Employees      []EmployeeAttendanceDetail   `json:"employees"`
}

type ShiftAttendance struct {
	ShiftName    string  `json:"shift_name"`
	Expected     int64   `json:"expected"`
	Present      int64   `json:"present"`
	Absent       int64   `json:"absent"`
	Late         int64   `json:"late"`
	TotalHours   float64 `json:"total_hours"`
	OvertimeHours float64 `json:"overtime_hours"`
}

type EmployeeAttendanceDetail struct {
	PersonID       uuid.UUID  `json:"person_id"`
	PersonName     string     `json:"person_name"`
	Department     *string    `json:"department,omitempty"`
	ShiftName      *string    `json:"shift_name,omitempty"`
	Status         string     `json:"status"`
	ClockInTime    *time.Time `json:"clock_in_time,omitempty"`
	ClockOutTime   *time.Time `json:"clock_out_time,omitempty"`
	WorkedHours    float64    `json:"worked_hours"`
	OvertimeHours  float64    `json:"overtime_hours"`
	BreakMinutes   int        `json:"break_minutes"`
	IsLate         bool       `json:"is_late"`
	IsEarlyLeave   bool       `json:"is_early_leave"`
}

type PayrollReport struct {
	PeriodStart     time.Time                    `json:"period_start"`
	PeriodEnd       time.Time                    `json:"period_end"`
	TotalEmployees  int64                        `json:"total_employees"`
	TotalRegularHours float64                    `json:"total_regular_hours"`
	TotalOvertimeHours float64                   `json:"total_overtime_hours"`
	Employees       []EmployeePayrollDetail      `json:"employees"`
}

type EmployeePayrollDetail struct {
	PersonID        uuid.UUID `json:"person_id"`
	PersonName      string    `json:"person_name"`
	Department      *string   `json:"department,omitempty"`
	RegularHours    float64   `json:"regular_hours"`
	OvertimeHours   float64   `json:"overtime_hours"`
	TotalHours      float64   `json:"total_hours"`
	WorkDays        int64     `json:"work_days"`
	AbsentDays      int64     `json:"absent_days"`
	LateDays        int64     `json:"late_days"`
}

// Event types for NATS

type AttendanceEvent struct {
	Type       string                 `json:"type"`
	TenantID   uuid.UUID              `json:"tenant_id"`
	PersonID   uuid.UUID              `json:"person_id"`
	PersonName string                 `json:"person_name"`
	Action     string                 `json:"action"` // clock_in, clock_out, break_start, break_end
	Timestamp  time.Time              `json:"timestamp"`
	Method     string                 `json:"method"`
	Location   *string                `json:"location,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Constants

// Attendance statuses
const (
	AttendanceStatusPresent    = "present"
	AttendanceStatusAbsent     = "absent"
	AttendanceStatusLate       = "late"
	AttendanceStatusEarlyLeave = "early_leave"
	AttendanceStatusPartial    = "partial"
)

// Approval statuses
const (
	ApprovalStatusPending  = "pending"
	ApprovalStatusApproved = "approved"
	ApprovalStatusRejected = "rejected"
)

// Clock methods
const (
	ClockMethodDoor   = "door"
	ClockMethodMobile = "mobile"
	ClockMethodManual = "manual"
	ClockMethodWeb    = "web"
	ClockMethodAuto   = "auto"
)

// Break types
const (
	BreakTypeLunch   = "lunch"
	BreakTypeCoffee  = "coffee"
	BreakTypeRest    = "rest"
	BreakTypePersonal = "personal"
)

// Leave types
const (
	LeaveTypeAnnual    = "annual"
	LeaveTypeSick      = "sick"
	LeaveTypePersonal  = "personal"
	LeaveTypeEmergency = "emergency"
	LeaveTypeMaternity = "maternity"
	LeaveTypePaternity = "paternity"
	LeaveTypeBereavement = "bereavement"
	LeaveTypeUnpaid    = "unpaid"
)

// Request statuses
const (
	RequestStatusPending   = "pending"
	RequestStatusApproved  = "approved"
	RequestStatusRejected  = "rejected"
	RequestStatusCancelled = "cancelled"
)

// Default settings
var DefaultAttendanceSettings = AttendanceSettings{
	WorkingDaysPerWeek:         5,
	WorkingHoursPerDay:         8.0,
	OvertimeRate:               1.5,
	LateThresholdMinutes:       15,
	EarlyLeaveThresholdMinutes: 15,
	RequireApproval:            false,
	AutoClockOut:               false,
	TrackBreaks:                true,
	MaxBreakMinutes:            60,
	RoundingMinutes:            1, // no rounding
	WeekStartDay:               1, // Monday
	TimezoneOffset:             "+07:00",
}