package access

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// TestParsePagination tests the pagination parser.
func TestParsePagination(t *testing.T) {
	tests := []struct {
		query     string
		wantPage  int
		wantLimit int
	}{
		{"", 1, 20},
		{"?page=2&limit=50", 2, 50},
		{"?page=-1&limit=200", 1, 20}, // -1 invalid → default; 200 > 100 → default
		{"?page=abc", 1, 20},
		{"?page=0", 1, 20},     // 0 invalid → default
		{"?limit=0", 1, 20},    // 0 invalid → default
		{"?limit=100", 1, 100}, // max allowed
	}

	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/test"+tt.query, nil)
		page, limit := parsePagination(r)
		if page != tt.wantPage || limit != tt.wantLimit {
			t.Errorf("parsePagination(%q) = (%d, %d), want (%d, %d)", tt.query, page, limit, tt.wantPage, tt.wantLimit)
		}
	}
}

// TestCreateAccessPointValidation tests access point request validation without DB.
func TestCreateAccessPointValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}

	// Missing name
	body := `{"description":"test"}`
	r := httptest.NewRequest("POST", "/api/v1/access-points", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateAccessPoint(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing name, got %d", w.Code)
	}

	// Invalid JSON
	r = httptest.NewRequest("POST", "/api/v1/access-points", bytes.NewBufferString("{bad"))
	w = httptest.NewRecorder()
	h.CreateAccessPoint(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}

// TestCreateAccessDeviceValidation tests access device request validation without DB.
func TestCreateAccessDeviceValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}

	// Missing required fields (type present but name missing)
	body := `{"type":"door"}`
	r := httptest.NewRequest("POST", "/api/v1/access-devices", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateAccessDevice(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing name, got %d", w.Code)
	}

	// Invalid JSON
	r = httptest.NewRequest("POST", "/api/v1/access-devices", bytes.NewBufferString("{bad"))
	w = httptest.NewRecorder()
	h.CreateAccessDevice(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}

// TestCreateRuleReturnsNotImplemented verifies rules stub returns 501.
func TestCreateRuleReturnsNotImplemented(t *testing.T) {
	h := &AccessHandlers{db: nil}

	body := `{"name":"test"}`
	r := httptest.NewRequest("POST", "/api/v1/rules", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateRule(w, r)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", w.Code)
	}
}

// TestCreateScheduleReturnsNotImplemented verifies schedules stub returns 501.
func TestCreateScheduleReturnsNotImplemented(t *testing.T) {
	h := &AccessHandlers{db: nil}

	body := `{"timezone":"UTC"}`
	r := httptest.NewRequest("POST", "/api/v1/schedules", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.CreateSchedule(w, r)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", w.Code)
	}
}

// TestRouteSetup verifies all routes register without panic.
func TestRouteSetup(t *testing.T) {
	r := chi.NewRouter()
	h := &AccessHandlers{db: nil}

	// Access Devices
	r.Get("/api/v1/access-devices", h.ListAccessDevices)
	r.Post("/api/v1/access-devices", h.CreateAccessDevice)
	r.Get("/api/v1/access-devices/{id}", h.GetAccessDevice)
	r.Put("/api/v1/access-devices/{id}", h.UpdateAccessDevice)
	r.Delete("/api/v1/access-devices/{id}", h.DeleteAccessDevice)
	r.Get("/api/v1/access-devices/{id}/sync-package", h.GetSyncPackage)

	// Zones
	r.Get("/api/v1/zones", h.ListZones)
	r.Post("/api/v1/zones", h.CreateZone)
	r.Get("/api/v1/zones/{id}", h.GetZone)
	r.Put("/api/v1/zones/{id}", h.UpdateZone)
	r.Delete("/api/v1/zones/{id}", h.DeleteZone)
	r.Get("/api/v1/zones/{id}/access-points", h.ListZoneDoors)
	r.Get("/api/v1/zones/{id}/map", h.GetZoneMap)
	r.Put("/api/v1/zones/{id}/map", h.UpdateZoneMap)
	r.Post("/api/v1/zones/{id}/map/upload", h.UploadZoneMap)

	// Access Points
	r.Get("/api/v1/access-points", h.ListAccessPoints)
	r.Post("/api/v1/access-points", h.CreateAccessPoint)
	r.Get("/api/v1/access-points/{id}", h.GetAccessPoint)
	r.Put("/api/v1/access-points/{id}", h.UpdateAccessPoint)
	r.Delete("/api/v1/access-points/{id}", h.DeleteAccessPoint)
	r.Get("/api/v1/access-points/{id}/devices", h.ListAccessPointDevices)
	r.Post("/api/v1/access-points/{id}/devices", h.AddAccessPointDevice)
	r.Delete("/api/v1/access-points/{id}/devices/{deviceId}", h.RemoveAccessPointDevice)
	r.Get("/api/v1/access-points/{id}/access-groups", h.ListAccessPointGroups)
	r.Post("/api/v1/access-points/{id}/access-groups", h.AddAccessPointGroup)
	r.Delete("/api/v1/access-points/{id}/access-groups/{groupId}", h.RemoveAccessPointGroup)

	// Legacy stubs
	r.Get("/api/v1/rules", h.ListRules)
	r.Post("/api/v1/rules", h.CreateRule)
	r.Get("/api/v1/schedules", h.ListSchedules)
	r.Post("/api/v1/schedules", h.CreateSchedule)

	// Events & Stats
	r.Get("/api/v1/events", h.ListEvents)
	r.Get("/api/v1/stats", h.GetStats)

	walkCount := 0
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		walkCount++
		return nil
	})
	if walkCount != 32 {
		t.Errorf("expected 32 routes, got %d", walkCount)
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
	if evt.Src != "device-001" {
		t.Errorf("expected src device-001, got %s", evt.Src)
	}

	var ald accessLogData
	if err := json.Unmarshal(evt.Data, &ald); err != nil {
		t.Fatalf("failed to unmarshal data: %v", err)
	}
	if ald.Decision != "granted" {
		t.Errorf("expected decision granted, got %s", ald.Decision)
	}
	if ald.UserName != "Test" {
		t.Errorf("expected user_name Test, got %s", ald.UserName)
	}
	if ald.DoorID != "d1" {
		t.Errorf("expected door_id d1 (legacy field), got %s", ald.DoorID)
	}
}

