package visitor

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

const visitorTestTenantID = "00000000-0000-0000-0000-000000000001"

func setupVisitorTestDB(t *testing.T) *db.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"
	}
	database, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		t.Skipf("database not available: %v", err)
	}
	// Ensure the hardcoded test tenant exists; many fixtures insert users and
	// visits scoped to this tenant and require the FK target to be present.
	if _, err := database.Pool.Exec(context.Background(), `
		INSERT INTO dm3_auth.tenants (id, name, code, enabled_plugins)
		VALUES ($1::uuid, 'Visitor Test Tenant', 'visitor-test', ARRAY['core','visitor']::varchar[])
		ON CONFLICT (id) DO NOTHING`, visitorTestTenantID); err != nil {
		database.Close()
		t.Fatalf("seed test tenant: %v", err)
	}
	return database
}

func setupVisitorRouter(h *VisitorHandlers) http.Handler {
	return setupVisitorRouterWithClaims(h, &authsvc.AccessClaims{
		Sub:   "00000000-0000-0000-0000-0000000000aa",
		CID:   visitorTestTenantID,
		Email: "visitor-test@example.com",
		Role:  "primary_manager",
		Roles: []string{"primary_manager"},
	})
}

func setupVisitorRouterWithClaims(h *VisitorHandlers, claims *authsvc.AccessClaims) http.Handler {
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/visitors", h.CreateVisit)
		r.Post("/visitors/walkin", h.WalkinVisit)
		r.Post("/visitors/watchlist", h.CreateWatchlistEntry)
		r.Post("/visitors/{id}/approve", h.ApproveVisit)
		r.Post("/visitors/{id}/checkin", h.CheckinVisit)
		r.Post("/visitors/{id}/checkout", h.CheckoutVisit)
	})
	return r
}

func createVisitorFixture(t *testing.T, database *db.DB, status string) (visitID string, qrToken string, badgeNumber string) {
	t.Helper()
	ctx := context.Background()
	seed := time.Now().UnixNano()
	visitorID := createVisitorRecord(t, database, fmt.Sprintf("Retry%d", seed), "Visitor", nil, nil, nil, nil)
	hostID := createHostRecord(t, database, "Host", "User")

	qrToken = fmt.Sprintf("qr-%x", seed)
	badgeNumber = fmt.Sprintf("B%016x", seed)
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_visitor.visits (
			tenant_id, visitor_id, host_user_id, purpose, status,
			expected_arrival, expected_departure, qr_token, qr_expires_at, badge_number
		)
		VALUES (
			$1::uuid, $2::uuid, $3::uuid, 'meeting', $4,
			now() - interval '30 minutes', now() + interval '4 hours', $5, now() + interval '1 day', $6
		)
		RETURNING id`, visitorTestTenantID, visitorID, hostID, status, qrToken, badgeNumber,
	).Scan(&visitID)
	if err != nil {
		t.Fatalf("create visit: %v", err)
	}
	return visitID, qrToken, badgeNumber
}

func createHostRecord(t *testing.T, database *db.DB, firstName, lastName string) string {
	t.Helper()
	ctx := context.Background()
	var hostID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
		VALUES ($1::uuid, $2, $3, 'active', false)
		RETURNING id`, visitorTestTenantID, firstName, lastName,
	).Scan(&hostID)
	if err != nil {
		t.Fatalf("create host: %v", err)
	}
	return hostID
}

