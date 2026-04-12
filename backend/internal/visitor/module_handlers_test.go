package visitor

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// setupFullVisitorRouter registers all visitor routes used by the module handler tests.
func setupFullVisitorRouter(h *VisitorHandlers) http.Handler {
	return setupFullVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000aa",
		CID:   visitorTestTenantID,
		Email: "visitor-test@example.com",
		Role:  "primary_manager",
		Roles: []string{"primary_manager"},
	})
}

func setupFullVisitorRouterWithClaims(h *VisitorHandlers, claims *authsvc.AccessClaims) http.Handler {
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1/visitors", func(vr chi.Router) {
		// Visit CRUD & lifecycle
		vr.Get("/", h.ListVisits)
		vr.Post("/", h.CreateVisit)
		vr.Get("/{id}", h.GetVisit)
		vr.Put("/{id}", h.UpdateVisit)
		vr.Post("/{id}/approve", h.ApproveVisit)
		vr.Post("/{id}/checkin", h.CheckinVisit)
		vr.Post("/{id}/checkout", h.CheckoutVisit)
		vr.Post("/walkin", h.WalkinVisit)
		vr.Get("/today/summary", h.GetTodaySummary)

		// Groups
		vr.Get("/groups", h.ListVisitGroups)
		vr.Post("/groups", h.CreateVisitGroup)
		vr.Get("/groups/{group_id}", h.GetVisitGroup)
		vr.Delete("/groups/{group_id}", h.DeleteVisitGroup)

		// Batch
		vr.Post("/batch", h.BatchCreateVisits)

		// Access log & evacuation
		vr.Get("/{id}/access-log", h.ListVisitAccessLog)
		vr.Get("/history/{visitor_id}", h.ListVisitorHistory)
		vr.Get("/evacuation", h.GetEvacuationList)

		// Watchlist
		vr.Get("/watchlist", h.ListWatchlist)
		vr.Post("/watchlist", h.CreateWatchlistEntry)
		vr.Delete("/watchlist/{id}", h.DeleteWatchlistEntry)

		// Agreements
		vr.Get("/agreements", h.ListAgreements)
		vr.Post("/agreements", h.CreateAgreement)
		vr.Put("/agreements/{agreement_id}", h.UpdateAgreement)
		vr.Get("/{id}/agreements", h.ListVisitSignatures)
		vr.Post("/{id}/agreements/sign", h.SignAgreement)

		// Analytics
		vr.Get("/analytics", h.GetVisitorAnalytics)
		vr.Get("/analytics/top-visitors", h.GetTopVisitors)

		// Recurring
		vr.Get("/recurring", h.ListRecurringTemplates)
		vr.Post("/recurring", h.CreateRecurringTemplate)
		vr.Put("/recurring/{template_id}", h.UpdateRecurringTemplate)
		vr.Delete("/recurring/{template_id}", h.DeleteRecurringTemplate)

		// Settings
		vr.Get("/settings", h.GetSettings)
		vr.Put("/settings", h.UpdateSettings)
	})
	return r
}

// ─── Settings Tests ─────────────────────────────────────────────────────────

func TestGetSettingsReturnsDefaults(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /settings expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var settings VisitorSettings
	if err := json.Unmarshal(w.Body.Bytes(), &settings); err != nil {
		t.Fatalf("decode settings: %v", err)
	}
	if settings.TenantID == "" {
		t.Fatal("expected tenant_id to be set")
	}
	// Verify default field names match JSON contract
	raw := make(map[string]any)
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode raw settings: %v", err)
	}
	requiredFields := []string{
		"id", "tenant_id", "approval_required", "auto_approve_returning",
		"auto_approve_vip", "approver_user_ids", "approval_timeout_hours",
		"default_duration_hours", "max_duration_hours", "auto_checkout_hour",
		"no_show_grace_minutes", "qr_validity_before_hours", "qr_validity_after_hours",
		"require_email", "require_phone", "require_national_id", "require_company",
		"require_photo", "require_nda", "badge_enabled", "badge_auto_assign",
		"badge_prefix", "badge_pool_size", "notify_host_on_arrival",
		"notify_host_on_register", "notify_method", "self_service_enabled",
		"self_service_requires_qr", "created_at", "updated_at",
	}
	for _, field := range requiredFields {
		if _, ok := raw[field]; !ok {
			t.Errorf("missing expected field %q in settings response", field)
		}
	}
}

