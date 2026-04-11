package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// GetSettings returns the visitor settings for the current tenant.
// If no settings exist, it creates a default row and returns it.
func (h *VisitorHandlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "missing tenant context")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("get visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to load visitor settings")
		return
	}

	httputil.JSON(w, http.StatusOK, settings)
}

// UpdateSettings updates the visitor settings for the current tenant.
func (h *VisitorHandlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "missing tenant context")
		return
	}

	if !requireWatchlistAdmin(r) {
		httputil.Error(w, http.StatusForbidden, "manager role required")
		return
	}

	var req VisitorSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate constraints
	if req.AutoCheckoutHour < 0 || req.AutoCheckoutHour > 23 {
		httputil.Error(w, http.StatusBadRequest, "auto_checkout_hour must be 0-23")
		return
	}
	if req.NoShowGraceMinutes <= 0 {
		httputil.Error(w, http.StatusBadRequest, "no_show_grace_minutes must be positive")
		return
	}
	if req.NotifyMethod == "" {
		req.NotifyMethod = "in_app"
	}
	validMethods := map[string]bool{"in_app": true, "email": true, "sms": true, "email_and_sms": true}
	if !validMethods[req.NotifyMethod] {
		httputil.Error(w, http.StatusBadRequest, "invalid notify_method")
		return
	}

	// Ensure settings row exists first
	if _, err := h.getOrCreateSettings(r.Context(), cid); err != nil {
		slog.Error("ensure visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to initialize settings")
		return
	}

	dbCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	err := h.db.Pool.QueryRow(dbCtx, `
		UPDATE dm3_identity.visitor_settings SET
			approval_required       = $2,
			auto_approve_returning  = $3,
			auto_approve_vip        = $4,
			approver_user_ids       = $5,
			approval_timeout_hours  = $6,
			default_duration_hours  = $7,
			max_duration_hours      = $8,
			auto_checkout_hour      = $9,
			no_show_grace_minutes   = $10,
			qr_validity_before_hours = $11,
			qr_validity_after_hours  = $12,
			require_email           = $13,
			require_phone           = $14,
			require_national_id     = $15,
			require_company         = $16,
			require_photo           = $17,
			require_nda             = $18,
			badge_enabled           = $19,
			badge_auto_assign       = $20,
			badge_prefix            = $21,
			badge_pool_size         = $22,
			notify_host_on_arrival  = $23,
			notify_host_on_register = $24,
			notify_method           = $25,
			allowed_purposes        = $26,
			self_service_enabled    = $27,
			self_service_requires_qr = $28,
			updated_at              = now()
		WHERE tenant_id = $1
		RETURNING id, tenant_id, approval_required, auto_approve_returning, auto_approve_vip,
			approver_user_ids, approval_timeout_hours, default_duration_hours, max_duration_hours,
			auto_checkout_hour, no_show_grace_minutes, qr_validity_before_hours, qr_validity_after_hours,
			require_email, require_phone, require_national_id, require_company, require_photo, require_nda,
			badge_enabled, badge_auto_assign, badge_prefix, badge_pool_size,
			notify_host_on_arrival, notify_host_on_register, notify_method,
			allowed_purposes, self_service_enabled, self_service_requires_qr,
			created_at, updated_at`,
		cid,
		req.ApprovalRequired,
		req.AutoApproveReturning,
		req.AutoApproveVIP,
		req.ApproverUserIDs,
		req.ApprovalTimeoutHours,
		req.DefaultDurationHours,
		req.MaxDurationHours,
		req.AutoCheckoutHour,
		req.NoShowGraceMinutes,
		req.QRValidityBeforeHours,
		req.QRValidityAfterHours,
		req.RequireEmail,
		req.RequirePhone,
		req.RequireNationalID,
		req.RequireCompany,
		req.RequirePhoto,
		req.RequireNDA,
		req.BadgeEnabled,
		req.BadgeAutoAssign,
		req.BadgePrefix,
		req.BadgePoolSize,
		req.NotifyHostOnArrival,
		req.NotifyHostOnRegister,
		req.NotifyMethod,
		req.AllowedPurposes,
		req.SelfServiceEnabled,
		req.SelfServiceRequiresQR,
	).Scan(
		&req.ID, &req.TenantID, &req.ApprovalRequired, &req.AutoApproveReturning, &req.AutoApproveVIP,
		&req.ApproverUserIDs, &req.ApprovalTimeoutHours, &req.DefaultDurationHours, &req.MaxDurationHours,
		&req.AutoCheckoutHour, &req.NoShowGraceMinutes, &req.QRValidityBeforeHours, &req.QRValidityAfterHours,
		&req.RequireEmail, &req.RequirePhone, &req.RequireNationalID, &req.RequireCompany, &req.RequirePhoto, &req.RequireNDA,
		&req.BadgeEnabled, &req.BadgeAutoAssign, &req.BadgePrefix, &req.BadgePoolSize,
		&req.NotifyHostOnArrival, &req.NotifyHostOnRegister, &req.NotifyMethod,
		&req.AllowedPurposes, &req.SelfServiceEnabled, &req.SelfServiceRequiresQR,
		&req.CreatedAt, &req.UpdatedAt,
	)
	if err != nil {
		slog.Error("update visitor settings error", "error", err, "tenant_id", cid)
		httputil.Error(w, http.StatusInternalServerError, "failed to update visitor settings")
		return
	}

	if h.audit != nil {
		h.audit.Log(audit.Entry{
			TenantID:   cid,
			Service:    "visitor-svc",
			Action:     "visitor_settings.updated",
			EntityType: "visitor_settings",
			EntityID:   req.ID,
			Status:     "success",
		})
	}

	httputil.JSON(w, http.StatusOK, req)
}

