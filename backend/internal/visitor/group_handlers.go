package visitor

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Visit Group CRUD ───────────────────────────────────────────────────────

type createGroupRequest struct {
	Name              string     `json:"name"`
	Description       *string    `json:"description"`
	HostUserID        string     `json:"host_user_id"`
	Purpose           string     `json:"purpose"`
	ExpectedArrival   time.Time  `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure"`
	AccessAreas       []string   `json:"access_areas"`
	EscortRequired    bool       `json:"escort_required"`
}

// ListGroups lists all visit groups for the tenant.
func (h *VisitorHandlers) ListVisitGroups(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_identity.visit_groups WHERE tenant_id = $1::uuid`, cid).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT g.id, g.tenant_id, g.name, g.description, g.host_user_id,
		       g.purpose, g.expected_arrival, g.expected_departure,
		       g.access_areas, g.escort_required, g.created_by,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM dm3_identity.visits v WHERE v.group_id = g.id)
		FROM dm3_identity.visit_groups g
		WHERE g.tenant_id = $1::uuid
		ORDER BY g.expected_arrival DESC
		LIMIT $2 OFFSET $3`, cid, limit, offset)
	if err != nil {
		slog.Error("list visit groups error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	groups := []models.VisitGroup{}
	for rows.Next() {
		var g models.VisitGroup
		if err := rows.Scan(
			&g.ID, &g.TenantID, &g.Name, &g.Description, &g.HostUserID,
			&g.Purpose, &g.ExpectedArrival, &g.ExpectedDeparture,
			&g.AccessAreas, &g.EscortRequired, &g.CreatedBy,
			&g.CreatedAt, &g.UpdatedAt, &g.MemberCount,
		); err != nil {
			slog.Error("scan visit group error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, groups, total, page, limit)
}

// GetVisitGroup returns a single visit group with its member visits.
func (h *VisitorHandlers) GetVisitGroup(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	groupID := chi.URLParam(r, "group_id")

	var g models.VisitGroup
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT g.id, g.tenant_id, g.name, g.description, g.host_user_id,
		       g.purpose, g.expected_arrival, g.expected_departure,
		       g.access_areas, g.escort_required, g.created_by,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM dm3_identity.visits v WHERE v.group_id = g.id)
		FROM dm3_identity.visit_groups g
		WHERE g.id = $1::uuid AND g.tenant_id = $2::uuid`, groupID, cid).Scan(
		&g.ID, &g.TenantID, &g.Name, &g.Description, &g.HostUserID,
		&g.Purpose, &g.ExpectedArrival, &g.ExpectedDeparture,
		&g.AccessAreas, &g.EscortRequired, &g.CreatedBy,
		&g.CreatedAt, &g.UpdatedAt, &g.MemberCount,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit group not found")
		return
	}
	httputil.JSON(w, http.StatusOK, g)
}

// CreateVisitGroup creates a new visit group.
func (h *VisitorHandlers) CreateVisitGroup(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.HostUserID == "" || req.Purpose == "" || req.ExpectedArrival.IsZero() {
		httputil.Error(w, http.StatusBadRequest, "name, host_user_id, purpose, and expected_arrival are required")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	createdBy := ""
	if claims != nil {
		createdBy = claims.Sub
	}

	var g models.VisitGroup
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.visit_groups
		  (tenant_id, name, description, host_user_id, purpose,
		   expected_arrival, expected_departure, access_areas, escort_required, created_by)
		VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8::uuid[], $9, $10::uuid)
		RETURNING id, tenant_id, name, description, host_user_id, purpose,
		          expected_arrival, expected_departure, access_areas, escort_required,
		          created_by, created_at, updated_at`,
		cid, req.Name, req.Description, req.HostUserID, req.Purpose,
		req.ExpectedArrival, req.ExpectedDeparture, req.AccessAreas, req.EscortRequired, createdBy,
	).Scan(
		&g.ID, &g.TenantID, &g.Name, &g.Description, &g.HostUserID, &g.Purpose,
		&g.ExpectedArrival, &g.ExpectedDeparture, &g.AccessAreas, &g.EscortRequired,
		&g.CreatedBy, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		slog.Error("create visit group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit_group.created", "visit_group", g.ID, g.Name, "success", nil, g)
	}
	httputil.JSON(w, http.StatusCreated, g)
}

// DeleteVisitGroup deletes a visit group (only if no visits are linked).
func (h *VisitorHandlers) DeleteVisitGroup(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	groupID := chi.URLParam(r, "group_id")

	var memberCount int
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_identity.visits WHERE group_id = $1::uuid AND tenant_id = $2::uuid`,
		groupID, cid).Scan(&memberCount)
	if memberCount > 0 {
		httputil.Error(w, http.StatusConflict, fmt.Sprintf("cannot delete group with %d linked visits", memberCount))
		return
	}

	cmd, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.visit_groups WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		groupID, cid)
	if err != nil || cmd.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "visit group not found")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit_group.deleted", "visit_group", groupID, "", "success", nil, nil)
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ─── Batch Visit Registration ───────────────────────────────────────────────

type batchVisitorEntry struct {
	FirstName string  `json:"first_name"`
	LastName  string  `json:"last_name"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Company   *string `json:"company"`
}

type batchCreateRequest struct {
	GroupID  string              `json:"group_id"`
	Visitors []batchVisitorEntry `json:"visitors"`
}

type batchCreateResult struct {
	Created int            `json:"created"`
	Failed  int            `json:"failed"`
	Visits  []models.Visit `json:"visits"`
	Errors  []string       `json:"errors,omitempty"`
}

// BatchCreateVisits creates multiple visits at once, optionally linked to a group.
// POST /api/v1/visitors/batch
func (h *VisitorHandlers) BatchCreateVisits(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req batchCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Visitors) == 0 {
		httputil.Error(w, http.StatusBadRequest, "visitors array is required")
		return
	}
	if len(req.Visitors) > 100 {
		httputil.Error(w, http.StatusBadRequest, "maximum 100 visitors per batch")
		return
	}

	// Load group details (required for batch)
	if req.GroupID == "" {
		httputil.Error(w, http.StatusBadRequest, "group_id is required for batch creation")
		return
	}
	var group models.VisitGroup
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, tenant_id, host_user_id, purpose, expected_arrival, expected_departure,
		       access_areas, escort_required
		FROM dm3_identity.visit_groups
		WHERE id = $1::uuid AND tenant_id = $2::uuid`, req.GroupID, cid).Scan(
		&group.ID, &group.TenantID, &group.HostUserID, &group.Purpose,
		&group.ExpectedArrival, &group.ExpectedDeparture, &group.AccessAreas, &group.EscortRequired,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit group not found")
		return
	}

	// Load settings for QR validity and auto-approve
	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("load visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to load visitor settings")
		return
	}

	initialStatus := models.VisitStatusPreRegistered
	if !settings.ApprovalRequired {
		initialStatus = models.VisitStatusApproved
	}
	isAutoApproved := initialStatus == models.VisitStatusApproved
	qrValidityDuration := time.Duration(settings.QRValidityAfterHours) * time.Hour

	result := batchCreateResult{Visits: []models.Visit{}}

	for _, v := range req.Visitors {
		if v.FirstName == "" || v.LastName == "" {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("missing name for visitor: %s %s", v.FirstName, v.LastName))
			continue
		}

		visitorID, _, err := h.upsertVisitor(r, cid, v.FirstName, v.LastName, v.Email, v.Phone, v.Company)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("upsert failed for %s %s: %v", v.FirstName, v.LastName, err))
			continue
		}

		// Check auto-approve for returning/VIP visitors
		status := initialStatus
		if settings.ApprovalRequired {
			var watchlistStatus string
			var visitCount int
			if err := h.db.Pool.QueryRow(r.Context(),
				`SELECT watchlist_status, visit_count FROM dm3_identity.visitors WHERE id = $1::uuid`,
				visitorID).Scan(&watchlistStatus, &visitCount); err == nil {
				if settings.AutoApproveVIP && watchlistStatus == models.WatchlistVIP {
					status = models.VisitStatusApproved
				} else if settings.AutoApproveReturning && visitCount > 1 {
					status = models.VisitStatusApproved
				}
			}
		}
		approved := status == models.VisitStatusApproved

		qrToken, err := generateQRToken()
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("QR generation failed for %s %s", v.FirstName, v.LastName))
			continue
		}
		qrExpiresAt := group.ExpectedArrival.Add(qrValidityDuration)

		var visit models.Visit
		err = h.db.Pool.QueryRow(r.Context(), `
			INSERT INTO dm3_identity.visits
			  (tenant_id, visitor_id, host_user_id, purpose,
			   status, expected_arrival, expected_departure,
			   qr_token, qr_expires_at, access_areas, escort_required,
			   group_id, host_approved, host_approved_at)
			VALUES
			  ($1::uuid, $2::uuid, $3::uuid, $4,
			   $5, $6, $7,
			   $8, $9, $10::uuid[], $11,
			   $12::uuid, $13, CASE WHEN $13 THEN now() ELSE NULL END)
			RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
			          status, expected_arrival, expected_departure,
			          actual_checkin, actual_checkout,
			          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
			          qr_token, qr_expires_at, badge_number, temp_credential_id,
			          access_areas, escort_required, vehicle_plate, items_carried,
			          nda_signed, host_approved, host_approved_at, notes,
			          created_at, updated_at`,
			cid, visitorID, group.HostUserID, group.Purpose,
			status, group.ExpectedArrival, group.ExpectedDeparture,
			qrToken, qrExpiresAt, group.AccessAreas, group.EscortRequired,
			group.ID, approved,
		).Scan(
			&visit.ID, &visit.TenantID, &visit.VisitorID, &visit.HostUserID,
			&visit.Purpose, &visit.PurposeNote, &visit.Status,
			&visit.ExpectedArrival, &visit.ExpectedDeparture,
			&visit.ActualCheckin, &visit.ActualCheckout,
			&visit.CheckinMethod, &visit.CheckinDeviceID, &visit.CheckinPhotoRef, &visit.CheckoutBy,
			&visit.QRToken, &visit.QRExpiresAt, &visit.BadgeNumber, &visit.TempCredentialID,
			&visit.AccessAreas, &visit.EscortRequired, &visit.VehiclePlate, &visit.ItemsCarried,
			&visit.NDASigned, &visit.HostApproved, &visit.HostApprovedAt, &visit.Notes,
			&visit.CreatedAt, &visit.UpdatedAt,
		)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("insert failed for %s %s: %v", v.FirstName, v.LastName, err))
			continue
		}

		result.Created++
		result.Visits = append(result.Visits, visit)
	}

	if h.audit != nil {
		h.audit.Log(audit.Entry{
			TenantID:   cid,
			Service:    "visitor-svc",
			Action:     "visit_group.batch_created",
			EntityType: "visit_group",
			EntityID:   group.ID,
			Status:     "success",
			NewValues: map[string]any{
				"group_id":      group.ID,
				"created":       result.Created,
				"failed":        result.Failed,
				"auto_approved": isAutoApproved,
			},
		})
	}

	status := http.StatusCreated
	if result.Failed > 0 && result.Created == 0 {
		status = http.StatusBadRequest
	} else if result.Failed > 0 {
		status = http.StatusMultiStatus
	}
	httputil.JSON(w, status, result)
}
