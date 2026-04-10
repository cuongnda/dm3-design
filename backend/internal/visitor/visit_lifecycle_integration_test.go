package visitor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
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
	return database
}

func setupVisitorRouter(h *VisitorHandlers) http.Handler {
	r := httputil.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), &authsvc.AccessClaims{
				Sub:   "00000000-0000-0000-0000-0000000000aa",
				CID:   visitorTestTenantID,
				Email: "visitor-test@example.com",
				Role:  "primary_manager",
				Roles: []string{"primary_manager"},
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/visitors/{id}/checkin", h.CheckinVisit)
		r.Post("/visitors/{id}/checkout", h.CheckoutVisit)
	})
	return r
}

func createVisitorFixture(t *testing.T, database *db.DB, status string) (visitID string, qrToken string, badgeNumber string) {
	t.Helper()
	ctx := context.Background()
	visitorID := ""
	err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.visitors (tenant_id, first_name, last_name, watchlist_status, visit_count)
		VALUES ($1::uuid, 'Retry', 'Visitor', 'none', 0)
		RETURNING id`, visitorTestTenantID,
	).Scan(&visitorID)
	if err != nil {
		t.Fatalf("create visitor: %v", err)
	}

	hostID := ""
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, status, is_deleted)
		VALUES ($1::uuid, 'Host', 'User', 'active', false)
		RETURNING id`, visitorTestTenantID,
	).Scan(&hostID)
	if err != nil {
		t.Fatalf("create host: %v", err)
	}

	seed := time.Now().UnixNano()
	qrToken = fmt.Sprintf("qr-%x", seed)
	badgeNumber = fmt.Sprintf("B%016x", seed)
	err = database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.visits (
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

func TestVisitorCheckinReusesExistingTempAccessOnRetry(t *testing.T) {
	database := setupVisitorTestDB(t)
	defer database.Close()

	visitID, qrToken, _ := createVisitorFixture(t, database, models.VisitStatusPreRegistered)
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

	h := NewVisitorHandlers(database, nil)
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
	err = database.Pool.QueryRow(ctx, `SELECT status, temp_credential_id::text FROM dm3_identity.visits WHERE id = $1::uuid`, visitID).Scan(&status, &linkedCredID)
	if err != nil {
		t.Fatalf("load visit after checkin: %v", err)
	}
	if status != models.VisitStatusCheckedIn {
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

	visitID, qrToken, badgeNumber := createVisitorFixture(t, database, models.VisitStatusCheckedIn)
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
	_, err = database.Pool.Exec(ctx, `UPDATE dm3_identity.visits SET temp_credential_id = $2::uuid WHERE id = $1::uuid`, visitID, tempCredID)
	if err != nil {
		t.Fatalf("link credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `INSERT INTO dm3_identity.visitor_badges (tenant_id, visit_id, badge_number) VALUES ($1::uuid, $2::uuid, $3)`, visitorTestTenantID, visitID, badgeNumber)
	if err != nil {
		t.Fatalf("create badge: %v", err)
	}

	h := NewVisitorHandlers(database, nil)
	router := setupVisitorRouter(h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/visitors/"+visitID+"/checkout", bytes.NewBufferString(`{"badge_returned":false}`))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("checkout: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var visitStatus, credentialStatus, userStatus string
	var badgeReturnedAt *time.Time
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.visits WHERE id = $1::uuid`, visitID).Scan(&visitStatus)
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
	err = database.Pool.QueryRow(ctx, `SELECT returned_at FROM dm3_identity.visitor_badges WHERE visit_id = $1::uuid AND badge_number = $2`, visitID, badgeNumber).Scan(&badgeReturnedAt)
	if err != nil {
		t.Fatalf("load badge: %v", err)
	}
	if visitStatus != models.VisitStatusCheckedOut {
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

	visitID, qrToken, badgeNumber := createVisitorFixture(t, database, models.VisitStatusCheckedIn)
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
	_, err = database.Pool.Exec(ctx, `UPDATE dm3_identity.visits SET temp_credential_id = $2::uuid WHERE id = $1::uuid`, visitID, tempCredID)
	if err != nil {
		t.Fatalf("link credential: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `INSERT INTO dm3_identity.visitor_badges (tenant_id, visit_id, badge_number) VALUES ($1::uuid, $2::uuid, $3)`, visitorTestTenantID, visitID, badgeNumber)
	if err != nil {
		t.Fatalf("create badge: %v", err)
	}

	h := NewVisitorHandlers(database, nil)
	cleanup, err := h.autoCheckoutVisit(ctx, visitorTestTenantID, visitID)
	if err != nil {
		t.Fatalf("autoCheckoutVisit: %v", err)
	}
	if cleanup == nil || cleanup.TempCredentialID == nil || *cleanup.TempCredentialID != tempCredID {
		t.Fatalf("unexpected cleanup payload: %+v", cleanup)
	}

	var visitStatus, credentialStatus, userStatus string
	var badgeReturnedAt *time.Time
	err = database.Pool.QueryRow(ctx, `SELECT status FROM dm3_identity.visits WHERE id = $1::uuid`, visitID).Scan(&visitStatus)
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
	err = database.Pool.QueryRow(ctx, `SELECT returned_at FROM dm3_identity.visitor_badges WHERE visit_id = $1::uuid AND badge_number = $2`, visitID, badgeNumber).Scan(&badgeReturnedAt)
	if err != nil {
		t.Fatalf("load badge: %v", err)
	}
	if visitStatus != models.VisitStatusCheckedOut || credentialStatus != "revoked" || userStatus != "inactive" || badgeReturnedAt == nil {
		payload, _ := json.Marshal(map[string]any{
			"visit_status": visitStatus,
			"credential":   credentialStatus,
			"user":         userStatus,
			"badge_closed": badgeReturnedAt != nil,
		})
		t.Fatalf("auto checkout cleanup mismatch: %s", payload)
	}
}
