package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

const visitorSyncBatchSize = 500

// VisitorSyncer assembles and pushes cfg.visitor_sync messages to devices.
// It mirrors PersonSyncer but sources data from dm3_visitor (visits +
// temp_credentials) instead of dm3_identity.users.
type VisitorSyncer struct {
	db             *db.DB
	mqtt           *mqtt.Client
	assetPresigner objectstore.GetURLPresigner // optional — nil in tests / local dev
}

func NewVisitorSyncer(database *db.DB, mqttClient *mqtt.Client) *VisitorSyncer {
	return &VisitorSyncer{db: database, mqtt: mqttClient}
}

// syncVisitor matches MQTT spec §7.8 cfg.visitor_sync entry.
type syncVisitor struct {
	VisitID     string           `json:"visit_id"`
	VisitorID   string           `json:"visitor_id"`
	Name        string           `json:"name"`
	Avatar      string           `json:"avatar,omitempty"` // photo_ref from dm3_visitor.visitors; empty if unset
	Credentials []syncPersonCred `json:"credentials"`
	AccessZones []string         `json:"access_zones"`
	ValidFrom   *int64           `json:"valid_from,omitempty"`
	ValidUntil  *int64           `json:"valid_until,omitempty"`
	Active      bool             `json:"active"`
}

type visitorSyncPayload struct {
	Action          string        `json:"action"` // full_sync | upsert | remove | clear
	Visitors        []syncVisitor `json:"visitors"`
	RemovedVisitIDs []string      `json:"removed_visit_ids,omitempty"`
	TotalCount      int           `json:"total_count"`
	Batch           int           `json:"batch"`
	BatchTotal      int           `json:"batch_total"`
}

// PushVisitorSync fetches all currently-valid visits whose access_areas include
// at least one zone reachable from this device, then sends batched
// cfg.visitor_sync messages with action=full_sync. Matches PushPersonSync in
// shape so the device contract stays consistent.
func (s *VisitorSyncer) PushVisitorSync(ctx context.Context, tenantID, deviceID string) error {
	return s.PushVisitorSyncJob(ctx, tenantID, deviceID, nil)
}

