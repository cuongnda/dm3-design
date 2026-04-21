package gateway

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// SyncService orchestrates device configuration sync via MQTT.
// It delegates to specialized syncers for each message type.
type SyncService struct {
	db        *db.DB
	mqtt      *mqtt.Client
	handlers  *GatewayHandlers // for pushDeviceConfig
	hub       *EventHub        // for broadcasting sync.progress events
	Jobs      *JobRegistry     // tracks manual transmit progress
	Persons     *PersonSyncer
	Rules       *AccessRulesSyncer
	Blacklist   *BlacklistSyncer
	Visitors    *VisitorSyncer
	KioskConfig *KioskConfigSyncer
}

func NewSyncService(database *db.DB, mqttClient *mqtt.Client) *SyncService {
	return &SyncService{
		db:        database,
		mqtt:      mqttClient,
		Jobs:      NewJobRegistry(),
		Persons:   NewPersonSyncer(database, mqttClient),
		Rules:     NewAccessRulesSyncer(database, mqttClient),
		Blacklist: NewBlacklistSyncer(database, mqttClient),
		Visitors:  NewVisitorSyncer(database, mqttClient),
		// KioskConfig stays nil until AttachKioskConfig is called from
		// main() with the resolved public API base URL. Without it, a
		// "kiosk_config" sync type fails gracefully in pushSyncTypes.
	}
}

// AttachKioskConfig wires the kiosk_config syncer with the server's public
// visitor-svc base URL. Called from main() after config is loaded.
func (s *SyncService) AttachKioskConfig(apiBaseURL string) {
	if apiBaseURL == "" {
		return
	}
	s.KioskConfig = NewKioskConfigSyncer(s.db, s.mqtt, apiBaseURL)
}

// AttachAssetPresigner gives the sync service an object-store presigner so
// that avatar / photo fields in person_sync and visitor_sync payloads can be
// rewritten as short-lived signed GET URLs the device can fetch directly.
// Call from main() after the MinIO client is initialised.
func (s *SyncService) AttachAssetPresigner(p objectstore.GetURLPresigner) {
	if s.Persons != nil {
		s.Persons.assetPresigner = p
	}
	if s.Visitors != nil {
		s.Visitors.assetPresigner = p
	}
}

// AttachHub gives the sync service the WebSocket hub so it can broadcast
// sync.progress events whenever a job state changes.
func (s *SyncService) AttachHub(h *EventHub) {
	s.hub = h
	s.Jobs.SetOnUpdate(func(job *SyncJob) {
		if h == nil || job == nil {
			return
		}
		data, err := json.Marshal(job)
		if err != nil {
			return
		}
		h.Broadcast(WSEvent{
			Type:     "sync.progress",
			DeviceID: job.DeviceID,
			TenantID: job.TenantID,
			Data:     data,
			Time:     time.Now(),
		})
	})
}

// AttachHandlers gives the sync service a back-reference to the device
// handlers so it can reuse pushDeviceConfig for the "config" sync type
// without duplicating the cfg.device_update marshaling logic.
func (s *SyncService) AttachHandlers(h *GatewayHandlers) { s.handlers = h }

// validSyncTypes is the canonical list of supported sync targets. Order matters
// for "all" — config goes first so the device has the right settings before any
// downstream rules / persons / blacklist get evaluated.
var validSyncTypes = []string{"config", "person_sync", "access_rules", "blacklist", "visitor_sync", "kiosk_config"}

// PushSyncToDevice pushes all sync types to a device (auto path — used by
// IdentityConsumer when a credential changes). Does NOT clear the local user
// DB before person_sync, since that would briefly empty the device between
// every edit. Auto syncs do not create a SyncJob — they're invisible to the
// progress UI by design.
func (s *SyncService) PushSyncToDevice(ctx context.Context, companyID, deviceID string) error {
	results, _ := s.pushSyncTypes(ctx, companyID, "", deviceID, validSyncTypes, false, nil)
	for t, r := range results {
		if strings.HasPrefix(r, "error") {
			return fmt.Errorf("sync %s: %s", t, r)
		}
	}
	return nil
}

