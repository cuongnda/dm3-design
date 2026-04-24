package visitor

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

type walkinRequest struct {
	Visitor struct {
		FirstName  string  `json:"first_name"`
		LastName   string  `json:"last_name"`
		Email      *string `json:"email"`
		Phone      *string `json:"phone"`
		Company    *string `json:"company"`
		NationalID *string `json:"national_id"`
	} `json:"visitor"`
	HostUserID        string     `json:"host_user_id"`
	Purpose           string     `json:"purpose"`
	PurposeNote       *string    `json:"purpose_note"`
	ExpectedDeparture *time.Time `json:"expected_departure"`
	AccessAreas       []string   `json:"access_areas"`
	EscortRequired    bool       `json:"escort_required"`
	VehiclePlate      *string    `json:"vehicle_plate"`
}

func (h *VisitorHandlers) WalkinVisit(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorWrite(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req walkinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Visitor.FirstName == "" || req.Visitor.LastName == "" {
		httputil.Error(w, http.StatusBadRequest, "visitor first_name and last_name are required")
		return
	}
	if req.Purpose == "" || !isValidVisitPurpose(req.Purpose) {
		httputil.Error(w, http.StatusBadRequest, "valid purpose is required")
		return
	}

	// Host is only required when the tenant's approval workflow is enabled —
	// without an approver, there's no one to route the visit to. With approval
	// off, walk-ins can be registered before knowing who they'll meet.
	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("walkin load visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to load visitor settings")
		return
	}
	if settings.ApprovalRequired && req.HostUserID == "" {
		httputil.Error(w, http.StatusBadRequest, "host_user_id is required when tenant requires host approval")
		return
	}
	if req.HostUserID != "" && !h.hostExists(r, cid, req.HostUserID) {
		httputil.Error(w, http.StatusBadRequest, "host_user_id does not reference an active host")
		return
	}

	visitorID, visitorName, err := h.upsertVisitor(r, cid, req.Visitor.FirstName, req.Visitor.LastName, req.Visitor.Email, req.Visitor.Phone, req.Visitor.Company)
	if err != nil {
		slog.Error("walkin upsert visitor error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if req.Visitor.NationalID != nil {
		if _, err := h.db.Pool.Exec(r.Context(), `UPDATE dm3_visitor.visitors SET national_id = $2, updated_at = now() WHERE id = $1::uuid`, visitorID, req.Visitor.NationalID); err != nil {
			slog.Error("walkin update national_id error", "error", err)
		}
	}

	qrToken, err := generateQRToken()
	if err != nil {
		slog.Error("walkin generate qr token error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	now := time.Now()
	qrExpiresAt := now.Add(4 * time.Hour)
	var visit Visit
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.visits
		  (tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		   status, expected_arrival, expected_departure, qr_token, qr_expires_at,
		   access_areas, escort_required, vehicle_plate)
		VALUES
		  ($1::uuid, $2::uuid, NULLIF($3,'')::uuid, $4, $5,
		   'waiting', now(), $6, $7, $8, $9::uuid[], $10, $11)
		RETURNING id, tenant_id, visitor_id, COALESCE(host_user_id::text,''), purpose, purpose_note,
		          status, expected_arrival, expected_departure,
		          actual_checkin, actual_checkout,
		          checkin_method, checkin_device_id, checkin_photo_ref, checkout_by,
		          qr_token, qr_expires_at, badge_number, temp_credential_id,
		          access_areas, escort_required, vehicle_plate, items_carried,
		          nda_signed, host_approved, host_approved_at, notes,
		          created_at, updated_at`,
		cid, visitorID, req.HostUserID, req.Purpose, req.PurposeNote,
		req.ExpectedDeparture, qrToken, qrExpiresAt, req.AccessAreas, req.EscortRequired, req.VehiclePlate,
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
		slog.Error("walkin create visit error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "visit.walkin_registered", "visit", visit.ID, visitorName, "success", nil, visit)
	}
	httputil.JSON(w, http.StatusCreated, visit)
}