func createVisitorRecord(t *testing.T, database *db.DB, firstName, lastName string, email, phone, company, nationalID *string) string {
	t.Helper()
	ctx := context.Background()
	var visitorID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_visitor.visitors (tenant_id, first_name, last_name, email, phone, company, national_id, watchlist_status, visit_count)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'none', 0)
		RETURNING id`, visitorTestTenantID, firstName, lastName, email, phone, company, nationalID,
	).Scan(&visitorID)
	if err != nil {
		t.Fatalf("create visitor: %v", err)
	}
	return visitorID
}

func mustJSONBody(t *testing.T, payload any) *bytes.Buffer {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return bytes.NewBuffer(body)
}

func decodeVisitResponse(t *testing.T, w *httptest.ResponseRecorder) Visit {
	t.Helper()
	var visit Visit
	if err := json.Unmarshal(w.Body.Bytes(), &visit); err != nil {
		t.Fatalf("decode visit response: %v, body=%s", err, w.Body.String())
	}
	return visit
}

func TestVisitorLifecycleCreateApproveCheckinCheckout(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	hostID := createHostRecord(t, database, "Flow", "Host")
	hostClaims := &authsvc.AccessClaims{
		Sub:   hostID,
		CID:   visitorTestTenantID,
		Email: "host@example.com",
		Role:  "viewer",
		Roles: []string{"viewer"},
	}
	hostRouter := setupVisitorRouterWithClaims(h, hostClaims)
	managerRouter := setupVisitorRouter(h)

	seed := time.Now().UnixNano()
	expectedArrival := time.Now().Add(45 * time.Minute).UTC().Truncate(time.Second)
	expectedDeparture := expectedArrival.Add(2 * time.Hour)
	createReq := map[string]any{
		"visitor": map[string]any{
			"first_name": "Ava",
			"last_name":  "Nguyen",
			"email":      fmt.Sprintf("ava.integration+%d@example.com", seed),
			"phone":      fmt.Sprintf("+84901%06d", seed%1000000),
			"company":    "Duali QA",
		},
		"host_user_id":       hostID,
		"purpose":            VisitPurposeMeeting,
		"expected_arrival":   expectedArrival.Format(time.RFC3339),
		"expected_departure": expectedDeparture.Format(time.RFC3339),
		"escort_required":    true,
		"vehicle_plate":      "51A-12345",
	}
	createW := httptest.NewRecorder()
	managerRouter.ServeHTTP(createW, httptest.NewRequest(http.MethodPost, "/api/v1/visitors", mustJSONBody(t, createReq)))
	if createW.Code != http.StatusCreated {
		t.Fatalf("create visit: expected 201, got %d: %s", createW.Code, createW.Body.String())
	}
	createdVisit := decodeVisitResponse(t, createW)
	if createdVisit.Status != VisitStatusPreRegistered || createdVisit.HostUserID != hostID {
		t.Fatalf("unexpected created visit: %+v", createdVisit)
	}

	approveW := httptest.NewRecorder()
	hostRouter.ServeHTTP(approveW, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+createdVisit.ID+"/approve", mustJSONBody(t, map[string]any{"approved": true, "note": "approved by host"})))
	if approveW.Code != http.StatusOK {
		t.Fatalf("approve visit: expected 200, got %d: %s", approveW.Code, approveW.Body.String())
	}
	approvedVisit := decodeVisitResponse(t, approveW)
	if approvedVisit.Status != VisitStatusApproved || !approvedVisit.HostApproved || approvedVisit.HostApprovedAt == nil {
		t.Fatalf("unexpected approved visit: %+v", approvedVisit)
	}

	checkinReq := map[string]any{
		"checkin_method": "reception",
		"qr_token":       approvedVisit.QRToken,
		"national_id":    "079123456789",
		"items_carried":  "laptop bag",
		"nda_signed":     true,
		"badge_number":   "FLOW-BADGE-01",
	}
	checkinW := httptest.NewRecorder()
	managerRouter.ServeHTTP(checkinW, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+createdVisit.ID+"/checkin", mustJSONBody(t, checkinReq)))
	if checkinW.Code != http.StatusOK {
		t.Fatalf("checkin visit: expected 200, got %d: %s", checkinW.Code, checkinW.Body.String())
	}
	checkedInVisit := decodeVisitResponse(t, checkinW)
	if checkedInVisit.Status != VisitStatusCheckedIn || checkedInVisit.TempCredentialID == nil || checkedInVisit.ActualCheckin == nil {
		t.Fatalf("unexpected checked in visit: %+v", checkedInVisit)
	}

	checkoutW := httptest.NewRecorder()
	managerRouter.ServeHTTP(checkoutW, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+createdVisit.ID+"/checkout", mustJSONBody(t, map[string]any{"badge_returned": true, "items_returned": true})))
	if checkoutW.Code != http.StatusOK {
		t.Fatalf("checkout visit: expected 200, got %d: %s", checkoutW.Code, checkoutW.Body.String())
	}
	checkedOutVisit := decodeVisitResponse(t, checkoutW)
	if checkedOutVisit.Status != VisitStatusCheckedOut || checkedOutVisit.ActualCheckout == nil || checkedOutVisit.CheckoutBy == nil || *checkedOutVisit.CheckoutBy != "00000000-0000-0000-0000-0000000000aa" {
		t.Fatalf("unexpected checked out visit: %+v", checkedOutVisit)
	}

	ctx := context.Background()
	var credentialStatus, tempUserStatus string
	var visitorNationalID, visitItemsCarried string
	var badgeReturnedAt *time.Time
	err := database.Pool.QueryRow(ctx, `
		SELECT c.status, u.status, v.items_carried, vis.national_id,
		       (SELECT returned_at FROM dm3_visitor.visitor_badges WHERE visit_id = $1::uuid AND badge_number = 'FLOW-BADGE-01' LIMIT 1)
		FROM dm3_visitor.visits v
		JOIN dm3_visitor.visitors vis ON vis.id = v.visitor_id
		JOIN dm3_identity.credentials c ON c.id = v.temp_credential_id
		JOIN dm3_identity.users u ON u.id = c.user_id
		WHERE v.id = $1::uuid`, createdVisit.ID,
	).Scan(&credentialStatus, &tempUserStatus, &visitItemsCarried, &visitorNationalID, &badgeReturnedAt)
	if err != nil {
		t.Fatalf("load lifecycle side effects: %v", err)
	}
	if credentialStatus != "revoked" || tempUserStatus != "inactive" || visitItemsCarried != "laptop bag" || visitorNationalID != "079123456789" || badgeReturnedAt == nil {
		t.Fatalf("unexpected lifecycle side effects: credential=%s temp_user=%s items=%s national_id=%s badge_closed=%t", credentialStatus, tempUserStatus, visitItemsCarried, visitorNationalID, badgeReturnedAt != nil)
	}
	var visitorVisitCount int
	err = database.Pool.QueryRow(ctx, `SELECT visit_count FROM dm3_visitor.visitors WHERE id = $1::uuid`, createdVisit.VisitorID).Scan(&visitorVisitCount)
	if err != nil {
		t.Fatalf("load visitor visit_count: %v", err)
	}
	if visitorVisitCount != 1 {
		t.Fatalf("expected visitor visit_count=1, got %d", visitorVisitCount)
	}
}

func TestWalkinVisitCreatesWaitingVisitAndStoresNationalID(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	hostID := createHostRecord(t, database, "Lobby", "Host")
	departure := time.Now().Add(90 * time.Minute).UTC().Truncate(time.Second)

	walkinReq := map[string]any{
		"visitor": map[string]any{
			"first_name":  "Walk",
			"last_name":   "In",
			"phone":       "+84907654321",
			"company":     "Lobby Co",
			"national_id": "WALKIN-999",
		},
		"host_user_id":       hostID,
		"purpose":            VisitPurposeDelivery,
		"expected_departure": departure.Format(time.RFC3339),
		"escort_required":    false,
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/walkin", mustJSONBody(t, walkinReq)))
	if w.Code != http.StatusCreated {
		t.Fatalf("walkin visit: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	visit := decodeVisitResponse(t, w)
	if visit.Status != VisitStatusWaiting || visit.ExpectedDeparture == nil || visit.QRToken == "" {
		t.Fatalf("unexpected walkin visit: %+v", visit)
	}

	ctx := context.Background()
	var nationalID string
	err := database.Pool.QueryRow(ctx, `SELECT national_id FROM dm3_visitor.visitors WHERE id = $1::uuid`, visit.VisitorID).Scan(&nationalID)
	if err != nil {
		t.Fatalf("load walkin visitor: %v", err)
	}
	if nationalID != "WALKIN-999" {
		t.Fatalf("expected national id to persist, got %q", nationalID)
	}
}

func TestVisitorCheckinBlockedByWatchlist(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	visitID, _, _ := createVisitorFixture(t, database, VisitStatusApproved)
	ctx := context.Background()
	var fullName string
	err := database.Pool.QueryRow(ctx, `SELECT first_name || ' ' || last_name FROM dm3_visitor.visitors WHERE id = (SELECT visitor_id FROM dm3_visitor.visits WHERE id = $1::uuid)`, visitID).Scan(&fullName)
	if err != nil {
		t.Fatalf("load visitor name: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO dm3_visitor.watchlist (tenant_id, entry_type, match_field, match_value, reason, added_by)
		VALUES ($1::uuid, $2, 'name', $3, 'security block', '00000000-0000-0000-0000-0000000000aa'::uuid)`,
		visitorTestTenantID, WatchlistBlacklisted, fullName,
	)
	if err != nil {
		t.Fatalf("seed watchlist entry: %v", err)
	}

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin", mustJSONBody(t, map[string]any{"checkin_method": CheckinMethodReception})))
	if w.Code != http.StatusForbidden {
		t.Fatalf("watchlist block: expected 403, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "visitor is on watchlist") {
		t.Fatalf("expected watchlist reason, got %s", w.Body.String())
	}

	var visitStatus string
	var tempCredCount int
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_visitor.visits WHERE id = $1::uuid`, visitID).Scan(&visitStatus)
	if err != nil {
		t.Fatalf("load visit status: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM dm3_identity.credentials WHERE tenant_id = $1::uuid AND value = (SELECT qr_token FROM dm3_visitor.visits WHERE id = $2::uuid)`, visitorTestTenantID, visitID).Scan(&tempCredCount)
	if err != nil {
		t.Fatalf("count temp credentials: %v", err)
	}
	if visitStatus != VisitStatusApproved || tempCredCount != 0 {
		t.Fatalf("watchlist block should leave visit untouched, status=%s temp_creds=%d", visitStatus, tempCredCount)
	}
}