// pushSyncTypes pushes the specified sync type(s) to a device. Each type runs
// independently — failures are collected so a partial sync still reports what
// succeeded. deviceDBID is the dm3_devices.devices.id (uuid) used to load the
// device row for the config push; pass "" to skip the config branch.
//
// `manual` controls whether person_sync uses the two-step replace flow
// (clear → full_sync). True for the on-demand "Transmit Data" button — the
// operator explicitly asked for a clean replacement. False for auto-syncs
// fired by credential edits, which should not destructively clear the device.
//
// `job` is non-nil when this is a manual transmit. The push functions stamp
// every MQTT message with job_id / index / total and call back into the
// registry to update progress, which broadcasts via WebSocket.
func (s *SyncService) pushSyncTypes(ctx context.Context, companyID, deviceDBID, deviceID string, types []string, manual bool, job *SyncJob) (results map[string]string, err error) {
	results = map[string]string{}
	slog.Info("sync: pushing", "types", types, "company", companyID, "device", deviceID, "manual", manual)

	jobCtxFor := func(t string) *SyncJobContext {
		if job == nil {
			return nil
		}
		return &SyncJobContext{Registry: s.Jobs, JobID: job.ID, Type: t}
	}

	for _, t := range types {
		switch t {
		case "config":
			if s.handlers == nil || deviceDBID == "" {
				results[t] = "error: config push not available"
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", "config push not available")
				}
				continue
			}
			d, derr := s.handlers.loadDeviceForSync(ctx, deviceDBID)
			if derr != nil {
				slog.Error("sync: load device for config", "device", deviceID, "error", derr)
				results[t] = "error: " + derr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", derr.Error())
				}
				continue
			}
			s.handlers.pushDeviceConfigJob(ctx, d, jobCtxFor(t))
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		case "person_sync":
			jc := jobCtxFor(t)
			// Manual transmit: clear the device's local user DB first so
			// stale users from a previous push are removed, then send the
			// authoritative full set. Documented in mqtt-protocol.md §7.4.
			if manual {
				if cerr := s.Persons.PushClearAllUsersJob(ctx, companyID, deviceID, jc); cerr != nil {
					slog.Error("sync: person_sync clear failed", "device", deviceID, "error", cerr)
					results[t] = "error: " + cerr.Error()
					if job != nil {
						s.Jobs.MarkTypeResult(job.ID, t, "error", cerr.Error())
					}
					continue
				}
			}
			if perr := s.Persons.PushPersonSyncJob(ctx, companyID, deviceID, jc); perr != nil {
				slog.Error("sync: person_sync failed", "device", deviceID, "error", perr)
				results[t] = "error: " + perr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", perr.Error())
				}
				continue
			}
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		case "access_rules":
			if rerr := s.Rules.PushAccessRulesJob(ctx, companyID, deviceID, jobCtxFor(t)); rerr != nil {
				slog.Error("sync: access_rules failed", "device", deviceID, "error", rerr)
				results[t] = "error: " + rerr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", rerr.Error())
				}
				continue
			}
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		case "blacklist":
			if berr := s.Blacklist.PushBlacklistJob(ctx, companyID, deviceID, jobCtxFor(t)); berr != nil {
				slog.Error("sync: blacklist failed", "device", deviceID, "error", berr)
				results[t] = "error: " + berr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", berr.Error())
				}
				continue
			}
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		case "kiosk_config":
			// LPR kiosks (DM3-provisioned devices running lpr-desktop-app)
			// receive their /register-visit credentials here. Non-kiosk
			// devices ignore the unknown cfg.kiosk_config type. If the
			// syncer isn't wired (KIOSK_API_BASE_URL unset) we skip with
			// a clear error instead of silently succeeding.
			if s.KioskConfig == nil {
				msg := "kiosk_config disabled (KIOSK_API_BASE_URL not configured)"
				results[t] = "error: " + msg
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", msg)
				}
				continue
			}
			if kerr := s.KioskConfig.PushKioskConfigJob(ctx, companyID, deviceID, jobCtxFor(t)); kerr != nil {
				slog.Error("sync: kiosk_config failed", "device", deviceID, "error", kerr)
				results[t] = "error: " + kerr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", kerr.Error())
				}
				continue
			}
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		case "visitor_sync":
			jc := jobCtxFor(t)
			// Same two-step replace pattern as person_sync when the operator
			// hits Transmit: clear the device's visitor cache, then send the
			// authoritative full set.
			if manual {
				if cerr := s.Visitors.PushClearAllVisitorsJob(ctx, companyID, deviceID, jc); cerr != nil {
					slog.Error("sync: visitor_sync clear failed", "device", deviceID, "error", cerr)
					results[t] = "error: " + cerr.Error()
					if job != nil {
						s.Jobs.MarkTypeResult(job.ID, t, "error", cerr.Error())
					}
					continue
				}
			}
			if verr := s.Visitors.PushVisitorSyncJob(ctx, companyID, deviceID, jc); verr != nil {
				slog.Error("sync: visitor_sync failed", "device", deviceID, "error", verr)
				results[t] = "error: " + verr.Error()
				if job != nil {
					s.Jobs.MarkTypeResult(job.ID, t, "error", verr.Error())
				}
				continue
			}
			results[t] = "ok"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "ok", "")
			}
		default:
			results[t] = "error: unknown sync type"
			if job != nil {
				s.Jobs.MarkTypeResult(job.ID, t, "error", "unknown sync type")
			}
		}
	}
	if job != nil {
		s.Jobs.Finish(job.ID)
	}
	return results, nil
}