// TestNATSNonAccessEvent tests that non-access events are skipped.
func TestNATSNonAccessEvent(t *testing.T) {
	c := &NATSConsumer{db: nil, nats: nil}
	raw := `{"version":1,"id":"evt-2","ts":1708344900000,"src":"device-001","type":"status.heartbeat","data":{}}`
	err := c.handleEvent(context.Background(), "dm3.devices.t1.d1.evt", []byte(raw))
	if err != nil {
		t.Errorf("non-access event should return nil, got %v", err)
	}
}

// TestNATSTenantExtraction tests tenant_id extraction from NATS subject.
func TestNATSTenantExtraction(t *testing.T) {
	c := &NATSConsumer{db: nil, nats: nil}

	// Invalid subject — too few parts
	raw := `{"version":1,"id":"e","ts":1,"src":"d","type":"access.log","data":{"decision":"granted"}}`
	err := c.handleEvent(context.Background(), "dm3.devices", []byte(raw))
	if err != nil {
		t.Errorf("short subject should be skipped, got %v", err)
	}

	// Invalid tenant_id — not a UUID
	err = c.handleEvent(context.Background(), "dm3.devices.not-a-uuid.dev1.evt", []byte(raw))
	if err != nil {
		t.Errorf("non-UUID tenant should be skipped, got %v", err)
	}
}

// TestNATSBadJSON tests that malformed JSON is acked (returns nil, not error).
func TestNATSBadJSON(t *testing.T) {
	c := &NATSConsumer{db: nil, nats: nil}
	err := c.handleEvent(context.Background(), "dm3.devices.t1.d1.evt", []byte("{bad json"))
	if err != nil {
		t.Errorf("bad JSON should return nil (ack), got %v", err)
	}
}

