package visitor

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Agreement CRUD ─────────────────────────────────────────────────────────

type createAgreementRequest struct {
	Name        string   `json:"name"`
	Content     string   `json:"content"`
	RequiredFor []string `json:"required_for"` // visit purposes that require this agreement
}

// ListAgreements returns active agreements for the tenant.
func (h *VisitorHandlers) ListAgreements(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	activeOnly := r.URL.Query().Get("active") != "false"
	activeFilter := ""
	if activeOnly {
		activeFilter = " AND active = true"
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, tenant_id, name, content, version, active, required_for, created_at, updated_at
		FROM dm3_identity.visitor_agreements
		WHERE tenant_id = $1::uuid`+activeFilter+`
		ORDER BY created_at DESC`, cid)
	if err != nil {
		slog.Error("list agreements error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	agreements := []VisitorAgreement{}
	for rows.Next() {
		var a VisitorAgreement
		if err := rows.Scan(
			&a.ID, &a.TenantID, &a.Name, &a.Content, &a.Version,
			&a.Active, &a.RequiredFor, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			slog.Error("scan agreement error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		agreements = append(agreements, a)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, agreements)
}

// CreateAgreement creates a new visitor agreement (NDA, terms, etc.).
func (h *VisitorHandlers) CreateAgreement(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireWatchlistAdmin(r) {
		httputil.Error(w, http.StatusForbidden, "manager role required")
		return
	}

	var req createAgreementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Content == "" {
		httputil.Error(w, http.StatusBadRequest, "name and content are required")
		return
	}

	var a VisitorAgreement
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.visitor_agreements (tenant_id, name, content, required_for)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id, tenant_id, name, content, version, active, required_for, created_at, updated_at`,
		cid, req.Name, req.Content, req.RequiredFor,
	).Scan(
		&a.ID, &a.TenantID, &a.Name, &a.Content, &a.Version,
		&a.Active, &a.RequiredFor, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		slog.Error("create agreement error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "agreement.created", "visitor_agreement", a.ID, a.Name, "success", nil, a)
	}
	httputil.JSON(w, http.StatusCreated, a)
}

// UpdateAgreement updates an agreement's content (bumps version) or active status.
func (h *VisitorHandlers) UpdateAgreement(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireWatchlistAdmin(r) {
		httputil.Error(w, http.StatusForbidden, "manager role required")
		return
	}

	agreementID := chi.URLParam(r, "agreement_id")

	var req struct {
		Name        *string  `json:"name"`
		Content     *string  `json:"content"`
		Active      *bool    `json:"active"`
		RequiredFor []string `json:"required_for"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Bump version if content changes
	versionBump := ""
	if req.Content != nil {
		versionBump = ", version = version + 1"
	}

	var a VisitorAgreement
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_identity.visitor_agreements
		SET name         = COALESCE($3, name),
		    content      = COALESCE($4, content),
		    active       = COALESCE($5, active),
		    required_for = COALESCE($6, required_for),
		    updated_at   = now()`+versionBump+`
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		RETURNING id, tenant_id, name, content, version, active, required_for, created_at, updated_at`,
		agreementID, cid, req.Name, req.Content, req.Active, req.RequiredFor,
	).Scan(
		&a.ID, &a.TenantID, &a.Name, &a.Content, &a.Version,
		&a.Active, &a.RequiredFor, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "agreement not found")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "agreement.updated", "visitor_agreement", a.ID, a.Name, "success", nil, a)
	}
	httputil.JSON(w, http.StatusOK, a)
}

// ─── Agreement Signing ──────────────────────────────────────────────────────

type signAgreementRequest struct {
	AgreementID  string  `json:"agreement_id"`
	VisitorID    string  `json:"visitor_id"`
	SignatureRef *string `json:"signature_ref"` // optional: reference to uploaded signature image
}

// SignAgreement records a visitor's signature on an agreement for a visit.
// POST /api/v1/visitors/{id}/agreements/sign
func (h *VisitorHandlers) SignAgreement(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	visitID := visitIDParam(r)

	var req signAgreementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgreementID == "" || req.VisitorID == "" {
		httputil.Error(w, http.StatusBadRequest, "agreement_id and visitor_id are required")
		return
	}

	// Verify visit belongs to tenant
	var visitExists bool
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_identity.visits WHERE id = $1::uuid AND tenant_id = $2::uuid)`,
		visitID, cid).Scan(&visitExists); err != nil || !visitExists {
		httputil.Error(w, http.StatusNotFound, "visit not found")
		return
	}

	// Verify the agreement is active
	var agreementActive bool
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT active FROM dm3_identity.visitor_agreements WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		req.AgreementID, cid).Scan(&agreementActive); err != nil || !agreementActive {
		httputil.Error(w, http.StatusBadRequest, "agreement not found or inactive")
		return
	}

	var sig VisitorAgreementSignature
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.visitor_agreement_signatures
		  (tenant_id, visit_id, agreement_id, visitor_id, signature_ref)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
		ON CONFLICT DO NOTHING
		RETURNING id, tenant_id, visit_id, agreement_id, visitor_id, signature_ref, signed_at`,
		cid, visitID, req.AgreementID, req.VisitorID, req.SignatureRef,
	).Scan(
		&sig.ID, &sig.TenantID, &sig.VisitID, &sig.AgreementID,
		&sig.VisitorID, &sig.SignatureRef, &sig.SignedAt,
	)
	if err != nil {
		slog.Error("sign agreement error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to record signature")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "agreement.signed", "visitor_agreement_signature", sig.ID, "", "success", nil, sig)
	}
	httputil.JSON(w, http.StatusCreated, sig)
}

// ListVisitSignatures returns all agreement signatures for a visit.
// GET /api/v1/visitors/{id}/agreements
func (h *VisitorHandlers) ListVisitSignatures(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	visitID := visitIDParam(r)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT s.id, s.tenant_id, s.visit_id, s.agreement_id, s.visitor_id, s.signature_ref, s.signed_at,
		       a.name, a.version
		FROM dm3_identity.visitor_agreement_signatures s
		JOIN dm3_identity.visitor_agreements a ON a.id = s.agreement_id
		WHERE s.visit_id = $1::uuid AND s.tenant_id = $2::uuid
		ORDER BY s.signed_at DESC`, visitID, cid)
	if err != nil {
		slog.Error("list visit signatures error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type signatureWithName struct {
		VisitorAgreementSignature
		AgreementName    string `json:"agreement_name"`
		AgreementVersion int    `json:"agreement_version"`
	}

	sigs := []signatureWithName{}
	for rows.Next() {
		var s signatureWithName
		if err := rows.Scan(
			&s.ID, &s.TenantID, &s.VisitID, &s.AgreementID,
			&s.VisitorID, &s.SignatureRef, &s.SignedAt,
			&s.AgreementName, &s.AgreementVersion,
		); err != nil {
			slog.Error("scan signature error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		sigs = append(sigs, s)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, sigs)
}
