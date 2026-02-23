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

// syncPerson represents a person in the sync payload.
type syncPerson struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	ValidFrom *int64 `json:"valid_from,omitempty"`
	ValidUntil *int64 `json:"valid_until,omitempty"`
}

// syncCredential represents a credential in the sync payload.
type syncCredential struct {
	ID        string `json:"id"`
	PersonID  string `json:"person_id"`
	Type      string `json:"type"`
	Value     string `json:"value"`
	Status    string `json:"status"`
	ValidFrom *int64 `json:"valid_from,omitempty"`
	ValidUntil *int64 `json:"valid_until,omitempty"`
}

// syncAccessRule represents an access rule in the sync payload.
type syncAccessRule struct {
	RuleID         string   `json:"rule_id"`
	Name           string   `json:"name"`
	DoorIDs        []string `json:"door_ids"`
	PersonGroupIDs []string `json:"person_group_ids"`
	Schedule       any      `json:"schedule,omitempty"`
	Priority       int      `json:"priority"`
	Enabled        bool     `json:"enabled"`
}

// syncPersonGroup represents a person group in the sync payload.
type syncPersonGroup struct {
	ID        string   `json:"id"`
	GroupID   string   `json:"group_id"`
	PersonIDs []string `json:"person_ids"`
}

// cfgFullPayload is the full sync message sent to devices.
type cfgFullPayload struct {
	ConfigVersion int              `json:"config_version"`
	Persons       []syncPerson     `json:"persons"`
	Credentials   []syncCredential `json:"credentials"`
	AccessRules   []syncAccessRule  `json:"access_rules"`
	PersonGroups  []syncPersonGroup `json:"person_groups"`
	Blacklist     []any            `json:"blacklist"`
}

// PushSyncToDevice assembles all config data for a device's tenant and pushes via MQTT.
func (s *SyncService) PushSyncToDevice(ctx context.Context, tenantID, deviceID string) error {
	slog.Info("sync: assembling config", "tenant", tenantID, "device", deviceID)

	// Fetch persons for tenant
	persons := []syncPerson{}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, CONCAT(first_name, ' ', last_name), status FROM dm3_identity.persons WHERE tenant_id = $1::uuid AND status = 'active'`,
		tenantID)
	if err != nil {
		return fmt.Errorf("sync: query persons: %w", err)
	}
	for rows.Next() {
		var p syncPerson
		if err := rows.Scan(&p.ID, &p.Name, &p.Status); err != nil {
			continue
		}
		persons = append(persons, p)
	}
	rows.Close()

	// Fetch credentials for tenant
	credentials := []syncCredential{}
	rows, err = s.db.Pool.Query(ctx,
		`SELECT c.id, c.person_id, c.type, c.value, c.status
		 FROM dm3_identity.credentials c
		 JOIN dm3_identity.persons p ON p.id = c.person_id
		 WHERE p.tenant_id = $1::uuid AND c.status = 'active'`,
		tenantID)
	if err != nil {
		return fmt.Errorf("sync: query credentials: %w", err)
	}
	for rows.Next() {
		var c syncCredential
		if err := rows.Scan(&c.ID, &c.PersonID, &c.Type, &c.Value, &c.Status); err != nil {
			continue
		}
		credentials = append(credentials, c)
	}
	rows.Close()

	// Fetch access rules for tenant
	accessRules := []syncAccessRule{}
	rows, err = s.db.Pool.Query(ctx,
		`SELECT id, name, COALESCE(door_ids, '{}'), COALESCE(person_group_ids, '{}'), schedule, priority, enabled
		 FROM dm3_access.access_rules WHERE tenant_id = $1::uuid AND enabled = true`,
		tenantID)
	if err != nil {
		return fmt.Errorf("sync: query access rules: %w", err)
	}
	for rows.Next() {
		var r syncAccessRule
		var doorIDs, groupIDs []string
		var schedule json.RawMessage
		if err := rows.Scan(&r.RuleID, &r.Name, &doorIDs, &groupIDs, &schedule, &r.Priority, &r.Enabled); err != nil {
			continue
		}
		// Convert UUID door_ids to string format matching simulator door IDs
		r.DoorIDs = make([]string, len(doorIDs))
		for i, d := range doorIDs {
			r.DoorIDs[i] = d
		}
		r.PersonGroupIDs = make([]string, len(groupIDs))
		for i, g := range groupIDs {
			r.PersonGroupIDs[i] = g
		}
		if len(schedule) > 0 {
			var s any
			json.Unmarshal(schedule, &s)
			r.Schedule = s
		}
		accessRules = append(accessRules, r)
	}
	rows.Close()

	// Fetch person groups
	personGroups := []syncPersonGroup{}
	rows, err = s.db.Pool.Query(ctx,
		`SELECT g.id, g.id, ARRAY_AGG(gm.person_id::text)
		 FROM dm3_identity.person_groups g
		 JOIN dm3_identity.person_group_members gm ON gm.group_id = g.id
		 WHERE g.tenant_id = $1::uuid
		 GROUP BY g.id`,
		tenantID)
	if err != nil {
		slog.Warn("sync: query person groups failed (may not exist)", "error", err)
	} else {
		for rows.Next() {
			var pg syncPersonGroup
			if err := rows.Scan(&pg.ID, &pg.GroupID, &pg.PersonIDs); err != nil {
				continue
			}
			personGroups = append(personGroups, pg)
		}
		rows.Close()
	}

	// Build cfg.full envelope
	data := cfgFullPayload{
		ConfigVersion: 1,
		Persons:       persons,
		Credentials:   credentials,
		AccessRules:   accessRules,
		PersonGroups:  personGroups,
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

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	if err := s.mqtt.Publish(ctx, topic, 1, payload); err != nil {
		return fmt.Errorf("sync: publish to %s: %w", topic, err)
	}

	slog.Info("sync: pushed cfg.full",
		"device", deviceID,
		"tenant", tenantID,
		"persons", len(persons),
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
	var tenantID, deviceID string
	err := s.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id, device_id FROM dm3_devices.devices WHERE id = $1::uuid`, id,
	).Scan(&tenantID, &deviceID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	if err := s.PushSyncToDevice(r.Context(), tenantID, deviceID); err != nil {
		slog.Error("sync: push failed", "error", err, "device", deviceID)
		httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("sync failed: %v", err))
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"status":    "sync_pushed",
		"device_id": deviceID,
		"tenant_id": tenantID,
	})
}

func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