func TestUpdateSettingsReturnsUpdatedFields(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Ensure defaults exist first
	req := httptest.NewRequest("GET", "/api/v1/visitors/settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /settings expected 200, got %d", w.Code)
	}

	// Update settings with real field names
	body := mustJSONBody(t, VisitorSettings{
		ApprovalRequired:      true,
		AutoApproveReturning:  true,
		AutoApproveVIP:        false,
		ApprovalTimeoutHours:  48,
		DefaultDurationHours:  4,
		MaxDurationHours:      12,
		AutoCheckoutHour:      20,
		NoShowGraceMinutes:    15,
		QRValidityBeforeHours: 24,
		QRValidityAfterHours:  4,
		RequireEmail:          true,
		RequirePhone:          true,
		RequireNationalID:     false,
		RequireCompany:        false,
		RequirePhoto:          true,
		RequireNDA:            true,
		BadgeEnabled:          true,
		BadgeAutoAssign:       true,
		BadgePrefix:           "VIS",
		BadgePoolSize:         100,
		NotifyHostOnArrival:   true,
		NotifyHostOnRegister:  true,
		NotifyMethod:          "email",
		SelfServiceEnabled:    false,
		SelfServiceRequiresQR: true,
	})

	req = httptest.NewRequest("PUT", "/api/v1/visitors/settings", body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("PUT /settings expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated VisitorSettings
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated settings: %v", err)
	}
	if !updated.ApprovalRequired {
		t.Error("expected approval_required=true")
	}
	if !updated.AutoApproveReturning {
		t.Error("expected auto_approve_returning=true")
	}
	if updated.AutoCheckoutHour != 20 {
		t.Errorf("expected auto_checkout_hour=20, got %d", updated.AutoCheckoutHour)
	}
	if updated.MaxDurationHours != 12 {
		t.Errorf("expected max_duration_hours=12, got %d", updated.MaxDurationHours)
	}
	if updated.NotifyMethod != "email" {
		t.Errorf("expected notify_method=email, got %s", updated.NotifyMethod)
	}
	if updated.BadgePrefix != "VIS" {
		t.Errorf("expected badge_prefix=VIS, got %s", updated.BadgePrefix)
	}
}

