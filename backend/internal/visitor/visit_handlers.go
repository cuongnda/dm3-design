package visitor

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
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
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.visits v JOIN dm3_identity.visitors vis ON vis.id = v.visitor_id `+where, countArgs...).Scan(&total)

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
		       vis.created_at, vis.updated_at,
		       u.id, COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''), COALESCE(d.name,'')
		FROM dm3_identity.visits v
		JOIN dm3_identity.visitors vis ON vis.id = v.visitor_id
		LEFT JOIN dm3_identity.users u ON u.id = v.host_user_id
		LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
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

	visits := []models.Visit{}
	for rows.Next() {
		v, err := scanVisitWithJoins(rows)
		if err != nil {
			slog.Error("list visits scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
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
		       vis.created_at, vis.updated_at,
		       u.id, COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''), COALESCE(d.name,'')
		FROM dm3_identity.visits v
		JOIN dm3_identity.visitors vis ON vis.id = v.visitor_id
		LEFT JOIN dm3_identity.users u ON u.id = v.host_user_id
		LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
		WHERE v.id = $1::uuid AND v.tenant_id = $2::uuid`, id, cid)

	visit, err := scanVisitWithJoins(row)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
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

	visitorID, visitorName, err := h.upsertVisitor(r, cid, req.Visitor.FirstName, req.Visitor.LastName, req.Visitor.Email, req.Visitor.Phone, req.Visitor.Company)
	if err != nil {
		slog.Error("upsert visitor error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	qrToken, err := generateQRToken()
	if err != nil {
		slog.Error("generate qr token error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	qrExpiresAt := req.ExpectedArrival.Add(4 * time.Hour)

	var visit models.Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.visits
		  (tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		   status, expected_arrival, expected_departure,
		   qr_token, qr_expires_at, access_areas, escort_required, vehicle_plate)
		VALUES
		  ($1::uuid, $2::uuid, $3::uuid, $4, $5,
		   'pre_registered', $6, $7,
		   $8, $9, $10::uuid[], $11, $12)
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		cid, visitorID, req.HostUserID, req.Purpose, req.PurposeNote,
		req.ExpectedArrival, req.ExpectedDeparture,
		qrToken, qrExpiresAt, req.AccessAreas, req.EscortRequired, req.VehiclePlate,
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
		h.audit.LogFromRequest(r, "visit.pre_registered", "visit", visit.ID, visitorName, "success", nil, visit)
	}
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

	var oldVisit models.Visit
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		status, expected_arrival, expected_departure, actual_checkin, actual_checkout,
		checkin_method, checkin_device_id, checkin_photo_ref, checkout_by, qr_token, qr_expires_at,
		badge_number, temp_credential_id, access_areas, escort_required, vehicle_plate, items_carried,
		nda_signed, host_approved, host_approved_at, notes, created_at, updated_at
		FROM dm3_identity.visits WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(
		&oldVisit.ID, &oldVisit.TenantID, &oldVisit.VisitorID, &oldVisit.HostUserID,
		&oldVisit.Purpose, &oldVisit.PurposeNote, &oldVisit.Status,
		&oldVisit.ExpectedArrival, &oldVisit.ExpectedDeparture, &oldVisit.ActualCheckin, &oldVisit.ActualCheckout,
		&oldVisit.CheckinMethod, &oldVisit.CheckinDeviceID, &oldVisit.CheckinPhotoRef, &oldVisit.CheckoutBy, &oldVisit.QRToken, &oldVisit.QRExpiresAt,
		&oldVisit.BadgeNumber, &oldVisit.TempCredentialID, &oldVisit.AccessAreas, &oldVisit.EscortRequired, &oldVisit.VehiclePlate, &oldVisit.ItemsCarried,
		&oldVisit.NDASigned, &oldVisit.HostApproved, &oldVisit.HostApprovedAt, &oldVisit.Notes, &oldVisit.CreatedAt, &oldVisit.UpdatedAt,
	)

	var visit models.Visit
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_identity.visits
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var hostUserID string
	if err := h.db.Pool.QueryRow(r.Context(), `SELECT host_user_id FROM dm3_identity.visits WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(&hostUserID); err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if !canApproveVisit(r, hostUserID) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	status := models.VisitStatusRejected
	if req.Approved {
		status = models.VisitStatusApproved
	}

	var visit models.Visit
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_identity.visits
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
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if h.audit != nil {
		action := "visit.rejected"
		if req.Approved {
			action = "visit.approved"
		}
		h.audit.LogFromRequest(r, action, "visit", visit.ID, "", "success", nil, visit)
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
	var expectedDeparture *time.Time
	var currentStatus string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT visitor_id, status, qr_token, expected_departure
		FROM dm3_identity.visits
		WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&visitorID, &currentStatus, &qrToken, &expectedDeparture)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if req.QRToken != nil && *req.QRToken != qrToken {
		httputil.Error(w, http.StatusForbidden, "invalid qr token")
		return
	}
	if currentStatus != models.VisitStatusPreRegistered && currentStatus != models.VisitStatusApproved && currentStatus != models.VisitStatusWaiting {
		httputil.Error(w, http.StatusConflict, "visit cannot be checked in from current status")
		return
	}

	if req.NationalID != nil {
		_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_identity.visitors SET national_id = COALESCE($2, national_id), updated_at = now() WHERE id = $1::uuid`, visitorID, req.NationalID)
	}
	if blocked, reason := h.checkWatchlist(r, cid, visitorID); blocked {
		if h.audit != nil {
			h.audit.LogFromRequest(r, "watchlist.match", "visit", id, "", "blocked", nil, map[string]any{"reason": reason, "visitor_id": visitorID})
		}
		httputil.Error(w, http.StatusForbidden, "visitor is on watchlist: "+reason)
		return
	}

	var tempUserID string
	var visFirstName, visLastName string
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT first_name, last_name FROM dm3_identity.visitors WHERE id = $1::uuid`, visitorID).Scan(&visFirstName, &visLastName)

	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status)
		VALUES ($1::uuid, $2, $3, 'visitor')
		RETURNING id`, cid, visFirstName, visLastName,
	).Scan(&tempUserID)
	if err != nil {
		slog.Error("create temp user error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	credValidUntil := endOfDay(time.Now())
	if expectedDeparture != nil {
		credValidUntil = *expectedDeparture
	}
	var tempCredID string
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.credentials
		  (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'qr', $3, 'active', now(), $4)
		RETURNING id`, cid, tempUserID, qrToken, credValidUntil,
	).Scan(&tempCredID)
	if err != nil {
		slog.Error("create temp credential error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if req.BadgeNumber != nil && *req.BadgeNumber != "" {
		_, _ = h.db.Pool.Exec(r.Context(), `
			INSERT INTO dm3_identity.visitor_badges (tenant_id, visit_id, badge_number)
			VALUES ($1::uuid, $2::uuid, $3)
			ON CONFLICT DO NOTHING`, cid, id, req.BadgeNumber)
	}

	var visit models.Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_identity.visits
		SET status             = 'checked_in',
		    actual_checkin     = now(),
		    checkin_method     = $3,
		    checkin_device_id  = COALESCE($4, checkin_device_id),
		    checkin_photo_ref  = COALESCE($5, checkin_photo_ref),
		    items_carried      = COALESCE($6, items_carried),
		    nda_signed         = $7,
		    badge_number       = COALESCE($8, badge_number),
		    temp_credential_id = $9::uuid,
		    updated_at         = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		id, cid, req.CheckinMethod, req.CheckinDeviceID, req.PhotoRef,
		req.ItemsCarried, req.NDASigned, req.BadgeNumber, tempCredID,
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
		slog.Error("checkin visit update error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.checked_in", "visit", visit.ID, auditEntityName(visFirstName, visLastName), "success", nil, map[string]any{
			"visit":            visit,
			"temporary_access": map[string]any{"credential_id": tempCredID, "sync_status": "pending_device_sync"},
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	actorID := ""
	if claims != nil {
		actorID = claims.Sub
	}

	var tempCredID, badgeNumber *string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT temp_credential_id, badge_number FROM dm3_identity.visits WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid).Scan(&tempCredID, &badgeNumber)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}

	if tempCredID != nil {
		_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_identity.credentials SET status = 'revoked', valid_until = now(), updated_at = now() WHERE id = $1::uuid`, *tempCredID)
	}
	if req.BadgeReturned && badgeNumber != nil {
		_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_identity.visitor_badges SET returned_at = now() WHERE visit_id = $1::uuid AND badge_number = $2`, id, *badgeNumber)
	}

	var checkoutBy any
	if actorID != "" {
		checkoutBy = actorID
	}

	var visit models.Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_identity.visits
		SET status          = 'checked_out',
		    actual_checkout = now(),
		    checkout_by     = COALESCE($3::uuid, checkout_by),
		    updated_at      = now()
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'checked_in'
		RETURNING id, tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		id, cid, checkoutBy,
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
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.checked_out", "visit", visit.ID, "", "success", nil, map[string]any{
			"visit":            visit,
			"temporary_access": map[string]any{"credential_id": tempCredID, "sync_status": "pending_revoke_sync"},
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
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT v.id, vis.first_name || ' ' || vis.last_name, vis.company,
		       v.purpose, v.expected_arrival, v.status, v.qr_expires_at
		FROM dm3_identity.visits v
		JOIN dm3_identity.visitors vis ON vis.id = v.visitor_id
		WHERE v.qr_token = $1`, token,
	).Scan(&resp.VisitID, &resp.VisitorName, &resp.VisitorCompany, &resp.Purpose, &resp.ExpectedArrival, &resp.Status, &qrExpiresAt)
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

	var summary models.VisitSummary
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT
		  COUNT(*) FILTER (WHERE status = 'waiting')      AS waiting,
		  COUNT(*) FILTER (WHERE status = 'checked_in')   AS checked_in,
		  COUNT(*) FILTER (WHERE status = 'checked_out')  AS checked_out,
		  COUNT(*) FILTER (WHERE status = 'no_show')      AS no_show,
		  COUNT(*)                                        AS total_expected
		FROM dm3_identity.visits
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

func scanVisitWithJoins(row rowScanner) (models.Visit, error) {
	var v models.Visit
	vis := &models.Visitor{}
	host := &models.VisitHost{}
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
	var existingID string
	if email != nil && *email != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT id FROM dm3_identity.visitors WHERE tenant_id = $1::uuid AND email = $2 LIMIT 1`, cid, *email).Scan(&existingID)
	}
	if existingID == "" && phone != nil && *phone != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT id FROM dm3_identity.visitors WHERE tenant_id = $1::uuid AND phone = $2 LIMIT 1`, cid, *phone).Scan(&existingID)
	}

	name := auditEntityName(firstName, lastName)
	if existingID != "" {
		_, _ = h.db.Pool.Exec(r.Context(), `UPDATE dm3_identity.visitors SET first_name = $2, last_name = $3, company = COALESCE($4, company), visit_count = visit_count + 1, last_visit_at = now(), updated_at = now() WHERE id = $1::uuid`, existingID, firstName, lastName, company)
		return existingID, name, nil
	}

	var newID string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.visitors
		  (tenant_id, first_name, last_name, email, phone, company, watchlist_status, visit_count, last_visit_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, 'none', 1, now())
		RETURNING id`,
		cid, firstName, lastName, email, phone, company,
	).Scan(&newID)
	return newID, name, err
}

func (h *VisitorHandlers) checkWatchlist(r *http.Request, cid, visitorID string) (bool, string) {
	var firstName, lastName string
	var email, phone, nationalID *string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT first_name, last_name, email, phone, national_id FROM dm3_identity.visitors WHERE id = $1::uuid`, visitorID).Scan(&firstName, &lastName, &email, &phone, &nationalID)
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
	}

	query := fmt.Sprintf(`SELECT reason FROM dm3_identity.watchlist WHERE tenant_id = $1::uuid AND entry_type = 'blacklisted' AND (expires_at IS NULL OR expires_at > now()) AND (%s) LIMIT 1`, orClauses)
	var reason string
	if err = h.db.Pool.QueryRow(r.Context(), query, args...).Scan(&reason); err != nil {
		return false, ""
	}
	return true, reason
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
	case models.VisitPurposeMeeting, models.VisitPurposeInterview, models.VisitPurposeDelivery, models.VisitPurposeMaintenance, models.VisitPurposeTour, models.VisitPurposeContractSigning, models.VisitPurposeOther:
		return true
	default:
		return false
	}
}

func isValidCheckinMethod(v string) bool {
	switch v {
	case models.CheckinMethodTerminalQR, models.CheckinMethodTerminalManual, models.CheckinMethodReception, models.CheckinMethodSelfService, models.CheckinMethodMobileQR:
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
