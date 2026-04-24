package cctv

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// Liveness timings — tuned for ~15-20s worst-case detection for RTSP-pull
// cameras and ~2.5min for VIID/tungson push cameras.
//
// RTSP pull: MediaMTX's internal source retry backs off every ~5–15s after a
// TCP/RTSP failure. Polling faster than that doesn't help — the source simply
// has not retried yet. 10s is the sweet spot: one MediaMTX retry cycle worth
// of latency on top of MediaMTX's own detection window.
//
// tungson/VIID: the camera sends keepalive every ~60s. Two missed keepalives
// (120s) is the earliest we can be sure the device is gone vs a dropped
// packet. Sweep interval is shorter so we discover the boundary within 30s.
const (
	rtspPollInterval        = 10 * time.Second
	tungsonSweepInterval    = 30 * time.Second
	tungsonHeartbeatTimeout = 2 * time.Minute
	// Cameras on unreliable networks routinely drop Ready=true for a single
	// poll window during RTSP reconnects. Flipping them offline on the first
	// miss produces visible flapping in the operator UI. Require three
	// consecutive misses (= 30 s at the current poll interval) before
	// believing the stream is actually down.
	rtspOfflineMissThreshold = 3
)

// RunStatusMonitor launches two goroutines that keep dm3_devices.devices.status
// for camera-type devices in sync with runtime reality:
//
//  1. RTSP poller — asks MediaMTX which paths are ready and flips non-tungson
//     cameras between online/offline accordingly.
//  2. Tungson sweeper — marks VIID cameras offline when their last_heartbeat_at
//     grows older than tungsonHeartbeatTimeout.
//
// On every actual status transition both loops publish a status.heartbeat
// event onto dm3.cctv.ws.{tenant}.{device} so the monitoring UI updates
// without polling. Pass nats=nil to disable the WS publish (tests / dev).
// Both loops exit when ctx is cancelled.
func RunStatusMonitor(ctx context.Context, database *db.DB, mediamtx MediaMTXClient, nats *natsutil.Client) {
	go runRTSPStatusPoller(ctx, database, mediamtx, nats)
	go runTungsonHeartbeatSweeper(ctx, database, nats)
}

func runRTSPStatusPoller(ctx context.Context, database *db.DB, mediamtx MediaMTXClient, nats *natsutil.Client) {
	if _, ok := mediamtx.(NoopMediaMTXClient); ok {
		slog.Info("cctv status: mediamtx noop client — RTSP status poller disabled")
		return
	}
	t := time.NewTicker(rtspPollInterval)
	defer t.Stop()
	slog.Info("cctv status: RTSP poller started", "interval", rtspPollInterval.String())

	// missCounts[cameraUUID] = number of consecutive polls the RTSP source
	// has been reported not-Ready. Kept in memory because this is a
	// liveness heuristic — a process restart resetting it to 0 for every
	// camera just means "give them a few polls before deciding they're
	// offline again", which is the correct conservative behaviour.
	missCounts := make(map[string]int)

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := syncRTSPCameraStatus(ctx, database, mediamtx, nats, missCounts); err != nil {
				slog.Warn("cctv status: RTSP poll failed", "error", err)
			}
		}
	}
}

func syncRTSPCameraStatus(ctx context.Context, database *db.DB, mediamtx MediaMTXClient, nats *natsutil.Client, missCounts map[string]int) error {
	pollCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	paths, err := mediamtx.ListPaths(pollCtx)
	if err != nil {
		return err
	}

	readySet := make(map[string]struct{}, len(paths))
	for _, p := range paths {
		if p.Ready {
			readySet[p.Name] = struct{}{}
		}
	}

	// Load the full non-tungson camera list up-front so we can split it
	// into "online now" / "probably offline" buckets based on both the
	// fresh MediaMTX snapshot AND the miss-count debounce.
	rows, err := database.Pool.Query(pollCtx, `
		SELECT d.id::text, d.tenant_id::text
		  FROM dm3_devices.devices d
		  JOIN dm3_cctv.cameras c ON c.device_id = d.id
		 WHERE d.type = 'camera'
		   AND (c.camera_protocol IS NULL OR c.camera_protocol <> 'viid_tungson')`)
	if err != nil {
		return err
	}
	tenantByID := make(map[string]string)
	cameraIDs := make([]string, 0)
	for rows.Next() {
		var id, tenantID string
		if err := rows.Scan(&id, &tenantID); err != nil {
			rows.Close()
			return err
		}
		cameraIDs = append(cameraIDs, id)
		tenantByID[id] = tenantID
	}
	rows.Close()

	readyIDs := make([]string, 0, len(cameraIDs))
	offlineIDs := make([]string, 0, len(cameraIDs))
	for _, id := range cameraIDs {
		if _, ok := readySet[id]; ok {
			missCounts[id] = 0
			readyIDs = append(readyIDs, id)
			continue
		}
		missCounts[id]++
		if missCounts[id] >= rtspOfflineMissThreshold {
			offlineIDs = append(offlineIDs, id)
		}
	}
	// Tidy: drop counters for cameras that no longer exist (deleted
	// between polls) so the map doesn't grow unbounded.
	for id := range missCounts {
		if _, keep := tenantByID[id]; !keep {
			delete(missCounts, id)
		}
	}

	if len(readyIDs) > 0 {
		flipped, err := applyCameraStatusUpdate(pollCtx, database, readyIDs, "online")
		if err != nil {
			return err
		}
		for _, id := range flipped {
			publishCameraStatusWSEvent(pollCtx, nats, tenantByID[id], id, true)
		}
	}

	if len(offlineIDs) > 0 {
		flipped, err := applyCameraStatusUpdate(pollCtx, database, offlineIDs, "offline")
		if err != nil {
			return err
		}
		for _, id := range flipped {
			publishCameraStatusWSEvent(pollCtx, nats, tenantByID[id], id, false)
		}
	}
	return nil
}

