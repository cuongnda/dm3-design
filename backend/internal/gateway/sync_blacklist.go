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

// BlacklistSyncer assembles and pushes cfg.blacklist messages to devices.
type BlacklistSyncer struct {
	db   *db.DB
	mqtt *mqtt.Client
}

func NewBlacklistSyncer(database *db.DB, mqttClient *mqtt.Client) *BlacklistSyncer {
	return &BlacklistSyncer{db: database, mqtt: mqttClient}
}

// syncBlacklistEntry matches MQTT spec §7.4 cfg.blacklist payload.
type syncBlacklistEntry struct {
	UserID        string           `json:"user_id"`
	Name          string           `json:"name"`
	Credentials   []syncPersonCred `json:"credentials"`
	Reason        string           `json:"reason"`
	EffectiveFrom int64            `json:"effective_from"`
	EffectiveUntil *int64          `json:"effective_until"`
}

type blacklistPayload struct {
	Action           string               `json:"action"`
	Entries          []syncBlacklistEntry  `json:"entries"`
	BlacklistVersion int                   `json:"blacklist_version"`
}

// PushBlacklist queries users with suspended/deleted status and their credentials,
// then sends cfg.blacklist to the specified device.
// Uses users.status IN ('suspended', 'deleted') as the blacklist source.
func (s *BlacklistSyncer) PushBlacklist(ctx context.Context, tenantID, deviceID string) error {
	return s.PushBlacklistJob(ctx, tenantID, deviceID, nil)
}

// PushBlacklistJob is the same push but tagged for progress tracking.
func (s *BlacklistSyncer) PushBlacklistJob(ctx context.Context, tenantID, deviceID string, jobCtx *SyncJobContext) error {
	if jobCtx != nil {
		jobCtx.Registry.SetTypeTotal(jobCtx.JobID, jobCtx.Type, 1)
	}
	// Fetch blacklisted users (suspended or deleted but not fully removed)
	rows, err := s.db.Pool.Query(ctx, `
		SELECT u.id, CONCAT(u.first_name, ' ', u.last_name), u.status, u.updated_at
		FROM dm3_identity.users u
		WHERE u.tenant_id = $1::uuid
		  AND u.status IN ('suspended', 'deleted')
		ORDER BY u.updated_at DESC
	`, tenantID)
	if err != nil {
		return fmt.Errorf("blacklist: query users: %w", err)
	}
	defer rows.Close()

	type blUser struct {
		ID        string
		Name      string
		Status    string
		UpdatedAt time.Time
	}
	var users []blUser
	for rows.Next() {
		var u blUser
		if err := rows.Scan(&u.ID, &u.Name, &u.Status, &u.UpdatedAt); err != nil {
			slog.Warn("blacklist: scan user", "error", err)
			continue
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("blacklist: iterate users: %w", err)
	}

	// Fetch credentials for blacklisted users (for device-side matching)
	credsByUser := map[string][]syncPersonCred{}
	if len(users) > 0 {
		userIDs := make([]string, len(users))
		for i, u := range users {
			userIDs[i] = u.ID
		}

		credRows, err := s.db.Pool.Query(ctx, `
			SELECT c.user_id, c.type, c.value
			FROM dm3_identity.credentials c
			WHERE c.user_id = ANY($1::uuid[])
		`, userIDs)
		if err != nil {
			return fmt.Errorf("blacklist: query credentials: %w", err)
		}
		defer credRows.Close()

		for credRows.Next() {
			var userID, cType, cValue string
			if err := credRows.Scan(&userID, &cType, &cValue); err != nil {
				continue
			}
			credsByUser[userID] = append(credsByUser[userID], buildSyncCred(cType, cValue, nil, nil))
		}
		if err := credRows.Err(); err != nil {
			return fmt.Errorf("blacklist: iterate credentials: %w", err)
		}
	}

	// Build entries
	entries := make([]syncBlacklistEntry, 0, len(users))
	for _, u := range users {
		reason := "terminated"
		if u.Status == "suspended" {
			reason = "security_threat"
		}

		entry := syncBlacklistEntry{
			UserID:        u.ID,
			Name:          u.Name,
			Credentials:   credsByUser[u.ID],
			Reason:        reason,
			EffectiveFrom: u.UpdatedAt.UnixMilli(),
		}
		if entry.Credentials == nil {
			entry.Credentials = []syncPersonCred{}
		}
		entries = append(entries, entry)
	}

	payload := blacklistPayload{
		Action:           "full_sync",
		Entries:          entries,
		BlacklistVersion: int(time.Now().Unix()),
	}

	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("blacklist: marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.blacklist",
		Data:    dataBytes,
	}
	if jobCtx != nil {
		envelope.JobID = jobCtx.JobID
		envelope.Index = 1
		envelope.Total = 1
	}

	envBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("blacklist: marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	if err := s.mqtt.Publish(ctx, topic, 2, envBytes); err != nil {
		return fmt.Errorf("blacklist: publish: %w", err)
	}
	if jobCtx != nil {
		jobCtx.Registry.IncrementPublished(jobCtx.JobID, jobCtx.Type)
	}

	slog.Info("blacklist: pushed",
		"device", deviceID,
		"tenant", tenantID,
		"entries", len(entries),
	)
	return nil
}
