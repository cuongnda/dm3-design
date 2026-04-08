package gateway

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// SyncService orchestrates device configuration sync via MQTT.
// It delegates to specialized syncers for each message type.
type SyncService struct {
	db        *db.DB
	mqtt      *mqtt.Client
	Persons   *PersonSyncer
	Rules     *AccessRulesSyncer
	Blacklist *BlacklistSyncer
}

func NewSyncService(database *db.DB, mqttClient *mqtt.Client) *SyncService {
	return &SyncService{
		db:        database,
		mqtt:      mqttClient,
		Persons:   NewPersonSyncer(database, mqttClient),
		Rules:     NewAccessRulesSyncer(database, mqttClient),
		Blacklist: NewBlacklistSyncer(database, mqttClient),
	}
}

// PushSyncToDevice pushes all sync types (person_sync, access_rules, blacklist) to a device.
func (s *SyncService) PushSyncToDevice(ctx context.Context, companyID, deviceID string) error {
	return s.pushSyncTypes(ctx, companyID, deviceID, "all")
}

// pushSyncTypes pushes the specified sync type(s) to a device.
// syncType: "person_sync", "access_rules", "blacklist", or "all".
func (s *SyncService) pushSyncTypes(ctx context.Context, companyID, deviceID, syncType string) error {
	slog.Info("sync: pushing", "type", syncType, "company", companyID, "device", deviceID)

	var errs []error

	if syncType == "all" || syncType == "person_sync" {
		if err := s.Persons.PushPersonSync(ctx, companyID, deviceID); err != nil {
			slog.Error("sync: person_sync failed", "device", deviceID, "error", err)
			errs = append(errs, err)
		}
	}

	if syncType == "all" || syncType == "access_rules" {
		if err := s.Rules.PushAccessRules(ctx, companyID, deviceID); err != nil {
			slog.Error("sync: access_rules failed", "device", deviceID, "error", err)
			errs = append(errs, err)
		}
	}

	if syncType == "all" || syncType == "blacklist" {
		if err := s.Blacklist.PushBlacklist(ctx, companyID, deviceID); err != nil {
			slog.Error("sync: blacklist failed", "device", deviceID, "error", err)
			errs = append(errs, err)
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("sync: %d error(s), first: %w", len(errs), errs[0])
	}
	return nil
}

// HandleSyncRequest handles POST /api/v1/devices/{id}/sync — manual sync trigger.
// Query param ?type=person_sync|access_rules|blacklist|all (default: all)
func (s *SyncService) HandleSyncRequest(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	syncType := r.URL.Query().Get("type")
	if syncType == "" {
		syncType = "all"
	}
	switch syncType {
	case "person_sync", "access_rules", "blacklist", "all":
		// valid
	default:
		httputil.Error(w, http.StatusBadRequest, "invalid sync type: must be person_sync, access_rules, blacklist, or all")
		return
	}

	// Look up device
	var companyID, deviceID string
	err := s.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id, device_id FROM dm3_devices.devices WHERE id = $1::uuid`, id,
	).Scan(&companyID, &deviceID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	if err := s.pushSyncTypes(r.Context(), companyID, deviceID, syncType); err != nil {
		slog.Error("sync: push failed", "error", err, "device", deviceID, "type", syncType)
		httputil.Error(w, http.StatusInternalServerError, "sync failed")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"status":    "sync_pushed",
		"type":      syncType,
		"device_id": deviceID,
		"tenant_id": companyID,
	})
}

func generateUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failure is extremely rare; fall back to a timestamp-based id
		// rather than silently returning a zero-UUID.
		return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