// TestToUUIDPtr validates UUID pointer helper.
func TestToUUIDPtr(t *testing.T) {
	tests := []struct {
		input string
		isNil bool
	}{
		{"", true},
		{"not-a-uuid", true},
		{"12345678-1234-1234-1234-123456789012", false},
		{"12345678-1234-1234-1234-12345678901", true}, // too short
	}
	for _, tt := range tests {
		result := toUUIDPtr(tt.input)
		if tt.isNil && result != nil {
			t.Errorf("toUUIDPtr(%q) should be nil", tt.input)
		}
		if !tt.isNil && result == nil {
			t.Errorf("toUUIDPtr(%q) should not be nil", tt.input)
		}
		if !tt.isNil && result != nil && *result != tt.input {
			t.Errorf("toUUIDPtr(%q) = %q, want %q", tt.input, *result, tt.input)
		}
	}
}

// TestNilIfEmpty validates nilIfEmpty helper.
func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Error("nilIfEmpty(\"\") should be nil")
	}
	result := nilIfEmpty("test")
	if result == nil || *result != "test" {
		t.Error("nilIfEmpty(\"test\") should return pointer to \"test\"")
	}
}

// TestEventResponseJSON tests eventResponse JSON serialization.
func TestEventResponseJSON(t *testing.T) {
	e := eventResponse{
		ID:            "evt-1",
		TenantID:      "t-1",
		AccessPointID: "ap-1",
		Decision:      "granted",
	}
	data, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m["access_point_id"] != "ap-1" {
		t.Errorf("expected access_point_id=ap-1, got %v", m["access_point_id"])
	}
	if _, ok := m["door_id"]; ok {
		t.Error("door_id should not be in eventResponse JSON")
	}
	if _, ok := m["device_id"]; ok {
		t.Error("device_id should not be in eventResponse JSON")
	}
}

// TestEventResponseDeviceFieldsJSON verifies device_id and device_name appear in JSON when set.
func TestEventResponseDeviceFieldsJSON(t *testing.T) {
	tests := []struct {
		name           string
		deviceID       string
		deviceName     string
		wantDeviceID   bool
		wantDeviceName bool
	}{
		{
			name:           "device fields present",
			deviceID:       "dev-uuid-1",
			deviceName:     "Main Entrance Reader",
			wantDeviceID:   true,
			wantDeviceName: true,
		},
		{
			name:           "device fields absent when empty",
			deviceID:       "",
			deviceName:     "",
			wantDeviceID:   false,
			wantDeviceName: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := eventResponse{
				ID:         "evt-1",
				TenantID:   "t-1",
				Decision:   "granted",
				DeviceID:   tt.deviceID,
				DeviceName: tt.deviceName,
			}
			data, err := json.Marshal(e)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			var m map[string]any
			if err := json.Unmarshal(data, &m); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			_, hasDeviceID := m["device_id"]
			if hasDeviceID != tt.wantDeviceID {
				t.Errorf("device_id present=%v, want %v", hasDeviceID, tt.wantDeviceID)
			}
			_, hasDeviceName := m["device_name"]
			if hasDeviceName != tt.wantDeviceName {
				t.Errorf("device_name present=%v, want %v", hasDeviceName, tt.wantDeviceName)
			}
			if tt.wantDeviceID && m["device_id"] != tt.deviceID {
				t.Errorf("device_id=%v, want %v", m["device_id"], tt.deviceID)
			}
			if tt.wantDeviceName && m["device_name"] != tt.deviceName {
				t.Errorf("device_name=%v, want %v", m["device_name"], tt.deviceName)
			}
		})
	}
}

// TestListEventsForbiddenWithoutCompany verifies ListEvents returns 403 when company context is absent.
func TestListEventsForbiddenWithoutCompany(t *testing.T) {
	h := &AccessHandlers{db: nil}
	r := httptest.NewRequest("GET", "/api/v1/access/events", nil)
	// No company context injected — CompanyIDFromContext returns "".
	w := httptest.NewRecorder()
	h.ListEvents(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 without company context, got %d", w.Code)
	}
}

