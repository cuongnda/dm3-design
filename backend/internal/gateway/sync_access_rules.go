package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// AccessRulesSyncer assembles and pushes cfg.access_rules messages to devices.
type AccessRulesSyncer struct {
	db   *db.DB
	mqtt *mqtt.Client
}

func NewAccessRulesSyncer(database *db.DB, mqttClient *mqtt.Client) *AccessRulesSyncer {
	return &AccessRulesSyncer{db: database, mqtt: mqttClient}
}

// accessTimeSlot is a single time slot in a schedule (day + window).
type accessTimeSlot struct {
	Day   int    `json:"day"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// passageTimePayload represents the AP-level passage time (door open, no credential check).
type passageTimePayload struct {
	Timezone string           `json:"timezone"`
	Slots    []accessTimeSlot `json:"slots"`
}

// userSchedule is one schedule source for a user (one access group).
type userSchedule struct {
	Source   string           `json:"source"`
	Timezone string           `json:"timezone"`
	Slots    []accessTimeSlot `json:"slots"`
}

// accessRuleUser is a per-user entry in the access_rules payload.
type accessRuleUser struct {
	UserID     string         `json:"user_id"`
	Credential string         `json:"credential"`
	Schedules  []userSchedule `json:"schedules"`
}

// accessRulesPayload matches MQTT spec cfg.access_rules.
type accessRulesPayload struct {
	Type        string             `json:"type"`
	Version     int                `json:"version"`
	PassageTime passageTimePayload `json:"passage_time"`
	AccessRules []accessRuleUser   `json:"access_rules"`
}

// PushAccessRules derives access rules from the access_groups → access_points
// chain and sends cfg.access_rules to the specified device.
func (s *AccessRulesSyncer) PushAccessRules(ctx context.Context, tenantID, deviceID string) error {
	// Resolve the access point linked to this device via access_point_devices junction.
	var accessPointID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT apd.access_point_id::text
		FROM dm3_access.access_point_devices apd
		WHERE apd.access_device_id = $1
		  AND apd.tenant_id = $2::uuid
		LIMIT 1
	`, deviceID, tenantID).Scan(&accessPointID)
	if err != nil {
		return fmt.Errorf("access_rules: no access point for device %s: %w", deviceID, err)
	}

	// Build passage_time from access_points.access_time_id (AP-level schedule).
	passageTime, err := s.fetchPassageTime(ctx, tenantID, accessPointID)
	if err != nil {
		return fmt.Errorf("access_rules: fetch passage time: %w", err)
	}

	// Build per-user access rules for all users who have access to this AP.
	accessRules, err := s.fetchUserAccessRules(ctx, tenantID, accessPointID)
	if err != nil {
		return fmt.Errorf("access_rules: fetch user rules: %w", err)
	}

	payload := accessRulesPayload{
		Type:        "cfg.access_rules",
		Version:     int(time.Now().Unix()),
		PassageTime: passageTime,
		AccessRules: accessRules,
	}

	if err := s.publishAccessRules(ctx, tenantID, deviceID, payload); err != nil {
		return err
	}

	slog.Info("access_rules: pushed",
		"device", deviceID,
		"tenant", tenantID,
		"users", len(accessRules),
	)
	return nil
}

// fetchPassageTime returns the passage time schedule for an access point.
// passage_time_id = NULL means 24/7 (empty slots array).
func (s *AccessRulesSyncer) fetchPassageTime(ctx context.Context, tenantID, accessPointID string) (passageTimePayload, error) {
	// Check if the AP has an access_time_id configured.
	var accessTimeID *string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT access_time_id::text
		FROM dm3_access.access_points
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, accessPointID, tenantID).Scan(&accessTimeID)
	if err != nil {
		return passageTimePayload{}, fmt.Errorf("query access point: %w", err)
	}

	// NULL access_time_id = 24/7 unrestricted passage.
	if accessTimeID == nil {
		return passageTimePayload{Slots: []accessTimeSlot{}}, nil
	}

	// Fetch timezone and slots for this access time.
	rows, err := s.db.Pool.Query(ctx, `
		SELECT at.timezone, ats.day_of_week,
		       to_char(ats.start_time, 'HH24:MI'),
		       to_char(ats.end_time, 'HH24:MI')
		FROM dm3_access.access_times at
		JOIN dm3_access.access_time_slots ats ON ats.access_time_id = at.id
		WHERE at.id = $1::uuid
		  AND at.is_active = true
		  AND ats.is_active = true
		ORDER BY ats.day_of_week, ats.start_time
	`, *accessTimeID)
	if err != nil {
		return passageTimePayload{}, fmt.Errorf("query passage time slots: %w", err)
	}
	defer rows.Close()

	var timezone string
	slots := []accessTimeSlot{}
	for rows.Next() {
		var day int
		var tz, start, end string
		if err := rows.Scan(&tz, &day, &start, &end); err != nil {
			slog.Warn("access_rules: scan passage slot", "error", err)
			continue
		}
		timezone = tz
		slots = append(slots, accessTimeSlot{Day: day, Start: start, End: end})
	}
	if err := rows.Err(); err != nil {
		return passageTimePayload{}, fmt.Errorf("iterate passage slots: %w", err)
	}

	return passageTimePayload{Timezone: timezone, Slots: slots}, nil
}

