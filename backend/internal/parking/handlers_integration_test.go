package parking

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

const parkingTestTenantID = "00000000-0000-0000-0000-000000000001"

func setupParkingTestDB(t *testing.T) *db.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"
	}
	database, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		t.Skipf("database not available: %v", err)
	}
	return database
}

func requireParkingSchema(t *testing.T, database *db.DB) {
	t.Helper()
	var exists bool
	if err := database.Pool.QueryRow(context.Background(), `SELECT to_regclass('dm3_parking.parking_lots') IS NOT NULL`).Scan(&exists); err != nil {
		t.Skipf("parking schema check failed: %v", err)
	}
	if !exists {
		t.Skip("parking migrations not applied (dm3_parking.parking_lots missing)")
	}
	if err := database.Pool.QueryRow(context.Background(), `SELECT to_regclass('dm3_parking.parking_passes') IS NOT NULL`).Scan(&exists); err != nil {
		t.Skipf("parking phase-2 schema check failed: %v", err)
	}
	if !exists {
		t.Skip("parking phase-2 migration not applied (dm3_parking.parking_passes missing)")
	}
}

func setupParkingRouter(h *ParkingHandlers) http.Handler {
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), &authsvc.AccessClaims{
				Sub:   "parking-test-user",
				CID:   parkingTestTenantID,
				Email: "parking.test@example.com",
				Role:  "primary_manager",
				Roles: []string{"primary_manager"},
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())

	r.Route("/api/v1/parking", func(r chi.Router) {
		r.Get("/lots", h.ListParkingLots)
		r.Post("/lots", h.CreateParkingLot)
		r.Get("/lots/{id}", h.GetParkingLot)
		r.Get("/zones", h.ListParkingZones)
		r.Post("/zones", h.CreateParkingZone)
		r.Get("/zones/{id}", h.GetParkingZone)
		r.Get("/vehicles", h.ListParkingVehicles)
		r.Post("/vehicles", h.CreateParkingVehicle)
		r.Get("/vehicles/{id}", h.GetParkingVehicle)
		r.Get("/fee-rules", h.ListParkingFeeRules)
		r.Post("/fee-rules", h.CreateParkingFeeRule)
		r.Get("/sessions", h.ListParkingSessions)
		r.Post("/sessions", h.CreateParkingSession)
		r.Post("/sessions/recognitions", h.RecognizeParkingPlate)
		r.Get("/sessions/{id}", h.GetParkingSession)
		r.Put("/sessions/{id}/exit", h.ExitParkingSession)
		r.Post("/sessions/{id}/payment", h.ProcessParkingPayment)
		r.Get("/passes", h.ListParkingPasses)
		r.Post("/passes", h.CreateParkingPass)
	})
	return r
}

func parkingRequest(t *testing.T, router http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reader = bytes.NewReader(payload)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func decodeJSON[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response (%d): %v\nbody=%s", w.Code, err, w.Body.String())
	}
	return out
}

func cleanupParkingFixtures(t *testing.T, database *db.DB, ids map[string]string) {
	t.Helper()
	ctx := context.Background()
	for _, stmt := range []struct {
		query string
		id    string
	}{
		{"DELETE FROM dm3_parking.parking_sessions WHERE id = $1::uuid", ids["session"]},
		{"DELETE FROM dm3_parking.parking_passes WHERE id = $1::uuid", ids["pass"]},
		{"DELETE FROM dm3_parking.parking_fee_rules WHERE id = $1::uuid", ids["fee_rule"]},
		{"DELETE FROM dm3_parking.parking_vehicles WHERE id = $1::uuid", ids["vehicle"]},
		{"DELETE FROM dm3_parking.parking_zones WHERE id = $1::uuid", ids["zone"]},
		{"DELETE FROM dm3_parking.parking_lots WHERE id = $1::uuid", ids["lot"]},
	} {
		if stmt.id == "" {
			continue
		}
		if _, err := database.Pool.Exec(ctx, stmt.query, stmt.id); err != nil {
			if strings.Contains(err.Error(), "does not exist") {
				return
			}
			t.Fatalf("cleanup failed for %s: %v", stmt.id, err)
		}
	}
}

func createParkingLotAndZone(t *testing.T, router http.Handler, suffix string, totalSpaces int) (lotID, zoneID string) {
	t.Helper()
	lotResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/lots", map[string]any{
		"name":        fmt.Sprintf("QA Parking Lot %s", suffix),
		"code":        fmt.Sprintf("QA-LOT-%s", suffix),
		"description": "Regression coverage fixture",
	})
	if lotResp.Code != http.StatusCreated {
		t.Fatalf("create lot: expected 201, got %d: %s", lotResp.Code, lotResp.Body.String())
	}
	lot := decodeJSON[map[string]any](t, lotResp)
	lotID = lot["id"].(string)

	zoneResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/zones", map[string]any{
		"lot_id":        lotID,
		"name":          fmt.Sprintf("QA Parking Zone %s", suffix),
		"code":          fmt.Sprintf("QA-ZONE-%s", suffix),
		"type":          "surface",
		"total_spaces":  totalSpaces,
		"vehicle_types": []string{"motorbike", "car"},
		"entry_devices": []map[string]any{{"id": "11111111-1111-1111-1111-111111111111", "name": "Entry Barrier"}},
		"exit_devices":  []map[string]any{{"id": "22222222-2222-2222-2222-222222222222", "name": "Exit Barrier"}},
		"status":        "active",
		"metadata":      map[string]any{"source": "integration-test"},
	})
	if zoneResp.Code != http.StatusCreated {
		t.Fatalf("create zone: expected 201, got %d: %s", zoneResp.Code, zoneResp.Body.String())
	}
	zone := decodeJSON[map[string]any](t, zoneResp)
	zoneID = zone["id"].(string)
	return lotID, zoneID
}

