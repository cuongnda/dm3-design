package cctv

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// DeviceSyncRequestConsumer subscribes to gateway-originated sync requests
// and routes them through cctv-svc when the target device is a camera.
//
// Background: device-gateway's POST /api/v1/gateway/devices/{id}/sync API
// is the operator's "Transmit Data" button — it covers terminals/readers
// over MQTT. TungSon cameras don't subscribe MQTT (they poll VIID HTTP),
// so without this consumer a sync targeting a camera silently no-ops on
// the cctv side. We hook the same operator action here so the cctv face
// queue gets refilled in lockstep with the MQTT push.
//
// Filter rules:
//   - device_type must be "camera" (anything else is a no-op for cctv)
//   - types[] must include "person_sync" (other sync types — config /
//     access_rules / blacklist — have no analogue on TungSon today)
//   - camera must exist in dm3_cctv.cameras with camera_protocol =
//     'viid_tungson'; other protocols (rtsp_only / http_tbvision) have no
//     face-sync surface
type DeviceSyncRequestConsumer struct {
	db       *db.DB
	nats     *natsutil.Client
	faceSync *FaceSyncService
}

// NewDeviceSyncRequestConsumer wires the consumer with its dependencies.
func NewDeviceSyncRequestConsumer(database *db.DB, natsClient *natsutil.Client, faceSync *FaceSyncService) *DeviceSyncRequestConsumer {
	return &DeviceSyncRequestConsumer{db: database, nats: natsClient, faceSync: faceSync}
}

// Start attaches the durable consumer on the DEVICES stream. Subject is
// dm3.devices.sync.request published by gateway/sync.go.
func (c *DeviceSyncRequestConsumer) Start(ctx context.Context) error {
	if err := c.nats.EnsureStream(ctx, "DEVICES", []string{"dm3.devices.>"}); err != nil {
		return err
	}
	return c.nats.Subscribe(ctx, "DEVICES", "cctv-device-sync-request",
		"dm3.devices.sync.request", c.handle)
}

// deviceSyncRequest mirrors the payload SyncService.publishSyncRequest
// emits — keep the JSON tags in lockstep with backend/internal/gateway/sync.go.
type deviceSyncRequest struct {
	TenantID   string   `json:"tenant_id"`
	DeviceUUID string   `json:"device_uuid"`
	DeviceID   string   `json:"device_id"`
	DeviceType string   `json:"device_type"`
	Types      []string `json:"types"`
	Manual     bool     `json:"manual"`
	TSMs       int64    `json:"ts_ms"`
}

func (c *DeviceSyncRequestConsumer) handle(subject string, data []byte) error {
	var req deviceSyncRequest
	if err := json.Unmarshal(data, &req); err != nil {
		// Bad payloads should not block the stream — ack and move on.
		slog.Warn("cctv device sync: bad payload", "subject", subject, "error", err)
		return nil
	}
	if req.DeviceType != "camera" {
		return nil
	}
	if !containsString(req.Types, "person_sync") {
		// Sync types like "config" / "access_rules" don't translate to
		// VIID; ignore quietly so we don't pollute logs on every sync.
		return nil
	}
	if req.TenantID == "" || req.DeviceUUID == "" {
		slog.Warn("cctv device sync: missing tenant or device uuid", "payload", string(data))
		return nil
	}

	// Confirm this is a TungSon camera before scheduling work — other
	// camera protocols don't have a face-sync queue.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var protocol string
	err := c.db.Pool.QueryRow(ctx,
		`SELECT COALESCE(camera_protocol, '')
		   FROM dm3_cctv.cameras
		  WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		req.DeviceUUID, req.TenantID,
	).Scan(&protocol)
	if err != nil {
		// No camera row yet (cam approved but never reported in) — skip
		// without erroring; the gateway sync still succeeded.
		slog.Debug("cctv device sync: camera row not found, skipping",
			"device_uuid", req.DeviceUUID, "tenant_id", req.TenantID)
		return nil
	}
	if protocol != "viid_tungson" {
		return nil
	}

	if err := c.faceSync.EnqueueFullSync(ctx, req.TenantID, req.DeviceUUID); err != nil {
		// Return error so JetStream redelivers — transient DB hiccups
		// shouldn't lose a sync request triggered by an operator click.
		slog.Error("cctv device sync: full-sync enqueue failed",
			"device_uuid", req.DeviceUUID, "tenant_id", req.TenantID, "error", err)
		return err
	}
	slog.Info("cctv device sync: routed gateway request to TungSon face queue",
		"device_uuid", req.DeviceUUID, "tenant_id", req.TenantID,
		"types", req.Types, "manual", req.Manual)
	return nil
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