// PushVisitorSyncJob is PushVisitorSync with optional job-progress tracking.
func (s *VisitorSyncer) PushVisitorSyncJob(ctx context.Context, tenantID, deviceID string, jobCtx *SyncJobContext) error {
	// Visits authorized on at least one zone reachable from this device.
	// access_areas is UUID[] of zone IDs; we intersect with zones belonging to
	// access_points that this device is wired to.
	visitRows, err := s.db.Pool.Query(ctx, `
		SELECT v.id::text,
		       v.visitor_id::text,
		       COALESCE(NULLIF(TRIM(CONCAT(vr.first_name, ' ', vr.last_name)), ''), vr.display_name, ''),
		       COALESCE(vr.photo_ref, ''),
		       COALESCE(v.access_areas, '{}'::uuid[]),
		       v.expected_arrival,
		       v.expected_departure
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vr ON vr.id = v.visitor_id
		WHERE v.tenant_id = $1::uuid
		  AND v.status IN ('approved', 'checked_in')
		  AND (v.expected_departure IS NULL OR v.expected_departure > now())
		  AND EXISTS (
		      SELECT 1
		      FROM dm3_access.access_points ap
		      JOIN dm3_access.access_point_devices apd
		           ON apd.access_point_id = ap.id
		      JOIN dm3_devices.devices d
		           ON d.id::text = apd.access_device_id
		      WHERE d.device_id = $2
		        AND d.tenant_id = $1::uuid
		        AND ap.zone_id IS NOT NULL
		        AND ap.zone_id = ANY(v.access_areas)
		  )
		ORDER BY v.id
	`, tenantID, deviceID)
	if err != nil {
		return fmt.Errorf("visitor_sync: query visits: %w", err)
	}
	defer visitRows.Close()

	type visitRow struct {
		VisitID    string
		VisitorID  string
		Name       string
		Avatar     string
		Zones      []string
		ValidFrom  *time.Time
		ValidUntil *time.Time
	}
	var visits []visitRow
	for visitRows.Next() {
		var vr visitRow
		if err := visitRows.Scan(&vr.VisitID, &vr.VisitorID, &vr.Name, &vr.Avatar, &vr.Zones, &vr.ValidFrom, &vr.ValidUntil); err != nil {
			slog.Warn("visitor_sync: scan visit", "error", err)
			continue
		}
		visits = append(visits, vr)
	}
	if err := visitRows.Err(); err != nil {
		return fmt.Errorf("visitor_sync: iterate visits: %w", err)
	}

	// Fetch temp credentials for those visits. We pull only rows that are
	// active and not revoked — revoked credentials must not be resent.
	credsByVisit := map[string][]syncPersonCred{}
	if len(visits) > 0 {
		visitIDs := make([]string, len(visits))
		for i, v := range visits {
			visitIDs[i] = v.VisitID
		}
		credRows, err := s.db.Pool.Query(ctx, `
			SELECT visit_id::text, type, value, valid_from, valid_until
			FROM dm3_visitor.temp_credentials
			WHERE tenant_id = $1::uuid
			  AND visit_id = ANY($2::uuid[])
			  AND status = 'active'
			  AND revoked_at IS NULL
		`, tenantID, visitIDs)
		if err != nil {
			return fmt.Errorf("visitor_sync: query credentials: %w", err)
		}
		defer credRows.Close()

		for credRows.Next() {
			var visitID, cType, cValue string
			var validFrom, validUntil *time.Time
			if err := credRows.Scan(&visitID, &cType, &cValue, &validFrom, &validUntil); err != nil {
				continue
			}
			if cValue == "" {
				// Skip placeholder rows (visitor-svc creates a row on approval
				// before the operator assigns an actual card/QR). The device
				// has nothing to match on without a value.
				continue
			}
			credsByVisit[visitID] = append(credsByVisit[visitID], buildSyncCred(cType, cValue, validFrom, validUntil))
		}
		if err := credRows.Err(); err != nil {
			return fmt.Errorf("visitor_sync: iterate credentials: %w", err)
		}
	}

	// Build payload entries. Visits without any usable credential are still
	// sent with active=false so the device knows the visit exists (useful for
	// self-service kiosks that look up by QR scan), but the device won't
	// grant access via an empty credential list.
	syncVisitors := make([]syncVisitor, 0, len(visits))
	for _, v := range visits {
		creds := credsByVisit[v.VisitID]
		if creds == nil {
			creds = []syncPersonCred{}
		}
		zones := v.Zones
		if zones == nil {
			zones = []string{}
		}
		sv := syncVisitor{
			VisitID:     v.VisitID,
			VisitorID:   v.VisitorID,
			Name:        v.Name,
			Avatar:      presignIdentityAsset(ctx, s.assetPresigner, v.Avatar),
			Credentials: creds,
			AccessZones: zones,
			Active:      len(creds) > 0,
		}
		if v.ValidFrom != nil {
			ms := v.ValidFrom.UnixMilli()
			sv.ValidFrom = &ms
		}
		if v.ValidUntil != nil {
			ms := v.ValidUntil.UnixMilli()
			sv.ValidUntil = &ms
		}
		syncVisitors = append(syncVisitors, sv)
	}

	// Send in batches — always send at least one full_sync, even if the list
	// is empty, so the device can reconcile (drop any locally-cached visits).
	totalCount := len(syncVisitors)
	batchTotal := (totalCount + visitorSyncBatchSize - 1) / visitorSyncBatchSize
	if batchTotal == 0 {
		batchTotal = 1
	}
	if jobCtx != nil {
		jobCtx.Registry.SetTypeTotal(jobCtx.JobID, jobCtx.Type, batchTotal)
	}

	for i := range batchTotal {
		start := i * visitorSyncBatchSize
		end := min(start+visitorSyncBatchSize, totalCount)
		slice := syncVisitors[start:end]
		if slice == nil {
			slice = []syncVisitor{}
		}

		payload := visitorSyncPayload{
			Action:     "full_sync",
			Visitors:   slice,
			TotalCount: totalCount,
			Batch:      i + 1,
			BatchTotal: batchTotal,
		}
		if err := s.publishJob(ctx, tenantID, deviceID, payload, jobCtx); err != nil {
			return fmt.Errorf("visitor_sync: batch %d/%d: %w", i+1, batchTotal, err)
		}
	}

	slog.Info("visitor_sync: pushed",
		"device", deviceID,
		"tenant", tenantID,
		"visitors", totalCount,
		"batches", batchTotal,
	)
	return nil
}

