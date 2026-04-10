package visitor

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
)

func TestParsePagination(t *testing.T) {
	tests := []struct {
		query     string
		wantPage  int
		wantLimit int
	}{
		{"", 1, 20},
		{"?page=2&limit=50", 2, 50},
		{"?page=-1&limit=200", 1, 20},
		{"?page=abc", 1, 20},
		{"?page=0", 1, 20},
		{"?limit=0", 1, 20},
		{"?limit=100", 1, 100},
		{"?limit=101", 1, 20},
	}
	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/test"+tt.query, nil)
		page, limit := parsePagination(r)
		if page != tt.wantPage || limit != tt.wantLimit {
			t.Fatalf("parsePagination(%q) = (%d, %d), want (%d, %d)", tt.query, page, limit, tt.wantPage, tt.wantLimit)
		}
	}
}

func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Fatal("expected nil")
	}
	v := nilIfEmpty("hello")
	if v == nil || *v != "hello" {
		t.Fatal("expected pointer to 'hello'")
	}
}

func TestGenerateQRToken(t *testing.T) {
	token, err := generateQRToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(token) != 64 {
		t.Fatalf("unexpected token len %d", len(token))
	}
}

func TestVisitIDParamSupportsBothRouteNames(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/visitors/123", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "123")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	if got := visitIDParam(r); got != "123" {
		t.Fatalf("got %q", got)
	}

	r2 := httptest.NewRequest("GET", "/api/v1/visitors/456", nil)
	rctx2 := chi.NewRouteContext()
	rctx2.URLParams.Add("visit_id", "456")
	r2 = r2.WithContext(context.WithValue(r2.Context(), chi.RouteCtxKey, rctx2))
	if got := visitIDParam(r2); got != "456" {
		t.Fatalf("got %q", got)
	}
}

func TestCanApproveVisitAsHost(t *testing.T) {
	claims := &authsvc.AccessClaims{Sub: "host-1", Role: "viewer"}
	r := httptest.NewRequest("POST", "/approve", nil).WithContext(authsvc.WithClaims(context.Background(), claims))
	if !canApproveVisit(r, "host-1") {
		t.Fatal("host should be allowed")
	}
	if canApproveVisit(r, "host-2") {
		t.Fatal("non-host viewer should not be allowed")
	}
}

func TestRequireVisitorWrite(t *testing.T) {
	claims := &authsvc.AccessClaims{Sub: "u1", Role: "operator"}
	r := httptest.NewRequest("POST", "/", nil).WithContext(authsvc.WithClaims(context.Background(), claims))
	if !requireVisitorWrite(r) {
		t.Fatal("operator should be allowed")
	}
}

func TestCreateVisitValidation(t *testing.T) {
	h := &VisitorHandlers{db: nil}
	tests := []struct {
		name string
		body string
	}{
		{"invalid JSON", "{bad"},
		{"missing arrival", `{"visitor":{"first_name":"John","last_name":"Doe"},"host_user_id":"abc","purpose":"meeting"}`},
		{"missing host", `{"visitor":{"first_name":"John","last_name":"Doe"},"host_user_id":"","purpose":"meeting"}`},
	}
	for _, tt := range tests {
		r := httptest.NewRequest("POST", "/api/v1/visitors", bytes.NewBufferString(tt.body))
		w := httptest.NewRecorder()
		h.CreateVisit(w, r)
		if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
			t.Fatalf("%s: got %d", tt.name, w.Code)
		}
	}
}

func TestWalkinVisitValidation(t *testing.T) {
	h := &VisitorHandlers{db: nil}
	r := httptest.NewRequest("POST", "/api/v1/visitors/walkin", bytes.NewBufferString(`{"visitor":{"first_name":"Jane","last_name":"Doe"},"purpose":"bad"}`))
	w := httptest.NewRecorder()
	h.WalkinVisit(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Fatalf("got %d", w.Code)
	}
}

func TestCreateWatchlistEntryValidation(t *testing.T) {
	h := &VisitorHandlers{db: nil}
	r := httptest.NewRequest("POST", "/api/v1/visitors/watchlist", bytes.NewBufferString(`{"entry_type":"blacklist","match_field":"name","match_value":"x","reason":"y"}`))
	w := httptest.NewRecorder()
	h.CreateWatchlistEntry(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Fatalf("got %d", w.Code)
	}
}

func TestListVisitsRequiresCompany(t *testing.T) {
	h := &VisitorHandlers{db: nil}
	w := httptest.NewRecorder()
	h.ListVisits(w, httptest.NewRequest("GET", "/api/v1/visitors", nil))
	if w.Code != http.StatusForbidden {
		t.Fatalf("got %d", w.Code)
	}
}
