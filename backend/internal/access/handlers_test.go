package access

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// TestParsePagination tests the pagination parser.
func TestParsePagination(t *testing.T) {
	tests := []struct {
		query    string
		wantPage int
		wantLimit int
	}{
		{"", 1, 20},
		{"?page=2&limit=50", 2, 50},
		{"?page=-1&limit=200", 1, 20},  // -1 invalid → default; 200 > 100 → default
		{"?page=abc", 1, 20},
	}

	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/test"+tt.query, nil)
		page, limit := parsePagination(r)
		if page != tt.wantPage || limit != tt.wantLimit {
			t.Errorf("parsePagination(%q) = (%d, %d), want (%d, %d)", tt.query, page, limit, tt.wantPage, tt.wantLimit)
		}
	}
}

// TestBoolVal tests the boolean default helper.
func TestBoolVal(t *testing.T) {
	trueVal := true
	falseVal := false

	if boolVal(nil, true) != true {
		t.Error("boolVal(nil, true) should be true")
	}
	if boolVal(nil, false) != false {
		t.Error("boolVal(nil, false) should be false")
	}
	if boolVal(&trueVal, false) != true {
		t.Error("boolVal(&true, false) should be true")
	}
	if boolVal(&falseVal, true) != false {
		t.Error("boolVal(&false, true) should be false")
	}
}

// TestCreateDoorRequestValidation tests request validation without DB.
func TestCreateDoorValidation(t *testing.T) {
	h := &AccessHandlers{db: nil} // nil DB — we expect validation to fail before DB call

	// Missing required fields
	body := `{"location":"test"}`
	r := httptest.NewRequest("POST", "/api/v1/doors", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateDoor(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	// Invalid JSON
	r = httptest.NewRequest("POST", "/api/v1/doors", bytes.NewBufferString("{bad"))
	w = httptest.NewRecorder()
	h.CreateDoor(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}

// TestCreateRuleValidation tests rule request validation without DB.
func TestCreateRuleValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}

	body := `{"name":"test"}`
	r := httptest.NewRequest("POST", "/api/v1/rules", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateRule(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestCreateScheduleValidation tests schedule request validation.
func TestCreateScheduleValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}

	body := `{"timezone":"UTC"}`
	r := httptest.NewRequest("POST", "/api/v1/schedules", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateSchedule(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestDeleteDoorNotFound tests 404 on delete with nil db (will panic-recover or we test routes).
func TestRouteSetup(t *testing.T) {
	// Verify routes can be registered without panic
	r := chi.NewRouter()
	h := &AccessHandlers{db: nil}

	r.Get("/api/v1/doors", h.ListDoors)
	r.Post("/api/v1/doors", h.CreateDoor)
	r.Get("/api/v1/doors/{id}", h.GetDoor)
	r.Put("/api/v1/doors/{id}", h.UpdateDoor)
	r.Delete("/api/v1/doors/{id}", h.DeleteDoor)
	r.Get("/api/v1/rules", h.ListRules)
	r.Post("/api/v1/rules", h.CreateRule)
	r.Get("/api/v1/schedules", h.ListSchedules)
	r.Post("/api/v1/schedules", h.CreateSchedule)
	r.Get("/api/v1/events", h.ListEvents)
	r.Get("/api/v1/stats", h.GetStats)
	r.Get("/api/v1/doors/{id}/sync-package", h.GetSyncPackage)

	// Test that routes are registered by walking
	walkCount := 0
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		walkCount++
		return nil
	})
	if walkCount != 12 {
		t.Errorf("expected 12 routes, got %d", walkCount)
	}
}

// TestNATSEventParsing tests event unmarshalling.
func TestNATSEventParsing(t *testing.T) {
	raw := `{"version":1,"id":"evt-1","ts":1708344900000,"src":"device-001","type":"access.log","data":{"door_id":"d1","user_name":"Test","decision":"granted","credential_type":"face"}}`
	var evt deviceEvent
	if err := json.Unmarshal([]byte(raw), &evt); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if evt.Type != "access.log" {
		t.Errorf("expected type access.log, got %s", evt.Type)
	}

	var ald accessLogData
	if err := json.Unmarshal(evt.Data, &ald); err != nil {
		t.Fatalf("failed to unmarshal data: %v", err)
	}
	if ald.Decision != "granted" {
		t.Errorf("expected decision granted, got %s", ald.Decision)
	}
	if ald.UserName != "Test" {
		t.Errorf("expected person_name Test, got %s", ald.UserName)
	}
}

// TestNATSNonAccessEvent tests that non-access events are skipped.
func TestNATSNonAccessEvent(t *testing.T) {
	c := &NATSConsumer{db: nil, nats: nil}
	raw := `{"version":1,"id":"evt-2","ts":1708344900000,"src":"device-001","type":"status.heartbeat","data":{}}`
	err := c.handleEvent("dm3.devices.t1.d1.evt", []byte(raw))
	if err != nil {
		t.Errorf("non-access event should return nil, got %v", err)
	}
}
