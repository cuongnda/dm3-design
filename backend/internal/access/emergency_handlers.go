package access

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Plan types ─────────────────────────────────────────────────────────────

type emergencyPlan struct {
	ID               string    `json:"id"`
	TenantID         string    `json:"tenant_id"`
	Name             string    `json:"name"`
	Description      string    `json:"description"`
	Icon             string    `json:"icon"`
	Color            string    `json:"color"`
	Action           string    `json:"action"`      // unlock | lock | hold_open | hold_close
	TargetType       string    `json:"target_type"`  // all | zone | access_point | device
	TargetIDs        []string  `json:"target_ids"`
	CountdownSeconds int       `json:"countdown_seconds"`
	Enabled          bool      `json:"enabled"`
	SortOrder        int       `json:"sort_order"`
	CreatedBy        *string   `json:"created_by,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type emergencyIncident struct {
	ID               string     `json:"id"`
	TenantID         string     `json:"tenant_id"`
	Time             time.Time  `json:"time"`
	PlanID           string     `json:"plan_id"`
	PlanName         string     `json:"plan_name"`
	Action           string     `json:"action"`
	Status           string     `json:"status"` // active | all_clear | cancelled
	TriggeredBy      *string    `json:"triggered_by,omitempty"`
	TriggeredByEmail string     `json:"triggered_by_email"`
	AllClearBy       *string    `json:"all_clear_by,omitempty"`
	AllClearByEmail  string     `json:"all_clear_by_email"`
	ActivatedAt      time.Time  `json:"activated_at"`
	ResolvedAt       *time.Time `json:"resolved_at,omitempty"`
	DurationSeconds  *int       `json:"duration_seconds,omitempty"`
	TargetSummary    string     `json:"target_summary"`
	Notes            string     `json:"notes"`
}

// ─── List Plans ─────────────────────────────────────────────────────────────

func (h *AccessHandlers) ListEmergencyPlans(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, name, description, icon, color, action,
		        target_type, target_ids, countdown_seconds, enabled, sort_order,
		        created_by, created_at, updated_at
		   FROM dm3_access.emergency_plans
		  WHERE tenant_id = $1::uuid
		  ORDER BY sort_order, name`, cid)
	if err != nil {
		slog.Error("ListEmergencyPlans: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	plans := []emergencyPlan{}
	for rows.Next() {
		var p emergencyPlan
		if err := rows.Scan(&p.ID, &p.TenantID, &p.Name, &p.Description, &p.Icon, &p.Color,
			&p.Action, &p.TargetType, &p.TargetIDs, &p.CountdownSeconds, &p.Enabled,
			&p.SortOrder, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			slog.Error("ListEmergencyPlans: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		if p.TargetIDs == nil {
			p.TargetIDs = []string{}
		}
		plans = append(plans, p)
	}
	httputil.JSON(w, http.StatusOK, plans)
}

// ─── Create Plan ────────────────────────────────────────────────────────────

type createEmergencyPlanRequest struct {
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Icon             string   `json:"icon"`
	Color            string   `json:"color"`
	Action           string   `json:"action"`
	TargetType       string   `json:"target_type"`
	TargetIDs        []string `json:"target_ids"`
	CountdownSeconds *int     `json:"countdown_seconds"`
	Enabled          *bool    `json:"enabled"`
	SortOrder        *int     `json:"sort_order"`
}

func (h *AccessHandlers) CreateEmergencyPlan(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req createEmergencyPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Action == "" {
		req.Action = "unlock"
	}
	if req.TargetType == "" {
		req.TargetType = "all"
	}

	validActions := map[string]bool{"unlock": true, "lock": true, "hold_open": true, "hold_close": true}
	validTargets := map[string]bool{"all": true, "zone": true, "access_point": true, "device": true}
	if !validActions[req.Action] {
		httputil.Error(w, http.StatusBadRequest, "invalid action")
		return
	}
	if !validTargets[req.TargetType] {
		httputil.Error(w, http.StatusBadRequest, "invalid target_type")
		return
	}
	if req.TargetIDs == nil {
		req.TargetIDs = []string{}
	}
	if req.Icon == "" {
		req.Icon = "shield-alert"
	}
	if req.Color == "" {
		req.Color = "#EF4444"
	}
	countdown := 5
	if req.CountdownSeconds != nil {
		countdown = *req.CountdownSeconds
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	sortOrder := 0
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}

	actorID, _ := audit.ActorFromContext(r.Context())

	var p emergencyPlan
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.emergency_plans
		    (tenant_id, name, description, icon, color, action, target_type, target_ids,
		     countdown_seconds, enabled, sort_order, created_by)
		 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid)
		 RETURNING id, tenant_id, name, description, icon, color, action,
		           target_type, target_ids, countdown_seconds, enabled, sort_order,
		           created_by, created_at, updated_at`,
		cid, req.Name, req.Description, req.Icon, req.Color, req.Action,
		req.TargetType, req.TargetIDs, countdown, enabled, sortOrder, nullStr(actorID),
	).Scan(&p.ID, &p.TenantID, &p.Name, &p.Description, &p.Icon, &p.Color,
		&p.Action, &p.TargetType, &p.TargetIDs, &p.CountdownSeconds, &p.Enabled,
		&p.SortOrder, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		slog.Error("CreateEmergencyPlan: insert failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if p.TargetIDs == nil {
		p.TargetIDs = []string{}
	}
	h.audit.LogFromRequest(r, "emergency.plan.create", "emergency_plan", p.ID, p.Name, "success", nil, p)
	httputil.JSON(w, http.StatusCreated, p)
}

// ─── Update Plan ────────────────────────────────────────────────────────────

func (h *AccessHandlers) UpdateEmergencyPlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req createEmergencyPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	validActions := map[string]bool{"unlock": true, "lock": true, "hold_open": true, "hold_close": true}
	validTargets := map[string]bool{"all": true, "zone": true, "access_point": true, "device": true}
	if req.Action != "" && !validActions[req.Action] {
		httputil.Error(w, http.StatusBadRequest, "invalid action")
		return
	}
	if req.TargetType != "" && !validTargets[req.TargetType] {
		httputil.Error(w, http.StatusBadRequest, "invalid target_type")
		return
	}

	var p emergencyPlan
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.emergency_plans
		    SET name = COALESCE(NULLIF($2,''), name),
		        description = COALESCE($3, description),
		        icon = COALESCE(NULLIF($4,''), icon),
		        color = COALESCE(NULLIF($5,''), color),
		        action = COALESCE(NULLIF($6,''), action),
		        target_type = COALESCE(NULLIF($7,''), target_type),
		        target_ids = COALESCE($8, target_ids),
		        countdown_seconds = COALESCE($9, countdown_seconds),
		        enabled = COALESCE($10, enabled),
		        sort_order = COALESCE($11, sort_order),
		        updated_at = now()
		  WHERE id = $1::uuid AND tenant_id = $12::uuid
		  RETURNING id, tenant_id, name, description, icon, color, action,
		            target_type, target_ids, countdown_seconds, enabled, sort_order,
		            created_by, created_at, updated_at`,
		id, req.Name, req.Description, req.Icon, req.Color, req.Action,
		req.TargetType, req.TargetIDs, req.CountdownSeconds, req.Enabled, req.SortOrder, cid,
	).Scan(&p.ID, &p.TenantID, &p.Name, &p.Description, &p.Icon, &p.Color,
		&p.Action, &p.TargetType, &p.TargetIDs, &p.CountdownSeconds, &p.Enabled,
		&p.SortOrder, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "plan not found")
			return
		}
		slog.Error("UpdateEmergencyPlan: update failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if p.TargetIDs == nil {
		p.TargetIDs = []string{}
	}
	h.audit.LogFromRequest(r, "emergency.plan.update", "emergency_plan", p.ID, p.Name, "success", nil, p)
	httputil.JSON(w, http.StatusOK, p)
}

