package visitor

import (
	"time"

	"github.com/google/uuid"
)

// Visitor represents a visitor to the facility
type Visitor struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	VisitorType  string                 `json:"visitor_type" db:"visitor_type"` // guest, contractor, delivery, interview, etc.
	FirstName    string                 `json:"first_name" db:"first_name"`
	LastName     string                 `json:"last_name" db:"last_name"`
	Email        *string                `json:"email,omitempty" db:"email"`
	Phone        *string                `json:"phone,omitempty" db:"phone"`
	Company      *string                `json:"company,omitempty" db:"company"`
	IDNumber     *string                `json:"id_number,omitempty" db:"id_number"` // Government ID (masked)
	VehiclePlate *string                `json:"vehicle_plate,omitempty" db:"vehicle_plate"`
	Purpose      string                 `json:"purpose" db:"purpose"`
	HostID       *uuid.UUID             `json:"host_id,omitempty" db:"host_id"`
	HostName     *string                `json:"host_name,omitempty" db:"host_name"`
	HostEmail    *string                `json:"host_email,omitempty" db:"host_email"`
	HostPhone    *string                `json:"host_phone,omitempty" db:"host_phone"`
	Status       string                 `json:"status" db:"status"` // pre_registered, waiting, approved, checked_in, checked_out, rejected, expired
	PhotoURL     *string                `json:"photo_url,omitempty" db:"photo_url"`
	BadgePrinted bool                   `json:"badge_printed" db:"badge_printed"`
	BadgeNumber  *string                `json:"badge_number,omitempty" db:"badge_number"`
	ScheduledAt  *time.Time             `json:"scheduled_at,omitempty" db:"scheduled_at"`
	ValidFrom    *time.Time             `json:"valid_from,omitempty" db:"valid_from"`
	ValidUntil   *time.Time             `json:"valid_until,omitempty" db:"valid_until"`
	CheckedInAt  *time.Time             `json:"checked_in_at,omitempty" db:"checked_in_at"`
	CheckedOutAt *time.Time             `json:"checked_out_at,omitempty" db:"checked_out_at"`
	CheckedInBy  *uuid.UUID             `json:"checked_in_by,omitempty" db:"checked_in_by"`
	CheckedOutBy *uuid.UUID             `json:"checked_out_by,omitempty" db:"checked_out_by"`
	AccessZones  []string               `json:"access_zones" db:"access_zones"`
	Metadata     map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	Notes        *string                `json:"notes,omitempty" db:"notes"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy    *uuid.UUID             `json:"created_by,omitempty" db:"created_by"`
}

// VisitorHost represents a person who can host visitors
type VisitorHost struct {
	ID           uuid.UUID   `json:"id" db:"id"`
	TenantID     uuid.UUID   `json:"tenant_id" db:"tenant_id"`
	PersonID     uuid.UUID   `json:"person_id" db:"person_id"` // Link to dm3_identity.persons
	Name         string      `json:"name" db:"name"`
	Email        string      `json:"email" db:"email"`
	Phone        *string     `json:"phone,omitempty" db:"phone"`
	Department   *string     `json:"department,omitempty" db:"department"`
	Title        *string     `json:"title,omitempty" db:"title"`
	MaxVisitors  int         `json:"max_visitors" db:"max_visitors"`
	CanApprove   bool        `json:"can_approve" db:"can_approve"`
	AutoApprove  bool        `json:"auto_approve" db:"auto_approve"`
	AccessZones  []string    `json:"access_zones" db:"access_zones"`
	Active       bool        `json:"active" db:"active"`
	CreatedAt    time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at" db:"updated_at"`
}

// VisitorSettings represents tenant-wide visitor management settings
type VisitorSettings struct {
	ID                    uuid.UUID `json:"id" db:"id"`
	TenantID              uuid.UUID `json:"tenant_id" db:"tenant_id"`
	RequirePreRegistration bool      `json:"require_pre_registration" db:"require_pre_registration"`
	RequireHostApproval   bool      `json:"require_host_approval" db:"require_host_approval"`
	RequirePhoto          bool      `json:"require_photo" db:"require_photo"`
	RequireIDVerification bool      `json:"require_id_verification" db:"require_id_verification"`
	MaxVisitDuration      int       `json:"max_visit_duration" db:"max_visit_duration"` // hours
	DefaultValidDuration  int       `json:"default_valid_duration" db:"default_valid_duration"` // hours
	AutoExpireVisitors    bool      `json:"auto_expire_visitors" db:"auto_expire_visitors"`
	BadgeTemplate         *string   `json:"badge_template,omitempty" db:"badge_template"`
	WelcomeMessage        *string   `json:"welcome_message,omitempty" db:"welcome_message"`
	CheckOutRequired      bool      `json:"checkout_required" db:"checkout_required"`
	NotifyHostOnArrival   bool      `json:"notify_host_on_arrival" db:"notify_host_on_arrival"`
	NotifyHostOnOverstay  bool      `json:"notify_host_on_overstay" db:"notify_host_on_overstay"`
	AllowWalkIns          bool      `json:"allow_walk_ins" db:"allow_walk_ins"`
	UpdatedAt             time.Time `json:"updated_at" db:"updated_at"`
	CreatedAt             time.Time `json:"created_at" db:"created_at"`
}

