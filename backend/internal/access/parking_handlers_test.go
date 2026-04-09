package access

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/models"
)

func TestNormalizePlate(t *testing.T) {
	if got := normalizePlate(" 92B1-123.45 "); got != "92B112345" {
		t.Fatalf("normalizePlate() = %q", got)
	}
}

func TestLooksLikePlate(t *testing.T) {
	valid := []string{"30A12345", "92B112345", "51G12345", "29KT88888"}
	for _, plate := range valid {
		if !looksLikePlate(plate) {
			t.Fatalf("expected %s to be valid", plate)
		}
	}
	invalid := []string{"", "abc", "123", "XXA12345"}
	for _, plate := range invalid {
		if looksLikePlate(plate) {
			t.Fatalf("expected %s to be invalid", plate)
		}
	}
}

func TestCalculateFee(t *testing.T) {
	rule := models.ParkingFeeRule{RateType: "hourly", FreeMinutes: 15, Rates: mustJSON(map[string]any{"hourly_rate": 10000.0})}
	if got := calculateFee(rule, 70); got != 10000 {
		t.Fatalf("hourly fee = %v", got)
	}

	rule = models.ParkingFeeRule{RateType: "flat", Rates: mustJSON(map[string]any{"amount": 5000.0})}
	if got := calculateFee(rule, 5); got != 5000 {
		t.Fatalf("flat fee = %v", got)
	}

	maxDaily := 30000.0
	rule = models.ParkingFeeRule{RateType: "hourly", Rates: mustJSON(map[string]any{"hourly_rate": 10000.0}), MaxDaily: &maxDaily}
	if got := calculateFee(rule, 10*60); got != 30000 {
		t.Fatalf("max daily fee = %v", got)
	}

	rule = models.ParkingFeeRule{RateType: "tiered", Rates: mustJSON(map[string]any{"tiers": []map[string]any{{"up_to_minutes": 120, "flat_amount": 10000.0}, {"up_to_minutes": 360, "per_hour": 5000.0}, {"per_hour": 2000.0}}})}
	if got := calculateFee(rule, 4*60); got != 20000 {
		t.Fatalf("tiered fee = %v", got)
	}
}

func TestCreateParkingVehicleValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}
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
				t.Fatalf("status = %d", w.Code)
			}
		})
	}
}

func TestCreateParkingSessionValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/parking/sessions", bytes.NewBufferString(`{"lot_id":"l1","zone_id":"z1","plate_number":"bad","vehicle_type":"car"}`))
	w := httptest.NewRecorder()
	h.CreateParkingSession(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestCreateParkingFeeRuleValidation(t *testing.T) {
	h := &AccessHandlers{db: nil}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/parking/fee-rules", bytes.NewBufferString(`{"name":"Moto","vehicle_type":"boat","rate_type":"hourly"}`))
	w := httptest.NewRecorder()
	h.CreateParkingFeeRule(w, r)
	if w.Code != http.StatusForbidden && w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestParkingRouteSetup(t *testing.T) {
	r := chi.NewRouter()
	h := &AccessHandlers{db: nil}
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
	r.Get("/api/v1/parking/sessions/{id}", h.GetParkingSession)
	r.Put("/api/v1/parking/sessions/{id}/exit", h.ExitParkingSession)

	count := 0
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		count++
		return nil
	})
	if count != 15 {
		t.Fatalf("route count = %d", count)
	}
}

func TestRoundFeeToNearestThousand(t *testing.T) {
	rule := models.ParkingFeeRule{RateType: "flat", Rates: mustJSON(map[string]any{"amount": 15499.0})}
	if got := calculateFee(rule, 1); math.Abs(got-15000) > 0.1 {
		t.Fatalf("rounded fee = %v", got)
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
