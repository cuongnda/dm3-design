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
		r.Post("/sessions/{id}/void", h.VoidParkingSession)
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
	t.Cleanup(func() { database.Close() })
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
	// Default settings enforce require_payment_before_exit=true, so an unpaid
	// exit leaves the session active until payment clears.
	if exited["status"] != "active" {
		t.Fatalf("expected active session after unpaid exit (require_payment_before_exit enforced), got %#v", exited["status"])
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
	t.Cleanup(func() { database.Close() })
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

// ensureParkingSettings creates the default settings row for the test tenant
// (idempotent). Returns when a row exists.
func ensureParkingSettings(t *testing.T, h *ParkingHandlers) {
	t.Helper()
	if _, err := h.getOrCreateSettings(context.Background(), parkingTestTenantID); err != nil {
		t.Fatalf("ensure parking settings: %v", err)
	}
}

// setParkingSettingBool updates a single boolean setting column for the test
// tenant and registers a defer to restore the default.
func setParkingSettingBool(t *testing.T, database *db.DB, h *ParkingHandlers, column string, value bool) {
	t.Helper()
	ensureParkingSettings(t, h)
	if _, err := database.Pool.Exec(context.Background(),
		fmt.Sprintf("UPDATE dm3_parking.parking_settings SET %s = $1 WHERE tenant_id = $2::uuid", column),
		value, parkingTestTenantID,
	); err != nil {
		t.Fatalf("update setting %s: %v", column, err)
	}
	t.Cleanup(func() {
		// Restore defaults so other tests see a clean state.
		_, _ = database.Pool.Exec(context.Background(),
			fmt.Sprintf("UPDATE dm3_parking.parking_settings SET %s = $1 WHERE tenant_id = $2::uuid", column),
			true, parkingTestTenantID,
		)
	})
}

// setParkingSettingInt updates a single integer setting column for the test
// tenant and registers a defer to restore the given restore value.
func setParkingSettingInt(t *testing.T, database *db.DB, h *ParkingHandlers, column string, value, restore int) {
	t.Helper()
	ensureParkingSettings(t, h)
	if _, err := database.Pool.Exec(context.Background(),
		fmt.Sprintf("UPDATE dm3_parking.parking_settings SET %s = $1 WHERE tenant_id = $2::uuid", column),
		value, parkingTestTenantID,
	); err != nil {
		t.Fatalf("update setting %s: %v", column, err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool.Exec(context.Background(),
			fmt.Sprintf("UPDATE dm3_parking.parking_settings SET %s = $1 WHERE tenant_id = $2::uuid", column),
			restore, parkingTestTenantID,
		)
	})
}

// TestParkingExitOverstayMarkedDisputed verifies that when a session's duration
// exceeds max_session_hours, exit marks the session disputed with the
// overstay_exceeded decision code regardless of payment status.
func TestParkingExitOverstayMarkedDisputed(t *testing.T) {
	database := setupParkingTestDB(t)
	t.Cleanup(func() { database.Close() })
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	// max_session_hours=1 so backdating entry by 2h triggers overstay.
	setParkingSettingInt(t, database, h, "max_session_hours", 1, 24)
	// Disable payment gate so exit would otherwise complete cleanly.
	setParkingSettingBool(t, database, h, "require_payment_before_exit", false)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-over", 3)

	plate := fmt.Sprintf("29A-%s", suffix[len(suffix)-5:])
	sessionResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"plate_number": plate,
		"vehicle_type": "car",
		"matched_by":   "manual",
	})
	if sessionResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", sessionResp.Code, sessionResp.Body.String())
	}
	ids["session"] = decodeJSON[map[string]any](t, sessionResp)["id"].(string)

	// Backdate entry_time to 2 hours ago.
	if _, err := database.Pool.Exec(context.Background(),
		`UPDATE dm3_parking.parking_sessions SET entry_time = NOW() - INTERVAL '2 hours' WHERE id = $1::uuid`,
		ids["session"],
	); err != nil {
		t.Fatalf("backdate entry_time: %v", err)
	}

	exitResp := parkingRequest(t, router, http.MethodPut, "/api/v1/parking/sessions/"+ids["session"]+"/exit", map[string]any{})
	if exitResp.Code != http.StatusOK {
		t.Fatalf("exit session: expected 200, got %d: %s", exitResp.Code, exitResp.Body.String())
	}
	exited := decodeJSON[map[string]any](t, exitResp)
	if exited["status"] != "disputed" {
		t.Fatalf("expected disputed on overstay, got %#v", exited["status"])
	}
	if exited["decision_code"] != "overstay_exceeded" {
		t.Fatalf("expected decision_code=overstay_exceeded, got %#v", exited["decision_code"])
	}
}

// TestParkingRecognitionDisabled verifies plate_recognition_enabled=false
// rejects /sessions/recognitions with 403.
func TestParkingRecognitionDisabled(t *testing.T) {
	database := setupParkingTestDB(t)
	t.Cleanup(func() { database.Close() })
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)

	setParkingSettingBool(t, database, h, "plate_recognition_enabled", false)

	resp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions/recognitions", map[string]any{
		"lot_id":       "00000000-0000-0000-0000-000000000099",
		"zone_id":      "00000000-0000-0000-0000-000000000098",
		"plate_number": "51H-99999",
		"vehicle_type": "car",
		"direction":    "entry",
	})
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when recognition disabled, got %d: %s", resp.Code, resp.Body.String())
	}
}