func TestMarkNoShowCandidatesMarksOnlyOverdueOpenVisits(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	h := NewVisitorHandlers(database, nil, nil)
	ctx := context.Background()
	preRegID, _, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)
	approvedID, _, _ := createVisitorFixture(t, database, VisitStatusApproved)
	waitingID, _, _ := createVisitorFixture(t, database, VisitStatusWaiting)
	checkedInID, _, _ := createVisitorFixture(t, database, VisitStatusCheckedIn)

	for _, id := range []string{preRegID, approvedID, waitingID, checkedInID} {
		_, err := database.Pool.Exec(ctx, `UPDATE dm3_visitor.visits SET expected_arrival = now() - interval '3 hours' WHERE id = $1::uuid`, id)
		if err != nil {
			t.Fatalf("age visit %s: %v", id, err)
		}
	}

	rowsUpdated, err := h.markNoShowCandidates(ctx)
	if err != nil {
		t.Fatalf("markNoShowCandidates: %v", err)
	}
	if rowsUpdated < 3 {
		t.Fatalf("expected at least 3 no-shows, got %d", rowsUpdated)
	}

	statuses := map[string]string{}
	rows, err := database.Pool.Query(ctx, `SELECT id::text, status FROM dm3_visitor.visits WHERE id = ANY($1::uuid[])`, []string{preRegID, approvedID, waitingID, checkedInID})
	if err != nil {
		t.Fatalf("query statuses: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, status string
		if err := rows.Scan(&id, &status); err != nil {
			t.Fatalf("scan status: %v", err)
		}
		statuses[id] = status
	}
	if statuses[preRegID] != VisitStatusNoShow || statuses[approvedID] != VisitStatusNoShow || statuses[waitingID] != VisitStatusNoShow {
		t.Fatalf("expected overdue open visits to be no_show, got %+v", statuses)
	}
	if statuses[checkedInID] != VisitStatusCheckedIn {
		t.Fatalf("checked-in visit should stay checked_in, got %+v", statuses)
	}
}