// Request/Response types

type CreateVisitorRequest struct {
	VisitorType  string                 `json:"visitor_type" validate:"required"`
	FirstName    string                 `json:"first_name" validate:"required"`
	LastName     string                 `json:"last_name" validate:"required"`
	Email        *string                `json:"email,omitempty"`
	Phone        *string                `json:"phone,omitempty"`
	Company      *string                `json:"company,omitempty"`
	IDNumber     *string                `json:"id_number,omitempty"`
	VehiclePlate *string                `json:"vehicle_plate,omitempty"`
	Purpose      string                 `json:"purpose" validate:"required"`
	HostID       *uuid.UUID             `json:"host_id,omitempty"`
	HostEmail    *string                `json:"host_email,omitempty"`
	ScheduledAt  *time.Time             `json:"scheduled_at,omitempty"`
	ValidFrom    *time.Time             `json:"valid_from,omitempty"`
	ValidUntil   *time.Time             `json:"valid_until,omitempty"`
	AccessZones  []string               `json:"access_zones,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Notes        *string                `json:"notes,omitempty"`
}

type UpdateVisitorRequest struct {
	VisitorType  *string                `json:"visitor_type,omitempty"`
	FirstName    *string                `json:"first_name,omitempty"`
	LastName     *string                `json:"last_name,omitempty"`
	Email        *string                `json:"email,omitempty"`
	Phone        *string                `json:"phone,omitempty"`
	Company      *string                `json:"company,omitempty"`
	IDNumber     *string                `json:"id_number,omitempty"`
	VehiclePlate *string                `json:"vehicle_plate,omitempty"`
	Purpose      *string                `json:"purpose,omitempty"`
	HostID       *uuid.UUID             `json:"host_id,omitempty"`
	ScheduledAt  *time.Time             `json:"scheduled_at,omitempty"`
	ValidFrom    *time.Time             `json:"valid_from,omitempty"`
	ValidUntil   *time.Time             `json:"valid_until,omitempty"`
	AccessZones  *[]string              `json:"access_zones,omitempty"`
	Metadata     *map[string]interface{} `json:"metadata,omitempty"`
	Notes        *string                `json:"notes,omitempty"`
}

type PreRegisterVisitorRequest struct {
	TenantCode   string     `json:"tenant_code" validate:"required"` // Company code for public registration
	FirstName    string     `json:"first_name" validate:"required"`
	LastName     string     `json:"last_name" validate:"required"`
	Email        string     `json:"email" validate:"required,email"`
	Phone        *string    `json:"phone,omitempty"`
	Company      *string    `json:"company,omitempty"`
	VehiclePlate *string    `json:"vehicle_plate,omitempty"`
	Purpose      string     `json:"purpose" validate:"required"`
	HostEmail    string     `json:"host_email" validate:"required,email"`
	ScheduledAt  *time.Time `json:"scheduled_at,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
}

type CheckInRequest struct {
	CheckedInBy *uuid.UUID `json:"checked_in_by,omitempty"`
	BadgeNumber *string    `json:"badge_number,omitempty"`
	PhotoURL    *string    `json:"photo_url,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
}

type CheckOutRequest struct {
	CheckedOutBy *uuid.UUID `json:"checked_out_by,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
}

type VisitorListQuery struct {
	Status      *string    `query:"status"`
	HostID      *string    `query:"host_id"`
	VisitorType *string    `query:"visitor_type"`
	DateFrom    *string    `query:"date_from"`
	DateTo      *string    `query:"date_to"`
	SearchTerm  *string    `query:"search"`
	Limit       int        `query:"limit"`
	Offset      int        `query:"offset"`
	OrderBy     *string    `query:"order_by"`
	OrderDir    *string    `query:"order_dir"`
}

