package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"crypto/rand"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// SyncService assembles and pushes device configuration via MQTT.
type SyncService struct {
	db   *db.DB
	mqtt *mqtt.Client
}

func NewSyncService(database *db.DB, mqttClient *mqtt.Client) *SyncService {
	return &SyncService{db: database, mqtt: mqttClient}
}

// syncUser represents a user in the sync payload.
type syncUser struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	ValidFrom *int64 `json:"valid_from,omitempty"`
	ValidUntil *int64 `json:"valid_until,omitempty"`
}

// syncCredential represents a credential in the sync payload.
type syncCredential struct {
	ID        string `json:"id"`
	UserID  string `json:"user_id"`
	Type      string `json:"type"`
	Value     string `json:"value"`
	Status    string `json:"status"`
	ValidFrom *int64 `json:"valid_from,omitempty"`
	ValidUntil *int64 `json:"valid_until,omitempty"`
}

// syncAccessRule represents an access rule in the sync payload.
type syncAccessRule struct {
	RuleID   string   `json:"rule_id"`
	Name     string   `json:"name"`
	DoorIDs  []string `json:"door_ids"`
	Schedule any      `json:"schedule,omitempty"`
	Priority int      `json:"priority"`
	Enabled  bool     `json:"enabled"`
}

// syncUserGroup represents a user group in the sync payload.
type syncUserGroup struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	UserIDs []string `json:"user_ids"`
}

// cfgFullPayload is the full sync message sent to devices.
type cfgFullPayload struct {
	ConfigVersion int              `json:"config_version"`
	Users         []syncUser       `json:"users"`
	UserGroups    []syncUserGroup  `json:"user_groups"`
	Credentials   []syncCredential `json:"credentials"`
	AccessRules   []syncAccessRule `json:"access_rules"`
	Blacklist     []any            `json:"blacklist"`
}

// PushSyncToDevice assembles all config data for a device's company and pushes via MQTT.
func (s *SyncService) PushSyncToDevice(ctx context.Context, companyID, deviceID string) error {
	slog.Info("sync: assembling config", "company", companyID, "device", deviceID)

	// Fetch users for company
	users := []syncUser{}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, CONCAT(first_name, ' ', last_name), status FROM dm3_identity.users WHERE tenant_id = $1::uuid AND status = 'active'`,
		companyID)
	if err != nil {
		return fmt.Errorf("sync: query users: %w", err)
	}
	for rows.Next() {
		var p syncUser
		if err := rows.Scan(&p.ID, &p.Name, &p.Status); err != nil {
			continue
		}
		users = append(users, p)
	}
	rows.Close()

	// Fetch credentials for company
	credentials := []syncCredential{}
	rows, err = s.db.Pool.Query(ctx,
		`SELECT c.id, c.user_id, c.type, c.value, c.status
		 FROM dm3_identity.credentials c
		 JOIN dm3_identity.users p ON p.id = c.user_id
		 WHERE p.tenant_id = $1::uuid AND c.status = 'active'`,
		companyID)
	if err != nil {
		return fmt.Errorf("sync: query credentials: %w", err)
	}
	for rows.Next() {
		var c syncCredential
		if err := rows.Scan(&c.ID, &c.UserID, &c.Type, &c.Value, &c.Status); err != nil {
			continue
		}
		credentials = append(credentials, c)
	}
	rows.Close()

	// Fetch access rules for company
	accessRules := []syncAccessRule{}
	rows, err = s.db.Pool.Query(ctx,
		`SELECT id, name, COALESCE(door_ids, '{}'), schedule, priority, enabled
		 FROM dm3_access.access_rules WHERE tenant_id = $1::uuid AND enabled = true`,
		companyID)
	if err != nil {
		return fmt.Errorf("sync: query access rules: %w", err)
	}
	for rows.Next() {
		var r syncAccessRule
		var doorIDs []string
		var schedule json.RawMessage
		if err := rows.Scan(&r.RuleID, &r.Name, &doorIDs, &schedule, &r.Priority, &r.Enabled); err != nil {
			continue
		}
		r.DoorIDs = make([]string, len(doorIDs))
		for i, d := range doorIDs {
			r.DoorIDs[i] = d
		}
		if len(schedule) > 0 {
			var s any
			json.Unmarshal(schedule, &s)
			r.Schedule = s
		}
		accessRules = append(accessRules, r)
	}
	rows.Close()

	// Fetch user groups for company
	userGroups := []syncUserGroup{}
	groupRows, err := s.db.Pool.Query(ctx,
		`SELECT g.id, g.name, COALESCE(array_agg(gm.user_id::text) FILTER (WHERE gm.user_id IS NOT NULL), ARRAY[]::text[])
		 FROM dm3_identity.user_groups g
		 LEFT JOIN dm3_identity.user_group_members gm ON gm.group_id = g.id
		 WHERE g.tenant_id = $1::uuid GROUP BY g.id, g.name`, companyID)
	if err == nil {
		defer groupRows.Close()
		for groupRows.Next() {
			var ug syncUserGroup
			if groupRows.Scan(&ug.ID, &ug.Name, &ug.UserIDs) == nil {
				userGroups = append(userGroups, ug)
			}
		}
	}

	// Build cfg.full envelope
	data := cfgFullPayload{
		ConfigVersion: 1,
		Users:         users,
		UserGroups:    userGroups,
		Credentials:   credentials,
		AccessRules:   accessRules,
		Blacklist:     []any{},
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("sync: marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.full",
		Data:    dataBytes,
	}

	payload, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("sync: marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", companyID, deviceID)
	if err := s.mqtt.Publish(ctx, topic, 1, payload); err != nil {
		return fmt.Errorf("sync: publish to %s: %w", topic, err)
	}

	slog.Info("sync: pushed cfg.full",
		"device", deviceID,
		"company", companyID,
		"users", len(users),
		"credentials", len(credentials),
		"rules", len(accessRules),
		"topic", topic,
	)
	return nil
}

// HandleSyncRequest handles POST /api/v1/devices/{id}/sync — manual sync trigger.
func (s *SyncService) HandleSyncRequest(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Look up device
	var companyID, deviceID string
	err := s.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id, device_id FROM dm3_devices.devices WHERE id = $1::uuid`, id,
	).Scan(&companyID, &deviceID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	if err := s.PushSyncToDevice(r.Context(), companyID, deviceID); err != nil {
		slog.Error("sync: push failed", "error", err, "device", deviceID)
		httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("sync failed: %v", err))
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"status":    "sync_pushed",
		"device_id": deviceID,
		"tenant_id": companyID,
	})
}

func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
