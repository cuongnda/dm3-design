package visitor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/email"
	"github.com/duali/dm3-backend/pkg/httputil"
)

func (h *VisitorHandlers) ListVisits(w http.ResponseWriter, r *http.Request) {
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

	where := "WHERE v.tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if s := r.URL.Query().Get("status"); s != "" {
		where += fmt.Sprintf(" AND v.status = $%d", idx)
		args = append(args, s)
		idx++
	}
	if d := r.URL.Query().Get("date"); d != "" {
		where += fmt.Sprintf(" AND v.expected_arrival::date = $%d::date", idx)
		args = append(args, d)
		idx++
	}
	if hid := r.URL.Query().Get("host_id"); hid != "" {
		where += fmt.Sprintf(" AND v.host_user_id = $%d::uuid", idx)
		args = append(args, hid)
		idx++
	}
	if q := strings.TrimSpace(r.URL.Query().Get("search")); q != "" {
		where += fmt.Sprintf(" AND (vis.first_name ILIKE $%d OR vis.last_name ILIKE $%d OR COALESCE(vis.company,'') ILIKE $%d OR COALESCE(vis.phone,'') ILIKE $%d OR COALESCE(vis.email,'') ILIKE $%d)", idx, idx, idx, idx, idx)
		args = append(args, "%"+q+"%")
		idx++
	}

	countArgs := append([]any(nil), args...)
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_visitor.visits v JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id `+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT v.id, v.tenant_id, v.visitor_id, v.host_user_id, v.purpose, v.purpose_note,
		       v.status, v.expected_arrival, v.expected_departure,
		       v.actual_checkin, v.actual_checkout,
		       v.checkin_method, v.checkin_device_id, v.checkin_photo_ref, v.checkout_by,
		       v.qr_token, v.qr_expires_at, v.badge_number, v.temp_credential_id,
		       v.access_areas, v.escort_required, v.vehicle_plate, v.items_carried,
		       v.nda_signed, v.host_approved, v.host_approved_at, v.notes,
		       v.created_at, v.updated_at,
		       vis.id, vis.tenant_id, vis.first_name, vis.last_name, vis.display_name,
		       vis.email, vis.phone, vis.company, vis.national_id, vis.photo_ref,
		       vis.watchlist_status, vis.watchlist_reason, vis.visit_count, vis.last_visit_at,
		       vis.created_at, vis.updated_at
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
		%s
		ORDER BY v.expected_arrival DESC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list visits query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	visits := []Visit{}
	for rows.Next() {
		v, err := scanVisit(rows)
		if err != nil {
			slog.Error("list visits scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		if h.cache != nil {
			if host := h.cache.GetUser(r.Context(), v.HostUserID); host != nil {
				v.Host = &VisitHost{ID: host.ID, Name: host.Name, Department: host.Department}
			}
		}
		visits = append(visits, v)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, visits, total, page, limit)
}

func (h *VisitorHandlers) GetVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := visitIDParam(r)

	row := h.db.Pool.QueryRow(r.Context(), `
		SELECT v.id, v.tenant_id, v.visitor_id, v.host_user_id, v.purpose, v.purpose_note,
		       v.status, v.expected_arrival, v.expected_departure,
		       v.actual_checkin, v.actual_checkout,
		       v.checkin_method, v.checkin_device_id, v.checkin_photo_ref, v.checkout_by,
		       v.qr_token, v.qr_expires_at, v.badge_number, v.temp_credential_id,
		       v.access_areas, v.escort_required, v.vehicle_plate, v.items_carried,
		       v.nda_signed, v.host_approved, v.host_approved_at, v.notes,
		       v.created_at, v.updated_at,
		       vis.id, vis.tenant_id, vis.first_name, vis.last_name, vis.display_name,
		       vis.email, vis.phone, vis.company, vis.national_id, vis.photo_ref,
		       vis.watchlist_status, vis.watchlist_reason, vis.visit_count, vis.last_visit_at,
		       vis.created_at, vis.updated_at
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
		WHERE v.id = $1::uuid AND v.tenant_id = $2::uuid`, id, cid)

	visit, err := scanVisit(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if h.cache != nil {
		if host := h.cache.GetUser(r.Context(), visit.HostUserID); host != nil {
			visit.Host = &VisitHost{ID: host.ID, Name: host.Name, Department: host.Department}
		}
	}
	// Fallback: query host directly if cache miss or cache unavailable
	if visit.Host == nil && visit.HostUserID != "" {
		var host VisitHost
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT u.id, COALESCE(u.first_name || ' ' || u.last_name, ''), COALESCE(d.name, '')
			 FROM dm3_identity.users u
			 LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
			 WHERE u.id = $1::uuid AND u.tenant_id = $2::uuid`,
			visit.HostUserID, cid).Scan(&host.ID, &host.Name, &host.Department)
		if err == nil {
			visit.Host = &host
		}
	}
	httputil.JSON(w, http.StatusOK, visit)
}

type createVisitRequest struct {
	Visitor struct {
		FirstName string  `json:"first_name"`
		LastName  string  `json:"last_name"`
		Email     *string `json:"email"`
		Phone     *string `json:"phone"`
		Company   *string `json:"company"`
	} `json:"visitor"`
	HostUserID        string     `json:"host_user_id"`
	Purpose           string     `json:"purpose"`
	PurposeNote       *string    `json:"purpose_note"`
	ExpectedArrival   time.Time  `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure"`
	AccessAreas       []string   `json:"access_areas"`
	EscortRequired    bool       `json:"escort_required"`
	VehiclePlate      *string    `json:"vehicle_plate"`
}