type DailyReportResponse struct {
	Date                string                `json:"date"`
	TotalVisitors       int64                 `json:"total_visitors"`
	CheckedIn           int64                 `json:"checked_in"`
	CheckedOut          int64                 `json:"checked_out"`
	CurrentlyInside     int64                 `json:"currently_inside"`
	PreRegistered       int64                 `json:"pre_registered"`
	WalkIns             int64                 `json:"walk_ins"`
	ByVisitorType       map[string]int64      `json:"by_visitor_type"`
	ByStatus            map[string]int64      `json:"by_status"`
	TopHosts            []HostActivityStats   `json:"top_hosts"`
	PeakHours           []HourlyStats         `json:"peak_hours"`
	AverageStayDuration *int                  `json:"average_stay_duration_minutes,omitempty"`
}

type HostActivityStats struct {
	HostID       uuid.UUID `json:"host_id"`
	HostName     string    `json:"host_name"`
	HostEmail    string    `json:"host_email"`
	VisitorCount int64     `json:"visitor_count"`
}

type HourlyStats struct {
	Hour  int   `json:"hour"`
	Count int64 `json:"count"`
}

type VisitorStatsResponse struct {
	TenantID               uuid.UUID               `json:"tenant_id"`
	TotalVisitors          int64                   `json:"total_visitors"`
	ActiveVisitors         int64                   `json:"active_visitors"`
	VisitorsToday          int64                   `json:"visitors_today"`
	VisitorsThisWeek       int64                   `json:"visitors_this_week"`
	VisitorsThisMonth      int64                   `json:"visitors_this_month"`
	CurrentlyInside        int64                   `json:"currently_inside"`
	AwaitingApproval       int64                   `json:"awaiting_approval"`
	ByStatus               map[string]int64        `json:"by_status"`
	ByVisitorType          map[string]int64        `json:"by_visitor_type"`
	TopHosts               []HostActivityStats     `json:"top_hosts"`
	AverageVisitDuration   *int                    `json:"average_visit_duration_minutes,omitempty"`
	ComplianceRate         float64                 `json:"compliance_rate"` // checked out / checked in
}

// Event types for NATS publishing

type VisitorEvent struct {
	Type         string                 `json:"type"`
	TenantID     uuid.UUID              `json:"tenant_id"`
	VisitorID    uuid.UUID              `json:"visitor_id"`
	Action       string                 `json:"action"` // created, approved, rejected, checked_in, checked_out, expired
	VisitorName  string                 `json:"visitor_name"`
	HostID       *uuid.UUID             `json:"host_id,omitempty"`
	HostName     *string                `json:"host_name,omitempty"`
	HostEmail    *string                `json:"host_email,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// Constants

// Visitor types
const (
	VisitorTypeGuest       = "guest"
	VisitorTypeContractor  = "contractor"
	VisitorTypeDelivery    = "delivery"
	VisitorTypeInterview   = "interview"
	VisitorTypeMaintenance = "maintenance"
	VisitorTypeVendor      = "vendor"
	VisitorTypeClient      = "client"
	VisitorTypeAuditor     = "auditor"
	VisitorTypeOther       = "other"
)

// Visitor statuses
const (
	VisitorStatusPreRegistered = "pre_registered"
	VisitorStatusWaiting       = "waiting"
	VisitorStatusApproved      = "approved"
	VisitorStatusRejected      = "rejected"
	VisitorStatusCheckedIn     = "checked_in"
	VisitorStatusCheckedOut    = "checked_out"
	VisitorStatusExpired       = "expired"
	VisitorStatusNoShow        = "no_show"
)

// Visitor event actions
const (
	VisitorActionCreated    = "created"
	VisitorActionApproved   = "approved"
	VisitorActionRejected   = "rejected"
	VisitorActionCheckedIn  = "checked_in"
	VisitorActionCheckedOut = "checked_out"
	VisitorActionExpired    = "expired"
	VisitorActionNoShow     = "no_show"
)

// Access zone types
const (
	AccessZoneLobby     = "lobby"
	AccessZoneOffice    = "office"
	AccessZoneMeeting   = "meeting"
	AccessZoneFactory   = "factory"
	AccessZoneWarehouse = "warehouse"
	AccessZoneParking   = "parking"
	AccessZoneRestricted = "restricted"
)

// Default settings
var DefaultVisitorSettings = VisitorSettings{
	RequirePreRegistration: false,
	RequireHostApproval:   true,
	RequirePhoto:          false,
	RequireIDVerification: false,
	MaxVisitDuration:      8,  // 8 hours
	DefaultValidDuration:  24, // 24 hours
	AutoExpireVisitors:    true,
	CheckOutRequired:      false,
	NotifyHostOnArrival:   true,
	NotifyHostOnOverstay:  true,
	AllowWalkIns:          true,
	WelcomeMessage:        stringPtr("Welcome! Please check in at reception."),
}

func stringPtr(s string) *string {
	return &s
}