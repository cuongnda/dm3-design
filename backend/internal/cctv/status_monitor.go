package cctv

import (
	"context"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
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
)

// RunStatusMonitor launches two goroutines that keep dm3_devices.devices.status
// for camera-type devices in sync with runtime reality:
//
//  1. RTSP poller — asks MediaMTX which paths are ready and flips non-tungson
//     cameras between online/offline accordingly.
//  2. Tungson sweeper — marks VIID cameras offline when their last_heartbeat_at
//     grows older than tungsonHeartbeatTimeout.
//
// Both loops exit when ctx is cancelled.
func RunStatusMonitor(ctx context.Context, database *db.DB, mediamtx MediaMTXClient) {
	go runRTSPStatusPoller(ctx, database, mediamtx)
	go runTungsonHeartbeatSweeper(ctx, database)
}

func runRTSPStatusPoller(ctx context.Context, database *db.DB, mediamtx MediaMTXClient) {
	if _, ok := mediamtx.(NoopMediaMTXClient); ok {
		slog.Info("cctv status: mediamtx noop client — RTSP status poller disabled")
		return
	}
	t := time.NewTicker(rtspPollInterval)
	defer t.Stop()
	slog.Info("cctv status: RTSP poller started", "interval", rtspPollInterval.String())

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := syncRTSPCameraStatus(ctx, database, mediamtx); err != nil {
				slog.Warn("cctv status: RTSP poll failed", "error", err)
			}
		}
	}
}

func syncRTSPCameraStatus(ctx context.Context, database *db.DB, mediamtx MediaMTXClient) error {
	pollCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	paths, err := mediamtx.ListPaths(pollCtx)
	if err != nil {
		return err
	}

	readyIDs := make([]string, 0, len(paths))
	for _, p := range paths {
		if p.Ready {
			readyIDs = append(readyIDs, p.Name)
		}
	}

	// Flip to online: cameras whose device UUID is in readyIDs and not tungson.
	if _, err := database.Pool.Exec(pollCtx, `
		UPDATE dm3_devices.devices d
		SET status = 'online', last_seen = now(), updated_at = now()
		FROM dm3_cctv.cameras c
		WHERE d.id = c.device_id
		  AND (c.camera_protocol IS NULL OR c.camera_protocol <> 'viid_tungson')
		  AND d.id::text = ANY($1::text[])
		  AND d.status <> 'online'`, readyIDs); err != nil {
		return err
	}

	// Flip to offline: non-tungson cameras not in readyIDs.
	if _, err := database.Pool.Exec(pollCtx, `
		UPDATE dm3_devices.devices d
		SET status = 'offline', updated_at = now()
		FROM dm3_cctv.cameras c
		WHERE d.id = c.device_id
		  AND (c.camera_protocol IS NULL OR c.camera_protocol <> 'viid_tungson')
		  AND NOT (d.id::text = ANY($1::text[]))
		  AND d.status <> 'offline'`, readyIDs); err != nil {
		return err
	}
	return nil
}

func runTungsonHeartbeatSweeper(ctx context.Context, database *db.DB) {
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
			tag, err := database.Pool.Exec(sweepCtx, `
				UPDATE dm3_devices.devices d
				SET status = 'offline', updated_at = now()
				FROM dm3_cctv.cameras c
				WHERE d.id = c.device_id
				  AND c.camera_protocol = 'viid_tungson'
				  AND d.status = 'online'
				  AND (c.last_heartbeat_at IS NULL
				       OR c.last_heartbeat_at < now() - make_interval(secs => $1))`,
				int(tungsonHeartbeatTimeout.Seconds()))
			cancel()
			if err != nil {
				slog.Warn("cctv status: tungson sweep failed", "error", err)
				continue
			}
			if n := tag.RowsAffected(); n > 0 {
				slog.Info("cctv status: tungson cameras marked offline", "count", n)
			}
		}
	}
}