func TestVisitorCheckinReusesExistingTempAccessOnRetry(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	visitID, qrToken, _ := createVisitorFixture(t, database, VisitStatusPreRegistered)
	ctx := context.Background()

	var tempUserID, tempCredID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
		VALUES ($1::uuid, 'Retry', 'Visitor', 'active', false)
		RETURNING id`, visitorTestTenantID,
	).Scan(&tempUserID)
	if err != nil {
		t.Fatalf("seed temp user: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'qr', $3, 'active', now(), now() + interval '4 hours')
		RETURNING id`, visitorTestTenantID, tempUserID, qrToken,
	).Scan(&tempCredID)
	if err != nil {
		t.Fatalf("seed temp credential: %v", err)
	}

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	body := `{"checkin_method":"reception","badge_number":"B-01"}`

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkin", bytes.NewBufferString(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("checkin attempt %d: expected 200, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	var linkedCredID string
	var status string
	err = database.Pool.QueryRow(ctx, `SELECT status, temp_credential_id::text FROM dm3_visitor.visits WHERE id = $1::uuid`, visitID).Scan(&status, &linkedCredID)
	if err != nil {
		t.Fatalf("load visit after checkin: %v", err)
	}
	if status != VisitStatusCheckedIn {
		t.Fatalf("expected checked_in, got %s", status)
	}
	if linkedCredID != tempCredID {
		t.Fatalf("expected credential %s, got %s", tempCredID, linkedCredID)
	}

	var credCount int
	err = database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM dm3_identity.credentials WHERE tenant_id = $1::uuid AND value = $2`, visitorTestTenantID, qrToken).Scan(&credCount)
	if err != nil {
		t.Fatalf("count credentials: %v", err)
	}
	if credCount != 1 {
		t.Fatalf("expected 1 credential, got %d", credCount)
	}
}

func TestVisitorCheckoutRevokesTempAccessAndClosesBadge(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	visitID, qrToken, badgeNumber := createVisitorFixture(t, database, VisitStatusCheckedIn)
	ctx := context.Background()

	var tempUserID, tempCredID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
		VALUES ($1::uuid, 'Badge', 'Visitor', 'active', false)
		RETURNING id`, visitorTestTenantID,
	).Scan(&tempUserID)
	if err != nil {
		t.Fatalf("seed temp user: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'qr', $3, 'active', now(), now() + interval '4 hours')
		RETURNING id`, visitorTestTenantID, tempUserID, qrToken,
	).Scan(&tempCredID)
	if err != nil {
		t.Fatalf("seed temp credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `UPDATE dm3_visitor.visits SET temp_credential_id = $2::uuid WHERE id = $1::uuid`, visitID, tempCredID)
	if err != nil {
		t.Fatalf("link credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `INSERT INTO dm3_visitor.visitor_badges (tenant_id, visit_id, badge_number) VALUES ($1::uuid, $2::uuid, $3)`, visitorTestTenantID, visitID, badgeNumber)
	if err != nil {
		t.Fatalf("create badge: %v", err)
	}

	h := NewVisitorHandlers(database, nil, nil)
	router := setupVisitorRouter(h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout", bytes.NewBufferString(`{"badge_returned":false}`))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("checkout: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var visitStatus, credentialStatus, userStatus string
	var badgeReturnedAt *time.Time
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_visitor.visits WHERE id = $1::uuid`, visitID).Scan(&visitStatus)
	if err != nil {
		t.Fatalf("load visit: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.credentials WHERE id = $1::uuid`, tempCredID).Scan(&credentialStatus)
	if err != nil {
		t.Fatalf("load credential: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.users WHERE id = $1::uuid`, tempUserID).Scan(&userStatus)
	if err != nil {
		t.Fatalf("load temp user: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT returned_at FROM dm3_visitor.visitor_badges WHERE visit_id = $1::uuid AND badge_number = $2`, visitID, badgeNumber).Scan(&badgeReturnedAt)
	if err != nil {
		t.Fatalf("load badge: %v", err)
	}
	if visitStatus != VisitStatusCheckedOut {
		t.Fatalf("expected checked_out, got %s", visitStatus)
	}
	if credentialStatus != "revoked" {
		t.Fatalf("expected revoked credential, got %s", credentialStatus)
	}
	if userStatus != "inactive" {
		t.Fatalf("expected inactive temp user, got %s", userStatus)
	}
	if badgeReturnedAt == nil {
		t.Fatal("expected badge to be closed with returned_at")
	}
}

func TestAutoCheckoutSharesManualCleanupSemantics(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	visitID, qrToken, badgeNumber := createVisitorFixture(t, database, VisitStatusCheckedIn)
	ctx := context.Background()

	var tempUserID, tempCredID string
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
		VALUES ($1::uuid, 'Auto', 'Visitor', 'active', false)
		RETURNING id`, visitorTestTenantID,
	).Scan(&tempUserID)
	if err != nil {
		t.Fatalf("seed temp user: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'qr', $3, 'active', now(), now() + interval '4 hours')
		RETURNING id`, visitorTestTenantID, tempUserID, qrToken,
	).Scan(&tempCredID)
	if err != nil {
		t.Fatalf("seed temp credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `UPDATE dm3_visitor.visits SET temp_credential_id = $2::uuid WHERE id = $1::uuid`, visitID, tempCredID)
	if err != nil {
		t.Fatalf("link credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `INSERT INTO dm3_visitor.visitor_badges (tenant_id, visit_id, badge_number) VALUES ($1::uuid, $2::uuid, $3)`, visitorTestTenantID, visitID, badgeNumber)
	if err != nil {
		t.Fatalf("create badge: %v", err)
	}

	h := NewVisitorHandlers(database, nil, nil)
	cleanup, err := h.autoCheckoutVisit(ctx, visitorTestTenantID, visitID)
	if err != nil {
		t.Fatalf("autoCheckoutVisit: %v", err)
	}
	if cleanup == nil || cleanup.TempCredentialID == nil || *cleanup.TempCredentialID != tempCredID {
		t.Fatalf("unexpected cleanup payload: %+v", cleanup)
	}

	var visitStatus, credentialStatus, userStatus string
	var badgeReturnedAt *time.Time
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_visitor.visits WHERE id = $1::uuid`, visitID).Scan(&visitStatus)
	if err != nil {
		t.Fatalf("load visit: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.credentials WHERE id = $1::uuid`, tempCredID).Scan(&credentialStatus)
	if err != nil {
		t.Fatalf("load credential: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.users WHERE id = $1::uuid`, tempUserID).Scan(&userStatus)
	if err != nil {
		t.Fatalf("load temp user: %v", err)
	}
	err = database.Pool.QueryRow(ctx, `SELECT returned_at FROM dm3_visitor.visitor_badges WHERE visit_id = $1::uuid AND badge_number = $2`, visitID, badgeNumber).Scan(&badgeReturnedAt)
	if err != nil {
		t.Fatalf("load badge: %v", err)
	}
	if visitStatus != VisitStatusCheckedOut || credentialStatus != "revoked" || userStatus != "inactive" || badgeReturnedAt == nil {
		payload, _ := json.Marshal(map[string]any{
			"visit_status": visitStatus,
			"credential":   credentialStatus,
			"user":         userStatus,
			"badge_closed": badgeReturnedAt != nil,
		})
		t.Fatalf("auto checkout cleanup mismatch: %s", payload)
	}
}