// PushVisitorUpsert sends a single-visit upsert to the device (incremental
// update fired from the NATS consumer on visit.approved or visit.updated).
// If the visit has no active credential yet, this is a no-op — there is
// nothing for the device to store until a credential is assigned.
func (s *VisitorSyncer) PushVisitorUpsert(ctx context.Context, tenantID, deviceID, visitID string) error {
	var (
		visitorID  string
		name       string
		avatar     string
		zones      []string
		validFrom  *time.Time
		validUntil *time.Time
	)
	err := s.db.Pool.QueryRow(ctx, `
		SELECT v.visitor_id::text,
		       COALESCE(NULLIF(TRIM(CONCAT(vr.first_name, ' ', vr.last_name)), ''), vr.display_name, ''),
		       COALESCE(vr.photo_ref, ''),
		       COALESCE(v.access_areas, '{}'::uuid[]),
		       v.expected_arrival,
		       v.expected_departure
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vr ON vr.id = v.visitor_id
		WHERE v.id = $1::uuid
		  AND v.tenant_id = $2::uuid
		  AND v.status IN ('approved', 'checked_in')
	`, visitID, tenantID).Scan(&visitorID, &name, &avatar, &zones, &validFrom, &validUntil)
	if err != nil {
		return fmt.Errorf("visitor_sync: load visit %s: %w", visitID, err)
	}

	credRows, err := s.db.Pool.Query(ctx, `
		SELECT type, value, valid_from, valid_until
		FROM dm3_visitor.temp_credentials
		WHERE visit_id = $1::uuid
		  AND tenant_id = $2::uuid
		  AND status = 'active'
		  AND revoked_at IS NULL
	`, visitID, tenantID)
	if err != nil {
		return fmt.Errorf("visitor_sync: load credentials for visit %s: %w", visitID, err)
	}
	defer credRows.Close()

	creds := []syncPersonCred{}
	for credRows.Next() {
		var cType, cValue string
		var vf, vu *time.Time
		if err := credRows.Scan(&cType, &cValue, &vf, &vu); err != nil {
			continue
		}
		if cValue == "" {
			continue
		}
		creds = append(creds, buildSyncCred(cType, cValue, vf, vu))
	}
	if len(creds) == 0 {
		slog.Debug("visitor_sync: skip upsert — no usable credential",
			"visit_id", visitID, "device", deviceID)
		return nil
	}

	if zones == nil {
		zones = []string{}
	}
	entry := syncVisitor{
		VisitID:     visitID,
		VisitorID:   visitorID,
		Name:        name,
		Avatar:      presignIdentityAsset(ctx, s.assetPresigner, avatar),
		Credentials: creds,
		AccessZones: zones,
		Active:      true,
	}
	if validFrom != nil {
		ms := validFrom.UnixMilli()
		entry.ValidFrom = &ms
	}
	if validUntil != nil {
		ms := validUntil.UnixMilli()
		entry.ValidUntil = &ms
	}

	payload := visitorSyncPayload{
		Action:     "upsert",
		Visitors:   []syncVisitor{entry},
		TotalCount: 1,
		Batch:      1,
		BatchTotal: 1,
	}
	return s.publishJob(ctx, tenantID, deviceID, payload, nil)
}

// PushVisitorRemove tells the device to drop the given visit from its local
// cache. Fired on visit end events (checked_out, rejected, cancelled, no_show).
func (s *VisitorSyncer) PushVisitorRemove(ctx context.Context, tenantID, deviceID, visitID string) error {
	payload := visitorSyncPayload{
		Action:          "remove",
		Visitors:        []syncVisitor{},
		RemovedVisitIDs: []string{visitID},
		TotalCount:      1,
		Batch:           1,
		BatchTotal:      1,
	}
	return s.publishJob(ctx, tenantID, deviceID, payload, nil)
}

// PushClearAllVisitors tells the device to wipe its local visitor cache. Used
// as the first half of a manual "Transmit Data" replace for visitor_sync,
// mirroring PushClearAllUsers.
func (s *VisitorSyncer) PushClearAllVisitors(ctx context.Context, tenantID, deviceID string) error {
	return s.PushClearAllVisitorsJob(ctx, tenantID, deviceID, nil)
}

// PushClearAllVisitorsJob is the job-tagged variant of PushClearAllVisitors.
func (s *VisitorSyncer) PushClearAllVisitorsJob(ctx context.Context, tenantID, deviceID string, jobCtx *SyncJobContext) error {
	payload := visitorSyncPayload{
		Action:     "clear",
		Visitors:   []syncVisitor{},
		TotalCount: 0,
		Batch:      1,
		BatchTotal: 1,
	}
	if jobCtx != nil {
		jobCtx.Registry.SetTypeTotal(jobCtx.JobID, jobCtx.Type, 1)
	}
	if err := s.publishJob(ctx, tenantID, deviceID, payload, jobCtx); err != nil {
		return fmt.Errorf("visitor_sync clear: %w", err)
	}
	slog.Info("visitor_sync: cleared", "device", deviceID, "tenant", tenantID)
	return nil
}

func (s *VisitorSyncer) publishJob(ctx context.Context, tenantID, deviceID string, payload visitorSyncPayload, jobCtx *SyncJobContext) error {
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("visitor_sync: marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.visitor_sync",
		Data:    dataBytes,
	}
	if jobCtx != nil {
		envelope.JobID = jobCtx.JobID
		if snap := jobCtx.Registry.Get(jobCtx.JobID); snap != nil {
			if st := snap.PerType[jobCtx.Type]; st != nil {
				envelope.Index = st.Published + 1
				envelope.Total = st.Total
			}
		}
	}

	envBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("visitor_sync: marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	if err := s.mqtt.Publish(ctx, topic, 2, envBytes); err != nil {
		return fmt.Errorf("visitor_sync: publish: %w", err)
	}
	if jobCtx != nil {
		jobCtx.Registry.IncrementPublished(jobCtx.JobID, jobCtx.Type)
	}
	return nil
}