func (h *VisitorHandlers) CreateVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req createVisitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Visitor.FirstName == "" || req.Visitor.LastName == "" {
		httputil.Error(w, http.StatusBadRequest, "visitor first_name and last_name are required")
		return
	}
	if req.HostUserID == "" || req.Purpose == "" || req.ExpectedArrival.IsZero() {
		httputil.Error(w, http.StatusBadRequest, "host_user_id, purpose, and expected_arrival are required")
		return
	}
	if !isValidVisitPurpose(req.Purpose) {
		httputil.Error(w, http.StatusBadRequest, "invalid purpose")
		return
	}
	if !h.hostExists(r, cid, req.HostUserID) {
		httputil.Error(w, http.StatusBadRequest, "host_user_id does not reference an active host")
		return
	}

	// Load tenant visitor settings for validation and auto-approve rules
	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("load visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to load visitor settings")
		return
	}

	// Validate required fields from settings
	if settings.RequireEmail && (req.Visitor.Email == nil || *req.Visitor.Email == "") {
		httputil.Error(w, http.StatusBadRequest, "visitor email is required by tenant settings")
		return
	}
	if settings.RequirePhone && (req.Visitor.Phone == nil || *req.Visitor.Phone == "") {
		httputil.Error(w, http.StatusBadRequest, "visitor phone is required by tenant settings")
		return
	}
	if settings.RequireCompany && (req.Visitor.Company == nil || *req.Visitor.Company == "") {
		httputil.Error(w, http.StatusBadRequest, "visitor company is required by tenant settings")
		return
	}

	// Validate purpose against allowed list
	if len(settings.AllowedPurposes) > 0 {
		purposeAllowed := false
		for _, p := range settings.AllowedPurposes {
			if p == req.Purpose {
				purposeAllowed = true
				break
			}
		}
		if !purposeAllowed {
			httputil.Error(w, http.StatusBadRequest, "purpose not allowed by tenant settings")
			return
		}
	}

	visitorID, visitorName, err := h.upsertVisitor(r, cid, req.Visitor.FirstName, req.Visitor.LastName, req.Visitor.Email, req.Visitor.Phone, req.Visitor.Company)
	if err != nil {
		slog.Error("upsert visitor error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Determine initial visit status based on approval settings
	initialStatus := VisitStatusPreRegistered
	if !settings.ApprovalRequired {
		initialStatus = VisitStatusApproved
	} else {
		var watchlistStatus string
		var visitCount int
		if err := h.db.Pool.QueryRow(r.Context(),
			`SELECT watchlist_status, visit_count FROM dm3_visitor.visitors WHERE id = $1::uuid`,
			visitorID).Scan(&watchlistStatus, &visitCount); err == nil {
			if settings.AutoApproveVIP && watchlistStatus == WatchlistVIP {
				initialStatus = VisitStatusApproved
			} else if settings.AutoApproveReturning && visitCount > 1 {
				initialStatus = VisitStatusApproved
			}
		}
	}

	qrToken, err := generateQRToken()
	if err != nil {
		slog.Error("generate qr token error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	qrExpiresAt := req.ExpectedArrival.Add(time.Duration(settings.QRValidityAfterHours) * time.Hour)

	isAutoApproved := initialStatus == VisitStatusApproved

	var visit Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.visits
		  (tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		   status, expected_arrival, expected_departure,
		   qr_token, qr_expires_at, access_areas, escort_required, vehicle_plate,
		   host_approved, host_approved_at)
		VALUES
		  ($1::uuid, $2::uuid, $3::uuid, $4, $5,
		   $6, $7, $8,
		   $9, $10, $11::uuid[], $12, $13,
		   $14, CASE WHEN $14 THEN now() ELSE NULL END)
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		cid, visitorID, req.HostUserID, req.Purpose, req.PurposeNote,
		initialStatus, req.ExpectedArrival, req.ExpectedDeparture,
		qrToken, qrExpiresAt, req.AccessAreas, req.EscortRequired, req.VehiclePlate,
		isAutoApproved,
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
		slog.Error("create visit error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		auditAction := "visit.pre_registered"
		if initialStatus == VisitStatusApproved {
			auditAction = "visit.auto_approved"
		}
		h.audit.LogFromRequest(r, auditAction, "visit", visit.ID, visitorName, "success", nil, visit)
	}

	// Send invitation email to visitor (async, don't block the response).
	if h.email != nil && req.Visitor.Email != nil && *req.Visitor.Email != "" {
		go h.sendVisitorInvitationEmail(cid, *req.Visitor.Email, visitorName, req.HostUserID, req.Purpose, req.ExpectedArrival, qrToken)
	}

	h.publishEvent(r.Context(), cid, EventVisitCreated, map[string]any{
		"visit_id": visit.ID, "visitor_id": visit.VisitorID, "host_user_id": visit.HostUserID,
		"status": visit.Status, "expected_arrival": visit.ExpectedArrival,
	})
	httputil.JSON(w, http.StatusCreated, visit)
}

type updateVisitRequest struct {
	Purpose           *string    `json:"purpose"`
	PurposeNote       *string    `json:"purpose_note"`
	ExpectedArrival   *time.Time `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure"`
	AccessAreas       []string   `json:"access_areas"`
	EscortRequired    *bool      `json:"escort_required"`
	VehiclePlate      *string    `json:"vehicle_plate"`
	Notes             *string    `json:"notes"`
}

func (h *VisitorHandlers) UpdateVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := visitIDParam(r)

	var req updateVisitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Purpose != nil && !isValidVisitPurpose(*req.Purpose) {
		httputil.Error(w, http.StatusBadRequest, "invalid purpose")
		return
	}

	var oldVisit Visit
	if err := h.db.Pool.QueryRow(r.Context(), `SELECT id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		status, expected_arrival, expected_departure, actual_checkin, actual_checkout,
		checkin_method, checkin_device_id, checkin_photo_ref, checkout_by, qr_token, qr_expires_at,
		badge_number, temp_credential_id, access_areas, escort_required, vehicle_plate, items_carried,
		nda_signed, host_approved, host_approved_at, notes, created_at, updated_at
		FROM dm3_visitor.visits WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(
		&oldVisit.ID, &oldVisit.TenantID, &oldVisit.VisitorID, &oldVisit.HostUserID,
		&oldVisit.Purpose, &oldVisit.PurposeNote, &oldVisit.Status,
		&oldVisit.ExpectedArrival, &oldVisit.ExpectedDeparture, &oldVisit.ActualCheckin, &oldVisit.ActualCheckout,
		&oldVisit.CheckinMethod, &oldVisit.CheckinDeviceID, &oldVisit.CheckinPhotoRef, &oldVisit.CheckoutBy, &oldVisit.QRToken, &oldVisit.QRExpiresAt,
		&oldVisit.BadgeNumber, &oldVisit.TempCredentialID, &oldVisit.AccessAreas, &oldVisit.EscortRequired, &oldVisit.VehiclePlate, &oldVisit.ItemsCarried,
		&oldVisit.NDASigned, &oldVisit.HostApproved, &oldVisit.HostApprovedAt, &oldVisit.Notes, &oldVisit.CreatedAt, &oldVisit.UpdatedAt,
	); err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}

	var visit Visit
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_visitor.visits
		SET purpose            = COALESCE($3, purpose),
		    purpose_note       = COALESCE($4, purpose_note),
		    expected_arrival   = COALESCE($5, expected_arrival),
		    expected_departure = COALESCE($6, expected_departure),
		    access_areas       = COALESCE($7::uuid[], access_areas),
		    escort_required    = COALESCE($8, escort_required),
		    vehicle_plate      = COALESCE($9, vehicle_plate),
		    notes              = COALESCE($10, notes),
		    updated_at         = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND status IN ('pre_registered','approved','waiting')
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		id, cid, req.Purpose, req.PurposeNote,
		req.ExpectedArrival, req.ExpectedDeparture,
		nilIfEmptyUUIDArray(req.AccessAreas), req.EscortRequired, req.VehiclePlate, req.Notes,
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
		httputil.Error(w, http.StatusNotFound, "visit not found or cannot be updated in current status")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.updated", "visit", visit.ID, "", "success", oldVisit, visit)
	}
	httputil.JSON(w, http.StatusOK, visit)
}

func (h *VisitorHandlers) ApproveVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	id := visitIDParam(r)

	var req struct {
		Approved bool    `json:"approved"`
		Note     *string `json:"note"`
	}
	req.Approved = true // default to approve when body is empty
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			httputil.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	var hostUserID string
	if err := h.db.Pool.QueryRow(r.Context(), `SELECT host_user_id FROM dm3_visitor.visits WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(&hostUserID); err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if !canApproveVisit(r, hostUserID) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	status := VisitStatusRejected
	if req.Approved {
		status = VisitStatusApproved
	}

	var visit Visit
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_visitor.visits
		SET status           = $3,
		    host_approved    = $4,
		    host_approved_at = CASE WHEN $4 THEN now() ELSE host_approved_at END,
		    notes            = COALESCE($5, notes),
		    updated_at       = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND status IN ('pre_registered','waiting')
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		id, cid, status, req.Approved, req.Note,
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
		httputil.Error(w, http.StatusBadRequest, "visit not found or already processed")
		return
	}
	if h.audit != nil {
		action := "visit.rejected"
		if req.Approved {
			action = "visit.approved"
		}
		h.audit.LogFromRequest(r, action, "visit", visit.ID, "", "success", nil, visit)
	}
	if req.Approved {
		var visitorName string
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM dm3_visitor.visitors WHERE id = $1::uuid`,
			visit.VisitorID,
		).Scan(&visitorName)
		h.publishEvent(r.Context(), cid, EventVisitApproved, map[string]any{
			"tenant_id":           cid,
			"visit_id":            visit.ID,
			"visitor_id":          visit.VisitorID,
			"visitor_name":        visitorName,
			"access_areas":        visit.AccessAreas,
			"expected_arrival":    visit.ExpectedArrival,
			"expected_departure":  visit.ExpectedDeparture,
		})
	} else {
		h.publishEvent(r.Context(), cid, EventVisitRejected, map[string]any{
			"tenant_id":          cid,
			"visit_id":           visit.ID,
			"visitor_id":         visit.VisitorID,
			"temp_credential_id": visit.TempCredentialID,
		})
	}
	httputil.JSON(w, http.StatusOK, visit)
}

// ReinviteVisit regenerates the QR token for a visit and increments the reinvite counter.
// Maximum 3 reinvitations per visit (BR-VIS-012).
func (h *VisitorHandlers) ReinviteVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := visitIDParam(r)

	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("load visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to load visitor settings")
		return
	}

	newQRToken, err := generateQRToken()
	if err != nil {
		slog.Error("generate qr token error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Atomic reinvite: UPDATE with WHERE guard prevents TOCTOU race on reinvite_count
	var expectedArrival time.Time
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT expected_arrival FROM dm3_visitor.visits
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND status IN ('pre_registered', 'approved')
		  AND COALESCE(reinvite_count, 0) < 3`,
		id, cid).Scan(&expectedArrival)
	if err != nil {
		// Distinguish: visit doesn't exist / wrong status vs max reinvites reached
		var exists bool
		_ = h.db.Pool.QueryRow(r.Context(), `
			SELECT EXISTS(SELECT 1 FROM dm3_visitor.visits WHERE id = $1::uuid AND tenant_id = $2::uuid
			  AND status IN ('pre_registered', 'approved'))`, id, cid).Scan(&exists)
		if exists {
			httputil.Error(w, http.StatusConflict, "maximum reinvitations (3) reached")
		} else {
			httputil.Error(w, http.StatusNotFound, "visit not found or not in reinvitable status")
		}
		return
	}

	newQRExpiry := expectedArrival.Add(time.Duration(settings.QRValidityAfterHours) * time.Hour)

	var visit Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_visitor.visits
		SET qr_token       = $3,
		    qr_expires_at  = $4,
		    reinvite_count = COALESCE(reinvite_count, 0) + 1,
		    updated_at     = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND status IN ('pre_registered', 'approved')
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		id, cid, newQRToken, newQRExpiry,
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
		slog.Error("reinvite visit error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to reinvite")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.reinvited", "visit", visit.ID, "", "success", nil,
			map[string]any{"new_qr_token": newQRToken})
	}
	httputil.JSON(w, http.StatusOK, visit)
}

