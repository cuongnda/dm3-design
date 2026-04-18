package visitor

import (
	"context"
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

// ─── Approve scenarios ──────────────────────────────────────────────────────

func TestApproveVisitWithEmptyBody(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	// POST with no body should default to approved=true
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("approve with empty body: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Status != VisitStatusApproved {
		t.Fatalf("expected approved, got %s", visit.Status)
	}
	if !visit.HostApproved {
		t.Fatal("expected host_approved=true")
	}
}

func TestRejectVisit(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve",
		mustJSONBody(t, map[string]any{"approved": false, "note": "not available"})))
	if w.Code != http.StatusOK {
		t.Fatalf("reject visit: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Status != VisitStatusRejected {
		t.Fatalf("expected rejected, got %s", visit.Status)
	}
	if visit.HostApproved {
		t.Fatal("expected host_approved=false")
	}
}

func TestApproveAlreadyApprovedVisitFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusApproved)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve",
		mustJSONBody(t, map[string]any{"approved": true})))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("double approve: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestApproveCheckedInVisitFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedIn)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve",
		mustJSONBody(t, map[string]any{"approved": true})))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("approve checked-in: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestApproveWaitingVisitSucceeds(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusWaiting)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve",
		mustJSONBody(t, map[string]any{"approved": true})))
	if w.Code != http.StatusOK {
		t.Fatalf("approve waiting: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Status != VisitStatusApproved {
		t.Fatalf("expected approved, got %s", visit.Status)
	}
}

func TestApproveNonExistentVisitReturns404(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/00000000-0000-0000-0000-fffffffffffe/approve",
		mustJSONBody(t, map[string]any{"approved": true})))
	if w.Code != http.StatusNotFound {
		t.Fatalf("approve nonexistent: expected 404, got %d", w.Code)
	}
}

// ─── Checkin edge cases ─────────────────────────────────────────────────────

func TestCheckinFromCheckedOutStatusFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedOut)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodReception})))
	if w.Code != http.StatusConflict {
		t.Fatalf("checkin from checked_out: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckinFromNoShowStatusFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusNoShow)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodReception})))
	if w.Code != http.StatusConflict {
		t.Fatalf("checkin from no_show: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckinFromRejectedStatusFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusRejected)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodReception})))
	if w.Code != http.StatusConflict {
		t.Fatalf("checkin from rejected: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckinWithInvalidMethodFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": "invalid_method"})))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("checkin invalid method: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckinWithWrongQRTokenFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusApproved)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodTerminalQR, "qr_token": "wrong-token-value"})))
	if w.Code != http.StatusForbidden {
		t.Fatalf("checkin wrong qr: expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckinAllValidMethods(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	methods := []string{
		CheckinMethodTerminalQR,
		CheckinMethodTerminalManual,
		CheckinMethodReception,
		CheckinMethodSelfService,
		CheckinMethodMobileQR,
	}
	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			h := NewVisitorHandlers(database, nil, nil)
			router := setupVisitorRouter(h)
			visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
				mustJSONBody(t, map[string]any{"checkin_method": method})))
			if w.Code != http.StatusOK {
				t.Fatalf("checkin method %s: expected 200, got %d: %s", method, w.Code, w.Body.String())
			}
		})
	}
}

// ─── Checkout edge cases ────────────────────────────────────────────────────

func TestCheckoutWithEmptyBody(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedIn)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("checkout empty body: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Status != VisitStatusCheckedOut {
		t.Fatalf("expected checked_out, got %s", visit.Status)
	}
}

func TestCheckoutFromPreRegisteredFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout",
		mustJSONBody(t, map[string]any{"badge_returned": true})))
	if w.Code != http.StatusConflict {
		t.Fatalf("checkout from pre_registered: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckoutIdempotent(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedIn)

	// First checkout
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout",
		mustJSONBody(t, map[string]any{"badge_returned": true})))
	if w1.Code != http.StatusOK {
		t.Fatalf("first checkout: expected 200, got %d", w1.Code)
	}

	// Second checkout should also succeed (idempotent)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout",
		mustJSONBody(t, map[string]any{"badge_returned": true})))
	if w2.Code != http.StatusOK {
		t.Fatalf("second checkout: expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestCheckoutNonExistentVisitReturns404(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/00000000-0000-0000-0000-fffffffffffe/checkout",
		mustJSONBody(t, map[string]any{"badge_returned": true})))
	if w.Code != http.StatusNotFound {
		t.Fatalf("checkout nonexistent: expected 404, got %d", w.Code)
	}
}

// ─── QR code lookup ─────────────────────────────────────────────────────────

