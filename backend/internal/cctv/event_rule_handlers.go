package cctv

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Event rule handlers ──────────────────────────────────────────────────
//
// Rules live in dm3_cctv.event_rules and are consulted by the access event
// consumer on every access.log event. See rule_resolver.go for precedence.
// TODO(refactor): move these into a dedicated EventRulesHandlers struct once
// the handler surface grows further; for now they hang off CCTVHandlers to
// keep the wiring minimal.

var validRuleScopes = map[string]struct{}{
	"tenant":       {},
	"access_point": {},
	"camera":       {},
}

// Canonical decision / event-type vocabularies. Empty arrays in the DB mean
// "match any" so we only validate presence, not whitelist membership — that
// way new decision types from access-svc don't require a cctv-svc deploy.
//
// TODO(refactor): expose these via a read-only /vocab endpoint so the UI
// multi-select can populate options without duplicating the list in JS.

// ListEventRules handles GET /event-rules.
func (h *CCTVHandlers) ListEventRules(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id::text, tenant_id::text, scope_kind,
		       access_point_id::text, camera_device_id::text,
		       decisions, event_types,
		       snapshot_enabled, record_enabled,
		       pre_roll_sec, post_roll_sec,
		       priority, enabled, notes,
		       created_at, updated_at
		  FROM dm3_cctv.event_rules
		 WHERE tenant_id = $1::uuid
		 ORDER BY
		   CASE scope_kind WHEN 'camera' THEN 1 WHEN 'access_point' THEN 2 ELSE 3 END,
		   priority ASC, created_at ASC`,
		cid,
	)
	if err != nil {
		logInternalError(w, "list event rules", err)
		return
	}
	defer rows.Close()

	out := make([]EventRule, 0, 32)
	for rows.Next() {
		var (
			rule   EventRule
			apID   *string
			camID  *string
			notes  *string
		)
		if err := rows.Scan(
			&rule.ID, &rule.TenantID, &rule.ScopeKind,
			&apID, &camID,
			&rule.Decisions, &rule.EventTypes,
			&rule.SnapshotEnabled, &rule.RecordEnabled,
			&rule.PreRollSec, &rule.PostRollSec,
			&rule.Priority, &rule.Enabled, &notes,
			&rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			logInternalError(w, "scan event rule", err)
			return
		}
		rule.AccessPointID = apID
		rule.CameraDeviceID = camID
		rule.Notes = notes
		out = append(out, rule)
	}
	httputil.JSON(w, http.StatusOK, out)
}

// eventRuleInput is the shared DTO for create + update requests. Pointers on
// optional fields let PATCH-ish semantics work (nil = don't change on update);
// creates require scope_kind and the corresponding *_id as per migration 000048.
type eventRuleInput struct {
	ScopeKind       string   `json:"scope_kind"`
	AccessPointID   *string  `json:"access_point_id"`
	CameraDeviceID  *string  `json:"camera_device_id"`
	Decisions       []string `json:"decisions"`
	EventTypes      []string `json:"event_types"`
	SnapshotEnabled *bool    `json:"snapshot_enabled"`
	RecordEnabled   *bool    `json:"record_enabled"`
	PreRollSec      *int     `json:"pre_roll_sec"`
	PostRollSec     *int     `json:"post_roll_sec"`
	Priority        *int     `json:"priority"`
	Enabled         *bool    `json:"enabled"`
	Notes           *string  `json:"notes"`
}

// CreateEventRule handles POST /event-rules.
func (h *CCTVHandlers) CreateEventRule(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	var in eventRuleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateRuleScope(in); err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Defaults for create. Pointer fields here double as nil-means-default.
	snapshot := true
	record := true
	preRoll := 10
	postRoll := 20
	priority := 1000
	enabled := true
	if in.SnapshotEnabled != nil {
		snapshot = *in.SnapshotEnabled
	}
	if in.RecordEnabled != nil {
		record = *in.RecordEnabled
	}
	if in.PreRollSec != nil {
		preRoll = *in.PreRollSec
	}
	if in.PostRollSec != nil {
		postRoll = *in.PostRollSec
	}
	if in.Priority != nil {
		priority = *in.Priority
	}
	if in.Enabled != nil {
		enabled = *in.Enabled
	}

	decisions := nonNilStringSlice(in.Decisions)
	eventTypes := nonNilStringSlice(in.EventTypes)

	if err := h.verifyRuleScopeRefs(r.Context(), cid, in); err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_cctv.event_rules
		  (tenant_id, scope_kind, access_point_id, camera_device_id,
		   decisions, event_types,
		   snapshot_enabled, record_enabled,
		   pre_roll_sec, post_roll_sec,
		   priority, enabled, notes)
		VALUES ($1::uuid, $2, $3::uuid, $4::uuid,
		        $5::text[], $6::text[],
		        $7, $8, $9, $10, $11, $12, $13)
		RETURNING id::text`,
		cid, in.ScopeKind, in.AccessPointID, in.CameraDeviceID,
		decisions, eventTypes,
		snapshot, record, preRoll, postRoll,
		priority, enabled, in.Notes,
	).Scan(&id)
	if err != nil {
		logInternalError(w, "insert event rule", err)
		return
	}

	h.respondOneEventRule(w, r.Context(), cid, id)
}