// getOrCreateSettings retrieves visitor settings for a tenant, creating defaults if none exist.
func (h *VisitorHandlers) getOrCreateSettings(ctx context.Context, tenantID string) (*VisitorSettings, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var s VisitorSettings
	err := h.db.Pool.QueryRow(dbCtx, `
		INSERT INTO dm3_identity.visitor_settings (tenant_id)
		VALUES ($1)
		ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
		RETURNING id, tenant_id, approval_required, auto_approve_returning, auto_approve_vip,
			approver_user_ids, approval_timeout_hours, default_duration_hours, max_duration_hours,
			auto_checkout_hour, no_show_grace_minutes, qr_validity_before_hours, qr_validity_after_hours,
			require_email, require_phone, require_national_id, require_company, require_photo, require_nda,
			badge_enabled, badge_auto_assign, badge_prefix, badge_pool_size,
			notify_host_on_arrival, notify_host_on_register, notify_method,
			allowed_purposes, self_service_enabled, self_service_requires_qr,
			created_at, updated_at`,
		tenantID,
	).Scan(
		&s.ID, &s.TenantID, &s.ApprovalRequired, &s.AutoApproveReturning, &s.AutoApproveVIP,
		&s.ApproverUserIDs, &s.ApprovalTimeoutHours, &s.DefaultDurationHours, &s.MaxDurationHours,
		&s.AutoCheckoutHour, &s.NoShowGraceMinutes, &s.QRValidityBeforeHours, &s.QRValidityAfterHours,
		&s.RequireEmail, &s.RequirePhone, &s.RequireNationalID, &s.RequireCompany, &s.RequirePhoto, &s.RequireNDA,
		&s.BadgeEnabled, &s.BadgeAutoAssign, &s.BadgePrefix, &s.BadgePoolSize,
		&s.NotifyHostOnArrival, &s.NotifyHostOnRegister, &s.NotifyMethod,
		&s.AllowedPurposes, &s.SelfServiceEnabled, &s.SelfServiceRequiresQR,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
