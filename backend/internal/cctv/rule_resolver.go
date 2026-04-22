package cctv

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
)

// RuleMatchInput carries everything the resolver needs to pick a rule for a
// single (camera, event) pair. All fields are plain values so the caller
// does not have to construct intermediate structs.
type RuleMatchInput struct {
	TenantID       string
	CameraDeviceID string
	AccessPointID  string // may be empty when event originates directly from a camera
	Decision       string // e.g. "granted" / "denied" / "unknown"
	EventType      string // e.g. "access.log" / "face.match"
}

// ResolveRule returns the EffectiveRule to apply for (camera, event). It runs
// a single query ordered by scope specificity (camera > access_point > tenant)
// then by priority. The DB filter already applies decision + event_type
// matching via @> (array contains). When no row matches we fall back to
// cctv_settings defaults.
//
// TODO(refactor): this issues a separate query per (camera,event). For events
// fanning out to many cameras the resolver could be batched or pre-warmed into
// memory with pg_listen_notify invalidation. Fine as-is under expected load.
func ResolveRule(ctx context.Context, database *db.DB, in RuleMatchInput) (EffectiveRule, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Ordering note:
	//   CASE scope_kind — 1 camera (most specific) → 2 access_point → 3 tenant
	//   priority ASC    — lower wins within same scope
	// LIMIT 1 → first row is the winner.
	//
	// Array match: empty decisions/event_types are treated as wildcards via
	// `cardinality(...) = 0 OR ... @> ARRAY[...]` so a rule only needs to list
	// filters when it wants to restrict.
	row := database.Pool.QueryRow(queryCtx, `
		SELECT r.id::text, r.snapshot_enabled, r.record_enabled,
		       r.pre_roll_sec, r.post_roll_sec
		  FROM dm3_cctv.event_rules r
		 WHERE r.tenant_id = $1::uuid
		   AND r.enabled   = TRUE
		   AND (
		        (r.scope_kind = 'camera'       AND r.camera_device_id = $2::uuid)
		     OR (r.scope_kind = 'access_point' AND $3 <> '' AND r.access_point_id = NULLIF($3,'')::uuid)
		     OR (r.scope_kind = 'tenant')
		   )
		   AND (cardinality(r.decisions)   = 0 OR r.decisions   @> ARRAY[$4]::text[])
		   AND (cardinality(r.event_types) = 0 OR r.event_types @> ARRAY[$5]::text[])
		 ORDER BY
		   CASE r.scope_kind WHEN 'camera' THEN 1 WHEN 'access_point' THEN 2 ELSE 3 END,
		   r.priority ASC,
		   r.created_at ASC
		 LIMIT 1`,
		in.TenantID, in.CameraDeviceID, in.AccessPointID, in.Decision, in.EventType,
	)

	var (
		ruleID   string
		snapshot bool
		record   bool
		preRoll  int
		postRoll int
	)
	err := row.Scan(&ruleID, &snapshot, &record, &preRoll, &postRoll)
	switch {
	case err == nil:
		return EffectiveRule{
			SnapshotEnabled: snapshot,
			RecordEnabled:   record,
			PreRollSec:      preRoll,
			PostRollSec:     postRoll,
			RuleID:          &ruleID,
		}, nil
	case err == pgx.ErrNoRows:
		// Fall through to settings fallback.
	default:
		return EffectiveRule{}, fmt.Errorf("resolve rule: %w", err)
	}

	return loadTenantFallback(queryCtx, database, in.TenantID)
}

// loadTenantFallback reads the per-tenant defaults from dm3_cctv.cctv_settings.
// If the row is missing (new tenant) we return hard-coded sane defaults
// matching the migration's column DEFAULTs so the capture pipeline does not
// silently go dark.
func loadTenantFallback(ctx context.Context, database *db.DB, tenantID string) (EffectiveRule, error) {
	var (
		snapshot bool
		record   bool
		preRoll  int
		postRoll int
	)
	err := database.Pool.QueryRow(ctx, `
		SELECT default_snapshot_enabled, default_record_enabled,
		       pre_roll_sec_default, post_roll_sec_default
		  FROM dm3_cctv.cctv_settings
		 WHERE tenant_id = $1::uuid`, tenantID,
	).Scan(&snapshot, &record, &preRoll, &postRoll)

	if err == pgx.ErrNoRows {
		return EffectiveRule{
			SnapshotEnabled: false,
			RecordEnabled:   true,
			PreRollSec:      10,
			PostRollSec:     20,
		}, nil
	}
	if err != nil {
		return EffectiveRule{}, fmt.Errorf("load tenant fallback: %w", err)
	}

	return EffectiveRule{
		SnapshotEnabled: snapshot,
		RecordEnabled:   record,
		PreRollSec:      preRoll,
		PostRollSec:     postRoll,
	}, nil
}
