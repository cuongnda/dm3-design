package models

import "time"

type User struct {
	ID         string    `json:"id"`
	TenantID   string    `json:"tenant_id"`
	FirstName  string    `json:"first_name"`
	LastName   string    `json:"last_name"`
	Email      string    `json:"email,omitempty"`
	Phone      string    `json:"phone,omitempty"`
	Department string    `json:"department,omitempty"`
	Role       string    `json:"role,omitempty"`
	EmployeeID string    `json:"employee_id,omitempty"`
	Status     string    `json:"status"`
	PhotoURL   string    `json:"photo_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Credential struct {
	ID         string     `json:"id"`
	TenantID   string     `json:"tenant_id"`
	UserID     string     `json:"user_id"`
	Type       string     `json:"type"`
	Value      string     `json:"value"`
	Status     string     `json:"status"`
	ValidFrom  *time.Time `json:"valid_from,omitempty"`
	ValidUntil *time.Time `json:"valid_until,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type UserGroup struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	MemberCount int       `json:"member_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UserGroupMember struct {
	GroupID string    `json:"group_id"`
	UserID  string    `json:"user_id"`
	AddedAt time.Time `json:"added_at"`
}

// Vehicle represents a registered vehicle linked to a user.
type Vehicle struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	UserID      *string   `json:"user_id,omitempty"`
	PlateNumber string    `json:"plate_number"`
	VehicleType string    `json:"vehicle_type"`
	Brand       string    `json:"brand,omitempty"`
	Model       string    `json:"model,omitempty"`
	Color       string    `json:"color,omitempty"`
	Description string    `json:"description,omitempty"`
	Status      string    `json:"status"`
	OwnerName   string    `json:"owner_name,omitempty"` // joined from users
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SyncResponse is returned by the sync endpoint for offline-first device sync.
type SyncResponse struct {
	Users       []User       `json:"users"`
	Credentials []Credential `json:"credentials"`
	Since       string       `json:"since"`
	Timestamp   string       `json:"timestamp"`
}

// IdentityStats holds aggregate identity statistics.
type IdentityStats struct {
	TotalUsers       int64            `json:"total_users"`
	UsersByStatus    map[string]int64 `json:"users_by_status"`
	UsersByDept      map[string]int64 `json:"users_by_department"`
	CredentialCounts map[string]int64 `json:"credential_counts"`
	TotalGroups      int64            `json:"total_groups"`
}
