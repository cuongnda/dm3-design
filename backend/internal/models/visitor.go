package models

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
	SiteID            *string    `json:"site_id,omitempty"`
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
	SiteID          *string    `json:"site_id,omitempty"`
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