// UpdateEventRule handles PUT /event-rules/{id}.
// Partial updates: only fields present in the payload are changed.
func (h *CCTVHandlers) UpdateEventRule(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	var in eventRuleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Load existing row first so we can fill defaults for unset fields. This
	// is a little chattier than a dynamic SQL builder but keeps the intent
	// explicit and avoids SQL-injection footguns on column lists.
	var existing EventRule
	var notes *string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id::text, scope_kind, access_point_id::text, camera_device_id::text,
		       decisions, event_types,
		       snapshot_enabled, record_enabled,
		       pre_roll_sec, post_roll_sec, priority, enabled, notes
		  FROM dm3_cctv.event_rules
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(
		&existing.ID, &existing.ScopeKind,
		&existing.AccessPointID, &existing.CameraDeviceID,
		&existing.Decisions, &existing.EventTypes,
		&existing.SnapshotEnabled, &existing.RecordEnabled,
		&existing.PreRollSec, &existing.PostRollSec,
		&existing.Priority, &existing.Enabled, &notes,
	)
	if err == pgx.ErrNoRows {
		httputil.Error(w, http.StatusNotFound, "rule not found")
		return
	}
	if err != nil {
		logInternalError(w, "load event rule", err)
		return
	}
	existing.Notes = notes

	// Apply changes from request, keep everything else.
	if in.ScopeKind != "" {
		existing.ScopeKind = in.ScopeKind
	}
	if in.AccessPointID != nil {
		existing.AccessPointID = in.AccessPointID
	}
	if in.CameraDeviceID != nil {
		existing.CameraDeviceID = in.CameraDeviceID
	}
	if in.Decisions != nil {
		existing.Decisions = nonNilStringSlice(in.Decisions)
	}
	if in.EventTypes != nil {
		existing.EventTypes = nonNilStringSlice(in.EventTypes)
	}
	if in.SnapshotEnabled != nil {
		existing.SnapshotEnabled = *in.SnapshotEnabled
	}
	if in.RecordEnabled != nil {
		existing.RecordEnabled = *in.RecordEnabled
	}
	if in.PreRollSec != nil {
		existing.PreRollSec = *in.PreRollSec
	}
	if in.PostRollSec != nil {
		existing.PostRollSec = *in.PostRollSec
	}
	if in.Priority != nil {
		existing.Priority = *in.Priority
	}
	if in.Enabled != nil {
		existing.Enabled = *in.Enabled
	}
	if in.Notes != nil {
		existing.Notes = in.Notes
	}

	// Normalize the FK fields based on the final scope. JSON `null` and field
	// absence both unmarshal to nil pointer, so a client that switches scope
	// (sending e.g. `{"scope_kind":"access_point","camera_device_id":null}`)
	// relies on us clearing the unrelated FK — otherwise we'd keep the old
	// camera_device_id and fail validation.
	switch existing.ScopeKind {
	case "tenant":
		existing.AccessPointID = nil
		existing.CameraDeviceID = nil
	case "access_point":
		existing.CameraDeviceID = nil
	case "camera":
		existing.AccessPointID = nil
	}

	// Re-validate the merged state so we can't sneak inconsistent scope through an update.
	if err := validateRuleScope(eventRuleInput{
		ScopeKind:      existing.ScopeKind,
		AccessPointID:  existing.AccessPointID,
		CameraDeviceID: existing.CameraDeviceID,
	}); err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.verifyRuleScopeRefs(r.Context(), cid, eventRuleInput{
		ScopeKind:      existing.ScopeKind,
		AccessPointID:  existing.AccessPointID,
		CameraDeviceID: existing.CameraDeviceID,
	}); err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_cctv.event_rules
		   SET scope_kind = $3, access_point_id = $4::uuid, camera_device_id = $5::uuid,
		       decisions = $6::text[], event_types = $7::text[],
		       snapshot_enabled = $8, record_enabled = $9,
		       pre_roll_sec = $10, post_roll_sec = $11,
		       priority = $12, enabled = $13, notes = $14,
		       updated_at = now()
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid, existing.ScopeKind, existing.AccessPointID, existing.CameraDeviceID,
		existing.Decisions, existing.EventTypes,
		existing.SnapshotEnabled, existing.RecordEnabled,
		existing.PreRollSec, existing.PostRollSec,
		existing.Priority, existing.Enabled, existing.Notes,
	)
	if err != nil {
		logInternalError(w, "update event rule", err)
		return
	}

	h.respondOneEventRule(w, r.Context(), cid, id)
}

