package cctv

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// uuidRegex matches a canonical UUID in string form. Package-private copy to
// avoid importing from internal/access (which would create a cross-service
// dependency).
var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// defaultMaxClipDurationSec is the hard cap applied when the tenant has no
// cctv_settings row. Matches the migration default.
const defaultMaxClipDurationSec = 600

// AccessEventConsumer subscribes to device access events on the DEVICES stream
// and drives the CCTV capture pipeline (snapshots + coalesced clips) governed
// by dm3_cctv.event_rules.
//
// Capture timeline (record path):
//   - Incoming event → resolve rule per camera → if record_enabled:
//       - find any open clip for that camera → extend its end_at (coalesce),
//         OR insert a new pending clip with end_at = now + post_roll.
//   - A separate Finalizer goroutine picks up pending clips whose end_at has
//     passed and submits them to the worker pool for ffmpeg concat + upload.
//
// Snapshot path bypasses coalescing — each event that matches a snapshot-enabled
// rule inserts a fresh `media_type='snapshot'` row and is dispatched to the
// snapshot extractor immediately. They finish in <1s and are cheap.
//
// TODO(refactor): ResolveRule runs once per (camera, event). For bursts fanning
// out to many cameras the per-camera query count grows — consider caching
// tenant rules in memory with a listen/notify invalidation channel.
type AccessEventConsumer struct {
	db               *db.DB
	nats             *natsutil.Client
	clipExtractor    *ClipExtractor
	snapshotExtrator *SnapshotExtractor
	workers          *ExtractionWorkerPool
}

// NewAccessEventConsumer wires the consumer. Any of clip/snapshot extractors
// or workers may be nil — capture stages with a nil dependency are logged and
// skipped instead of crashing. This keeps the consumer usable in dev setups
// where the object store or ffmpeg isn't configured.
func NewAccessEventConsumer(
	database *db.DB,
	natsClient *natsutil.Client,
	clipExtractor *ClipExtractor,
	snapshotExtractor *SnapshotExtractor,
	workers *ExtractionWorkerPool,
) *AccessEventConsumer {
	return &AccessEventConsumer{
		db:               database,
		nats:             natsClient,
		clipExtractor:    clipExtractor,
		snapshotExtrator: snapshotExtractor,
		workers:          workers,
	}
}

// deviceEvent mirrors the envelope published by device-gateway to the DEVICES stream.
type deviceEvent struct {
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

// accessLogData is the subset of the access-log family payload we care about
// for capture decisions. Decision drives rule matching; DoorID is used as the
// fallback access point resolver when src is empty. The same struct works for
// `access.log`, `face.match`, and `face.unknown` events — they all share the
// decision/photo/door_id shape.
type accessLogData struct {
	EventID  string `json:"event_id"`
	DoorID   string `json:"door_id"`
	Decision string `json:"decision"`
}

// Start subscribes to dm3.devices.*.*.evt on the DEVICES stream with queue
// group "cctv-svc-access-events".
func (c *AccessEventConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleAccessEvent(ctx, subject, data)
	}
	const filter = "dm3.devices.*.*.evt"
	if err := c.nats.Subscribe(ctx, "DEVICES", "cctv-svc-access-events", filter, handler); err != nil {
		return fmt.Errorf("cctv: subscribe access events: %w", err)
	}
	slog.Info("cctv access-event consumer started", "subject", filter)
	return nil
}

