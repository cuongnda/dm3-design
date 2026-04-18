package authsvc

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
)

// noopPublisher drops audit entries; the Logger still needs a non-nil publisher
// to instantiate.
type noopPublisher struct{}

func (noopPublisher) Publish(_ context.Context, _ string, _ []byte) error { return nil }

func openTestDB(t *testing.T) *db.DB {
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

// TestLoginLockoutAfterFiveFailures verifies the account-lockout path added in
// 810507f2: after loginLockoutMaxFailures wrong passwords, the next attempt
// returns 401 even with the correct password until locked_until expires.
//
// The test seeds a disposable account in the default tenant, fires wrong
// passwords through Login, and asserts the correct-password attempt still 401s
// while locked_until is in the future.
func TestLoginLockoutAfterFiveFailures(t *testing.T) {
	database := openTestDB(t)
	defer database.Close()

	ctx := context.Background()
	const email = "lockout-test@dm3.test"
	const password = "CorrectHorseBatteryStaple1!"

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}

	// Pick any existing tenant so foreign keys are satisfied; the auth flow
	// treats tenant_id IS NULL as system-admin, which follows a different
	// post-auth branch, so we need a real tenant for this test.
	var tenantID string
	if err := database.Pool.QueryRow(ctx,
		`SELECT id::text FROM dm3_auth.tenants ORDER BY created_at LIMIT 1`).Scan(&tenantID); err != nil {
		t.Skipf("no tenants available for test: %v", err)
	}

	// Clean up any prior run, then seed.
	_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_auth.accounts WHERE email = $1`, email)
	_, err = database.Pool.Exec(ctx,
		`INSERT INTO dm3_auth.accounts (id, tenant_id, email, full_name, password_hash, role, status)
		 VALUES (gen_random_uuid(), $1::uuid, $2, 'Lockout Test', $3, 'primary_manager', 'active')`,
		tenantID, email, string(hash))
	if err != nil {
		t.Fatalf("seed account: %v", err)
	}
	defer func() {
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_auth.accounts WHERE email = $1`, email)
	}()

	h := &AuthHandlers{
		db:        database,
		jwtSecret: testSecret,
		audit:     audit.New(noopPublisher{}, "test"),
	}

	// Fire loginLockoutMaxFailures wrong-password attempts.
	for i := 0; i < loginLockoutMaxFailures; i++ {
		body, _ := json.Marshal(map[string]string{"email": email, "password": "wrong"})
		r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		w := httptest.NewRecorder()
		h.Login(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: code = %d, want 401", i+1, w.Code)
		}
	}

	// Correct password should still 401 because the account is now locked.
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.Login(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("post-lockout correct password: code = %d, want 401 (account locked)", w.Code)
	}

	// Verify locked_until is in the future in the DB.
	var lockedInFuture bool
	if err := database.Pool.QueryRow(ctx,
		`SELECT locked_until IS NOT NULL AND locked_until > now()
		   FROM dm3_auth.accounts WHERE email = $1`, email).Scan(&lockedInFuture); err != nil {
		t.Fatalf("read locked_until: %v", err)
	}
	if !lockedInFuture {
		t.Fatal("expected locked_until to be set and in the future after lockout")
	}
}