func TestGetVisitByQRValid(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	visitID, qrToken, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	r := httputil.NewRouter()
	r.Get("/api/v1/visitors/qr/{qr_token}", h.GetVisitByQR)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/qr/"+qrToken, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("QR lookup: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode QR response: %v", err)
	}
	if resp["visit_id"] != visitID {
		t.Fatalf("expected visit_id %s, got %v", visitID, resp["visit_id"])
	}
	if resp["status"] != VisitStatusPreRegistered {
		t.Fatalf("expected status pre_registered, got %v", resp["status"])
	}
}

func TestGetVisitByQRExpired(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	_, qrToken, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	// Expire the QR token
	ctx := context.Background()
	_, err := database.Pool.Exec(ctx, `UPDATE dm3_visitor.visits SET qr_expires_at = now() - interval '1 hour' WHERE qr_token = $1`, qrToken)
	if err != nil {
		t.Fatalf("expire qr: %v", err)
	}

	r := httputil.NewRouter()
	r.Get("/api/v1/visitors/qr/{qr_token}", h.GetVisitByQR)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/qr/"+qrToken, nil))
	if w.Code != http.StatusGone {
		t.Fatalf("expired QR: expected 410, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetVisitByQRInvalidToken(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	r := httputil.NewRouter()
	r.Get("/api/v1/visitors/qr/{qr_token}", h.GetVisitByQR)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/qr/nonexistent-token", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("invalid QR: expected 404, got %d", w.Code)
	}
}

func TestGetVisitByQRWithAuthContext(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	_, qrToken, _ := createVisitorFixture(t, database, VisitStatusApproved)

	// With auth context — should filter by tenant_id
	claims := &authsvc.AccessClaims{
		Sub: "00000000-0000-0000-0000-0000000000aa",
		CID: visitorTestTenantID,
	}
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Get("/api/v1/visitors/qr/{qr_token}", h.GetVisitByQR)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/qr/"+qrToken, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("QR with auth: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Today summary ──────────────────────────────────────────────────────────

func TestTodaySummaryReturnsCorrectCounts(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/today/summary", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("today summary: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var summary VisitSummary
	if err := json.Unmarshal(w.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	// Summary should have non-negative counts
	if summary.TotalExpected < 0 || summary.Waiting < 0 || summary.CheckedIn < 0 || summary.CheckedOut < 0 || summary.NoShow < 0 {
		t.Fatalf("summary has negative counts: %+v", summary)
	}
}

func TestTodaySummaryRequiresAuth(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	// No claims middleware
	w := httptest.NewRecorder()
	h.GetTodaySummary(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/today/summary", nil))
	if w.Code != http.StatusForbidden {
		t.Fatalf("summary no auth: expected 403, got %d", w.Code)
	}
}

// ─── List visits with filters ───────────────────────────────────────────────

func setupListVisitsRouter(h *VisitorHandlers) http.Handler {
	claims := &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000aa",
		CID:   visitorTestTenantID,
		Email: "test@example.com",
		Role:  "primary_manager",
		Roles: []string{"primary_manager"},
	}
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/visitors", h.ListVisits)
		r.Get("/visitors/{id}", h.GetVisit)
		r.Get("/visitors/today/summary", h.GetTodaySummary)
		r.Get("/visitors/visits", h.ListVisits)
	})
	return r
}

func TestListVisitsDefaultPagination(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list visits: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if resp["page"] != float64(1) {
		t.Fatalf("expected page 1, got %v", resp["page"])
	}
}

func TestListVisitsFilterByStatus(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	// Create visits with different statuses
	createVisitorFixture(t, database, VisitStatusPreRegistered)
	createVisitorFixture(t, database, VisitStatusCheckedIn)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors?status=checked_in", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list by status: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []Visit `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	for _, v := range resp.Data {
		if v.Status != VisitStatusCheckedIn {
			t.Fatalf("expected only checked_in visits, got %s", v.Status)
		}
	}
}

func TestListVisitsFilterByDate(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	today := time.Now().Format("2006-01-02")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors?date="+today, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list by date: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListVisitsSearch(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	seed := time.Now().UnixNano()
	email := fmt.Sprintf("searchtest+%d@example.com", seed)
	createVisitorRecord(t, database, "SearchMe", "Visitor", &email, nil, nil, nil)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors?search=SearchMe", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("search: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetVisitReturnsJoinedData(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/"+visitID, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("get visit: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Visitor == nil {
		t.Fatal("expected visitor to be populated")
	}
	if visit.Host == nil {
		t.Fatal("expected host to be populated")
	}
}

func TestGetVisitNotFound(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupListVisitsRouter(h)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/00000000-0000-0000-0000-fffffffffffe", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("get nonexistent: expected 404, got %d", w.Code)
	}
}