// HandleSyncRequest handles POST /api/v1/devices/{id}/sync — manual sync trigger.
// Query param ?type=config|person_sync|access_rules|blacklist|all (default: all).
// Multiple types may be combined as a comma-separated list, e.g. ?type=config,person_sync.
func (s *SyncService) HandleSyncRequest(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rawType := r.URL.Query().Get("type")
	if rawType == "" {
		rawType = "all"
	}

	var types []string
	if rawType == "all" {
		types = append(types, validSyncTypes...)
	} else {
		seen := map[string]bool{}
		for _, t := range strings.Split(rawType, ",") {
			t = strings.TrimSpace(t)
			if t == "" || seen[t] {
				continue
			}
			if !contains(validSyncTypes, t) {
				httputil.Error(w, http.StatusBadRequest,
					"invalid sync type: must be one of "+strings.Join(validSyncTypes, ", ")+", or 'all'")
				return
			}
			seen[t] = true
			types = append(types, t)
		}
	}
	if len(types) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no sync types specified")
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

	// Create the job up front so the client can subscribe immediately. The
	// pushes run inline (the operator clicked Transmit and is waiting on
	// the modal). Progress updates broadcast over WebSocket as each MQTT
	// message is published and acked.
	job := s.Jobs.Create(companyID, deviceID, types)
	results, _ := s.pushSyncTypes(r.Context(), companyID, id, deviceID, types, true, job)

	actorID, actorEmail := audit.ActorFromContext(r.Context())
	go InsertDeviceEvent(context.Background(), s.db.Pool, DeviceEvent{
		TenantID:    companyID,
		DeviceID:    deviceID,
		EventType:   "sync",
		Description: fmt.Sprintf("Data synced: %s", strings.Join(types, ", ")),
		ActorID:     strPtr(actorID),
		ActorEmail:  strPtr(actorEmail),
		Metadata:    map[string]any{"types": types, "results": results, "job_id": job.ID},
	})

	httputil.JSON(w, http.StatusOK, map[string]any{
		"status":    "sync_pushed",
		"job_id":    job.ID,
		"types":     types,
		"results":   results,
		"device_id": deviceID,
		"tenant_id": companyID,
	})
}

// HandleGetSyncJob handles GET /api/v1/gateway/devices/{id}/sync/jobs/{jobID}
// — polling fallback for progress when WebSocket isn't available.
func (s *SyncService) HandleGetSyncJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")
	job := s.Jobs.Get(jobID)
	if job == nil {
		httputil.Error(w, http.StatusNotFound, "job not found")
		return
	}
	httputil.JSON(w, http.StatusOK, job)
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// loadDeviceForSync reads the minimal fields from dm3_devices.devices needed
// to publish a cfg.device_update message. Returns models.Device so it can be
// passed straight to pushDeviceConfig.
func (h *GatewayHandlers) loadDeviceForSync(ctx context.Context, dbID string) (models.Device, error) {
	query := `SELECT ` + deviceColumns + ` FROM dm3_devices.devices WHERE id = $1::uuid`
	return scanDevice(h.db.Pool.QueryRow(ctx, query, dbID))
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
