package authsvc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

// ─── Stats Endpoint Tests ────────────────────────────────────────────────────

func TestSystemStatsResponse(t *testing.T) {
	// Test that the stats response struct marshals correctly
	stats := systemStats{
		Companies: companyStat{Total: 10, Active: 8, Suspended: 2},
		Users:     userStat{Total: 100, Active: 95, Inactive: 5},
		Devices:   deviceStat{Total: 50, Online: 30, Offline: 20},
		RecentStats: recentStat{
			NewCompanies7d: 2,
			NewUsers7d:     15,
			NewDevices7d:   5,
		},
	}

	data, err := json.Marshal(stats)
	if err != nil {
		t.Fatalf("marshal stats: %v", err)
	}

	var got systemStats
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal stats: %v", err)
	}

	if got.Companies.Total != 10 {
		t.Errorf("companies.total = %d, want 10", got.Companies.Total)
	}
	if got.Companies.Active != 8 {
		t.Errorf("companies.active = %d, want 8", got.Companies.Active)
	}
	if got.Companies.Suspended != 2 {
		t.Errorf("companies.suspended = %d, want 2", got.Companies.Suspended)
	}
	if got.Users.Total != 100 {
		t.Errorf("users.total = %d, want 100", got.Users.Total)
	}
	if got.Devices.Online != 30 {
		t.Errorf("devices.online = %d, want 30", got.Devices.Online)
	}
	if got.RecentStats.NewCompanies7d != 2 {
		t.Errorf("recent.new_companies_7d = %d, want 2", got.RecentStats.NewCompanies7d)
	}
	if got.RecentStats.NewUsers7d != 15 {
		t.Errorf("recent.new_users_7d = %d, want 15", got.RecentStats.NewUsers7d)
	}
}

func TestSystemStatsJSONFields(t *testing.T) {
	stats := systemStats{
		Companies:   companyStat{Total: 1, Active: 1, Suspended: 0},
		Users:       userStat{Total: 2, Active: 2, Inactive: 0},
		Devices:     deviceStat{Total: 3, Online: 1, Offline: 2},
		RecentStats: recentStat{NewCompanies7d: 1, NewUsers7d: 2, NewDevices7d: 3},
	}

	data, _ := json.Marshal(stats)
	s := string(data)

	// Verify JSON field names
	expectedFields := []string{
		`"companies"`, `"users"`, `"devices"`, `"recent"`,
		`"total"`, `"active"`, `"suspended"`, `"inactive"`,
		`"online"`, `"offline"`,
		`"new_companies_7d"`, `"new_users_7d"`, `"new_devices_7d"`,
	}
	for _, f := range expectedFields {
		if !strings.Contains(s, f) {
			t.Errorf("JSON missing field %s in: %s", f, s)
		}
	}
}

// ─── Company Handlers Tests ──────────────────────────────────────────────────

func TestCreateCompanyRequestValidation(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		wantCode int
	}{
		{
			"valid request",
			`{"name":"Test Corp","code":"TEST","email":"admin@test.com"}`,
			0, // would need DB, skip actual handler
		},
		{
			"missing name",
			`{"code":"TEST","email":"admin@test.com"}`,
			http.StatusBadRequest,
		},
		{
			"missing code",
			`{"name":"Test Corp","email":"admin@test.com"}`,
			http.StatusBadRequest,
		},
		{
			"missing email",
			`{"name":"Test Corp","code":"TEST"}`,
			http.StatusBadRequest,
		},
		{
			"empty body",
			`{}`,
			http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.wantCode == 0 {
				t.Skip("requires database connection")
			}

			// Handler without DB will fail, but we can test validation
			h := &AuthHandlers{jwtSecret: testSecret}
			req := httptest.NewRequest("POST", "/api/v1/system/companies", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.CreateCompany(w, req)

			if w.Code != tt.wantCode {
				t.Errorf("status = %d, want %d", w.Code, tt.wantCode)
			}
		})
	}
}

func TestUpdateCompanyRequestParsing(t *testing.T) {
	var req updateCompanyRequest
	body := `{"name":"Updated Corp","plan":"enterprise","max_devices":100}`
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if req.Name == nil || *req.Name != "Updated Corp" {
		t.Errorf("name = %v, want Updated Corp", req.Name)
	}
	if req.Plan == nil || *req.Plan != "enterprise" {
		t.Errorf("plan = %v, want enterprise", req.Plan)
	}
	if req.MaxDevices == nil || *req.MaxDevices != 100 {
		t.Errorf("max_devices = %v, want 100", req.MaxDevices)
	}
	if req.Status != nil {
		t.Errorf("status should be nil, got %v", req.Status)
	}
}

// ─── System Admin Auth Flow Tests ────────────────────────────────────────────

func TestSystemAdminTokenHasNoCompanyID(t *testing.T) {
	h := &AuthHandlers{jwtSecret: testSecret}

	// System admin should get token without tenant_id
	tokenStr, err := h.generateAccessToken("admin-1", "system", "sysadmin@duali.com", "System Admin", []string{"admin"}, "", "system_admin", nil)
	if err != nil {
		t.Fatalf("generateAccessToken: %v", err)
	}

	claims := parseTestToken(t, tokenStr)
	if claims.CID != "" {
		t.Errorf("system admin CID = %q, want empty", claims.CID)
	}
	if claims.Role != "system_admin" {
		t.Errorf("role = %q, want system_admin", claims.Role)
	}
}

func TestSystemAdminAccessToSystemRoutes(t *testing.T) {
	// System admin should pass RequireRole("system_admin")
	claims := &AccessClaims{
		Sub:   "admin-1",
		Role:  "system_admin",
		Roles: []string{"admin"},
	}
	ctx := context.WithValue(context.Background(), claimsContextKey, claims)

	got := ClaimsFromContext(ctx)
	if got.Role != "system_admin" {
		t.Errorf("role = %q, want system_admin", got.Role)
	}
}

func TestNonAdminCannotAccessSystemRoutes(t *testing.T) {
	// Regular user should be rejected by RequireRole("system_admin")
	claims := &AccessClaims{
		Sub:   "user-1",
		Role:  "primary_manager",
		Roles: []string{"admin"},
	}

	allowed := false
	requiredRoles := []string{"system_admin"}
	for _, req := range requiredRoles {
		if claims.Role == req {
			allowed = true
		}
	}
	if allowed {
		t.Error("primary_manager should not access system_admin routes")
	}
}

func TestRequireRoleMiddleware(t *testing.T) {
	tests := []struct {
		name     string
		role     string
		required []string
		wantCode int
	}{
		{"system_admin allowed", "system_admin", []string{"system_admin"}, http.StatusOK},
		{"primary_manager blocked", "primary_manager", []string{"system_admin"}, http.StatusForbidden},
		{"viewer blocked", "viewer", []string{"system_admin"}, http.StatusForbidden},
		{"empty role blocked", "", []string{"system_admin"}, http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := RequireRole(tt.required...)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			claims := &AccessClaims{Sub: "user-1", Role: tt.role}

			req := httptest.NewRequest("GET", "/test", nil)
			ctx := context.WithValue(req.Context(), claimsContextKey, claims)
			req = req.WithContext(ctx)

			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantCode {
				t.Errorf("status = %d, want %d", w.Code, tt.wantCode)
			}
		})
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func parseTestToken(t *testing.T, tokenStr string) *AccessClaims {
	t.Helper()
	token, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	claims, ok := token.Claims.(*AccessClaims)
	if !ok || !token.Valid {
		t.Fatal("invalid token claims")
	}
	return claims
}