func TestParkingVehicleSessionPaymentLifecycle(t *testing.T) {
	database := setupParkingTestDB(t)
	defer database.Close()
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-lifecycle", 5)

	plate := fmt.Sprintf("59A-%s", suffix[len(suffix)-5:])
	vehicleResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/vehicles", map[string]any{
		"plate_number":        plate,
		"type":                "car",
		"category":            "visitor",
		"registration_status": "visitor",
		"brand":               "Toyota",
		"color":               "Black",
	})
	if vehicleResp.Code != http.StatusCreated {
		t.Fatalf("create vehicle: expected 201, got %d: %s", vehicleResp.Code, vehicleResp.Body.String())
	}
	vehicle := decodeJSON[map[string]any](t, vehicleResp)
	ids["vehicle"] = vehicle["id"].(string)
	if vehicle["normalized_plate"] != strings.ReplaceAll(plate, "-", "") {
		t.Fatalf("expected normalized plate, got %#v", vehicle["normalized_plate"])
	}

	feeRuleResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/fee-rules", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"name":         "QA Hourly Visitor Rule",
		"vehicle_type": "car",
		"rate_type":    "hourly",
		"rates":        map[string]any{"hourly_rate": 12000},
		"free_minutes": 0,
		"applies_to":   "visitor",
		"priority":     90,
	})
	if feeRuleResp.Code != http.StatusCreated {
		t.Fatalf("create fee rule: expected 201, got %d: %s", feeRuleResp.Code, feeRuleResp.Body.String())
	}
	feeRule := decodeJSON[map[string]any](t, feeRuleResp)
	ids["fee_rule"] = feeRule["id"].(string)

	sessionResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions", map[string]any{
		"lot_id":          ids["lot"],
		"zone_id":         ids["zone"],
		"plate_number":    plate,
		"vehicle_type":    "car",
		"entry_device_id": "11111111-1111-1111-1111-111111111111",
		"matched_by":      "manual",
	})
	if sessionResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", sessionResp.Code, sessionResp.Body.String())
	}
	session := decodeJSON[map[string]any](t, sessionResp)
	ids["session"] = session["id"].(string)
	if session["decision_code"] != "manual_review" {
		t.Fatalf("expected manual decision, got %#v", session["decision_code"])
	}

	if _, err := database.Pool.Exec(context.Background(), `UPDATE dm3_parking.parking_sessions SET entry_time = now() - interval '125 minutes' WHERE id = $1::uuid`, ids["session"]); err != nil {
		t.Fatalf("backdate session: %v", err)
	}

	exitResp := parkingRequest(t, router, http.MethodPut, "/api/v1/parking/sessions/"+ids["session"]+"/exit", map[string]any{
		"exit_device_id": "22222222-2222-2222-2222-222222222222",
	})
	if exitResp.Code != http.StatusOK {
		t.Fatalf("exit session: expected 200, got %d: %s", exitResp.Code, exitResp.Body.String())
	}
	exited := decodeJSON[map[string]any](t, exitResp)
	if exited["status"] != "completed" {
		t.Fatalf("expected completed session after exit, got %#v", exited["status"])
	}
	if exited["payment_status"] != "pending" {
		t.Fatalf("expected pending payment after fee calculation, got %#v", exited["payment_status"])
	}
	if exited["fee_amount"].(float64) < 24000 {
		t.Fatalf("expected hourly fee to be calculated, got %#v", exited["fee_amount"])
	}

	paymentResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions/"+ids["session"]+"/payment", map[string]any{
		"method":    "cash",
		"amount":    exited["fee_amount"],
		"reference": "cashier-regression",
	})
	if paymentResp.Code != http.StatusOK {
		t.Fatalf("process payment: expected 200, got %d: %s", paymentResp.Code, paymentResp.Body.String())
	}
	paid := decodeJSON[map[string]any](t, paymentResp)
	if paid["payment_status"] != "paid" {
		t.Fatalf("expected paid payment_status, got %#v", paid["payment_status"])
	}
	if paid["decision_code"] != "payment_confirmed" {
		t.Fatalf("expected payment_confirmed decision, got %#v", paid["decision_code"])
	}

	listResp := parkingRequest(t, router, http.MethodGet, "/api/v1/parking/sessions?plate_number="+plate, nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list sessions: expected 200, got %d: %s", listResp.Code, listResp.Body.String())
	}
	listed := decodeJSON[map[string]any](t, listResp)
	items := listed["data"].([]any)
	if len(items) == 0 {
		t.Fatalf("expected listed session for plate filter")
	}
}