// DeleteEventRule handles DELETE /event-rules/{id}.
func (h *CCTVHandlers) DeleteEventRule(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_cctv.event_rules WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil {
		logInternalError(w, "delete event rule", err)
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "rule not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── helpers ──────────────────────────────────────────────────────────────

func (h *CCTVHandlers) respondOneEventRule(w http.ResponseWriter, ctx context.Context, tenantID, id string) {
	var rule EventRule
	var apID, camID, notes *string
	err := h.db.Pool.QueryRow(ctx, `
		SELECT id::text, tenant_id::text, scope_kind,
		       access_point_id::text, camera_device_id::text,
		       decisions, event_types,
		       snapshot_enabled, record_enabled,
		       pre_roll_sec, post_roll_sec,
		       priority, enabled, notes,
		       created_at, updated_at
		  FROM dm3_cctv.event_rules
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, tenantID,
	).Scan(
		&rule.ID, &rule.TenantID, &rule.ScopeKind,
		&apID, &camID,
		&rule.Decisions, &rule.EventTypes,
		&rule.SnapshotEnabled, &rule.RecordEnabled,
		&rule.PreRollSec, &rule.PostRollSec,
		&rule.Priority, &rule.Enabled, &notes,
		&rule.CreatedAt, &rule.UpdatedAt,
	)
	if err != nil {
		logInternalError(w, "reload event rule", err)
		return
	}
	rule.AccessPointID = apID
	rule.CameraDeviceID = camID
	rule.Notes = notes
	httputil.JSON(w, http.StatusOK, rule)
}

func validateRuleScope(in eventRuleInput) error {
	scope := strings.TrimSpace(in.ScopeKind)
	if _, ok := validRuleScopes[scope]; !ok {
		return fmt.Errorf("invalid scope_kind %q; expected one of: tenant, access_point, camera", in.ScopeKind)
	}
	switch scope {
	case "tenant":
		if in.AccessPointID != nil && *in.AccessPointID != "" {
			return fmt.Errorf("access_point_id must be null when scope_kind=tenant")
		}
		if in.CameraDeviceID != nil && *in.CameraDeviceID != "" {
			return fmt.Errorf("camera_device_id must be null when scope_kind=tenant")
		}
	case "access_point":
		if in.AccessPointID == nil || *in.AccessPointID == "" {
			return fmt.Errorf("access_point_id is required when scope_kind=access_point")
		}
		if in.CameraDeviceID != nil && *in.CameraDeviceID != "" {
			return fmt.Errorf("camera_device_id must be null when scope_kind=access_point")
		}
	case "camera":
		if in.CameraDeviceID == nil || *in.CameraDeviceID == "" {
			return fmt.Errorf("camera_device_id is required when scope_kind=camera")
		}
	}
	if in.PreRollSec != nil && (*in.PreRollSec < 0 || *in.PreRollSec > 120) {
		return fmt.Errorf("pre_roll_sec must be 0..120")
	}
	if in.PostRollSec != nil && (*in.PostRollSec < 0 || *in.PostRollSec > 300) {
		return fmt.Errorf("post_roll_sec must be 0..300")
	}
	return nil
}

// verifyRuleScopeRefs ensures referenced access_point / camera belong to the
// tenant. Cheap 2s queries — runs on create and update where scope changes.
func (h *CCTVHandlers) verifyRuleScopeRefs(ctx context.Context, tenantID string, in eventRuleInput) error {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if in.AccessPointID != nil && *in.AccessPointID != "" {
		var exists bool
		if err := h.db.Pool.QueryRow(lookupCtx,
			`SELECT EXISTS(SELECT 1 FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid)`,
			*in.AccessPointID, tenantID,
		).Scan(&exists); err != nil {
			return fmt.Errorf("lookup access_point: %w", err)
		}
		if !exists {
			return fmt.Errorf("access_point_id not found in tenant")
		}
	}
	if in.CameraDeviceID != nil && *in.CameraDeviceID != "" {
		var exists bool
		if err := h.db.Pool.QueryRow(lookupCtx,
			`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
			*in.CameraDeviceID, tenantID,
		).Scan(&exists); err != nil {
			return fmt.Errorf("lookup camera: %w", err)
		}
		if !exists {
			return fmt.Errorf("camera_device_id not found in tenant")
		}
	}
	return nil
}

// nonNilStringSlice returns an empty slice instead of nil so pgx marshals it
// as text[] '{}' (not NULL). Avoids the "NULL vs empty array" trap in our
// cardinality() filters.
func nonNilStringSlice(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}
