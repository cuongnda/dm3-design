package visitor

import "time"

// ─── Visitor (persistent directory entry) ────────────────────────────────────

type Visitor struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	FirstName       string     `json:"first_name"`
	LastName        string     `json:"last_name"`
	DisplayName     string     `json:"display_name,omitempty"`
	Email           *string    `json:"email,omitempty"`
	Phone           *string    `json:"phone,omitempty"`
	Company         *string    `json:"company,omitempty"`
	NationalID      *string    `json:"national_id,omitempty"`
	PhotoRef        *string    `json:"photo_ref,omitempty"`
	WatchlistStatus string     `json:"watchlist_status"`
	WatchlistReason *string    `json:"watchlist_reason,omitempty"`
	VisitCount      int        `json:"visit_count"`
	LastVisitAt     *time.Time `json:"last_visit_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// ─── Visit (one row per visit lifecycle) ─────────────────────────────────────

type Visit struct {
	ID                string     `json:"id"`
	TenantID          string     `json:"tenant_id"`
	VisitorID         string     `json:"visitor_id"`
	HostUserID        string     `json:"host_user_id"`
	Purpose           string     `json:"purpose"`
	PurposeNote       *string    `json:"purpose_note,omitempty"`
	Status            string     `json:"status"`
	ExpectedArrival   time.Time  `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure,omitempty"`
	ActualCheckin     *time.Time `json:"actual_checkin,omitempty"`
	ActualCheckout    *time.Time `json:"actual_checkout,omitempty"`
	CheckinMethod     *string    `json:"checkin_method,omitempty"`
	CheckinDeviceID   *string    `json:"checkin_device_id,omitempty"`
	CheckinPhotoRef   *string    `json:"checkin_photo_ref,omitempty"`
	CheckoutBy        *string    `json:"checkout_by,omitempty"`
	QRToken           string     `json:"qr_token"`
	QRExpiresAt       time.Time  `json:"qr_expires_at"`
	BadgeNumber       *string    `json:"badge_number,omitempty"`
	TempCredentialID  *string    `json:"temp_credential_id,omitempty"`
	AccessAreas       []string   `json:"access_areas,omitempty"`
	EscortRequired    bool       `json:"escort_required"`
	VehiclePlate      *string    `json:"vehicle_plate,omitempty"`
	ItemsCarried      *string    `json:"items_carried,omitempty"`
	NDASigned         bool       `json:"nda_signed"`
	HostApproved      bool       `json:"host_approved"`
	HostApprovedAt    *time.Time `json:"host_approved_at,omitempty"`
	Notes             *string    `json:"notes,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`

	// Joined data (not stored, populated by queries)
	Visitor *Visitor   `json:"visitor,omitempty"`
	Host    *VisitHost `json:"host,omitempty"`
}

// VisitHost is a lightweight host summary embedded in visit responses.
type VisitHost struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Department string `json:"department,omitempty"`
}

// ─── Visitor Badge ───────────────────────────────────────────────────────────

type VisitorBadge struct {
	ID          string     `json:"id"`
	TenantID    string     `json:"tenant_id"`
	VisitID     string     `json:"visit_id"`
	BadgeNumber string     `json:"badge_number"`
	BadgeType   string     `json:"badge_type"`
	IssuedAt    time.Time  `json:"issued_at"`
	ReturnedAt  *time.Time `json:"returned_at,omitempty"`
	Printed     bool       `json:"printed"`
}

// ─── Watchlist Entry ─────────────────────────────────────────────────────────

type WatchlistEntry struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	EntryType       string     `json:"entry_type"`
	MatchField      string     `json:"match_field"`
	MatchValue      string     `json:"match_value"`
	FaceTemplateRef *string    `json:"face_template_ref,omitempty"`
	Reason          string     `json:"reason"`
	AddedBy         string     `json:"added_by"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// ─── Visit Summary (dashboard) ───────────────────────────────────────────────

type VisitSummary struct {
	Waiting       int `json:"waiting"`
	CheckedIn     int `json:"checked_in"`
	CheckedOut    int `json:"checked_out"`
	NoShow        int `json:"no_show"`
	TotalExpected int `json:"total_expected"`
}

// ─── Visitor Settings (per-tenant configuration) ────────────────────────────

type VisitorSettings struct {
	ID                    string    `json:"id"`
	TenantID              string    `json:"tenant_id"`
	ApprovalRequired      bool      `json:"approval_required"`
	AutoApproveReturning  bool      `json:"auto_approve_returning"`
	AutoApproveVIP        bool      `json:"auto_approve_vip"`
	ApproverUserIDs       []string  `json:"approver_user_ids"`
	ApprovalTimeoutHours  int       `json:"approval_timeout_hours"`
	DefaultDurationHours  int       `json:"default_duration_hours"`
	MaxDurationHours      int       `json:"max_duration_hours"`
	AutoCheckoutHour      int       `json:"auto_checkout_hour"`
	NoShowGraceMinutes    int       `json:"no_show_grace_minutes"`
	QRValidityBeforeHours int       `json:"qr_validity_before_hours"`
	QRValidityAfterHours  int       `json:"qr_validity_after_hours"`
	RequireEmail          bool      `json:"require_email"`
	RequirePhone          bool      `json:"require_phone"`
	RequireNationalID     bool      `json:"require_national_id"`
	RequireCompany        bool      `json:"require_company"`
	RequirePhoto          bool      `json:"require_photo"`
	RequireNDA            bool      `json:"require_nda"`
	BadgeEnabled          bool      `json:"badge_enabled"`
	BadgeAutoAssign       bool      `json:"badge_auto_assign"`
	BadgePrefix           string    `json:"badge_prefix"`
	BadgePoolSize         int       `json:"badge_pool_size"`
	NotifyHostOnArrival   bool      `json:"notify_host_on_arrival"`
	NotifyHostOnRegister  bool      `json:"notify_host_on_register"`
	NotifyMethod          string    `json:"notify_method"`
	AllowedPurposes       []string  `json:"allowed_purposes,omitempty"`
	SelfServiceEnabled    bool      `json:"self_service_enabled"`
	SelfServiceRequiresQR bool      `json:"self_service_requires_qr"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// ─── Visit Group (batch / conference visits) ─────────────────────────────────