func TestUpdateSettingsInvalidAutoCheckoutHour(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	body := mustJSONBody(t, map[string]any{
		"auto_checkout_hour":   25,
		"no_show_grace_minutes": 30,
		"notify_method":        "in_app",
	})
	req := httptest.NewRequest("PUT", "/api/v1/visitors/settings", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid auto_checkout_hour, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateSettingsInvalidNotifyMethod(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	body := mustJSONBody(t, map[string]any{
		"auto_checkout_hour":    18,
		"no_show_grace_minutes": 30,
		"notify_method":         "pigeon_post",
	})
	req := httptest.NewRequest("PUT", "/api/v1/visitors/settings", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid notify_method, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Analytics Tests ────────────────────────────────────────────────────────

func TestGetAnalyticsReturnsSingleObject(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/analytics?period=7d", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /analytics expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Must be an object, not an array
	raw := w.Body.Bytes()
	if len(raw) == 0 || raw[0] == '[' {
		t.Fatal("expected analytics to return a JSON object, not an array")
	}

	var analytics map[string]any
	if err := json.Unmarshal(raw, &analytics); err != nil {
		t.Fatalf("decode analytics: %v", err)
	}

	requiredFields := []string{
		"period", "total_visits", "unique_visitors", "checked_in",
		"no_shows", "avg_duration_minutes", "by_purpose", "by_status",
		"peak_hour",
	}
	for _, field := range requiredFields {
		if _, ok := analytics[field]; !ok {
			t.Errorf("missing expected field %q in analytics response", field)
		}
	}
	if analytics["period"] != "7d" {
		t.Errorf("expected period=7d, got %v", analytics["period"])
	}
}

func TestGetAnalyticsDefault7d(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// No period param should default to 7d
	req := httptest.NewRequest("GET", "/api/v1/visitors/analytics", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var analytics map[string]any
	json.Unmarshal(w.Body.Bytes(), &analytics)
	if analytics["period"] != "7d" {
		t.Errorf("expected default period=7d, got %v", analytics["period"])
	}
}

func TestGetAnalytics30d(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/analytics?period=30d", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var analytics map[string]any
	json.Unmarshal(w.Body.Bytes(), &analytics)
	if analytics["period"] != "30d" {
		t.Errorf("expected period=30d, got %v", analytics["period"])
	}
}

func TestGetTopVisitorsFieldNames(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Create a visitor with some visits for top visitors to return
	seed := time.Now().UnixNano()
	email := fmt.Sprintf("top-%d@test.com", seed)
	createVisitorRecord(t, database, "TopTest", "Visitor", &email, nil, nil, nil)

	req := httptest.NewRequest("GET", "/api/v1/visitors/analytics/top-visitors?limit=5", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /analytics/top-visitors expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Response must be an array
	raw := w.Body.Bytes()
	if len(raw) == 0 || raw[0] != '[' {
		t.Fatal("expected top-visitors to return a JSON array")
	}

	// If there are any entries, verify field names
	var visitors []map[string]any
	if err := json.Unmarshal(raw, &visitors); err != nil {
		t.Fatalf("decode top visitors: %v", err)
	}
	if len(visitors) > 0 {
		v := visitors[0]
		for _, field := range []string{"visitor_id", "name", "visit_count"} {
			if _, ok := v[field]; !ok {
				t.Errorf("missing field %q in top visitor entry", field)
			}
		}
		// Must NOT have old frontend field names
		if _, ok := v["visitor_name"]; ok {
			t.Error("top visitor should use 'name' not 'visitor_name'")
		}
		if _, ok := v["visitor_company"]; ok {
			t.Error("top visitor should use 'company' not 'visitor_company'")
		}
	}
}

// ─── Visit Group Tests ──────────────────────────────────────────────────────

func TestCreateVisitGroupRequiresFields(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Missing required fields should return 400
	body := mustJSONBody(t, map[string]any{"name": "Test Group"})
	req := httptest.NewRequest("POST", "/api/v1/visitors/groups", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for incomplete group creation, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateAndListVisitGroup(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	hostID := createHostRecord(t, database, "GroupHost", "User")

	body := mustJSONBody(t, map[string]any{
		"name":             "Conference Group",
		"description":      "Annual conference visitors",
		"host_user_id":     hostID,
		"purpose":          "meeting",
		"expected_arrival":  time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		"escort_required":  true,
	})
	req := httptest.NewRequest("POST", "/api/v1/visitors/groups", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("POST /groups expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var group VisitGroup
	if err := json.Unmarshal(w.Body.Bytes(), &group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	if group.Name != "Conference Group" {
		t.Errorf("expected name 'Conference Group', got %q", group.Name)
	}
	if group.HostUserID != hostID {
		t.Error("expected host_user_id to match")
	}
	if group.Purpose != "meeting" {
		t.Errorf("expected purpose 'meeting', got %q", group.Purpose)
	}

	// Verify JSON field names in raw response
	raw := make(map[string]any)
	json.Unmarshal(w.Body.Bytes(), &raw)
	for _, field := range []string{"id", "tenant_id", "name", "host_user_id", "purpose", "expected_arrival", "escort_required", "created_by", "created_at", "updated_at"} {
		if _, ok := raw[field]; !ok {
			t.Errorf("missing field %q in group response", field)
		}
	}

	// List and verify the group appears
	req = httptest.NewRequest("GET", "/api/v1/visitors/groups", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /groups expected 200, got %d", w.Code)
	}

	// Delete the group
	req = httptest.NewRequest("DELETE", "/api/v1/visitors/groups/"+group.ID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("DELETE /groups expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Agreement Tests ────────────────────────────────────────────────────────

func TestCreateAgreementRequiresNameAndContent(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Missing content
	body := mustJSONBody(t, map[string]any{"name": "NDA"})
	req := httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing content, got %d: %s", w.Code, w.Body.String())
	}

	// Missing name
	body = mustJSONBody(t, map[string]any{"content": "Some agreement text"})
	req = httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing name, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateAgreementUsesNameNotTitle(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Create with correct field name "name"
	body := mustJSONBody(t, map[string]any{
		"name":    "Non-Disclosure Agreement",
		"content": "This is a test NDA agreement content.",
	})
	req := httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("POST /agreements expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Verify response uses "name" not "title", "active" not "is_active"
	raw := make(map[string]any)
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode agreement: %v", err)
	}

	if _, ok := raw["name"]; !ok {
		t.Error("agreement response should have 'name' field")
	}
	if _, ok := raw["title"]; ok {
		t.Error("agreement response should NOT have 'title' field (old frontend name)")
	}
	if _, ok := raw["active"]; !ok {
		t.Error("agreement response should have 'active' field")
	}
	if _, ok := raw["is_active"]; ok {
		t.Error("agreement response should NOT have 'is_active' field (old frontend name)")
	}

	if raw["name"] != "Non-Disclosure Agreement" {
		t.Errorf("expected name to be 'Non-Disclosure Agreement', got %v", raw["name"])
	}
	if raw["active"] != true {
		t.Errorf("expected active=true by default, got %v", raw["active"])
	}

	// Create with old field name "title" should fail (name required)
	body = mustJSONBody(t, map[string]any{
		"title":   "Should Fail",
		"content": "Content here",
	})
	req = httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("POST with 'title' instead of 'name' should return 400, got %d", w.Code)
	}
}

func TestListAgreementsReturnsArray(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/agreements", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /agreements expected 200, got %d: %s", w.Code, w.Body.String())
	}

	raw := w.Body.Bytes()
	if len(raw) == 0 || raw[0] != '[' {
		t.Fatal("expected agreements to return a JSON array")
	}
}

func TestUpdateAgreementBumpsVersion(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Create an agreement first
	body := mustJSONBody(t, map[string]any{
		"name":    "Version Test Agreement",
		"content": "Version 1 content",
	})
	req := httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create agreement: expected 201, got %d", w.Code)
	}

	var agreement VisitorAgreement
	json.Unmarshal(w.Body.Bytes(), &agreement)
	if agreement.Version != 1 {
		t.Fatalf("expected initial version=1, got %d", agreement.Version)
	}

	// Update content => should bump version
	updatedContent := "Version 2 content"
	body = mustJSONBody(t, map[string]any{"content": updatedContent})
	req = httptest.NewRequest("PUT", "/api/v1/visitors/agreements/"+agreement.ID, body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("PUT /agreements/{id} expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated VisitorAgreement
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Version != 2 {
		t.Errorf("expected version=2 after content update, got %d", updated.Version)
	}
	if updated.Content != updatedContent {
		t.Errorf("expected content to be updated")
	}
}

// ─── Access Log Tests ───────────────────────────────────────────────────────

func TestAccessLogFieldNames(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Create a visit to query access log for
	visitID, _, _ := createVisitorFixture(t, database, "checked_in")

	req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/visitors/%s/access-log", visitID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /access-log expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Response should be a paginated structure
	var result struct {
		Data  []map[string]any `json:"data"`
		Total int              `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode access log: %v", err)
	}

	// If there are entries, verify field names use backend names
	if len(result.Data) > 0 {
		entry := result.Data[0]
		// Must have backend field names
		for _, field := range []string{"decision", "event_time", "credential_type"} {
			if _, ok := entry[field]; !ok {
				t.Errorf("expected field %q in access log entry", field)
			}
		}
		// Must NOT have old frontend field names
		for _, oldField := range []string{"granted", "timestamp", "method"} {
			if _, ok := entry[oldField]; ok {
				t.Errorf("access log should NOT have old field %q", oldField)
			}
		}
	}
}

func TestVisitorHistoryEndpoint(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	seed := time.Now().UnixNano()
	email := fmt.Sprintf("history-%d@test.com", seed)
	visitorID := createVisitorRecord(t, database, "History", "Visitor", &email, nil, nil, nil)

	req := httptest.NewRequest("GET", "/api/v1/visitors/history/"+visitorID, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /history/{visitor_id} expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Recurring Template Tests ───────────────────────────────────────────────

func TestCreateRecurringTemplateRequiresFields(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	// Missing required fields
	body := mustJSONBody(t, map[string]any{"purpose": "meeting"})
	req := httptest.NewRequest("POST", "/api/v1/visitors/recurring", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for incomplete recurring template, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRecurringTemplateUsesActiveNotIsActive(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	hostID := createHostRecord(t, database, "RecurringHost", "User")
	seed := time.Now().UnixNano()
	email := fmt.Sprintf("recurring-%d@test.com", seed)
	visitorID := createVisitorRecord(t, database, "Recurring", "Visitor", &email, nil, nil, nil)

	body := mustJSONBody(t, map[string]any{
		"visitor_id":      visitorID,
		"host_user_id":    hostID,
		"purpose":         "meeting",
		"recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
		"start_date":      time.Now().Format("2006-01-02"),
	})
	req := httptest.NewRequest("POST", "/api/v1/visitors/recurring", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("POST /recurring expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Verify JSON uses "active" not "is_active", "recurrence_rule" not "schedule_cron"
	raw := make(map[string]any)
	json.Unmarshal(w.Body.Bytes(), &raw)

	if _, ok := raw["active"]; !ok {
		t.Error("recurring template should have 'active' field")
	}
	if _, ok := raw["is_active"]; ok {
		t.Error("recurring template should NOT have 'is_active' field")
	}
	if _, ok := raw["recurrence_rule"]; !ok {
		t.Error("recurring template should have 'recurrence_rule' field")
	}
	if _, ok := raw["schedule_cron"]; ok {
		t.Error("recurring template should NOT have 'schedule_cron' field")
	}
	if _, ok := raw["start_date"]; !ok {
		t.Error("recurring template should have 'start_date' field")
	}

	// Verify toggle active works with "active" field
	templateID, _ := raw["id"].(string)
	body = mustJSONBody(t, map[string]any{"active": false})
	req = httptest.NewRequest("PUT", "/api/v1/visitors/recurring/"+templateID, body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("PUT /recurring/{id} expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated map[string]any
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated["active"] != false {
		t.Error("expected active=false after toggle")
	}

	// Clean up
	req = httptest.NewRequest("DELETE", "/api/v1/visitors/recurring/"+templateID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("DELETE /recurring/{id} expected 200, got %d", w.Code)
	}
}

func TestListRecurringTemplates(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/recurring", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /recurring expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Evacuation Tests ───────────────────────────────────────────────────────

func TestEvacuationListEndpoint(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/visitors/evacuation", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /evacuation expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Permission Tests ───────────────────────────────────────────────────────

func TestViewerCannotUpdateSettings(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	body := mustJSONBody(t, map[string]any{
		"auto_checkout_hour":    18,
		"no_show_grace_minutes": 30,
		"notify_method":         "in_app",
	})
	req := httptest.NewRequest("PUT", "/api/v1/visitors/settings", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer should not be able to update settings, got %d", w.Code)
	}
}

func TestViewerCannotCreateAgreement(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	body := mustJSONBody(t, map[string]any{
		"name":    "Viewer NDA",
		"content": "Should fail",
	})
	req := httptest.NewRequest("POST", "/api/v1/visitors/agreements", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer should not be able to create agreements, got %d", w.Code)
	}
}

func TestViewerCanReadSettings(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	req := httptest.NewRequest("GET", "/api/v1/visitors/settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("viewer should be able to read settings, got %d: %s", w.Code, w.Body.String())
	}
}

func TestViewerCanReadAnalytics(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()
	h := NewVisitorHandlers(database, nil, nil)
	router := setupFullVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	req := httptest.NewRequest("GET", "/api/v1/visitors/analytics", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("viewer should be able to read analytics, got %d: %s", w.Code, w.Body.String())
	}
}