// fetchUserAccessRules returns one entry per user that has active membership in
// any access group containing this access point. Schedules are per-AG (union/OR).
func (s *AccessRulesSyncer) fetchUserAccessRules(ctx context.Context, tenantID, accessPointID string) ([]accessRuleUser, error) {
	// Single query: join access_group_users → access_group_access_points → access_groups
	// → optionally access_times + access_time_slots, filtered to active memberships.
	// We get one row per (user, access_group, slot) — grouped in Go.
	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			agu.user_id::text,
			COALESCE(c.value, '')          AS credential,
			ag.id::text                    AS ag_id,
			ag.name                        AS ag_name,
			COALESCE(at.timezone, '')      AS timezone,
			ats.day_of_week,
			to_char(ats.start_time, 'HH24:MI') AS start_time,
			to_char(ats.end_time, 'HH24:MI')   AS end_time
		FROM dm3_access.access_group_access_points agap
		JOIN dm3_access.access_groups ag
			ON ag.id = agap.access_group_id AND ag.tenant_id = $2::uuid
		JOIN dm3_access.access_group_users agu
			ON agu.access_group_id = ag.id AND agu.tenant_id = $2::uuid
		JOIN dm3_identity.users u
			ON u.id = agu.user_id AND u.status = 'active'
			AND (u.is_deleted = false OR u.is_deleted IS NULL)
		LEFT JOIN dm3_identity.credentials c
			ON c.user_id = u.id AND c.status = 'active'
			AND (c.valid_until IS NULL OR c.valid_until > now())
		LEFT JOIN dm3_access.access_times at
			ON at.id = ag.access_time_id AND at.is_active = true
		LEFT JOIN dm3_access.access_time_slots ats
			ON ats.access_time_id = at.id AND ats.is_active = true
		WHERE agap.access_point_id = $1::uuid
		  AND agap.tenant_id = $2::uuid
		  AND agu.effective_from <= now()
		  AND (agu.effective_to IS NULL OR agu.effective_to > now())
		ORDER BY agu.user_id, ag.id, ats.day_of_week, ats.start_time
	`, accessPointID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query user access rules: %w", err)
	}
	defer rows.Close()

	type agKey struct {
		userID string
		agID   string
	}

	// Accumulate: user → credential (first non-empty wins), user+ag → schedule.
	type agEntry struct {
		name     string
		timezone string
		slots    []accessTimeSlot
	}

	userOrder := []string{}                // preserve insertion order
	userCreds := map[string]string{}       // user_id → credential value
	userAGOrder := map[string][]string{}   // user_id → ordered ag_ids
	agEntries := map[agKey]*agEntry{}      // (user_id, ag_id) → schedule data
	seenUsers := map[string]bool{}
	seenAGs := map[agKey]bool{}

	for rows.Next() {
		var userID, credential, agID, agName, timezone string
		var dayOfWeek *int
		var startTime, endTime *string

		if err := rows.Scan(
			&userID, &credential, &agID, &agName,
			&timezone, &dayOfWeek, &startTime, &endTime,
		); err != nil {
			slog.Warn("access_rules: scan user rule row", "error", err)
			continue
		}

		// Track user order.
		if !seenUsers[userID] {
			seenUsers[userID] = true
			userOrder = append(userOrder, userID)
			userCreds[userID] = credential
		} else if userCreds[userID] == "" && credential != "" {
			userCreds[userID] = credential
		}

		key := agKey{userID: userID, agID: agID}
		if !seenAGs[key] {
			seenAGs[key] = true
			userAGOrder[userID] = append(userAGOrder[userID], agID)
			agEntries[key] = &agEntry{
				name:     agName,
				timezone: timezone,
				slots:    []accessTimeSlot{},
			}
		}

		// Append slot if present (NULL when AG has no access_time_id = 24/7).
		if dayOfWeek != nil && startTime != nil && endTime != nil {
			agEntries[key].slots = append(agEntries[key].slots, accessTimeSlot{
				Day:   *dayOfWeek,
				Start: *startTime,
				End:   *endTime,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user rule rows: %w", err)
	}

	// Build result slice in stable order.
	result := make([]accessRuleUser, 0, len(userOrder))
	for _, userID := range userOrder {
		schedules := make([]userSchedule, 0, len(userAGOrder[userID]))
		for _, agID := range userAGOrder[userID] {
			key := agKey{userID: userID, agID: agID}
			entry := agEntries[key]
			schedules = append(schedules, userSchedule{
				Source:   entry.name,
				Timezone: entry.timezone,
				Slots:    entry.slots,
			})
		}
		result = append(result, accessRuleUser{
			UserID:     userID,
			Credential: userCreds[userID],
			Schedules:  schedules,
		})
	}

	return result, nil
}

func (s *AccessRulesSyncer) publishAccessRules(ctx context.Context, tenantID, deviceID string, payload accessRulesPayload) error {
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.access_rules",
		Data:    dataBytes,
	}

	envBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	return s.mqtt.Publish(ctx, topic, 2, envBytes)
}