// ─── Delete Plan ────────────────────────────────────────────────────────────

func (h *AccessHandlers) DeleteEmergencyPlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_access.emergency_plans WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid)
	if err != nil {
		slog.Error("DeleteEmergencyPlan: delete failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "plan not found")
		return
	}
	h.audit.LogFromRequest(r, "emergency.plan.delete", "emergency_plan", id, "", "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ─── Activate (create incident) ─────────────────────────────────────────────

type activateEmergencyRequest struct {
	PlanID string `json:"plan_id"`
	Notes  string `json:"notes"`
}

// ActivateEmergency creates an incident record. The frontend calls the gateway's
// bulk door command separately to actually execute the action on devices.
func (h *AccessHandlers) ActivateEmergency(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req activateEmergencyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PlanID == "" {
		httputil.Error(w, http.StatusBadRequest, "plan_id is required")
		return
	}

	// Load the plan
	var plan emergencyPlan
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, name, action, target_type, target_ids
		   FROM dm3_access.emergency_plans
		  WHERE id = $1::uuid AND tenant_id = $2::uuid AND enabled = true`,
		req.PlanID, cid,
	).Scan(&plan.ID, &plan.TenantID, &plan.Name, &plan.Action, &plan.TargetType, &plan.TargetIDs)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "plan not found or disabled")
			return
		}
		slog.Error("ActivateEmergency: plan lookup failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Resolve target access point IDs for the door command
	var accessPointIDs []string
	switch plan.TargetType {
	case "all":
		rows, err := h.db.Pool.Query(r.Context(),
			`SELECT id::text FROM dm3_access.access_points WHERE tenant_id = $1::uuid`, cid)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var apID string
				_ = rows.Scan(&apID)
				accessPointIDs = append(accessPointIDs, apID)
			}
		}
	case "zone":
		if len(plan.TargetIDs) > 0 {
			rows, err := h.db.Pool.Query(r.Context(),
				`SELECT id::text FROM dm3_access.access_points
				  WHERE tenant_id = $1::uuid AND zone_id = ANY($2::uuid[])`, cid, plan.TargetIDs)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var apID string
					_ = rows.Scan(&apID)
					accessPointIDs = append(accessPointIDs, apID)
				}
			}
		}
	case "access_point":
		accessPointIDs = plan.TargetIDs
	case "device":
		// Resolve devices to access points
		if len(plan.TargetIDs) > 0 {
			rows, err := h.db.Pool.Query(r.Context(),
				`SELECT DISTINCT apd.access_point_id::text
				   FROM dm3_access.access_point_devices apd
				  WHERE apd.tenant_id = $1::uuid AND apd.access_device_id = ANY($2::text[])`, cid, plan.TargetIDs)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var apID string
					_ = rows.Scan(&apID)
					accessPointIDs = append(accessPointIDs, apID)
				}
			}
		}
	}

	targetSummary := fmt.Sprintf("%d access points, action: %s", len(accessPointIDs), plan.Action)

	actorID, actorEmail := audit.ActorFromContext(r.Context())

	var inc emergencyIncident
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_access.emergency_incidents
		    (tenant_id, plan_id, plan_name, action, status, triggered_by, triggered_by_email,
		     target_summary, notes, metadata)
		 VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5::uuid, $6, $7, $8, $9)
		 RETURNING id, tenant_id, time, plan_id, plan_name, action, status,
		           triggered_by, triggered_by_email, all_clear_by, COALESCE(all_clear_by_email,''),
		           activated_at, resolved_at, duration_seconds, target_summary, notes`,
		cid, plan.ID, plan.Name, plan.Action, nullStr(actorID), actorEmail,
		targetSummary, req.Notes,
		marshalJSON(map[string]any{"access_point_ids": accessPointIDs, "target_type": plan.TargetType, "target_ids": plan.TargetIDs}),
	).Scan(&inc.ID, &inc.TenantID, &inc.Time, &inc.PlanID, &inc.PlanName, &inc.Action, &inc.Status,
		&inc.TriggeredBy, &inc.TriggeredByEmail, &inc.AllClearBy, &inc.AllClearByEmail,
		&inc.ActivatedAt, &inc.ResolvedAt, &inc.DurationSeconds, &inc.TargetSummary, &inc.Notes)
	if err != nil {
		slog.Error("ActivateEmergency: insert incident failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.LogFromRequest(r, "emergency.activated", "emergency_incident", inc.ID, plan.Name, "success", nil,
		map[string]any{"plan_id": plan.ID, "action": plan.Action, "access_point_ids": accessPointIDs})

	httputil.JSON(w, http.StatusCreated, map[string]any{
		"incident":         inc,
		"access_point_ids": accessPointIDs,
		"action":           plan.Action,
	})
}

// ─── All Clear ──────────────────────────────────────────────────────────────

type allClearRequest struct {
	Notes string `json:"notes"`
}

func (h *AccessHandlers) AllClearEmergency(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req allClearRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	actorID, actorEmail := audit.ActorFromContext(r.Context())

	var inc emergencyIncident
	var metadataRaw []byte
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_access.emergency_incidents
		    SET status = 'all_clear',
		        all_clear_by = $3::uuid,
		        all_clear_by_email = $4,
		        resolved_at = now(),
		        duration_seconds = EXTRACT(EPOCH FROM (now() - activated_at))::int,
		        notes = CASE WHEN $5 = '' THEN notes ELSE notes || E'\n' || $5 END
		  WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'
		  RETURNING id, tenant_id, time, plan_id, plan_name, action, status,
		            triggered_by, COALESCE(triggered_by_email,''),
		            all_clear_by, COALESCE(all_clear_by_email,''),
		            activated_at, resolved_at, duration_seconds, target_summary, notes,
		            metadata`,
		id, cid, nullStr(actorID), actorEmail, req.Notes,
	).Scan(&inc.ID, &inc.TenantID, &inc.Time, &inc.PlanID, &inc.PlanName, &inc.Action, &inc.Status,
		&inc.TriggeredBy, &inc.TriggeredByEmail,
		&inc.AllClearBy, &inc.AllClearByEmail,
		&inc.ActivatedAt, &inc.ResolvedAt, &inc.DurationSeconds, &inc.TargetSummary, &inc.Notes,
		&metadataRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "no active incident found")
			return
		}
		slog.Error("AllClearEmergency: update failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Extract access_point_ids from stored metadata so frontend can send release command.
	var meta struct {
		AccessPointIDs []string `json:"access_point_ids"`
	}
	_ = json.Unmarshal(metadataRaw, &meta)

	h.audit.LogFromRequest(r, "emergency.all_clear", "emergency_incident", inc.ID, inc.PlanName, "success", nil, inc)
	httputil.JSON(w, http.StatusOK, map[string]any{
		"incident":         inc,
		"access_point_ids": meta.AccessPointIDs,
	})
}

// ─── List Incidents ─────────────────────────────────────────────────────────

func (h *AccessHandlers) ListEmergencyIncidents(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	page, limit := parsePagination(r)

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_access.emergency_incidents WHERE tenant_id = $1::uuid`, cid).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, time, plan_id, plan_name, action, status,
		        triggered_by, COALESCE(triggered_by_email,''),
		        all_clear_by, COALESCE(all_clear_by_email,''),
		        activated_at, resolved_at, duration_seconds, target_summary, notes
		   FROM dm3_access.emergency_incidents
		  WHERE tenant_id = $1::uuid
		  ORDER BY time DESC
		  LIMIT $2 OFFSET $3`, cid, limit, (page-1)*limit)
	if err != nil {
		slog.Error("ListEmergencyIncidents: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	incidents := []emergencyIncident{}
	for rows.Next() {
		var inc emergencyIncident
		if err := rows.Scan(&inc.ID, &inc.TenantID, &inc.Time, &inc.PlanID, &inc.PlanName,
			&inc.Action, &inc.Status,
			&inc.TriggeredBy, &inc.TriggeredByEmail,
			&inc.AllClearBy, &inc.AllClearByEmail,
			&inc.ActivatedAt, &inc.ResolvedAt, &inc.DurationSeconds,
			&inc.TargetSummary, &inc.Notes); err != nil {
			slog.Error("ListEmergencyIncidents: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		incidents = append(incidents, inc)
	}
	httputil.Paginated(w, incidents, total, page, limit)
}

// ─── Active Incidents ───────────────────────────────────────────────────────

func (h *AccessHandlers) ListActiveEmergencies(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, time, plan_id, plan_name, action, status,
		        triggered_by, COALESCE(triggered_by_email,''),
		        all_clear_by, COALESCE(all_clear_by_email,''),
		        activated_at, resolved_at, duration_seconds, target_summary, notes
		   FROM dm3_access.emergency_incidents
		  WHERE tenant_id = $1::uuid AND status = 'active'
		  ORDER BY time DESC`, cid)
	if err != nil {
		slog.Error("ListActiveEmergencies: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	incidents := []emergencyIncident{}
	for rows.Next() {
		var inc emergencyIncident
		if err := rows.Scan(&inc.ID, &inc.TenantID, &inc.Time, &inc.PlanID, &inc.PlanName,
			&inc.Action, &inc.Status,
			&inc.TriggeredBy, &inc.TriggeredByEmail,
			&inc.AllClearBy, &inc.AllClearByEmail,
			&inc.ActivatedAt, &inc.ResolvedAt, &inc.DurationSeconds,
			&inc.TargetSummary, &inc.Notes); err != nil {
			slog.Error("ListActiveEmergencies: scan failed", "error", err)
			continue
		}
		incidents = append(incidents, inc)
	}
	httputil.JSON(w, http.StatusOK, incidents)
}

// ─── helpers ────────────────────────────────────────────────────────────────

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func marshalJSON(v any) []byte {
	b, _ := json.Marshal(v)
	if b == nil {
		return []byte("{}")
	}
	return b
}