type checkinRequest struct {
	CheckinMethod   string  `json:"checkin_method"`
	QRToken         *string `json:"qr_token"`
	CheckinDeviceID *string `json:"checkin_device_id"`
	PhotoRef        *string `json:"photo_ref"`
	NationalID      *string `json:"national_id"`
	ItemsCarried    *string `json:"items_carried"`
	NDASigned       bool    `json:"nda_signed"`
	BadgeNumber     *string `json:"badge_number"`
}

func (h *VisitorHandlers) CheckinVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := visitIDParam(r)

	var req checkinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isValidCheckinMethod(req.CheckinMethod) {
		httputil.Error(w, http.StatusBadRequest, "invalid checkin_method")
		return
	}

	var visitorID, qrToken string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT visitor_id, qr_token
		FROM dm3_visitor.visits
		WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&visitorID, &qrToken)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if req.QRToken != nil && *req.QRToken != qrToken {
		httputil.Error(w, http.StatusForbidden, "invalid qr token")
		return
	}

	tx, err := h.db.Pool.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		slog.Error("begin visitor checkin tx error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	if req.NationalID != nil {
		if _, err := tx.Exec(r.Context(), `UPDATE dm3_visitor.visitors SET national_id = COALESCE($2, national_id), updated_at = now() WHERE id = $1::uuid`, visitorID, req.NationalID); err != nil {
			slog.Error("checkin update national_id error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to update visitor national ID")
			return
		}
	}
	if blocked, reason := h.checkWatchlist(r, cid, visitorID); blocked {
		if h.audit != nil {
			h.audit.LogFromRequest(r, "watchlist.match", "visit", id, "", "blocked", nil, map[string]any{"reason": reason, "visitor_id": visitorID})
		}
		httputil.Error(w, http.StatusForbidden, "visitor is on watchlist: "+reason)
		return
	}

	visit, tempCredID, alreadyCheckedIn, visitorName, err := h.checkinVisitTx(r.Context(), tx, cid, id, req)
	if err != nil {
		if errors.Is(err, errVisitCheckinConflict) {
			httputil.Error(w, http.StatusConflict, "visit cannot be checked in from current status")
			return
		}
		slog.Error("checkin visit error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Badge assignment: manual or auto-assign from pool
	if req.BadgeNumber != nil && *req.BadgeNumber != "" {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO dm3_visitor.visitor_badges (tenant_id, visit_id, badge_number)
			VALUES ($1::uuid, $2::uuid, $3)
			ON CONFLICT DO NOTHING`, cid, id, req.BadgeNumber); err != nil {
			slog.Error("checkin badge insert error", "error", err)
		}
	} else if badgeSettings, settingsErr := h.getOrCreateSettings(r.Context(), cid); settingsErr == nil && badgeSettings.BadgeEnabled && badgeSettings.BadgeAutoAssign {
		if badgeNum, badgeErr := h.nextBadgeNumber(r.Context(), tx, cid, badgeSettings.BadgePrefix, badgeSettings.BadgePoolSize); badgeErr != nil {
			slog.Warn("auto badge assign failed", "error", badgeErr, "tenant_id", cid)
		} else {
			if _, err := tx.Exec(r.Context(), `
				INSERT INTO dm3_visitor.visitor_badges (tenant_id, visit_id, badge_number)
				VALUES ($1::uuid, $2::uuid, $3)
				ON CONFLICT DO NOTHING`, cid, id, badgeNum); err != nil {
				slog.Error("auto badge insert error", "error", err)
			} else if _, err := tx.Exec(r.Context(), `
				UPDATE dm3_visitor.visits SET badge_number = $2, updated_at = now()
				WHERE id = $1::uuid`, id, badgeNum); err != nil {
				slog.Error("update visit badge_number error", "error", err)
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("commit visitor checkin tx error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		action := "visit.checked_in"
		if alreadyCheckedIn {
			action = "visit.checkin_retried"
		}
		h.audit.LogFromRequest(r, action, "visit", visit.ID, visitorName, "success", nil, map[string]any{
			"visit":            visit,
			"temporary_access": map[string]any{"credential_id": tempCredID, "sync_status": "pending_device_sync", "idempotent": alreadyCheckedIn},
		})
	}
	if !alreadyCheckedIn {
		h.publishEvent(r.Context(), cid, EventVisitCheckedIn, map[string]any{
			"visit_id": visit.ID, "visitor_id": visitorID, "host_user_id": visit.HostUserID,
		})
	}
	httputil.JSON(w, http.StatusOK, visit)
}

func (h *VisitorHandlers) CheckoutVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := visitIDParam(r)

	var req struct {
		BadgeReturned bool `json:"badge_returned"`
		ItemsReturned bool `json:"items_returned"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			httputil.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	var checkoutBy any
	if claims != nil && claims.Sub != "" {
		checkoutBy = claims.Sub
	}

	tx, err := h.db.Pool.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		slog.Error("begin visitor checkout tx error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	visit, cleanup, err := h.checkoutVisitTx(r.Context(), tx, cid, id, checkoutOptions{CheckoutBy: checkoutBy, BadgeReturned: req.BadgeReturned})
	if err != nil {
		switch {
		case errors.Is(err, errVisitNotFound):
			httputil.Error(w, http.StatusNotFound, "visit not found")
		case errors.Is(err, errVisitCheckoutConflict):
			httputil.Error(w, http.StatusConflict, "visit cannot be checked out from current status")
		default:
			slog.Error("checkout visit error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("commit visitor checkout tx error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.checked_out", "visit", visit.ID, "", "success", nil, map[string]any{
			"visit":            visit,
			"temporary_access": map[string]any{"credential_id": cleanup.TempCredentialID, "sync_status": "pending_revoke_sync", "user_deactivated": cleanup.TempUserDeactivated},
			"badge":            map[string]any{"returned": req.BadgeReturned, "closed": cleanup.BadgeClosed},
			"idempotent":       cleanup.AlreadyCheckedOut,
		})
	}
	if !cleanup.AlreadyCheckedOut {
		h.publishEvent(r.Context(), cid, EventVisitCheckedOut, map[string]any{
			"tenant_id":          cid,
			"visit_id":           visit.ID,
			"temp_credential_id": cleanup.TempCredentialID,
			"reason":             "manual",
		})
	}
	httputil.JSON(w, http.StatusOK, visit)
}

func (h *VisitorHandlers) GetVisitByQR(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "qr_token")
	type qrResponse struct {
		VisitID         string    `json:"visit_id"`
		VisitorName     string    `json:"visitor_name"`
		VisitorCompany  *string   `json:"visitor_company,omitempty"`
		Purpose         string    `json:"purpose"`
		ExpectedArrival time.Time `json:"expected_arrival"`
		Status          string    `json:"status"`
	}

	var resp qrResponse
	var qrExpiresAt time.Time
	// Use tenant_id when auth context is available (defense in depth);
	// for unauthenticated kiosk use, the QR token uniqueness is the security boundary.
	cid := authsvc.CompanyIDFromContext(r.Context())
	var err error
	if cid != "" {
		err = h.db.Pool.QueryRow(r.Context(), `
			SELECT v.id, vis.first_name || ' ' || vis.last_name, vis.company,
			       v.purpose, v.expected_arrival, v.status, v.qr_expires_at
			FROM dm3_visitor.visits v
			JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
			WHERE v.qr_token = $1 AND v.tenant_id = $2::uuid`, token, cid,
		).Scan(&resp.VisitID, &resp.VisitorName, &resp.VisitorCompany, &resp.Purpose, &resp.ExpectedArrival, &resp.Status, &qrExpiresAt)
	} else {
		err = h.db.Pool.QueryRow(r.Context(), `
			SELECT v.id, vis.first_name || ' ' || vis.last_name, vis.company,
			       v.purpose, v.expected_arrival, v.status, v.qr_expires_at
			FROM dm3_visitor.visits v
			JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
			WHERE v.qr_token = $1`, token,
		).Scan(&resp.VisitID, &resp.VisitorName, &resp.VisitorCompany, &resp.Purpose, &resp.ExpectedArrival, &resp.Status, &qrExpiresAt)
	}
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if time.Now().After(qrExpiresAt) {
		httputil.Error(w, http.StatusGone, "QR code has expired")
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

func (h *VisitorHandlers) GetTodaySummary(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var summary VisitSummary
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT
		  COUNT(*) FILTER (WHERE status = 'waiting')      AS waiting,
		  COUNT(*) FILTER (WHERE status = 'checked_in')   AS checked_in,
		  COUNT(*) FILTER (WHERE status = 'checked_out')  AS checked_out,
		  COUNT(*) FILTER (WHERE status = 'no_show')      AS no_show,
		  COUNT(*)                                        AS total_expected
		FROM dm3_visitor.visits
		WHERE tenant_id = $1::uuid AND expected_arrival::date = CURRENT_DATE`, cid,
	).Scan(&summary.Waiting, &summary.CheckedIn, &summary.CheckedOut, &summary.NoShow, &summary.TotalExpected)
	if err != nil {
		slog.Error("today summary error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, summary)
}

type rowScanner interface{ Scan(dest ...any) error }

// scanVisit scans a Visit and its embedded Visitor from a query that does NOT
// include the cross-schema host JOIN columns. Host info is populated separately
// via LookupCache.
func scanVisit(row rowScanner) (Visit, error) {
	var v Visit
	vis := &Visitor{}
	err := row.Scan(
		&v.ID, &v.TenantID, &v.VisitorID, &v.HostUserID,
		&v.Purpose, &v.PurposeNote, &v.Status,
		&v.ExpectedArrival, &v.ExpectedDeparture,
		&v.ActualCheckin, &v.ActualCheckout,
		&v.CheckinMethod, &v.CheckinDeviceID, &v.CheckinPhotoRef, &v.CheckoutBy,
		&v.QRToken, &v.QRExpiresAt, &v.BadgeNumber, &v.TempCredentialID,
		&v.AccessAreas, &v.EscortRequired, &v.VehiclePlate, &v.ItemsCarried,
		&v.NDASigned, &v.HostApproved, &v.HostApprovedAt, &v.Notes,
		&v.CreatedAt, &v.UpdatedAt,
		&vis.ID, &vis.TenantID, &vis.FirstName, &vis.LastName, &vis.DisplayName,
		&vis.Email, &vis.Phone, &vis.Company, &vis.NationalID, &vis.PhotoRef,
		&vis.WatchlistStatus, &vis.WatchlistReason, &vis.VisitCount, &vis.LastVisitAt,
		&vis.CreatedAt, &vis.UpdatedAt,
	)
	if err != nil {
		return v, err
	}
	v.Visitor = vis
	return v, nil
}

func scanVisitWithJoins(row rowScanner) (Visit, error) {
	var v Visit
	vis := &Visitor{}
	host := &VisitHost{}
	err := row.Scan(
		&v.ID, &v.TenantID, &v.VisitorID, &v.HostUserID,
		&v.Purpose, &v.PurposeNote, &v.Status,
		&v.ExpectedArrival, &v.ExpectedDeparture,
		&v.ActualCheckin, &v.ActualCheckout,
		&v.CheckinMethod, &v.CheckinDeviceID, &v.CheckinPhotoRef, &v.CheckoutBy,
		&v.QRToken, &v.QRExpiresAt, &v.BadgeNumber, &v.TempCredentialID,
		&v.AccessAreas, &v.EscortRequired, &v.VehiclePlate, &v.ItemsCarried,
		&v.NDASigned, &v.HostApproved, &v.HostApprovedAt, &v.Notes,
		&v.CreatedAt, &v.UpdatedAt,
		&vis.ID, &vis.TenantID, &vis.FirstName, &vis.LastName, &vis.DisplayName,
		&vis.Email, &vis.Phone, &vis.Company, &vis.NationalID, &vis.PhotoRef,
		&vis.WatchlistStatus, &vis.WatchlistReason, &vis.VisitCount, &vis.LastVisitAt,
		&vis.CreatedAt, &vis.UpdatedAt,
		&host.ID, &host.Name, &host.Department,
	)
	if err != nil {
		return v, err
	}
	v.Visitor = vis
	if host.ID != "" {
		v.Host = host
	}
	return v, nil
}

func (h *VisitorHandlers) upsertVisitor(r *http.Request, cid, firstName, lastName string, email, phone, company *string) (string, string, error) {
	name := auditEntityName(firstName, lastName)

	// Atomic upsert: try to find existing visitor by email or phone, then update or insert.
	// Uses INSERT ... ON CONFLICT to avoid TOCTOU race conditions.
	if email != nil && *email != "" {
		var id string
		err := h.db.Pool.QueryRow(r.Context(), `
			INSERT INTO dm3_visitor.visitors
			  (tenant_id, first_name, last_name, email, phone, company, watchlist_status, visit_count, last_visit_at)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, 'none', 1, now())
			ON CONFLICT (tenant_id, email) WHERE email IS NOT NULL
			DO UPDATE SET first_name = $2, last_name = $3, company = COALESCE($6, dm3_visitor.visitors.company),
			             visit_count = dm3_visitor.visitors.visit_count + 1, last_visit_at = now(), updated_at = now()
			RETURNING id`,
			cid, firstName, lastName, email, phone, company,
		).Scan(&id)
		if err != nil {
			return "", name, fmt.Errorf("upsert visitor by email: %w", err)
		}
		return id, name, nil
	}

	if phone != nil && *phone != "" {
		var id string
		err := h.db.Pool.QueryRow(r.Context(), `
			INSERT INTO dm3_visitor.visitors
			  (tenant_id, first_name, last_name, email, phone, company, watchlist_status, visit_count, last_visit_at)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, 'none', 1, now())
			ON CONFLICT (tenant_id, phone) WHERE phone IS NOT NULL
			DO UPDATE SET first_name = $2, last_name = $3, company = COALESCE($6, dm3_visitor.visitors.company),
			             visit_count = dm3_visitor.visitors.visit_count + 1, last_visit_at = now(), updated_at = now()
			RETURNING id`,
			cid, firstName, lastName, email, phone, company,
		).Scan(&id)
		if err != nil {
			return "", name, fmt.Errorf("upsert visitor by phone: %w", err)
		}
		return id, name, nil
	}

	// No email or phone — always insert a new visitor
	var newID string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.visitors
		  (tenant_id, first_name, last_name, email, phone, company, watchlist_status, visit_count, last_visit_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, 'none', 1, now())
		RETURNING id`,
		cid, firstName, lastName, email, phone, company,
	).Scan(&newID)
	if err != nil {
		return "", name, fmt.Errorf("insert visitor: %w", err)
	}
	return newID, name, nil
}

// nextBadgeNumber finds the first available badge number from the pool (prefix+"001" .. prefix+poolSize).
// A badge is available if it is not currently assigned to an active (unreturned) visit.
func (h *VisitorHandlers) nextBadgeNumber(ctx context.Context, tx pgx.Tx, tenantID, prefix string, poolSize int) (string, error) {
	var badgeNum string
	err := tx.QueryRow(ctx, `
		SELECT $2 || LPAD(num::text, 3, '0')
		FROM generate_series(1, $3) AS num
		WHERE ($2 || LPAD(num::text, 3, '0')) NOT IN (
			SELECT badge_number FROM dm3_visitor.visitor_badges
			WHERE tenant_id = $1::uuid AND returned_at IS NULL
		)
		ORDER BY num
		LIMIT 1`, tenantID, prefix, poolSize).Scan(&badgeNum)
	if err != nil {
		return "", fmt.Errorf("badge pool exhausted or query error: %w", err)
	}
	return badgeNum, nil
}

func (h *VisitorHandlers) checkWatchlist(r *http.Request, cid, visitorID string) (bool, string) {
	var firstName, lastName string
	var email, phone, nationalID *string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT first_name, last_name, email, phone, national_id FROM dm3_visitor.visitors WHERE id = $1::uuid`, visitorID).Scan(&firstName, &lastName, &email, &phone, &nationalID)
	if err != nil {
		return false, ""
	}

	fullName := auditEntityName(firstName, lastName)
	args := []any{cid, fullName}
	orClauses := "(match_field = 'name' AND match_value ILIKE $2)"
	idx := 3
	if email != nil {
		orClauses += fmt.Sprintf(" OR (match_field = 'email' AND match_value = $%d)", idx)
		args = append(args, *email)
		idx++
	}
	if phone != nil {
		orClauses += fmt.Sprintf(" OR (match_field = 'phone' AND match_value = $%d)", idx)
		args = append(args, *phone)
		idx++
	}
	if nationalID != nil {
		orClauses += fmt.Sprintf(" OR (match_field = 'national_id' AND match_value = $%d)", idx)
		args = append(args, *nationalID)
		idx++
	}

	query := fmt.Sprintf(`SELECT reason FROM dm3_visitor.watchlist WHERE tenant_id = $1::uuid AND entry_type = 'blacklisted' AND (expires_at IS NULL OR expires_at > now()) AND (%s) LIMIT 1`, orClauses)
	var reason string
	if err = h.db.Pool.QueryRow(r.Context(), query, args...).Scan(&reason); err != nil {
		return false, ""
	}
	return true, reason
}

var (
	errVisitNotFound         = errors.New("visit not found")
	errVisitCheckinConflict  = errors.New("visit checkin conflict")
	errVisitCheckoutConflict = errors.New("visit checkout conflict")
)

type visitRow struct {
	Visit
	VisitorFirstName string
	VisitorLastName  string
}

type checkoutOptions struct {
	CheckoutBy    any
	BadgeReturned bool
}

type checkoutCleanup struct {
	TempCredentialID    *string
	TempUserDeactivated bool
	BadgeClosed         bool
	AlreadyCheckedOut   bool
}

func (h *VisitorHandlers) checkinVisitTx(ctx context.Context, tx pgx.Tx, tenantID, visitID string, req checkinRequest) (Visit, string, bool, string, error) {
	lockedVisit, tempUserID, tempCredID, err := loadVisitForLifecycle(ctx, tx, tenantID, visitID)
	if err != nil {
		return Visit{}, "", false, "", err
	}
	visitorName := auditEntityName(lockedVisit.VisitorFirstName, lockedVisit.VisitorLastName)

	if lockedVisit.Status == VisitStatusCheckedIn {
		if tempCredID == nil {
			credID, _, ensureErr := ensureTemporaryAccess(ctx, tx, tenantID, lockedVisit, tempUserID)
			if ensureErr != nil {
				return Visit{}, "", false, visitorName, ensureErr
			}
			tempCredID = &credID
		}
		visit, getErr := getVisitByIDTx(ctx, tx, tenantID, visitID)
		return visit, derefString(tempCredID), true, visitorName, getErr
	}
	if lockedVisit.Status != VisitStatusPreRegistered && lockedVisit.Status != VisitStatusApproved && lockedVisit.Status != VisitStatusWaiting {
		return Visit{}, "", false, visitorName, errVisitCheckinConflict
	}

	credID, _, err := ensureTemporaryAccess(ctx, tx, tenantID, lockedVisit, tempUserID)
	if err != nil {
		return Visit{}, "", false, visitorName, err
	}
	_, err = tx.Exec(ctx, `
		UPDATE dm3_visitor.visits
		SET status             = 'checked_in',
		    actual_checkin     = COALESCE(actual_checkin, now()),
		    checkin_method     = COALESCE($3, checkin_method),
		    checkin_device_id  = COALESCE($4, checkin_device_id),
		    checkin_photo_ref  = COALESCE($5, checkin_photo_ref),
		    items_carried      = COALESCE($6, items_carried),
		    nda_signed         = $7,
		    badge_number       = COALESCE($8, badge_number),
		    temp_credential_id = $9::uuid,
		    updated_at         = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		visitID, tenantID, req.CheckinMethod, req.CheckinDeviceID, req.PhotoRef, req.ItemsCarried, req.NDASigned, req.BadgeNumber, credID,
	)
	if err != nil {
		return Visit{}, "", false, visitorName, err
	}
	visit, err := getVisitByIDTx(ctx, tx, tenantID, visitID)
	return visit, credID, false, visitorName, err
}