// TestParkingExitCompletesWhenPaymentNotRequired verifies the require_payment_before_exit
// setting actually gates the session lifecycle: when disabled, an unpaid exit
// transitions the session directly to "completed" (old behavior).
func TestParkingExitCompletesWhenPaymentNotRequired(t *testing.T) {
	database := setupParkingTestDB(t)
	t.Cleanup(func() { database.Close() })
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	setParkingSettingBool(t, database, h, "require_payment_before_exit", false)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-nopay", 3)

	plate := fmt.Sprintf("30X-%s", suffix[len(suffix)-5:])
	vehicleResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/vehicles", map[string]any{
		"plate_number":        plate,
		"type":                "car",
		"category":            "visitor",
		"registration_status": "visitor",
	})
	if vehicleResp.Code != http.StatusCreated {
		t.Fatalf("create vehicle: expected 201, got %d: %s", vehicleResp.Code, vehicleResp.Body.String())
	}
	ids["vehicle"] = decodeJSON[map[string]any](t, vehicleResp)["id"].(string)

	sessionResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"plate_number": plate,
		"vehicle_type": "car",
		"matched_by":   "manual",
	})
	if sessionResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", sessionResp.Code, sessionResp.Body.String())
	}
	ids["session"] = decodeJSON[map[string]any](t, sessionResp)["id"].(string)

	exitResp := parkingRequest(t, router, http.MethodPut, "/api/v1/parking/sessions/"+ids["session"]+"/exit", map[string]any{})
	if exitResp.Code != http.StatusOK {
		t.Fatalf("exit session: expected 200, got %d: %s", exitResp.Code, exitResp.Body.String())
	}
	exited := decodeJSON[map[string]any](t, exitResp)
	if exited["status"] != "completed" {
		t.Fatalf("expected completed exit when require_payment_before_exit=false, got %#v", exited["status"])
	}
}

// TestParkingSessionListFilterByVoidStatus verifies that the canonical "void"
// status value (not "voided") is accepted by the list filter and returns only
// voided sessions. Guards against the backend/frontend status naming mismatch
// previously flagged in the review verdict.
func TestParkingSessionListFilterByVoidStatus(t *testing.T) {
	database := setupParkingTestDB(t)
	t.Cleanup(func() { database.Close() })
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-void", 3)

	plate := fmt.Sprintf("51V-%s", suffix[len(suffix)-5:])
	sessionResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"plate_number": plate,
		"vehicle_type": "car",
		"matched_by":   "manual",
	})
	if sessionResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", sessionResp.Code, sessionResp.Body.String())
	}
	ids["session"] = decodeJSON[map[string]any](t, sessionResp)["id"].(string)

	voidResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions/"+ids["session"]+"/void", nil)
	if voidResp.Code != http.StatusOK {
		t.Fatalf("void session: expected 200, got %d: %s", voidResp.Code, voidResp.Body.String())
	}
	voided := decodeJSON[map[string]any](t, voidResp)
	if voided["status"] != "void" {
		t.Fatalf("expected status=\"void\" (canonical), got %#v", voided["status"])
	}

	// status=voided should NOT match (guards against legacy frontend term leaking back).
	legacyResp := parkingRequest(t, router, http.MethodGet,
		"/api/v1/parking/sessions?plate_number="+plate+"&status=voided", nil)
	if legacyResp.Code != http.StatusOK {
		t.Fatalf("list with legacy status=voided: expected 200, got %d", legacyResp.Code)
	}
	legacyBody := decodeJSON[map[string]any](t, legacyResp)
	if data, _ := legacyBody["data"].([]any); len(data) != 0 {
		t.Fatalf("expected empty result for status=voided filter, got %d rows", len(data))
	}

	// status=void returns the voided row.
	listResp := parkingRequest(t, router, http.MethodGet,
		"/api/v1/parking/sessions?plate_number="+plate+"&status=void", nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list with status=void: expected 200, got %d: %s", listResp.Code, listResp.Body.String())
	}
	body := decodeJSON[map[string]any](t, listResp)
	data, _ := body["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected exactly 1 voided session, got %d", len(data))
	}
	row := data[0].(map[string]any)
	if row["status"] != "void" {
		t.Fatalf("expected filtered row status=void, got %#v", row["status"])
	}
}

// TestParkingSessionResponseContract verifies the JSON contract keys exposed to
// API clients. Guards against DTO drift (e.g. normalized_plate vs
// normalized_plate_number) that previously broke the frontend.
func TestParkingSessionResponseContract(t *testing.T) {
	database := setupParkingTestDB(t)
	t.Cleanup(func() { database.Close() })
	requireParkingSchema(t, database)

	h := NewParkingHandlers(database, nil, nil)
	router := setupParkingRouter(h)
	ids := map[string]string{}
	defer cleanupParkingFixtures(t, database, ids)

	suffix := time.Now().Format("20060102150405")
	ids["lot"], ids["zone"] = createParkingLotAndZone(t, router, suffix+"-shape", 3)

	plate := fmt.Sprintf("88K-%s", suffix[len(suffix)-5:])
	sessionResp := parkingRequest(t, router, http.MethodPost, "/api/v1/parking/sessions", map[string]any{
		"lot_id":       ids["lot"],
		"zone_id":      ids["zone"],
		"plate_number": plate,
		"vehicle_type": "car",
		"matched_by":   "manual",
	})
	if sessionResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", sessionResp.Code, sessionResp.Body.String())
	}
	session := decodeJSON[map[string]any](t, sessionResp)
	ids["session"] = session["id"].(string)

	if _, ok := session["normalized_plate"]; !ok {
		t.Fatalf("ParkingSession JSON missing expected key \"normalized_plate\"; keys=%v", mapKeys(session))
	}
	if _, ok := session["normalized_plate_number"]; ok {
		t.Fatalf("ParkingSession JSON contains legacy key \"normalized_plate_number\"; should be \"normalized_plate\"")
	}
}

func mapKeys(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	return ks
}