// applyCameraStatusUpdate flips non-tungson cameras matching ids to the
// requested status when they are not already there, and returns the device
// IDs that actually transitioned. Using RETURNING keeps the "did this row
// flip?" check on the DB side so we don't spam WS events for cameras that
// were already in the target state.
func applyCameraStatusUpdate(ctx context.Context, database *db.DB, ids []string, status string) ([]string, error) {
	var sql string
	if status == "online" {
		sql = `UPDATE dm3_devices.devices d
			SET status = 'online', last_seen = now(), updated_at = now()
			FROM dm3_cctv.cameras c
			WHERE d.id = c.device_id
			  AND (c.camera_protocol IS NULL OR c.camera_protocol <> 'viid_tungson')
			  AND d.id::text = ANY($1::text[])
			  AND d.status <> 'online'
			RETURNING d.id::text`
	} else {
		sql = `UPDATE dm3_devices.devices d
			SET status = 'offline', updated_at = now()
			FROM dm3_cctv.cameras c
			WHERE d.id = c.device_id
			  AND (c.camera_protocol IS NULL OR c.camera_protocol <> 'viid_tungson')
			  AND d.id::text = ANY($1::text[])
			  AND d.status <> 'offline'
			RETURNING d.id::text`
	}
	rows, err := database.Pool.Query(ctx, sql, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	flipped := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		flipped = append(flipped, id)
	}
	return flipped, nil
}

func runTungsonHeartbeatSweeper(ctx context.Context, database *db.DB, nats *natsutil.Client) {
	t := time.NewTicker(tungsonSweepInterval)
	defer t.Stop()
	slog.Info("cctv status: tungson sweeper started",
		"interval", tungsonSweepInterval.String(),
		"timeout", tungsonHeartbeatTimeout.String())

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			sweepCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			rows, err := database.Pool.Query(sweepCtx, `
				UPDATE dm3_devices.devices d
				SET status = 'offline', updated_at = now()
				FROM dm3_cctv.cameras c
				WHERE d.id = c.device_id
				  AND c.camera_protocol = 'viid_tungson'
				  AND d.status = 'online'
				  AND (c.last_heartbeat_at IS NULL
				       OR c.last_heartbeat_at < now() - make_interval(secs => $1))
				RETURNING d.id::text, d.tenant_id::text`,
				int(tungsonHeartbeatTimeout.Seconds()))
			if err != nil {
				cancel()
				slog.Warn("cctv status: tungson sweep failed", "error", err)
				continue
			}
			type flip struct{ id, tenantID string }
			flipped := make([]flip, 0)
			for rows.Next() {
				var f flip
				if scanErr := rows.Scan(&f.id, &f.tenantID); scanErr != nil {
					slog.Warn("cctv status: tungson sweep scan failed", "error", scanErr)
					continue
				}
				flipped = append(flipped, f)
			}
			rows.Close()
			cancel()
			if len(flipped) > 0 {
				slog.Info("cctv status: tungson cameras marked offline", "count", len(flipped))
				pubCtx, pubCancel := context.WithTimeout(ctx, 5*time.Second)
				for _, f := range flipped {
					publishCameraStatusWSEvent(pubCtx, nats, f.tenantID, f.id, false)
				}
				pubCancel()
			}
		}
	}
}

// publishCameraStatusWSEvent pushes a status.heartbeat event onto the CCTV
// WebSocket fan-out subject so device-gateway's CCTVWebSocketConsumer
// broadcasts it to connected realtime clients. Called only on actual
// transitions so the UI never receives no-op updates.
//
// Envelope shape matches internal/gateway/cctv_ws_consumer.go's cctvWSEvent
// and tungson_handlers.go's publishWSEventWithPhoto — keep them aligned.
func publishCameraStatusWSEvent(ctx context.Context, nats *natsutil.Client, tenantID, deviceID string, online bool) {
	if nats == nil || tenantID == "" || deviceID == "" {
		return
	}
	payload, err := json.Marshal(map[string]any{
		"type":      "status.heartbeat",
		"device_id": deviceID,
		"tenant_id": tenantID,
		"data": map[string]any{
			"online":    online,
			"device_id": deviceID,
		},
		"time_ms": time.Now().UnixMilli(),
	})
	if err != nil {
		slog.Warn("cctv status: marshal ws event failed", "error", err)
		return
	}
	subject := "dm3.cctv.ws." + tenantID + "." + deviceID
	if err := nats.Publish(ctx, subject, payload); err != nil {
		slog.Warn("cctv status: publish ws event failed", "error", err, "subject", subject)
	}
}
