package models

import (
	"encoding/json"
	"time"
)

const (
	ParkingVehicleCategoryResident  = "resident"
	ParkingVehicleCategoryVisitor   = "visitor"
	ParkingVehicleCategoryTemporary = "temporary"
)

const (
	ParkingVehicleTypeCar       = "car"
	ParkingVehicleTypeMotorbike = "motorbike"
	ParkingVehicleTypeBicycle   = "bicycle"
	ParkingVehicleTypeTruck     = "truck"
)

const (
	ParkingSessionStatusActive    = "active"
	ParkingSessionStatusCompleted = "completed"
	ParkingSessionStatusDisputed  = "disputed"
	ParkingSessionStatusVoided    = "void"
)

const (
	ParkingPaymentStatusPending  = "pending"
	ParkingPaymentStatusPaid     = "paid"
	ParkingPaymentStatusWaived   = "waived"
	ParkingPaymentStatusRefunded = "refunded"
)

// ParkingLot is the top-level physical grouping for parking zones.
type ParkingLot struct {
	ID                 string          `json:"id"`
	TenantID           string          `json:"tenant_id"`
	SiteID             *string         `json:"site_id,omitempty"`
	Name               string          `json:"name"`
	Code               string          `json:"code"`
	Description        *string         `json:"description,omitempty"`
	Status             string          `json:"status"`
	Metadata           json.RawMessage `json:"metadata,omitempty"`
	ZoneCount          int             `json:"zone_count,omitempty"`
	ActiveSessionCount int             `json:"active_session_count,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// ParkingZone groups capacity and device integration config.
type ParkingZone struct {
	ID                  string          `json:"id"`
	TenantID            string          `json:"tenant_id"`
	LotID               string          `json:"lot_id"`
	SiteID              *string         `json:"site_id,omitempty"`
	Name                string          `json:"name"`
	Code                string          `json:"code"`
	Type                string          `json:"type"`
	Level               *string         `json:"level,omitempty"`
	TotalSpaces         int             `json:"total_spaces"`
	AllowedVehicleTypes []string        `json:"vehicle_types,omitempty"`
	EntryDevices        json.RawMessage `json:"entry_devices,omitempty"`
	ExitDevices         json.RawMessage `json:"exit_devices,omitempty"`
	Status              string          `json:"status"`
	Metadata            json.RawMessage `json:"metadata,omitempty"`
	ActiveSessionCount  int             `json:"active_session_count,omitempty"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// ParkingVehicle is a registered or observed vehicle.
type ParkingVehicle struct {
	ID                 string          `json:"id"`
	TenantID           string          `json:"tenant_id"`
	OwnerUserID        *string         `json:"owner_id,omitempty"`
	PlateNumber        string          `json:"plate_number"`
	NormalizedPlate    string          `json:"normalized_plate_number"`
	PlateImageRef      *string         `json:"plate_image_ref,omitempty"`
	Type               string          `json:"type"`
	Category           string          `json:"category"`
	Brand              *string         `json:"brand,omitempty"`
	Color              *string         `json:"color,omitempty"`
	RegistrationStatus string          `json:"registration_status"`
	MonthlyPassID      *string         `json:"monthly_pass_id,omitempty"`
	Metadata           json.RawMessage `json:"metadata,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// ParkingFeeRule stores the minimal phase-1 tariff definition.
type ParkingFeeRule struct {
	ID          string          `json:"id"`
	TenantID    string          `json:"tenant_id"`
	SiteID      *string         `json:"site_id,omitempty"`
	LotID       *string         `json:"lot_id,omitempty"`
	ZoneID      *string         `json:"zone_id,omitempty"`
	Name        string          `json:"name"`
	VehicleType string          `json:"vehicle_type"`
	RateType    string          `json:"rate_type"`
	Rates       json.RawMessage `json:"rates"`
	FreeMinutes int             `json:"free_minutes"`
	MaxDaily    *float64        `json:"max_daily,omitempty"`
	AppliesTo   string          `json:"applies_to"`
	Priority    int             `json:"priority"`
	Enabled     bool            `json:"enabled"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ParkingSession captures one entry/exit lifecycle.
type ParkingSession struct {
	ID               string          `json:"id"`
	TenantID         string          `json:"tenant_id"`
	LotID            string          `json:"lot_id"`
	ZoneID           string          `json:"zone_id"`
	VehicleID        *string         `json:"vehicle_id,omitempty"`
	PlateNumber      string          `json:"plate_number"`
	NormalizedPlate  string          `json:"normalized_plate_number"`
	VehicleType      string          `json:"vehicle_type"`
	VehicleCategory  *string         `json:"vehicle_category,omitempty"`
	EntryTime        time.Time       `json:"entry_time"`
	ExitTime         *time.Time      `json:"exit_time,omitempty"`
	EntryDeviceID    *string         `json:"entry_device_id,omitempty"`
	ExitDeviceID     *string         `json:"exit_device_id,omitempty"`
	EntryPlateImage  *string         `json:"entry_plate_image,omitempty"`
	ExitPlateImage   *string         `json:"exit_plate_image,omitempty"`
	Status           string          `json:"status"`
	FeeAmount        *float64        `json:"fee_amount,omitempty"`
	FeeCurrency      string          `json:"fee_currency"`
	FeeRuleID        *string         `json:"fee_rule_id,omitempty"`
	PaymentStatus    *string         `json:"payment_status,omitempty"`
	PaymentMethod    *string         `json:"payment_method,omitempty"`
	PaymentRef       *string         `json:"payment_ref,omitempty"`
	MonthlyPassID    *string         `json:"monthly_pass_id,omitempty"`
	DurationMinutes  *int64          `json:"duration_minutes,omitempty"`
	IntegrationState json.RawMessage `json:"integration_state,omitempty"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}