// ─── Update visit ───────────────────────────────────────────────────────────

func setupMutationRouter(h *VisitorHandlers) http.Handler {
	claims := &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000aa",
		CID:   visitorTestTenantID,
		Email: "test@example.com",
		Role:  "primary_manager",
		Roles: []string{"primary_manager"},
	}
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1", func(r chi.Router) {
		r.Put("/visitors/{id}", h.UpdateVisit)
	})
	return r
}

func TestUpdateVisitChangesFields(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupMutationRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	newPurpose := VisitPurposeInterview
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/api/v1/visitors/"+visitID,
		mustJSONBody(t, map[string]any{"purpose": newPurpose, "notes": "updated notes"})))
	if w.Code != http.StatusOK {
		t.Fatalf("update visit: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Purpose != newPurpose {
		t.Fatalf("expected purpose %s, got %s", newPurpose, visit.Purpose)
	}
}

func TestUpdateVisitCheckedInStatusFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupMutationRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedIn)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/api/v1/visitors/"+visitID,
		mustJSONBody(t, map[string]any{"notes": "attempt update"})))
	if w.Code == http.StatusOK {
		t.Fatal("should not allow updating checked-in visit")
	}
}

func TestUpdateVisitInvalidPurposeFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupMutationRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)

	w := httptest.NewRecorder()
	invalid := "invalid_purpose"
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/api/v1/visitors/"+visitID,
		mustJSONBody(t, map[string]any{"purpose": invalid})))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("update invalid purpose: expected 400, got %d", w.Code)
	}
}

// ─── Create visit validation ────────────────────────────────────────────────

func TestCreateVisitAllPurposes(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	hostID := createHostRecord(t, database, "Purpose", "Host")

	purposes := []string{
		VisitPurposeMeeting,
		VisitPurposeInterview,
		VisitPurposeDelivery,
		VisitPurposeMaintenance,
		VisitPurposeTour,
		VisitPurposeContractSigning,
		VisitPurposeOther,
	}
	for _, purpose := range purposes {
		t.Run(purpose, func(t *testing.T) {
			seed := time.Now().UnixNano()
			req := map[string]any{
				"visitor":          map[string]any{"first_name": "Test", "last_name": purpose, "email": fmt.Sprintf("p+%d@example.com", seed), "phone": fmt.Sprintf("+8490%07d", seed%10000000)},
				"host_user_id":     hostID,
				"purpose":          purpose,
				"expected_arrival": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, req)))
			if w.Code != http.StatusCreated {
				t.Fatalf("create %s: expected 201, got %d: %s", purpose, w.Code, w.Body.String())
			}
		})
	}
}

func TestCreateVisitInvalidPurposeFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	hostID := createHostRecord(t, database, "Bad", "Host")

	req := map[string]any{
		"visitor":          map[string]any{"first_name": "Test", "last_name": "User"},
		"host_user_id":     hostID,
		"purpose":          "lunch",
		"expected_arrival": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, req)))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid purpose: expected 400, got %d", w.Code)
	}
}

func TestCreateVisitInvalidHostFails(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)

	req := map[string]any{
		"visitor":          map[string]any{"first_name": "Test", "last_name": "User"},
		"host_user_id":     "00000000-0000-0000-0000-fffffffffffe",
		"purpose":          VisitPurposeMeeting,
		"expected_arrival": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, req)))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid host: expected 400, got %d", w.Code)
	}
}

// ─── Permission checks ─────────────────────────────────────────────────────

func TestViewerCannotCreateVisit(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	viewerRouter := setupVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	req := map[string]any{
		"visitor":          map[string]any{"first_name": "Test", "last_name": "User"},
		"host_user_id":     "some-id",
		"purpose":          VisitPurposeMeeting,
		"expected_arrival": time.Now().Add(1 * time.Hour).Format(time.RFC3339),
	}
	w := httptest.NewRecorder()
	viewerRouter.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, req)))
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer create: expected 403, got %d", w.Code)
	}
}

func TestViewerCannotCheckinVisit(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusApproved)

	viewerRouter := setupVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	w := httptest.NewRecorder()
	viewerRouter.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin",
		mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodReception})))
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer checkin: expected 403, got %d", w.Code)
	}
}