func (h *VisitorHandlers) checkoutVisitTx(ctx context.Context, tx pgx.Tx, tenantID, visitID string, opts checkoutOptions) (Visit, checkoutCleanup, error) {
	lockedVisit, tempUserID, tempCredID, err := loadVisitForLifecycle(ctx, tx, tenantID, visitID)
	if err != nil {
		return Visit{}, checkoutCleanup{}, err
	}
	cleanup := checkoutCleanup{TempCredentialID: tempCredID}
	if lockedVisit.Status != VisitStatusCheckedIn && lockedVisit.Status != VisitStatusCheckedOut {
		return Visit{}, cleanup, errVisitCheckoutConflict
	}
	cleanup.AlreadyCheckedOut = lockedVisit.Status == VisitStatusCheckedOut

	if tempCredID != nil {
		if _, err := tx.Exec(ctx, `UPDATE dm3_identity.credentials SET status = 'revoked', valid_until = now(), updated_at = now() WHERE id = $1::uuid AND status <> 'revoked'`, *tempCredID); err != nil {
			return Visit{}, cleanup, err
		}
	}
	if tempUserID != nil {
		cmd, err := tx.Exec(ctx, `UPDATE dm3_identity.users SET status = 'inactive', expired_date = COALESCE(expired_date, CURRENT_DATE), updated_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid AND status <> 'inactive'`, *tempUserID, tenantID)
		if err != nil {
			return Visit{}, cleanup, err
		}
		cleanup.TempUserDeactivated = cmd.RowsAffected() > 0
	}
	badgeCmd, err := tx.Exec(ctx, `UPDATE dm3_visitor.visitor_badges SET returned_at = COALESCE(returned_at, now()) WHERE visit_id = $1::uuid AND tenant_id = $2::uuid AND returned_at IS NULL`, visitID, tenantID)
	if err != nil {
		return Visit{}, cleanup, err
	}
	cleanup.BadgeClosed = badgeCmd.RowsAffected() > 0

	if !cleanup.AlreadyCheckedOut {
		if _, err := tx.Exec(ctx, `
			UPDATE dm3_visitor.visits
			SET status          = 'checked_out',
			    actual_checkout = COALESCE(actual_checkout, now()),
			    checkout_by     = COALESCE($3::uuid, checkout_by),
			    updated_at      = now()
			WHERE id = $1::uuid AND tenant_id = $2::uuid`, visitID, tenantID, opts.CheckoutBy); err != nil {
			return Visit{}, cleanup, err
		}
	}
	visit, err := getVisitByIDTx(ctx, tx, tenantID, visitID)
	return visit, cleanup, err
}