func (c *AccessEventConsumer) handleAccessEvent(ctx context.Context, subject string, data []byte) error {
	var evt deviceEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("cctv: failed to unmarshal device event", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	switch evt.Type {
	case "access.log", "face.match", "face.unknown", "door.forced":
		// accepted — continue
	default:
		return nil
	}

	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 || !uuidRegex.MatchString(parts[2]) {
		slog.Warn("cctv: invalid subject format", "subject", subject)
		return nil
	}
	tenantID := parts[2]

	srcDeviceID := evt.Src
	if srcDeviceID == "" {
		srcDeviceID = parts[3]
	}
	srcDeviceID = strings.TrimPrefix(srcDeviceID, "device:")
	if !uuidRegex.MatchString(srcDeviceID) {
		var deviceUUID string
		err := c.db.Pool.QueryRow(ctx,
			`SELECT id::text FROM dm3_devices.devices WHERE device_id = $1 AND tenant_id = $2::uuid LIMIT 1`,
			srcDeviceID, tenantID,
		).Scan(&deviceUUID)
		if err != nil {
			return nil
		}
		srcDeviceID = deviceUUID
	}

	var payload accessLogData
	if err := json.Unmarshal(evt.Data, &payload); err != nil {
		slog.Warn("cctv: failed to unmarshal access.log payload", "error", err)
		return nil
	}

	enabled, err := c.tenantHasCCTVPlugin(ctx, tenantID)
	if err != nil {
		slog.Error("cctv: plugin check failed", "error", err, "tenant_id", tenantID)
		return err
	}
	if !enabled {
		return nil
	}

	var (
		cameras       []string
		accessPointID string
	)
	if c.isCamera(ctx, tenantID, srcDeviceID) {
		cameras = []string{srcDeviceID}
		// Even though the event originated directly on the camera (TungSon
		// face path), resolve its access point so access-point-scoped rules
		// still match. Without this, a rule targeting an AP would silently
		// be ignored whenever the camera published the event itself.
		if apID, err := c.resolveAccessPointID(ctx, tenantID, srcDeviceID, payload.DoorID); err == nil {
			accessPointID = apID
		}
	} else {
		apID, err := c.resolveAccessPointID(ctx, tenantID, srcDeviceID, payload.DoorID)
		if err != nil {
			slog.Error("cctv: failed to resolve access_point_id", "error", err, "src", srcDeviceID)
			return err
		}
		if apID == "" {
			return nil
		}
		accessPointID = apID
		cameras, err = c.findCamerasForAccessPoint(ctx, tenantID, accessPointID)
		if err != nil {
			slog.Error("cctv: failed to find cameras for access point", "error", err, "access_point_id", accessPointID)
			return err
		}
	}
	if len(cameras) == 0 {
		return nil
	}

	// Resolve max_clip_duration once per event — used by the coalescer to stop
	// growing a clip past the tenant's cap.
	maxClipDuration := c.loadMaxClipDuration(ctx, tenantID)

	eventTS := time.UnixMilli(evt.TS)
	var eventUUID *string
	if evt.ID != "" && uuidRegex.MatchString(evt.ID) {
		eventUUID = &evt.ID
	} else if payload.EventID != "" && uuidRegex.MatchString(payload.EventID) {
		eventUUID = &payload.EventID
	}

	// Fan out per-camera work in parallel — each camera is a self-contained
	// rule lookup + (at most) one INSERT + one junction write. Processing
	// serially would make the NATS handler's latency O(num_cameras), which
	// matters when 20+ cameras hang off the same access point. A WaitGroup
	// bounded implicitly by the camera list (≤ dozens in practice) is cheap
	// and avoids adding another worker pool for light DB-only work.
	//
	// TODO(refactor): if we ever see tenants with >100 cameras on an AP,
	// convert this to a small semaphore (say 16) to avoid DB connection
	// saturation under burst traffic.
	// Resolver takes a slice to stay forward-compatible with producers that
	// might carry aliases (e.g. access.log + face.match on the same wire
	// event). Today we just pass the single canonical type.
	ruleEventTypes := []string{evt.Type}

	var wg sync.WaitGroup
	for _, camDeviceID := range cameras {
		wg.Add(1)
		go func(camDeviceID string) {
			defer wg.Done()
			c.captureForCamera(ctx, tenantID, accessPointID, camDeviceID, payload, evt, ruleEventTypes, eventUUID, eventTS, maxClipDuration)
		}(camDeviceID)
	}
	wg.Wait()
	return nil
}

func (c *AccessEventConsumer) captureForCamera(
	ctx context.Context,
	tenantID, accessPointID, camDeviceID string,
	payload accessLogData,
	evt deviceEvent,
	eventTypes []string,
	eventUUID *string,
	eventTS time.Time,
	maxClipDuration time.Duration,
) {
	rule, err := ResolveRule(ctx, c.db, RuleMatchInput{
		TenantID:       tenantID,
		CameraDeviceID: camDeviceID,
		AccessPointID:  accessPointID,
		Decision:       payload.Decision,
		EventTypes:     eventTypes,
	})
	if err != nil {
		slog.Warn("cctv: rule resolve failed, skipping camera", "error", err,
			"camera_device_id", camDeviceID)
		return
	}
	if !rule.RecordEnabled && !rule.SnapshotEnabled {
		return
	}

	// Shape of the row depends on which flags the rule set. We keep the
	// 1-row-per-(camera,event) invariant so UI can show "event → N media
	// across cameras" cleanly; when a rule enables both, the snapshot lives
	// as a thumbnail on the same clip row rather than producing a twin row.
	switch {
	case rule.RecordEnabled:
		clipID, err := c.captureClip(ctx, tenantID, camDeviceID, eventUUID, eventTS, rule, maxClipDuration)
		if err != nil {
			slog.Error("cctv: capture clip failed", "error", err,
				"camera_device_id", camDeviceID)
			return
		}
		if rule.SnapshotEnabled && clipID != "" && c.snapshotExtrator != nil {
			// Dispatch thumbnail capture alongside the pending clip. We pass
			// the same clip_id so the extractor updates thumbnail_ref on that
			// row instead of creating a new one.
			capID := clipID
			if c.workers != nil {
				c.workers.Submit(ctx, func(jobCtx context.Context) {
					c.snapshotExtrator.ExtractThumbnail(jobCtx, capID, tenantID, camDeviceID)
				})
			} else {
				go c.snapshotExtrator.ExtractThumbnail(ctx, capID, tenantID, camDeviceID)
			}
		}
	case rule.SnapshotEnabled:
		if err := c.captureSnapshot(ctx, tenantID, camDeviceID, eventUUID, eventTS, rule); err != nil {
			slog.Error("cctv: capture snapshot failed", "error", err,
				"camera_device_id", camDeviceID)
		}
	}
}

// captureClip implements the coalescing state machine for video capture. It
// either extends an in-flight pending clip for the camera (burst merging) or
// starts a brand-new pending clip.
//
// Coalescing rules:
//   - An "open" clip is status in {pending, recording} AND end_at > now AND
//     media_type = 'clip'.
//   - If extending would push the resulting duration past maxClipDuration,
//     we force a new clip instead — this prevents runaway clips during
//     perpetual door-open events.
//
// All writes happen in a single Postgres round trip for the common path
// (extend via UPDATE ... RETURNING, fallback to INSERT). The junction write
// happens after we know the clip id.
func (c *AccessEventConsumer) captureClip(
	ctx context.Context,
	tenantID, cameraDeviceID string,
	accessEventID *string,
	eventTS time.Time,
	rule EffectiveRule,
	maxClipDuration time.Duration,
) (string, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	newEndAt := time.Now().Add(time.Duration(rule.PostRollSec) * time.Second)

	// Try to extend an open clip first — row-level lock keeps concurrent events
	// from racing. The LIMIT 1 + FOR UPDATE SKIP LOCKED combination means a
	// simultaneous event just falls through to the INSERT branch below.
	var (
		extClipID    string
		extStartedAt time.Time
	)
	err := c.db.Pool.QueryRow(dbCtx, `
		WITH candidate AS (
		  SELECT id, started_at FROM dm3_cctv.event_clips
		   WHERE tenant_id = $1::uuid
		     AND device_id = $2::uuid
		     AND media_type = 'clip'
		     AND status IN ('pending','recording')
		     AND end_at > now()
		     AND (now() - started_at) < make_interval(secs => $4)
		   ORDER BY started_at DESC
		   LIMIT 1
		   FOR UPDATE SKIP LOCKED
		)
		UPDATE dm3_cctv.event_clips c
		   SET end_at = GREATEST(c.end_at, $3), updated_at = now()
		  FROM candidate
		 WHERE c.id = candidate.id
		RETURNING c.id::text, c.started_at`,
		tenantID, cameraDeviceID, newEndAt, int(maxClipDuration.Seconds()),
	).Scan(&extClipID, &extStartedAt)

	if err == nil {
		// Extended — just link the event to the existing clip.
		return extClipID, c.linkEventToClip(dbCtx, tenantID, extClipID, extStartedAt, accessEventID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("coalesce lookup: %w", err)
	}

	// No open clip — start a new pending row. started_at rewinds pre_roll into
	// the past so the finalizer knows which rolling-buffer range to splice.
	startedAt := eventTS.Add(-time.Duration(rule.PreRollSec) * time.Second)
	placeholderKey := fmt.Sprintf("pending/%s/%s/%d.mp4", tenantID, cameraDeviceID, startedAt.UnixNano())

	var newClipID string
	err = c.db.Pool.QueryRow(dbCtx, `
		INSERT INTO dm3_cctv.event_clips
		  (tenant_id, device_id, access_event_id, started_at, ended_at, end_at,
		   duration_ms, object_key, trigger, media_type, status, rule_id)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, $5, 0, $6, 'access_event',
		        'clip', 'pending', $7::uuid)
		RETURNING id::text`,
		tenantID, cameraDeviceID, accessEventID, startedAt, newEndAt, placeholderKey, rule.RuleID,
	).Scan(&newClipID)
	if err != nil {
		return "", fmt.Errorf("insert pending clip: %w", err)
	}

	if err := c.linkEventToClip(dbCtx, tenantID, newClipID, startedAt, accessEventID); err != nil {
		return newClipID, err
	}
	return newClipID, nil
}

// captureSnapshot inserts a snapshot row and dispatches immediate extraction.
// Snapshots are never coalesced — each event gets its own still frame.
func (c *AccessEventConsumer) captureSnapshot(
	ctx context.Context,
	tenantID, cameraDeviceID string,
	accessEventID *string,
	eventTS time.Time,
	rule EffectiveRule,
) error {
	if c.snapshotExtrator == nil {
		// Extractor not wired (e.g. no object store) — skip silently.
		return nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	placeholderKey := fmt.Sprintf("pending/%s/%s/%d.jpg", tenantID, cameraDeviceID, eventTS.UnixNano())
	var clipID string
	err := c.db.Pool.QueryRow(dbCtx, `
		INSERT INTO dm3_cctv.event_clips
		  (tenant_id, device_id, access_event_id, started_at, ended_at, end_at,
		   duration_ms, object_key, trigger, media_type, status, rule_id)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, $4, 0, $5, 'access_event',
		        'snapshot', 'pending', $6::uuid)
		RETURNING id::text`,
		tenantID, cameraDeviceID, accessEventID, eventTS, placeholderKey, rule.RuleID,
	).Scan(&clipID)
	if err != nil {
		return fmt.Errorf("insert pending snapshot: %w", err)
	}

	if err := c.linkEventToClip(dbCtx, tenantID, clipID, eventTS, accessEventID); err != nil {
		return err
	}

	// Hand off to the worker pool. Failures are persisted in the row by the
	// extractor; we don't block the event loop here.
	if c.workers != nil {
		c.workers.Submit(ctx, func(jobCtx context.Context) {
			c.snapshotExtrator.ExtractSnapshot(jobCtx, clipID, tenantID, cameraDeviceID)
		})
	} else {
		go c.snapshotExtrator.ExtractSnapshot(ctx, clipID, tenantID, cameraDeviceID)
	}
	return nil
}

// linkEventToClip adds the junction row so one clip can represent a burst of
// access events. ON CONFLICT is idempotent — replay-safe.
func (c *AccessEventConsumer) linkEventToClip(
	ctx context.Context,
	tenantID, clipID string,
	clipStartedAt time.Time,
	accessEventID *string,
) error {
	if accessEventID == nil {
		return nil
	}
	_, err := c.db.Pool.Exec(ctx, `
		INSERT INTO dm3_cctv.event_clip_events (clip_id, clip_started_at, access_event_id, tenant_id)
		VALUES ($1::uuid, $2, $3::uuid, $4::uuid)
		ON CONFLICT (clip_id, access_event_id) DO NOTHING`,
		clipID, clipStartedAt, *accessEventID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("link event to clip: %w", err)
	}
	return nil
}

// loadMaxClipDuration pulls the tenant's cap from cctv_settings. Fall back to
// the package default when the row is missing — keeps the pipeline moving
// even for newly created tenants.
func (c *AccessEventConsumer) loadMaxClipDuration(ctx context.Context, tenantID string) time.Duration {
	lookupCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()
	var secs int
	err := c.db.Pool.QueryRow(lookupCtx,
		`SELECT max_clip_duration_sec FROM dm3_cctv.cctv_settings WHERE tenant_id = $1::uuid`,
		tenantID,
	).Scan(&secs)
	if err != nil || secs <= 0 {
		return time.Duration(defaultMaxClipDurationSec) * time.Second
	}
	return time.Duration(secs) * time.Second
}

// tenantHasCCTVPlugin returns true when the tenant's enabled_plugins column
// includes "cctv".
func (c *AccessEventConsumer) tenantHasCCTVPlugin(ctx context.Context, tenantID string) (bool, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var enabled bool
	err := c.db.Pool.QueryRow(lookupCtx,
		`SELECT 'cctv' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
		tenantID,
	).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return enabled, nil
}

// resolveAccessPointID maps a source device or legacy door_id to its access_point.
// Tenant-scoped. Returns "" when no mapping exists.
func (c *AccessEventConsumer) resolveAccessPointID(ctx context.Context, tenantID, srcDeviceID, doorID string) (string, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if srcDeviceID != "" {
		var apID string
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT ap.id::text
			   FROM dm3_access.access_points ap
			   JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
			   JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id
			  WHERE ad.device_id = $1::uuid AND ap.tenant_id = $2::uuid
			  LIMIT 1`,
			srcDeviceID, tenantID,
		).Scan(&apID)
		if err == nil {
			return apID, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	if uuidRegex.MatchString(doorID) {
		var apID string
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT id::text FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			doorID, tenantID,
		).Scan(&apID)
		if err == nil {
			return apID, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	return "", nil
}

// findCamerasForAccessPoint returns camera device IDs bound to the given access
// point for the tenant.
func (c *AccessEventConsumer) findCamerasForAccessPoint(ctx context.Context, tenantID, accessPointID string) ([]string, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	rows, err := c.db.Pool.Query(lookupCtx,
		`SELECT d.id::text
		   FROM dm3_access.access_point_devices apd
		   JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id AND ad.tenant_id = apd.tenant_id
		   JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		  WHERE apd.access_point_id = $1::uuid AND apd.tenant_id = $2::uuid AND d.type = 'camera'`,
		accessPointID, tenantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// isCamera returns true if the device is a camera (type='camera' in dm3_devices.devices).
func (c *AccessEventConsumer) isCamera(ctx context.Context, tenantID, deviceID string) bool {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var isCamera bool
	_ = c.db.Pool.QueryRow(lookupCtx,
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		deviceID, tenantID,
	).Scan(&isCamera)
	return isCamera
}

