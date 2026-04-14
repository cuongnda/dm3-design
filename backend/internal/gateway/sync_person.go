package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

const personSyncBatchSize = 1000

// PersonSyncer assembles and pushes cfg.person_sync messages to devices.
type PersonSyncer struct {
	db   *db.DB
	mqtt *mqtt.Client
}

func NewPersonSyncer(database *db.DB, mqttClient *mqtt.Client) *PersonSyncer {
	return &PersonSyncer{db: database, mqtt: mqttClient}
}

// syncPersonUser is a user in the person_sync payload (matches MQTT spec §7.3).
type syncPersonUser struct {
	UserID      string               `json:"user_id"`
	Name        string               `json:"name"`
	Credentials []syncPersonCred     `json:"credentials"`
	AccessZones []string             `json:"access_zones"`
	ScheduleID  *string              `json:"schedule_id,omitempty"`
	ValidFrom   *int64               `json:"valid_from,omitempty"`
	ValidUntil  *int64               `json:"valid_until,omitempty"`
	Active      bool                 `json:"active"`
}

type syncPersonCred struct {
	Type       string `json:"type"`                   // card, face, fingerprint, qr, pin
	UID        string `json:"uid,omitempty"`          // for card type
	Template   string `json:"template,omitempty"`     // for face/fingerprint (base64)
	Code       string `json:"code,omitempty"`         // for qr/pin
	Version    string `json:"version,omitempty"`      // e.g. "arcface_v3"
	Finger     string `json:"finger,omitempty"`       // e.g. "right_index" for fingerprint
	ValidFrom  *int64 `json:"valid_from,omitempty"`   // epoch ms — credential-level start (overrides user-level when set)
	ValidUntil *int64 `json:"valid_until,omitempty"`  // epoch ms — credential-level expiry (overrides user-level when set)
}

// buildSyncCred maps a credential type+value+validity from DB to the spec-compliant struct.
func buildSyncCred(credType, credValue string, validFrom, validUntil *time.Time) syncPersonCred {
	c := syncPersonCred{Type: credType}
	switch credType {
	case "card":
		c.UID = credValue
	case "face":
		c.Template = credValue
		c.Version = "arcface_v3"
	case "fingerprint":
		c.Template = credValue
	case "qr":
		c.Code = credValue
	case "pin":
		c.Code = credValue
	default:
		c.UID = credValue // fallback
	}
	if validFrom != nil {
		ms := validFrom.UnixMilli()
		c.ValidFrom = &ms
	}
	if validUntil != nil {
		ms := validUntil.UnixMilli()
		c.ValidUntil = &ms
	}
	return c
}

type personSyncPayload struct {
	Action     string           `json:"action"`
	Users      []syncPersonUser `json:"users"`
	SyncToken  string           `json:"sync_token"`
	TotalCount int              `json:"total_count"`
	Batch      int              `json:"batch"`
	BatchTotal int              `json:"batch_total"`
}