func (h *VisitorHandlers) autoCheckoutVisit(ctx context.Context, tenantID, visitID string) (*checkoutCleanup, error) {
	tx, err := h.db.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	visit, cleanup, err := h.checkoutVisitTx(ctx, tx, tenantID, visitID, checkoutOptions{})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	if h.audit != nil {
		h.audit.Log(audit.Entry{
			TenantID:   tenantID,
			Action:     "visit.auto_checked_out",
			EntityType: "visit",
			EntityID:   visit.ID,
			Status:     "success",
			NewValues: map[string]any{
				"visit":            visit,
				"temporary_access": map[string]any{"credential_id": cleanup.TempCredentialID, "sync_status": "pending_revoke_sync", "user_deactivated": cleanup.TempUserDeactivated},
				"badge":            map[string]any{"closed": cleanup.BadgeClosed},
				"idempotent":       cleanup.AlreadyCheckedOut,
			},
		})
	}
	if !cleanup.AlreadyCheckedOut {
		h.publishEvent(ctx, tenantID, EventVisitCheckedOut, map[string]any{
			"tenant_id":          tenantID,
			"visit_id":           visit.ID,
			"temp_credential_id": cleanup.TempCredentialID,
			"reason":             "auto",
		})
	}
	return &cleanup, nil
}