// TestListEventsFilterParams verifies filter query params are accepted (handler reaches DB call).
// Without a live DB, ListEvents will panic on nil db — this test only validates the 403 guard.
// Full filter + tenant isolation coverage is in automation/tests/api/.
func TestListEventsQueryParamNames(t *testing.T) {
	// Verify all expected filter params are handled by inspecting URL construction.
	// These params must not cause a 400 — the handler silently ignores invalid values.
	filterCases := []struct {
		name  string
		query string
	}{
		{"access_point_id filter", "?access_point_id=12345678-1234-1234-1234-123456789012"},
		{"user_id filter", "?user_id=12345678-1234-1234-1234-123456789012"},
		{"decision filter", "?decision=granted"},
		{"credential_type filter", "?credential_type=face"},
		{"from filter", "?from=2024-01-01T00:00:00Z"},
		{"to filter", "?to=2024-12-31T23:59:59Z"},
		{"combined filters", "?decision=denied&credential_type=card&from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z"},
	}
	for _, tc := range filterCases {
		t.Run(tc.name, func(t *testing.T) {
			h := &AccessHandlers{db: nil}
			r := httptest.NewRequest("GET", "/api/v1/access/events"+tc.query, nil)
			// No company context → 403 before DB is touched (nil db safe).
			w := httptest.NewRecorder()
			h.ListEvents(w, r)
			if w.Code != http.StatusForbidden {
				t.Errorf("expected 403 (no company context), got %d", w.Code)
			}
		})
	}
}

func TestBuildZoneMapObjectKey(t *testing.T) {
	got := buildZoneMapObjectKey("tenant-1", "zone-1", ".png")
	want := "tenants/tenant-1/access/zones/zone-1/map.png"
	if got != want {
		t.Fatalf("buildZoneMapObjectKey() = %q, want %q", got, want)
	}
}

func TestZoneMapExtension(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		filename    string
		wantExt     string
		wantOK      bool
	}{
		{name: "png by content type", contentType: "image/png", filename: "floor.bin", wantExt: ".png", wantOK: true},
		{name: "jpeg by extension fallback", contentType: "application/octet-stream", filename: "floor.jpeg", wantExt: ".jpg", wantOK: true},
		{name: "reject pdf", contentType: "application/pdf", filename: "floor.pdf", wantExt: "", wantOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotExt, gotOK := zoneMapExtension(tt.contentType, tt.filename)
			if gotExt != tt.wantExt || gotOK != tt.wantOK {
				t.Fatalf("zoneMapExtension(%q, %q) = (%q, %v), want (%q, %v)", tt.contentType, tt.filename, gotExt, gotOK, tt.wantExt, tt.wantOK)
			}
		})
	}
}

func TestManagedAssetObjectKey(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		want   string
		wantOK bool
	}{
		{name: "public path", raw: "/assets/tenants/t1/access/zones/z1/map.png", want: "tenants/t1/access/zones/z1/map.png", wantOK: true},
		{name: "bare key", raw: "tenants/t1/access/zones/z1/map.png", want: "tenants/t1/access/zones/z1/map.png", wantOK: true},
		{name: "reject traversal", raw: "/assets/../secrets.txt", want: "", wantOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := managedAssetObjectKey(tt.raw)
			if got != tt.want || ok != tt.wantOK {
				t.Fatalf("managedAssetObjectKey(%q) = (%q, %v), want (%q, %v)", tt.raw, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

func TestContentTypeForExt(t *testing.T) {
	if got := contentTypeForExt(".jpg", "application/octet-stream"); got != "image/jpeg" {
		t.Fatalf("contentTypeForExt(.jpg) = %q", got)
	}
	if got := contentTypeForExt(".weird", "application/octet-stream"); got != "application/octet-stream" {
		t.Fatalf("contentTypeForExt fallback = %q", got)
	}
}