// PushPersonSync fetches all active users + credentials for a tenant and sends
// batched cfg.person_sync messages to the specified device.
func (s *PersonSyncer) PushPersonSync(ctx context.Context, tenantID, deviceID string) error {
	// 1. Fetch all active users for the tenant
	userRows, err := s.db.Pool.Query(ctx, `
		SELECT u.id, CONCAT(u.first_name, ' ', u.last_name),
		       u.effective_date, u.expired_date
		FROM dm3_identity.users u
		WHERE u.tenant_id = $1::uuid
		  AND u.status = 'active'
		  AND (u.is_deleted = false OR u.is_deleted IS NULL)
		ORDER BY u.id
	`, tenantID)
	if err != nil {
		return fmt.Errorf("person_sync: query users: %w", err)
	}
	defer userRows.Close()

	type userRow struct {
		ID         string
		Name       string
		ValidFrom  *time.Time
		ValidUntil *time.Time
	}
	var users []userRow
	for userRows.Next() {
		var u userRow
		if err := userRows.Scan(&u.ID, &u.Name, &u.ValidFrom, &u.ValidUntil); err != nil {
			slog.Warn("person_sync: scan user", "error", err)
			continue
		}
		users = append(users, u)
	}
	if err := userRows.Err(); err != nil {
		return fmt.Errorf("person_sync: iterate users: %w", err)
	}

	if len(users) == 0 {
		slog.Info("person_sync: no active users", "tenant", tenantID)
		return s.publishPersonSync(ctx, tenantID, deviceID, personSyncPayload{
			Action:     "full_sync",
			Users:      []syncPersonUser{},
			TotalCount: 0,
			Batch:      1,
			BatchTotal: 1,
		})
	}

	// 2. Fetch all active credentials for the tenant (indexed by user_id).
	// We pull valid_from / valid_until so the device can enforce credential-
	// level expiry locally without waiting for the next sync to drop the row.
	//
	// We deliberately do NOT filter on `valid_until > now()`. If we did, an
	// edit to an already-expired credential (e.g. extending the expiry into
	// the future) would never reach the device, because the row would still
	// look expired during the post-edit sync. The device receives the dates
	// and enforces expiry locally — that's the contract documented in
	// mqtt-protocol.md §7.4.
	credRows, err := s.db.Pool.Query(ctx, `
		SELECT c.user_id, c.type, c.value, c.valid_from, c.valid_until
		FROM dm3_identity.credentials c
		JOIN dm3_identity.users u ON u.id = c.user_id
		WHERE u.tenant_id = $1::uuid
		  AND c.status = 'active'
		ORDER BY c.user_id
	`, tenantID)
	if err != nil {
		return fmt.Errorf("person_sync: query credentials: %w", err)
	}
	defer credRows.Close()

	credsByUser := map[string][]syncPersonCred{}
	for credRows.Next() {
		var userID, cType, cValue string
		var validFrom, validUntil *time.Time
		if err := credRows.Scan(&userID, &cType, &cValue, &validFrom, &validUntil); err != nil {
			continue
		}
		cred := buildSyncCred(cType, cValue, validFrom, validUntil)
		credsByUser[userID] = append(credsByUser[userID], cred)
	}
	if err := credRows.Err(); err != nil {
		return fmt.Errorf("person_sync: iterate credentials: %w", err)
	}

	// 2b. Fetch user → access_group mappings from junction table
	aguRows, err := s.db.Pool.Query(ctx, `
		SELECT agu.user_id::text, agu.access_group_id::text
		FROM dm3_access.access_group_users agu
		WHERE agu.tenant_id = $1::uuid
		  AND (agu.effective_to IS NULL OR agu.effective_to > now())
	`, tenantID)
	if err != nil {
		return fmt.Errorf("person_sync: query user groups: %w", err)
	}
	defer aguRows.Close()

	groupsByUser := map[string][]string{} // user_id → []access_group_id
	for aguRows.Next() {
		var userID, groupID string
		if err := aguRows.Scan(&userID, &groupID); err != nil {
			continue
		}
		groupsByUser[userID] = append(groupsByUser[userID], groupID)
	}
	if err := aguRows.Err(); err != nil {
		return fmt.Errorf("person_sync: iterate user groups: %w", err)
	}

	// 3. Fetch access zones per access_group (access_group → access_point → zone)
	zoneRows, err := s.db.Pool.Query(ctx, `
		SELECT agap.access_group_id, z.id::text
		FROM dm3_access.access_group_access_points agap
		JOIN dm3_access.access_points ap ON ap.id = agap.access_point_id
		JOIN dm3_access.zones z ON z.id = ap.zone_id
		WHERE agap.tenant_id = $1::uuid AND ap.zone_id IS NOT NULL
	`, tenantID)
	if err != nil {
		return fmt.Errorf("person_sync: query access zones: %w", err)
	}
	defer zoneRows.Close()

	zonesByGroup := map[string][]string{}
	for zoneRows.Next() {
		var groupID, zoneID string
		if err := zoneRows.Scan(&groupID, &zoneID); err != nil {
			continue
		}
		if !slices.Contains(zonesByGroup[groupID], zoneID) {
			zonesByGroup[groupID] = append(zonesByGroup[groupID], zoneID)
		}
	}
	if err := zoneRows.Err(); err != nil {
		return fmt.Errorf("person_sync: iterate zones: %w", err)
	}

	// 4. Fetch schedule_id per access_group (from group-level access_time_id)
	schedRows, err := s.db.Pool.Query(ctx, `
		SELECT ag.id::text, ag.access_time_id::text
		FROM dm3_access.access_groups ag
		WHERE ag.tenant_id = $1::uuid
		  AND ag.access_time_id IS NOT NULL
		  AND (ag.is_deleted = false OR ag.is_deleted IS NULL)
	`, tenantID)
	if err != nil {
		return fmt.Errorf("person_sync: query schedules: %w", err)
	}
	defer schedRows.Close()

	schedByGroup := map[string]string{}
	for schedRows.Next() {
		var groupID, schedID string
		if err := schedRows.Scan(&groupID, &schedID); err != nil {
			continue
		}
		schedByGroup[groupID] = schedID // last one wins if multiple
	}

	// 5. Build sync users
	syncUsers := make([]syncPersonUser, 0, len(users))
	for _, u := range users {
		su := syncPersonUser{
			UserID:      u.ID,
			Name:        u.Name,
			Credentials: credsByUser[u.ID],
			Active:      true,
		}
		if su.Credentials == nil {
			su.Credentials = []syncPersonCred{}
		}
		if u.ValidFrom != nil {
			ms := u.ValidFrom.UnixMilli()
			su.ValidFrom = &ms
		}
		if u.ValidUntil != nil {
			ms := u.ValidUntil.UnixMilli()
			su.ValidUntil = &ms
		}
		// Aggregate zones and schedule from all access groups the user belongs to
		for _, gid := range groupsByUser[u.ID] {
			for _, z := range zonesByGroup[gid] {
				if !slices.Contains(su.AccessZones, z) {
					su.AccessZones = append(su.AccessZones, z)
				}
			}
			if su.ScheduleID == nil {
				if sched, ok := schedByGroup[gid]; ok {
					su.ScheduleID = &sched
				}
			}
		}
		if su.AccessZones == nil {
			su.AccessZones = []string{}
		}
		syncUsers = append(syncUsers, su)
	}

	// 6. Send in batches
	totalCount := len(syncUsers)
	batchTotal := (totalCount + personSyncBatchSize - 1) / personSyncBatchSize

	for i := range batchTotal {
		start := i * personSyncBatchSize
		end := min(start+personSyncBatchSize, totalCount)

		payload := personSyncPayload{
			Action:     "full_sync",
			Users:      syncUsers[start:end],
			TotalCount: totalCount,
			Batch:      i + 1,
			BatchTotal: batchTotal,
		}

		if err := s.publishPersonSync(ctx, tenantID, deviceID, payload); err != nil {
			return fmt.Errorf("person_sync: batch %d/%d: %w", i+1, batchTotal, err)
		}
	}

	slog.Info("person_sync: pushed",
		"device", deviceID,
		"tenant", tenantID,
		"users", totalCount,
		"batches", batchTotal,
	)
	return nil
}

func (s *PersonSyncer) publishPersonSync(ctx context.Context, tenantID, deviceID string, payload personSyncPayload) error {
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.person_sync",
		Data:    dataBytes,
	}

	envBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	return s.mqtt.Publish(ctx, topic, 2, envBytes)
}
