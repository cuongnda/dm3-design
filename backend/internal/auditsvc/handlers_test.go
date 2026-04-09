package auditsvc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestHandlers(isAdmin bool, companyID string) *AuditHandlers {
	return &AuditHandlers{
		db: nil,
		claims: ClaimsReader{
			IsAdmin:   func(_ context.Context) bool { return isAdmin },
			CompanyID: func(_ context.Context) string { return companyID },
		},
	}
}

func TestParseAuditPagination(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantPage  int
		wantLimit int
	}{
		{"defaults", "", 1, defaultAuditLimit},
		{"explicit page and limit", "page=3&limit=100", 3, 100},
		{"limit capped at max", "limit=999", 1, maxAuditLimit},
		{"invalid page ignored", "page=abc", 1, defaultAuditLimit},
		{"zero page ignored", "page=0", 1, defaultAuditLimit},
		{"zero limit ignored", "limit=0", 1, defaultAuditLimit},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/?"+tt.query, nil)
			page, limit := parseAuditPagination(r)
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if limit != tt.wantLimit {
				t.Errorf("limit = %d, want %d", limit, tt.wantLimit)
			}
		})
	}
}

func TestNewAuditHandlers(t *testing.T) {
	h := newTestHandlers(true, "tenant-123")
	if h == nil {
		t.Fatal("expected non-nil AuditHandlers")
	}
	if !h.claims.IsAdmin(context.Background()) {
		t.Error("expected IsAdmin to return true")
	}
	if got := h.claims.CompanyID(context.Background()); got != "tenant-123" {
		t.Errorf("CompanyID = %q, want tenant-123", got)
	}
}

func TestGetAuditLogNoCompanyForbidden(t *testing.T) {
	h := newTestHandlers(false, "")
	r := httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs/some-id", nil)
	w := httptest.NewRecorder()

	defer func() {
		if rec := recover(); rec != nil {
			t.Errorf("handler panicked: %v", rec)
		}
	}()

	h.GetAuditLog(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

func TestBuildAuditWhereAdminNoFilter(t *testing.T) {
	h := newTestHandlers(true, "")
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	where, args, idx := h.buildAuditWhere(r, true)
	if where != "WHERE 1=1" {
		t.Errorf("unexpected where: %s", where)
	}
	if len(args) != 0 {
		t.Errorf("expected no args, got %d", len(args))
	}
	if idx != 1 {
		t.Errorf("expected idx=1, got %d", idx)
	}
}

func TestBuildAuditWhereTenantScoped(t *testing.T) {
	const testTenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	h := newTestHandlers(false, testTenant)
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	where, args, idx := h.buildAuditWhere(r, false)
	if len(args) != 1 || args[0] != testTenant {
		t.Errorf("expected tenant_id arg %s, got %v", testTenant, args)
	}
	if idx != 2 {
		t.Errorf("expected idx=2, got %d", idx)
	}
	_ = where
}

func TestJsonString(t *testing.T) {
	if got := jsonString(nil); got != "" {
		t.Errorf("expected empty for nil, got %q", got)
	}
	m := map[string]any{"key": "val"}
	got := jsonString(m)
	if got == "" {
		t.Errorf("expected non-empty for non-nil map")
	}
}
