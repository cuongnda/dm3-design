package models

import "time"

type Person struct {
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
	PersonID   string     `json:"person_id"`
	Type       string     `json:"type"`       // face, card, pin, qr, fingerprint
	Value      string     `json:"value"`       // NOTE: would be encrypted in production
	Status     string     `json:"status"`
	ValidFrom  *time.Time `json:"valid_from,omitempty"`
	ValidUntil *time.Time `json:"valid_until,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type PersonGroup struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	MemberCount int       `json:"member_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PersonGroupMember struct {
	GroupID  string    `json:"group_id"`
	PersonID string    `json:"person_id"`
	AddedAt  time.Time `json:"added_at"`
}

// SyncResponse is returned by the sync endpoint for offline-first device sync.
type SyncResponse struct {
	Persons     []Person     `json:"persons"`
	Credentials []Credential `json:"credentials"`
	Since       string       `json:"since"`
	Timestamp   string       `json:"timestamp"`
}

// IdentityStats holds aggregate identity statistics.
type IdentityStats struct {
	TotalPersons     int64            `json:"total_persons"`
	PersonsByStatus  map[string]int64 `json:"persons_by_status"`
	PersonsByDept    map[string]int64 `json:"persons_by_department"`
	CredentialCounts map[string]int64 `json:"credential_counts"`
	TotalGroups      int64            `json:"total_groups"`
}
