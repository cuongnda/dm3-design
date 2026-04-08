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

// syncRule matches MQTT spec §7.5 cfg.access_rules payload.
type syncRule struct {
	RuleID       string       `json:"rule_id"`
	Name         string       `json:"name"`
	DoorIDs      []string     `json:"door_ids"`
	UserGroupIDs []string     `json:"user_group_ids"`
	Schedule     *syncRuleSch `json:"schedule,omitempty"`
	AntiPassback bool         `json:"anti_passback"`
	Priority     int          `json:"priority"`
	Enabled      bool         `json:"enabled"`
}

type syncRuleSch struct {
	Timezone string          `json:"timezone"`
	Periods  []syncRulePeriod `json:"periods"`
}

type syncRulePeriod struct {
	Days  []int  `json:"days"`
	Start string `json:"start"`
	End   string `json:"end"`
}

type accessRulesPayload struct {
	Action       string     `json:"action"`
	RulesVersion int        `json:"rules_version"`
	Rules        []syncRule `json:"rules"`
	SyncToken    string     `json:"sync_token"`
}

// PushAccessRules derives access rules from the access_groups → access_points
// chain and sends cfg.access_rules to the specified device.
func (s *AccessRulesSyncer) PushAccessRules(ctx context.Context, tenantID, deviceID string) error {
	// Find the device's UUID from device_id string
	var deviceUUID string
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id FROM dm3_devices.devices WHERE device_id = $1 AND tenant_id = $2::uuid`,
		deviceID, tenantID,
	).Scan(&deviceUUID)
	if err != nil {
		return fmt.Errorf("access_rules: device not found: %w", err)
	}

	// Find the access point linked to this device
	var accessPointID string
	err = s.db.Pool.QueryRow(ctx,
		`SELECT id::text FROM dm3_access.access_points WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID,
	).Scan(&accessPointID)
	if err != nil {
		return fmt.Errorf("access_rules: no access point for device: %w", err)
	}

	// Query access groups that include this access point
	ruleRows, err := s.db.Pool.Query(ctx, `
		SELECT DISTINCT ag.id, ag.name, ag.type
		FROM dm3_access.access_groups ag
		JOIN dm3_access.access_group_access_points agap ON agap.access_group_id = ag.id
		WHERE agap.access_point_id = $1::uuid
		  AND ag.tenant_id = $2::uuid
	`, accessPointID, tenantID)
	if err != nil {
		return fmt.Errorf("access_rules: query groups: %w", err)
	}
	defer ruleRows.Close()

	type groupRow struct {
		ID   string
		Name string
		Type int
	}
	var groups []groupRow
	for ruleRows.Next() {
		var g groupRow
		if err := ruleRows.Scan(&g.ID, &g.Name, &g.Type); err != nil {
			slog.Warn("access_rules: scan group", "error", err)
			continue
		}
		groups = append(groups, g)
	}
	if err := ruleRows.Err(); err != nil {
		return fmt.Errorf("access_rules: iterate groups: %w", err)
	}

	if len(groups) == 0 {
		return s.publishAccessRules(ctx, tenantID, deviceID, accessRulesPayload{
			Action:       "full_sync",
			RulesVersion: 1,
			Rules:        []syncRule{},
		})
	}

	// Anti-passback from the access point itself
	var apAntiPassback bool
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT anti_passback FROM dm3_access.access_points WHERE id = $1::uuid`,
		accessPointID,
	).Scan(&apAntiPassback)

	// For each access group, find users and schedule
	rules := make([]syncRule, 0, len(groups))

	for _, g := range groups {
		rule := syncRule{
			RuleID:       g.ID,
			Name:         g.Name,
			DoorIDs:      []string{accessPointID}, // access_point = door in new model
			Priority:     g.Type,
			Enabled:      true,
			AntiPassback: apAntiPassback,
		}

		// User IDs assigned to this access group (via access_group_users junction)
		userRows, err := s.db.Pool.Query(ctx, `
			SELECT u.id::text
			FROM dm3_access.access_group_users agu
			JOIN dm3_identity.users u ON u.id = agu.user_id
			WHERE agu.access_group_id = $1::uuid
			  AND u.status = 'active'
			  AND (u.is_deleted = false OR u.is_deleted IS NULL)
			  AND (agu.effective_to IS NULL OR agu.effective_to > now())
		`, g.ID)
		if err != nil {
			slog.Warn("access_rules: query users", "group", g.ID, "error", err)
			continue
		}
		rule.UserGroupIDs = []string{}
		for userRows.Next() {
			var uid string
			if userRows.Scan(&uid) == nil {
				rule.UserGroupIDs = append(rule.UserGroupIDs, uid)
			}
		}
		userRows.Close()

		// Schedule: prefer group-specific override, fall back to access point default
		schedRows, err := s.db.Pool.Query(ctx, `
			SELECT DISTINCT at.timezone, ats.day_of_week,
			       to_char(ats.start_time, 'HH24:MI'), to_char(ats.end_time, 'HH24:MI')
			FROM dm3_access.access_group_access_points agap
			JOIN dm3_access.access_points ap ON ap.id = agap.access_point_id
			JOIN dm3_access.access_times at ON at.id = COALESCE(agap.access_time_id, ap.access_time_id)
			JOIN dm3_access.access_time_slots ats ON ats.access_time_id = at.id AND ats.is_active = true
			WHERE agap.access_group_id = $1::uuid AND agap.access_point_id = $2::uuid AND at.is_active = true
		`, g.ID, accessPointID)
		if err == nil {
			var timezone string
			daySlots := map[string]syncRulePeriod{}
			for schedRows.Next() {
				var tz, start, end string
				var day int
				if schedRows.Scan(&tz, &day, &start, &end) == nil {
					timezone = tz
					key := start + "-" + end
					if p, ok := daySlots[key]; ok {
						p.Days = append(p.Days, day)
						daySlots[key] = p
					} else {
						daySlots[key] = syncRulePeriod{Days: []int{day}, Start: start, End: end}
					}
				}
			}
			schedRows.Close()

			if len(daySlots) > 0 {
				periods := make([]syncRulePeriod, 0, len(daySlots))
				for _, p := range daySlots {
					periods = append(periods, p)
				}
				rule.Schedule = &syncRuleSch{
					Timezone: timezone,
					Periods:  periods,
				}
			}
		}

		rules = append(rules, rule)
	}

	payload := accessRulesPayload{
		Action:       "full_sync",
		RulesVersion: int(time.Now().Unix()),
		Rules:        rules,
	}

	if err := s.publishAccessRules(ctx, tenantID, deviceID, payload); err != nil {
		return err
	}

	slog.Info("access_rules: pushed",
		"device", deviceID,
		"tenant", tenantID,
		"rules", len(rules),
	)
	return nil
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