func loadVisitForLifecycle(ctx context.Context, tx pgx.Tx, tenantID, visitID string) (visitRow, *string, *string, error) {
	var visit visitRow
	var tempUserID *string
	var tempCredID *string
	err := tx.QueryRow(ctx, `
		SELECT v.id, v.tenant_id, v.visitor_id, v.host_user_id, v.purpose, v.purpose_note,
		       v.status, v.expected_arrival, v.expected_departure,
		       v.actual_checkin, v.actual_checkout,
		       v.checkin_method, v.checkin_device_id, v.checkin_photo_ref, v.checkout_by,
		       v.qr_token, v.qr_expires_at, v.badge_number, v.temp_credential_id,
		       v.access_areas, v.escort_required, v.vehicle_plate, v.items_carried,
		       v.nda_signed, v.host_approved, v.host_approved_at, v.notes,
		       v.created_at, v.updated_at,
		       vis.first_name, vis.last_name,
		       (SELECT c.user_id FROM dm3_identity.credentials c WHERE c.id = v.temp_credential_id) AS temp_user_id
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
		WHERE v.id = $1::uuid AND v.tenant_id = $2::uuid
		FOR UPDATE`, visitID, tenantID,
	).Scan(
		&visit.ID, &visit.TenantID, &visit.VisitorID, &visit.HostUserID, &visit.Purpose, &visit.PurposeNote,
		&visit.Status, &visit.ExpectedArrival, &visit.ExpectedDeparture,
		&visit.ActualCheckin, &visit.ActualCheckout,
		&visit.CheckinMethod, &visit.CheckinDeviceID, &visit.CheckinPhotoRef, &visit.CheckoutBy,
		&visit.QRToken, &visit.QRExpiresAt, &visit.BadgeNumber, &tempCredID,
		&visit.AccessAreas, &visit.EscortRequired, &visit.VehiclePlate, &visit.ItemsCarried,
		&visit.NDASigned, &visit.HostApproved, &visit.HostApprovedAt, &visit.Notes,
		&visit.CreatedAt, &visit.UpdatedAt,
		&visit.VisitorFirstName, &visit.VisitorLastName,
		&tempUserID,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return visitRow{}, nil, nil, errVisitNotFound
		}
		return visitRow{}, nil, nil, err
	}
	visit.TempCredentialID = tempCredID
	return visit, tempUserID, tempCredID, nil
}