func TestParkingRecognitionPassFlow(t *testing.T) {
	database := setupParkingTestDB(t)
	defer database.Close()
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-pass", 2)

	plate := fmt.Sprintf("51G-%s", suffix[len(suffix)-5:])
	vehicleResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/vehicles", map[string]any{
		"plate_number":        plate,
		"type":                "motorbike",
		"category":            "resident",
		"registration_status": "registered",
		"brand":               "Honda",
		"color":               "Red",
	})
	if vehicleResp.Code != http.StatusCreated {
		t.Fatalf("create resident vehicle: expected 201, got %d: %s", vehicleResp.Code, vehicleResp.Body.String())
	}
	vehicle := decodeJSON[map[string]any](t, vehicleResp)
	ids["vehicle"] = vehicle["id"].(string)

	passResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/passes", map[string]any{
		"lot_id":      ids["lot"],
		"zone_id":     ids["zone"],
		"vehicle_id":  ids["vehicle"],
		"pass_type":   "standard",
		"valid_from":  time.Now().AddDate(0, 0, -1).Format("2006-01-02"),
		"valid_until": time.Now().AddDate(0, 1, 0).Format("2006-01-02"),
		"fee_amount":  0,
		"auto_renew":  true,
	})
	if passResp.Code != http.StatusCreated {
		t.Fatalf("create pass: expected 201, got %d: %s", passResp.Code, passResp.Body.String())
	}
	pass := decodeJSON[map[string]any](t, passResp)
	ids["pass"] = pass["id"].(string)

	getVehicleResp := parkingRequest(t, router, http.MethodGet, "/api/v1/parking/vehicles/"+ids["vehicle"], nil)
	if getVehicleResp.Code != http.StatusOK {
		t.Fatalf("get vehicle: expected 200, got %d: %s", getVehicleResp.Code, getVehicleResp.Body.String())
	}
	vehicleDetail := decodeJSON[map[string]any](t, getVehicleResp)
	if vehicleDetail["active_pass_id"] != ids["pass"] {
		t.Fatalf("expected vehicle active_pass_id to be updated, got %#v", vehicleDetail["active_pass_id"])
	}

	confidence := 0.93
	entryResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions/recognitions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"direction":    "entry",
		"plate_number": plate,
		"vehicle_type": "motorbike",
		"device_id":    "33333333-3333-3333-3333-333333333333",
		"confidence":   confidence,
	})
	if entryResp.Code != http.StatusCreated {
		t.Fatalf("recognition entry: expected 201, got %d: %s", entryResp.Code, entryResp.Body.String())
	}
	entry := decodeJSON[map[string]any](t, entryResp)
	ids["session"] = entry["id"].(string)
	if entry["matched_by"] != "anpr_auto" {
		t.Fatalf("expected anpr_auto match, got %#v", entry["matched_by"])
	}
	if entry["decision_code"] != "resident_pass_allow" {
		t.Fatalf("expected resident pass allow decision, got %#v", entry["decision_code"])
	}
	if entry["monthly_pass_id"] != ids["pass"] {
		t.Fatalf("expected session to reference monthly pass, got %#v", entry["monthly_pass_id"])
	}

	exitResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions/recognitions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"direction":    "exit",
		"plate_number": plate,
		"vehicle_type": "motorbike",
		"device_id":    "44444444-4444-4444-4444-444444444444",
		"confidence":   confidence,
	})
	if exitResp.Code != http.StatusOK {
		t.Fatalf("recognition exit: expected 200, got %d: %s", exitResp.Code, exitResp.Body.String())
	}
	exitBody := decodeJSON[map[string]any](t, exitResp)
	if exitBody["status"] != "completed" {
		t.Fatalf("expected completed resident pass exit, got %#v", exitBody["status"])
	}
	if exitBody["payment_status"] != "paid" && exitBody["payment_status"] != "waived" {
		t.Fatalf("expected settled payment status for pass exit, got %#v", exitBody["payment_status"])
	}
	if exitBody["decision_code"] != "exit_allow" {
		t.Fatalf("expected exit_allow decision, got %#v", exitBody["decision_code"])
	}

	passesResp := parkingRequest(t, router, http.MethodGet, "/api/v1/parking/passes?vehicle_id="+ids["vehicle"]+"&status=active", nil)
	if passesResp.Code != http.StatusOK {
		t.Fatalf("list passes: expected 200, got %d: %s", passesResp.Code, passesResp.Body.String())
	}
	passes := decodeJSON[map[string]any](t, passesResp)
	if len(passes["data"].([]any)) == 0 {
		t.Fatalf("expected active pass in filtered list")
	}
}