type VisitGroup struct {
	ID                string     `json:"id"`
	TenantID          string     `json:"tenant_id"`
	Name              string     `json:"name"`
	Description       *string    `json:"description,omitempty"`
	HostUserID        string     `json:"host_user_id"`
	Purpose           string     `json:"purpose"`
	ExpectedArrival   time.Time  `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure,omitempty"`
	AccessAreas       []string   `json:"access_areas,omitempty"`
	EscortRequired    bool       `json:"escort_required"`
	CreatedBy         string     `json:"created_by"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	MemberCount       int        `json:"member_count,omitempty"`
}

// ─── Visitor Access Log Entry ────────────────────────────────────────────────

type VisitorAccessLogEntry struct {
	ID              string    `json:"id"`
	TenantID        string    `json:"tenant_id"`
	VisitID         string    `json:"visit_id"`
	VisitorID       string    `json:"visitor_id"`
	AccessEventID   *string   `json:"access_event_id,omitempty"`
	AccessPointID   *string   `json:"access_point_id,omitempty"`
	AccessPointName *string   `json:"access_point_name,omitempty"`
	ZoneID          *string   `json:"zone_id,omitempty"`
	ZoneName        *string   `json:"zone_name,omitempty"`
	Direction       *string   `json:"direction,omitempty"`
	Decision        string    `json:"decision"`
	EventTime       time.Time `json:"event_time"`
	CredentialType  *string   `json:"credential_type,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// ─── Recurring Visit Template ────────────────────────────────────────────────

type RecurringVisitTemplate struct {
	ID             string     `json:"id"`
	TenantID       string     `json:"tenant_id"`
	VisitorID      string     `json:"visitor_id"`
	HostUserID     string     `json:"host_user_id"`
	Purpose        string     `json:"purpose"`
	AccessAreas    []string   `json:"access_areas,omitempty"`
	EscortRequired bool       `json:"escort_required"`
	RecurrenceRule string     `json:"recurrence_rule"`
	StartDate      string     `json:"start_date"`
	EndDate        *string    `json:"end_date,omitempty"`
	Active         bool       `json:"active"`
	LastGenerated  *string    `json:"last_generated,omitempty"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	Visitor        *Visitor   `json:"visitor,omitempty"`
}

// ─── Visitor Agreement ───────────────────────────────────────────────────────

type VisitorAgreement struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Content     string    `json:"content"`
	Version     int       `json:"version"`
	Active      bool      `json:"active"`
	RequiredFor []string  `json:"required_for,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type VisitorAgreementSignature struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	VisitID      string    `json:"visit_id"`
	AgreementID  string    `json:"agreement_id"`
	VisitorID    string    `json:"visitor_id"`
	SignatureRef *string   `json:"signature_ref,omitempty"`
	SignedAt     time.Time `json:"signed_at"`
}

// ─── Evacuation Entry ────────────────────────────────────────────────────────

type EvacuationEntry struct {
	VisitID         string     `json:"visit_id"`
	VisitorID       string     `json:"visitor_id"`
	VisitorName     string     `json:"visitor_name"`
	VisitorCompany  *string    `json:"visitor_company,omitempty"`
	VisitorPhone    *string    `json:"visitor_phone,omitempty"`
	VisitorPhotoRef *string    `json:"visitor_photo_ref,omitempty"`
	HostName        string     `json:"host_name"`
	CheckinTime     time.Time  `json:"checkin_time"`
	LastAccessPoint *string    `json:"last_access_point,omitempty"`
	LastZone        *string    `json:"last_zone,omitempty"`
	LastEventTime   *time.Time `json:"last_event_time,omitempty"`
}

// ─── Enums ───────────────────────────────────────────────────────────────────

// Visit purposes
const (
	VisitPurposeMeeting         = "meeting"
	VisitPurposeInterview       = "interview"
	VisitPurposeDelivery        = "delivery"
	VisitPurposeMaintenance     = "maintenance"
	VisitPurposeTour            = "tour"
	VisitPurposeContractSigning = "contract_signing"
	VisitPurposeOther           = "other"
)

// Visit statuses
const (
	VisitStatusPreRegistered = "pre_registered"
	VisitStatusApproved      = "approved"
	VisitStatusWaiting       = "waiting"
	VisitStatusCheckedIn     = "checked_in"
	VisitStatusCheckedOut    = "checked_out"
	VisitStatusCancelled     = "cancelled"
	VisitStatusNoShow        = "no_show"
	VisitStatusRejected      = "rejected"
)

// Check-in methods
const (
	CheckinMethodTerminalQR     = "terminal_qr"
	CheckinMethodTerminalManual = "terminal_manual"
	CheckinMethodReception      = "reception"
	CheckinMethodSelfService    = "self_service"
	CheckinMethodMobileQR       = "mobile_qr"
)

// Badge types
const (
	BadgeTypeStandard   = "standard"
	BadgeTypeVIP        = "vip"
	BadgeTypeContractor = "contractor"
	BadgeTypeTemporary  = "temporary"
)

// Watchlist statuses
const (
	WatchlistNone        = "none"
	WatchlistVIP         = "vip"
	WatchlistBlacklisted = "blacklisted"
)