func ensureTemporaryAccess(ctx context.Context, tx pgx.Tx, tenantID string, visit visitRow, existingUserID *string) (string, *string, error) {
	if visit.TempCredentialID != nil {
		return *visit.TempCredentialID, existingUserID, nil
	}

	var credID string
	var userID *string
	err := tx.QueryRow(ctx, `
		SELECT c.id, c.user_id
		FROM dm3_identity.credentials c
		WHERE c.tenant_id = $1::uuid AND c.type = 'qr' AND c.value = $2
		ORDER BY c.created_at DESC
		LIMIT 1`, tenantID, visit.QRToken,
	).Scan(&credID, &userID)
	if err == nil {
		if userID != nil {
			if _, err := tx.Exec(ctx, `UPDATE dm3_identity.users SET status = 'active', is_deleted = false, updated_at = now() WHERE id = $1::uuid`, *userID); err != nil {
				return "", nil, fmt.Errorf("reactivate temp user: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE dm3_identity.credentials SET status = 'active', valid_from = COALESCE(valid_from, now()), valid_until = $2, updated_at = now() WHERE id = $1::uuid`, credID, visitCredentialExpiry(visit.ExpectedDeparture)); err != nil {
			return "", nil, fmt.Errorf("reactivate temp credential: %w", err)
		}
		_, err = tx.Exec(ctx, `UPDATE dm3_visitor.visits SET temp_credential_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid`, visit.ID, tenantID, credID)
		return credID, userID, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, err
	}

	if existingUserID == nil {
		var createdUserID string
		err = tx.QueryRow(ctx, `
			INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
			VALUES ($1::uuid, $2, $3, 'active', false)
			RETURNING id`, tenantID, visit.VisitorFirstName, visit.VisitorLastName,
		).Scan(&createdUserID)
		if err != nil {
			return "", nil, err
		}
		existingUserID = &createdUserID
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials
		  (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'qr', $3, 'active', now(), $4)
		RETURNING id`, tenantID, *existingUserID, visit.QRToken, visitCredentialExpiry(visit.ExpectedDeparture),
	).Scan(&credID)
	if err != nil {
		return "", nil, err
	}
	_, err = tx.Exec(ctx, `UPDATE dm3_visitor.visits SET temp_credential_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid`, visit.ID, tenantID, credID)
	return credID, existingUserID, err
}

func getVisitByIDTx(ctx context.Context, tx pgx.Tx, tenantID, visitID string) (Visit, error) {
	var visit Visit
	err := tx.QueryRow(ctx, `
		SELECT id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		       status, expected_arrival, expected_departure,
		       actual_checkin, actual_checkout,
		       checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		       qr_token, qr_expires_at, badge_number, temp_credential_id,
		       access_areas, escort_required, vehicle_plate, items_carried,
		       nda_signed, host_approved, host_approved_at, notes,
		       created_at, updated_at
		FROM dm3_visitor.visits
		WHERE id = $1::uuid AND tenant_id = $2::uuid`, visitID, tenantID,
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
	if errors.Is(err, pgx.ErrNoRows) {
		return visit, errVisitNotFound
	}
	return visit, err
}

func visitCredentialExpiry(expectedDeparture *time.Time) time.Time {
	if expectedDeparture != nil {
		return *expectedDeparture
	}
	return endOfDay(time.Now())
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 23, 59, 59, 0, time.UTC)
}

func nilIfEmptyUUIDArray(values []string) any {
	if len(values) == 0 {
		return nil
	}
	return values
}

func isValidVisitPurpose(v string) bool {
	switch v {
	case VisitPurposeMeeting, VisitPurposeInterview, VisitPurposeDelivery, VisitPurposeMaintenance, VisitPurposeTour, VisitPurposeContractSigning, VisitPurposeOther:
		return true
	default:
		return false
	}
}

func isValidCheckinMethod(v string) bool {
	switch v {
	case CheckinMethodTerminalQR, CheckinMethodTerminalManual, CheckinMethodReception, CheckinMethodSelfService, CheckinMethodMobileQR:
		return true
	default:
		return false
	}
}

func (h *VisitorHandlers) hostExists(r *http.Request, cid, hostUserID string) bool {
	var found string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT id FROM dm3_identity.users WHERE id = $1::uuid AND tenant_id = $2::uuid AND status NOT IN ('inactive','deleted') AND (is_deleted = false OR is_deleted IS NULL)`, hostUserID, cid).Scan(&found)
	return err == nil && found != ""
}

// sendVisitorInvitationEmail sends an invitation email to a visitor (runs in a goroutine).
func (h *VisitorHandlers) sendVisitorInvitationEmail(tenantID, visitorEmail, visitorName, hostUserID, purpose string, expectedArrival time.Time, qrToken string) {
	ctx := context.Background()

	// Get company name
	var companyName string
	_ = h.db.Pool.QueryRow(ctx, `SELECT name FROM dm3_auth.tenants WHERE id = $1::uuid`, tenantID).Scan(&companyName)
	if companyName == "" {
		companyName = "Duall Master"
	}

	// Get host name
	var hostName string
	_ = h.db.Pool.QueryRow(ctx, `SELECT COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') FROM dm3_identity.users WHERE id = $1::uuid`, hostUserID).Scan(&hostName)
	hostName = strings.TrimSpace(hostName)
	if hostName == "" {
		hostName = "Your host"
	}

	arrivalStr := expectedArrival.Format("Mon, 02 Jan 2006 15:04")

	// Check for custom template
	var customSubject, customBody string
	err := h.db.Pool.QueryRow(ctx,
		`SELECT subject, body_html FROM dm3_identity.email_templates
		 WHERE tenant_id = $1::uuid AND type = 'visitor_invitation' AND is_active = true`,
		tenantID,
	).Scan(&customSubject, &customBody)

	var msg email.Message
	if err == nil && customBody != "" {
		msg = email.RenderCustomTemplate(visitorEmail, customSubject, customBody, map[string]string{
			"visitor_name":     visitorName,
			"host_name":        hostName,
			"company_name":     companyName,
			"purpose":          purpose,
			"expected_arrival": arrivalStr,
			"qr_code":          qrToken,
		})
	} else {
		msg = email.VisitorInvitationEmail(visitorEmail, email.VisitorInvitationData{
			VisitorName:     visitorName,
			HostName:        hostName,
			CompanyName:     companyName,
			Purpose:         purpose,
			ExpectedArrival: arrivalStr,
			QRCodeValue:     qrToken,
		})
	}

	if err := h.email.Send(msg); err != nil {
		slog.Error("visitor invitation email failed", "error", err, "to", visitorEmail)
		return
	}
	slog.Info("visitor invitation email sent", "to", visitorEmail, "visitor", visitorName)
}
