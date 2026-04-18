package identity

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Email Template Types & Defaults ─────────────────────────────────────────

// EmailTemplate represents a customizable email template.
type EmailTemplate struct {
	ID        string          `json:"id"`
	TenantID  string          `json:"tenant_id"`
	Type      string          `json:"type"`
	Name      string          `json:"name"`
	Subject   string          `json:"subject"`
	BodyHTML  string          `json:"body_html"`
	Variables json.RawMessage `json:"variables"`
	IsActive  bool            `json:"is_active"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// templateTypeMeta defines each template type's metadata and available variables.
type templateTypeMeta struct {
	Type      string   `json:"type"`
	Name      string   `json:"name"`
	Variables []string `json:"variables"`
}

var defaultTemplateTypes = []templateTypeMeta{
	{
		Type: "account_created",
		Name: "Account Created / Welcome",
		Variables: []string{
			"{{user_name}}", "{{email}}", "{{company_name}}",
			"{{login_url}}", "{{temp_password}}",
		},
	},
	{
		Type: "password_reset",
		Name: "Password Reset",
		Variables: []string{
			"{{user_name}}", "{{reset_link}}", "{{expires_in}}",
		},
	},
	{
		Type: "visitor_invitation",
		Name: "Visitor Invitation",
		Variables: []string{
			"{{visitor_name}}", "{{host_name}}", "{{company_name}}",
			"{{purpose}}", "{{expected_arrival}}", "{{location}}", "{{qr_code}}",
		},
	},
}

// ─── Handlers ────────────────────────────────────────────────────────────────

// ListEmailTemplateTypes returns all available template types with their variables.
func (h *IdentityHandlers) ListEmailTemplateTypes(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, map[string]any{"types": defaultTemplateTypes})
}

// ListEmailTemplates returns all email templates for the current tenant.
func (h *IdentityHandlers) ListEmailTemplates(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, tenant_id, type, name, subject, body_html, variables, is_active, created_at, updated_at
		 FROM dm3_identity.email_templates WHERE tenant_id = $1::uuid ORDER BY type`, cid)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	templates := []EmailTemplate{}
	for rows.Next() {
		var t EmailTemplate
		if err := rows.Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Subject,
			&t.BodyHTML, &t.Variables, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			slog.Error("scan email template", "error", err)
			continue
		}
		templates = append(templates, t)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{"templates": templates})
}

// GetEmailTemplate returns a single email template by ID.
func (h *IdentityHandlers) GetEmailTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var t EmailTemplate
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, type, name, subject, body_html, variables, is_active, created_at, updated_at
		 FROM dm3_identity.email_templates WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Subject,
		&t.BodyHTML, &t.Variables, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "template not found")
		return
	}
	httputil.JSON(w, http.StatusOK, t)
}

type upsertEmailTemplateRequest struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Subject  string `json:"subject"`
	BodyHTML string `json:"body_html"`
	IsActive *bool  `json:"is_active"`
}

// CreateEmailTemplate creates or updates (upsert) an email template for the tenant.
func (h *IdentityHandlers) CreateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req upsertEmailTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" || req.Subject == "" || req.BodyHTML == "" {
		httputil.Error(w, http.StatusBadRequest, "type, subject and body_html are required")
		return
	}

	// Find the variables for this template type
	var variables json.RawMessage
	for _, tmpl := range defaultTemplateTypes {
		if tmpl.Type == req.Type {
			b, _ := json.Marshal(tmpl.Variables)
			variables = b
			break
		}
	}
	if variables == nil {
		variables = json.RawMessage(`[]`)
	}

	if req.Name == "" {
		for _, tmpl := range defaultTemplateTypes {
			if tmpl.Type == req.Type {
				req.Name = tmpl.Name
				break
			}
		}
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var t EmailTemplate
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.email_templates (tenant_id, type, name, subject, body_html, variables, is_active)
		 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (tenant_id, type) DO UPDATE SET
			name = EXCLUDED.name, subject = EXCLUDED.subject, body_html = EXCLUDED.body_html,
			variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = now()
		 RETURNING id, tenant_id, type, name, subject, body_html, variables, is_active, created_at, updated_at`,
		cid, req.Type, req.Name, req.Subject, req.BodyHTML, variables, isActive,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Subject,
		&t.BodyHTML, &t.Variables, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		slog.Error("upsert email template", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.audit.LogFromRequest(r, "identity.email_template.upsert", "email_template", t.ID, t.Type, "success", nil, req)
	httputil.JSON(w, http.StatusOK, t)
}

// UpdateEmailTemplate updates an existing email template.
func (h *IdentityHandlers) UpdateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var req upsertEmailTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var t EmailTemplate
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.email_templates SET
			name = COALESCE(NULLIF($3,''), name),
			subject = COALESCE(NULLIF($4,''), subject),
			body_html = COALESCE(NULLIF($5,''), body_html),
			is_active = $6,
			updated_at = now()
		 WHERE id = $1::uuid AND tenant_id = $2::uuid
		 RETURNING id, tenant_id, type, name, subject, body_html, variables, is_active, created_at, updated_at`,
		id, cid, req.Name, req.Subject, req.BodyHTML, isActive,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Subject,
		&t.BodyHTML, &t.Variables, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "template not found")
		return
	}

	h.audit.LogFromRequest(r, "identity.email_template.update", "email_template", t.ID, t.Type, "success", nil, req)
	httputil.JSON(w, http.StatusOK, t)
}

// DeleteEmailTemplate removes a custom template (reverts to system default).
func (h *IdentityHandlers) DeleteEmailTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := authsvc.CompanyIDFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.email_templates WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "template not found")
		return
	}
	h.audit.LogFromRequest(r, "identity.email_template.delete", "email_template", id, id, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// PreviewEmailTemplate renders a template with sample data and returns HTML.
func (h *IdentityHandlers) PreviewEmailTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BodyHTML string `json:"body_html"`
		Type     string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Replace placeholders with sample data
	sampleData := map[string]string{
		"{{user_name}}":        "Nguyễn Văn A",
		"{{email}}":            "nguyenvana@example.com",
		"{{company_name}}":     "Duali Vietnam",
		"{{login_url}}":        "https://app.duall.vn/login",
		"{{temp_password}}":    "Temp@1234",
		"{{reset_link}}":       "https://app.duall.vn/reset-password?token=sample",
		"{{expires_in}}":       "1 hour",
		"{{visitor_name}}":     "Trần Thị B",
		"{{host_name}}":        "Nguyễn Văn A",
		"{{purpose}}":          "Business Meeting",
		"{{expected_arrival}}": "2026-04-15 09:00",
		"{{location}}":         "Floor 3, Meeting Room A",
		"{{qr_code}}":          "VIS-2026-SAMPLE",
	}

	rendered := req.BodyHTML
	for k, v := range sampleData {
		rendered = strings.ReplaceAll(rendered, k, v)
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"html": rendered})
}

// GetEmailTemplateByType returns a tenant's custom template or empty if none.
func (h *IdentityHandlers) GetEmailTemplateByType(w http.ResponseWriter, r *http.Request) {
	templateType := chi.URLParam(r, "type")
	cid := authsvc.CompanyIDFromContext(r.Context())

	var t EmailTemplate
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, tenant_id, type, name, subject, body_html, variables, is_active, created_at, updated_at
		 FROM dm3_identity.email_templates WHERE tenant_id = $1::uuid AND type = $2 AND is_active = true`,
		cid, templateType,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Subject,
		&t.BodyHTML, &t.Variables, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		httputil.JSON(w, http.StatusOK, map[string]any{"template": nil})
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"template": t})
}
