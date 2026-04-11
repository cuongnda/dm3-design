package parking

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestNormalizePlate(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{" 92B1-123.45 ", "92B112345"},
		{"51A-123.45", "51A12345"},
		{"30H-789.01", "30H78901"},
		{"59c1-456.78", "59C145678"},
		{"  51g 555.66 ", "51G55566"},
	}
	for _, tt := range tests {
		if got := normalizePlate(tt.input); got != tt.want {
			t.Errorf("normalizePlate(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestLooksLikePlate(t *testing.T) {
	valid := []string{"30A12345", "92B112345", "51G12345", "29KT88888"}
	for _, plate := range valid {
		if !looksLikePlate(plate) {
			t.Errorf("expected %s to be valid", plate)
		}
	}
	invalid := []string{"", "abc", "123", "XXA12345"}
	for _, plate := range invalid {
		if looksLikePlate(plate) {
			t.Errorf("expected %s to be invalid", plate)
		}
	}
}

func TestCalculateFee(t *testing.T) {
	t.Run("hourly", func(t *testing.T) {
		rule := ParkingFeeRule{RateType: "hourly", FreeMinutes: 15, Rates: mustJSON(map[string]any{"hourly_rate": 10000.0})}
		if got := calculateFee(rule, 70); got != 10000 {
			t.Errorf("hourly fee = %v, want 10000", got)
		}
	})

	t.Run("flat", func(t *testing.T) {
		rule := ParkingFeeRule{RateType: "flat", Rates: mustJSON(map[string]any{"amount": 5000.0})}
		if got := calculateFee(rule, 5); got != 5000 {
			t.Errorf("flat fee = %v, want 5000", got)
		}
	})

	t.Run("max daily cap", func(t *testing.T) {
		maxDaily := 30000.0
		rule := ParkingFeeRule{RateType: "hourly", Rates: mustJSON(map[string]any{"hourly_rate": 10000.0}), MaxDaily: &maxDaily}
		if got := calculateFee(rule, 10*60); got != 30000 {
			t.Errorf("max daily fee = %v, want 30000", got)
		}
	})

	t.Run("tiered", func(t *testing.T) {
		rule := ParkingFeeRule{RateType: "tiered", Rates: mustJSON(map[string]any{"tiers": []map[string]any{{"up_to_minutes": 120, "flat_amount": 10000.0}, {"up_to_minutes": 360, "per_hour": 5000.0}, {"per_hour": 2000.0}}})}
		if got := calculateFee(rule, 4*60); got != 20000 {
			t.Errorf("tiered fee = %v, want 20000", got)
		}
	})

	t.Run("free minutes not exceeded", func(t *testing.T) {
		rule := ParkingFeeRule{RateType: "hourly", FreeMinutes: 30, Rates: mustJSON(map[string]any{"hourly_rate": 10000.0})}
		if got := calculateFee(rule, 20); got != 0 {
			t.Errorf("free period fee = %v, want 0", got)
		}
	})
}

func TestRoundFeeToNearestThousand(t *testing.T) {
	rule := ParkingFeeRule{RateType: "flat", Rates: mustJSON(map[string]any{"amount": 15499.0})}
	if got := calculateFee(rule, 1); math.Abs(got-15000) > 0.1 {
		t.Errorf("rounded fee = %v, want ~15000", got)
	}
}

func TestRecognitionMatchMode(t *testing.T) {
	tests := []struct {
		confidence float64
		want       string
	}{
		{0.9, "anpr_auto"},
		{0.85, "anpr_auto"},
		{0.75, "anpr_review"},
		{0.70, "anpr_review"},
		{0.5, "manual_override"},
		{0.0, "manual_override"},
	}
	for _, tt := range tests {
		if got := recognitionMatchMode(tt.confidence); got != tt.want {
			t.Errorf("recognitionMatchMode(%v) = %q, want %q", tt.confidence, got, tt.want)
		}
	}
}

func TestBarrierDecisionCode(t *testing.T) {
	tests := []struct {
		name        string
		capacity    bool
		matched     bool
		blacklisted bool
		hasPass     bool
		wantCode    string
	}{
		{"denied capacity", false, false, false, false, "entry_denied_capacity"},
		{"denied blacklist", true, false, true, false, "entry_denied_blacklist"},
		{"resident pass", true, true, false, true, "resident_pass_allow"},
		{"auto allow registered", true, true, false, false, "auto_allow"},
		{"visitor allow", true, false, false, false, "visitor_allow"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, reason := barrierDecisionCode(tt.capacity, tt.matched, tt.blacklisted, tt.hasPass)
			if code != tt.wantCode {
				t.Errorf("code = %q, want %q", code, tt.wantCode)
			}
			if reason == "" {
				t.Error("expected non-empty reason")
			}
		})
	}
}

func TestDefaultRegistrationStatus(t *testing.T) {
	tests := []struct {
		category string
		want     string
	}{
		{ParkingVehicleCategoryResident, "registered"},
		{ParkingVehicleCategoryTemporary, "temporary"},
		{ParkingVehicleCategoryVisitor, "visitor"},
		{"unknown", "visitor"},
	}
	for _, tt := range tests {
		if got := defaultRegistrationStatus(tt.category); got != tt.want {
			t.Errorf("defaultRegistrationStatus(%q) = %q, want %q", tt.category, got, tt.want)
		}
	}
}

func TestCreateParkingVehicleValidation(t *testing.T) {
	h := &ParkingHandlers{db: nil}
	cases := []struct {
		name string
		body string
	}{
		{"bad json", "{bad"},
		{"missing plate", `{"type":"car"}`},
		{"bad plate", `{"plate_number":"bad","type":"car"}`},
		{"bad type", `{"plate_number":"30A-12345","type":"plane"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/v1/parking/vehicles", bytes.NewBufferString(tc.body))
			w := httptest.NewRecorder()
			h.CreateParkingVehicle(w, r)
			if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 or 403", w.Code)
			}
		})
	}
}

func TestCreateParkingSessionValidation(t *testing.T) {
	h := &ParkingHandlers{db: nil}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/parking/sessions", bytes.NewBufferString(`{"lot_id":"l1","zone_id":"z1","plate_number":"bad","vehicle_type":"car"}`))
	w := httptest.NewRecorder()
	h.CreateParkingSession(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 or 403", w.Code)
	}
}

func TestCreateParkingFeeRuleValidation(t *testing.T) {
	h := &ParkingHandlers{db: nil}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/parking/fee-rules", bytes.NewBufferString(`{"name":"Moto","vehicle_type":"boat","rate_type":"hourly"}`))
	w := httptest.NewRecorder()
	h.CreateParkingFeeRule(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 or 403", w.Code)
	}
}

func TestParkingRouteSetup(t *testing.T) {
	r := chi.NewRouter()
	h := &ParkingHandlers{db: nil}
	r.Get("/api/v1/parking/lots", h.ListParkingLots)
	r.Post("/api/v1/parking/lots", h.CreateParkingLot)
	r.Get("/api/v1/parking/lots/{id}", h.GetParkingLot)
	r.Get("/api/v1/parking/zones", h.ListParkingZones)
	r.Post("/api/v1/parking/zones", h.CreateParkingZone)
	r.Get("/api/v1/parking/zones/{id}", h.GetParkingZone)
	r.Get("/api/v1/parking/vehicles", h.ListParkingVehicles)
	r.Post("/api/v1/parking/vehicles", h.CreateParkingVehicle)
	r.Get("/api/v1/parking/vehicles/{id}", h.GetParkingVehicle)
	r.Get("/api/v1/parking/fee-rules", h.ListParkingFeeRules)
	r.Post("/api/v1/parking/fee-rules", h.CreateParkingFeeRule)
	r.Get("/api/v1/parking/sessions", h.ListParkingSessions)
	r.Post("/api/v1/parking/sessions", h.CreateParkingSession)
	r.Post("/api/v1/parking/sessions/recognitions", h.RecognizeParkingPlate)
	r.Get("/api/v1/parking/sessions/{id}", h.GetParkingSession)
	r.Put("/api/v1/parking/sessions/{id}/exit", h.ExitParkingSession)
	r.Post("/api/v1/parking/sessions/{id}/payment", h.ProcessParkingPayment)
	r.Get("/api/v1/parking/passes", h.ListParkingPasses)
	r.Post("/api/v1/parking/passes", h.CreateParkingPass)

	count := 0
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		count++
		return nil
	})
	if count != 19 {
		t.Errorf("route count = %d, want 19", count)
	}
}

func TestParsePagination(t *testing.T) {
	tests := []struct {
		query     string
		wantPage  int
		wantLimit int
	}{
		{"", 1, 20},
		{"?page=3&limit=50", 3, 50},
		{"?page=-1&limit=200", 1, 20},
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

func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Error("expected nil for empty string")
	}
	if v := nilIfEmpty("test"); v == nil || *v != "test" {
		t.Error("expected pointer to 'test'")
	}
}

func TestDefaultMap(t *testing.T) {
	if m := defaultMap(nil); m == nil {
		t.Error("expected non-nil map")
	}
	input := map[string]any{"key": "val"}
	if m := defaultMap(input); m["key"] != "val" {
		t.Error("expected pass-through")
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