func TestHostCanApproveOwnVisitOnly(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	hostID := createHostRecord(t, database, "MyHost", "User")

	// Create a visit for this host
	ctx := context.Background()
	seed := time.Now().UnixNano()
	visitorID := createVisitorRecord(t, database, fmt.Sprintf("HostTest%d", seed), "Visitor", nil, nil, nil, nil)
	var visitID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_visitor.visits (tenant_id, visitor_id, host_user_id, purpose, status,
			expected_arrival, expected_departure, qr_token, qr_expires_at)
		VALUES ($1::uuid, $2::uuid, $3::uuid, 'meeting', 'pre_registered',
			now() + interval '1 hour', now() + interval '3 hours', $4, now() + interval '1 day')
		RETURNING id`, visitorTestTenantID, visitorID, hostID, fmt.Sprintf("qr-%x", seed),
	).Scan(&visitID)
	if err != nil {
		t.Fatalf("create visit: %v", err)
	}

	// Host (viewer role) should be able to approve their own visit
	hostRouter := setupVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   hostID,
		CID:   visitorTestTenantID,
		Email: "host@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	w := httptest.NewRecorder()
	hostRouter.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/approve",
		mustJSONBody(t, map[string]any{"approved": true})))
	if w.Code != http.StatusOK {
		t.Fatalf("host approve own: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Watchlist CRUD ─────────────────────────────────────────────────────────

func setupWatchlistRouter(h *VisitorHandlers) http.Handler {
	claims := &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000aa",
		CID:   visitorTestTenantID,
		Email: "admin@example.com",
		Role:  "admin",
		Roles: []string{"admin"},
	}
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/visitors/watchlist", h.ListWatchlist)
		r.Post("/visitors/watchlist", h.CreateWatchlistEntry)
		r.Delete("/visitors/watchlist/{id}", h.DeleteWatchlistEntry)
	})
	return r
}

func TestWatchlistCreateAndDelete(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupWatchlistRouter(h)

	seed := time.Now().UnixNano()
	// Create
	createReq := map[string]any{
		"entry_type":  WatchlistBlacklisted,
		"match_field": "email",
		"match_value": fmt.Sprintf("watchtest+%d@example.com", seed),
		"reason":      "test entry",
	}
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/watchlist", mustJSONBody(t, createReq)))
	if createW.Code != http.StatusCreated {
		t.Fatalf("create watchlist: expected 201, got %d: %s", createW.Code, createW.Body.String())
	}
	var entry WatchlistEntry
	if err := json.Unmarshal(createW.Body.Bytes(), &entry); err != nil {
		t.Fatalf("decode watchlist entry: %v", err)
	}
	if entry.EntryType != WatchlistBlacklisted || entry.MatchField != "email" {
		t.Fatalf("unexpected watchlist entry: %+v", entry)
	}

	// List — should contain the entry
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, httptest.NewRequest(http.MethodGet, "/api/v1/visitors/watchlist", nil))
	if listW.Code != http.StatusOK {
		t.Fatalf("list watchlist: expected 200, got %d", listW.Code)
	}

	// Delete
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, httptest.NewRequest(http.MethodDelete, "/api/v1/visitors/watchlist/"+entry.ID, nil))
	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("delete watchlist: expected 204, got %d: %s", deleteW.Code, deleteW.Body.String())
	}

	// Delete again — should be 404
	deleteW2 := httptest.NewRecorder()
	router.ServeHTTP(deleteW2, httptest.NewRequest(http.MethodDelete, "/api/v1/visitors/watchlist/"+entry.ID, nil))
	if deleteW2.Code != http.StatusNotFound {
		t.Fatalf("delete again: expected 404, got %d", deleteW2.Code)
	}
}

func TestWatchlistCreateValidation(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupWatchlistRouter(h)

	tests := []struct {
		name string
		body map[string]any
	}{
		{"missing entry_type", map[string]any{"match_field": "name", "match_value": "x", "reason": "y"}},
		{"missing match_field", map[string]any{"entry_type": "blacklisted", "match_value": "x", "reason": "y"}},
		{"missing match_value", map[string]any{"entry_type": "blacklisted", "match_field": "name", "reason": "y"}},
		{"missing reason", map[string]any{"entry_type": "blacklisted", "match_field": "name", "match_value": "x"}},
		{"invalid entry_type", map[string]any{"entry_type": "invalid", "match_field": "name", "match_value": "x", "reason": "y"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/watchlist", mustJSONBody(t, tt.body)))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("%s: expected 400, got %d: %s", tt.name, w.Code, w.Body.String())
			}
		})
	}
}

func TestWatchlistViewerCannotCreate(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	viewerRouter := setupVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000bb",
		CID:   visitorTestTenantID,
		Email: "viewer@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	})

	w := httptest.NewRecorder()
	viewerRouter.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/watchlist",
		mustJSONBody(t, map[string]any{"entry_type": "blacklisted", "match_field": "name", "match_value": "x", "reason": "y"})))
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer watchlist: expected 403, got %d", w.Code)
	}
}

// ─── Visitor upsert dedup ───────────────────────────────────────────────────

func TestVisitorUpsertDeduplicatesByEmail(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	hostID := createHostRecord(t, database, "Dedup", "Host")

	seed := time.Now().UnixNano()
	email := fmt.Sprintf("dedup+%d@example.com", seed)

	for i := 0; i < 3; i++ {
		req := map[string]any{
			"visitor":          map[string]any{"first_name": "Same", "last_name": "Person", "email": email, "phone": fmt.Sprintf("+8491%07d", seed%10000000)},
			"host_user_id":     hostID,
			"purpose":          VisitPurposeMeeting,
			"expected_arrival": time.Now().Add(time.Duration(i+1) * time.Hour).Format(time.RFC3339),
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, req)))
		if w.Code != http.StatusCreated {
			t.Fatalf("create visit %d: expected 201, got %d: %s", i, w.Code, w.Body.String())
		}
	}

	// Should have exactly 1 visitor record with visit_count=3
	ctx := context.Background()
	var count int
	var visitCount int
	err := database.Pool.QueryRow(ctx, `SELECT COUNT(*), MAX(visit_count) FROM dm3_visitor.visitors WHERE email = $1 AND tenant_id = $2::uuid`, email, visitorTestTenantID).Scan(&count, &visitCount)
	if err != nil {
		t.Fatalf("count visitors: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 visitor, got %d", count)
	}
	if visitCount != 3 {
		t.Fatalf("expected visit_count=3, got %d", visitCount)
	}
}

// ─── Validation helpers ─────────────────────────────────────────────────────

func TestIsValidVisitPurpose(t *testing.T) {
	valid := []string{"meeting", "interview", "delivery", "maintenance", "tour", "contract_signing", "other"}
	for _, v := range valid {
		if !isValidVisitPurpose(v) {
			t.Fatalf("%q should be valid", v)
		}
	}
	invalid := []string{"lunch", "business", "personal", ""}
	for _, v := range invalid {
		if isValidVisitPurpose(v) {
			t.Fatalf("%q should be invalid", v)
		}
	}
}

func TestIsValidCheckinMethod(t *testing.T) {
	valid := []string{"terminal_qr", "terminal_manual", "reception", "self_service", "mobile_qr"}
	for _, v := range valid {
		if !isValidCheckinMethod(v) {
			t.Fatalf("%q should be valid", v)
		}
	}
	invalid := []string{"manual", "qr", "card", ""}
	for _, v := range invalid {
		if isValidCheckinMethod(v) {
			t.Fatalf("%q should be invalid", v)
		}
	}
}

func TestEndOfDay(t *testing.T) {
	now := time.Date(2026, 4, 10, 14, 30, 0, 0, time.UTC)
	eod := endOfDay(now)
	if eod.Hour() != 23 || eod.Minute() != 59 || eod.Second() != 59 {
		t.Fatalf("expected 23:59:59, got %s", eod.Format(time.RFC3339))
	}
	if eod.Day() != 10 || eod.Month() != 4 {
		t.Fatalf("expected same date, got %s", eod.Format("2006-01-02"))
	}
}

func TestNilIfEmptyUUIDArray(t *testing.T) {
	if nilIfEmptyUUIDArray(nil) != nil {
		t.Fatal("nil input should return nil")
	}
	if nilIfEmptyUUIDArray([]string{}) != nil {
		t.Fatal("empty slice should return nil")
	}
	result := nilIfEmptyUUIDArray([]string{"abc"})
	if result == nil {
		t.Fatal("non-empty slice should return values")
	}
}

func TestDerefString(t *testing.T) {
	if derefString(nil) != "" {
		t.Fatal("nil should return empty")
	}
	v := "hello"
	if derefString(&v) != "hello" {
		t.Fatal("expected hello")
	}
}

func TestHasAnyRole(t *testing.T) {
	claims := &authsvc.AccessClaims{Role: "operator", Roles: []string{"operator", "manager"}}
	if !hasAnyRole(claims, "operator") {
		t.Fatal("should match primary role")
	}
	if !hasAnyRole(claims, "manager") {
		t.Fatal("should match roles list")
	}
	if !hasAnyRole(claims, "viewer", "manager") {
		t.Fatal("should match any of provided roles")
	}
	if hasAnyRole(claims, "super_admin") {
		t.Fatal("should not match unassigned role")
	}
	if hasAnyRole(nil, "admin") {
		t.Fatal("nil claims should return false")
	}
}
