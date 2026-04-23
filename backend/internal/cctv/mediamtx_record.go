package cctv

import (
	"context"
	"fmt"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
)

// pathRecordDefaults returns the rolling-buffer fields to attach to a
// PathConfig based on the tenant's cctv_settings.rolling_buffer_sec. When the
// buffer is disabled (0, missing row, or DB error), returns an empty struct
// so the caller's UpsertPath stays backward-compatible.
//
// Segment duration is fixed at 5s: a good balance between splice granularity
// (finalizer can pick a start segment within ±5s of pre_roll) and fMP4 fragment
// overhead. Retention is set to 2× buffer window so a late finalizer still
// finds the segments it needs.
//
// TODO(refactor): once we have evidence from real workloads, expose the
// segment duration as a tenant setting — some deployments may prefer 10s
// segments to trade granularity for fewer small files.
func pathRecordDefaults(ctx context.Context, database *db.DB, tenantID string) PathConfig {
	queryCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	var rollingSec int
	err := database.Pool.QueryRow(queryCtx,
		`SELECT rolling_buffer_sec FROM dm3_cctv.cctv_settings WHERE tenant_id = $1::uuid`,
		tenantID,
	).Scan(&rollingSec)
	if err != nil || rollingSec <= 0 {
		return PathConfig{}
	}

	// recordPath template uses MediaMTX's built-in strftime-style placeholders.
	// %path = camera UUID (we set path name = device UUID in UpsertPath); %f =
	// microseconds. The filename encodes segment start time so the extractor
	// can window-filter without opening each file.
	return PathConfig{
		Record:                true,
		RecordFormat:          "fmp4",
		RecordPath:            "/recordings/%path/%Y-%m-%d_%H-%M-%S-%f",
		RecordSegmentDuration: "10s",
		RecordDeleteAfter:     fmt.Sprintf("%ds", rollingSec+60),
	}
}

// applyRecordDefaults merges the record-related fields of `defaults` into
// `cfg` without touching Source / SourceOnDemand. Tiny helper so the call
// sites don't duplicate the copy.
func applyRecordDefaults(cfg PathConfig, defaults PathConfig) PathConfig {
	cfg.Record = defaults.Record
	cfg.RecordFormat = defaults.RecordFormat
	cfg.RecordPath = defaults.RecordPath
	cfg.RecordSegmentDuration = defaults.RecordSegmentDuration
	cfg.RecordDeleteAfter = defaults.RecordDeleteAfter
	return cfg
}
