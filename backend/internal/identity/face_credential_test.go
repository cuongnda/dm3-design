package identity

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/duali/dm3-backend/pkg/db"
)

func randSuffix(t *testing.T) string {
	t.Helper()
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return hex.EncodeToString(b)
}

// setupIdentityTestDB returns a real pgx pool against the local TimescaleDB
// or skips the test when it isn't reachable. Mirrors the pattern used by
// internal/parking/handlers_integration_test.go.
func setupIdentityTestDB(t *testing.T) *db.DB {
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

// seedTenantWithModel creates a throw-away tenant owning a single device
// of `model` and a single user. Returns (tenantID, userID). Caller is
// responsible for cleanup via t.Cleanup.
func seedTenantWithModel(t *testing.T, database *db.DB, model string) (tenantID, userID, userCode string) {
	t.Helper()
	ctx := context.Background()

	suffix := randSuffix(t)
	if err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_auth.tenants (name, code, status, created_at, updated_at)
		VALUES ($1, $1, 'active', now(), now()) RETURNING id
	`, "fe-"+suffix).Scan(&tenantID); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}

	if model != "" {
		_, err := database.Pool.Exec(ctx, `
			INSERT INTO dm3_devices.devices (tenant_id, device_id, name, type, model, status, created_at, updated_at)
			VALUES ($1::uuid, $2, 'test-term', 'terminal', $3, 'offline', now(), now())
		`, tenantID, "dev-"+suffix, model)
		if err != nil {
			t.Fatalf("seed device: %v", err)
		}
	}

	userCode = "999" + suffix[:3]
	if err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, email, user_code, status, created_at, updated_at)
		VALUES ($1::uuid, 'Face', 'Test', $2, $3, 'active', now(), now()) RETURNING id
	`, tenantID, "face."+suffix+"@example.com", userCode).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = database.Pool.Exec(cleanupCtx, `DELETE FROM dm3_identity.credentials WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(cleanupCtx, `DELETE FROM dm3_identity.users WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(cleanupCtx, `DELETE FROM dm3_devices.devices WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(cleanupCtx, `DELETE FROM dm3_auth.tenants WHERE id = $1::uuid`, tenantID)
	})
	return tenantID, userID, userCode
}

func TestEnsureFaceIDCardCredential_QualifyingModels(t *testing.T) {
	database := setupIdentityTestDB(t)
	defer database.Close()

	for _, model := range faceEnrollDeviceModels {
		t.Run(model, func(t *testing.T) {
			tenantID, userID, userCode := seedTenantWithModel(t, database, model)
			h := &IdentityHandlers{db: database}

			created, err := h.ensureFaceIDCardCredential(context.Background(), tenantID, userID)
			if err != nil {
				t.Fatalf("ensureFaceIDCardCredential: %v", err)
			}
			if !created {
				t.Fatalf("expected credential to be created for model %s", model)
			}

			var value, status string
			if err := database.Pool.QueryRow(context.Background(), `
				SELECT value, status FROM dm3_identity.credentials
				WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND type = 'face'
			`, tenantID, userID).Scan(&value, &status); err != nil {
				t.Fatalf("read credential: %v", err)
			}
			if want := "M_" + userCode; value != want {
				t.Errorf("value: got %q want %q", value, want)
			}
			if status != "invalid" {
				t.Errorf("status: got %q want invalid", status)
			}

			// Idempotent: second call is a no-op because of the partial unique index.
			created2, err := h.ensureFaceIDCardCredential(context.Background(), tenantID, userID)
			if err != nil {
				t.Fatalf("second ensure: %v", err)
			}
			if created2 {
				t.Errorf("expected second call to be a no-op, got created=true")
			}
		})
	}
}

func TestEnsureFaceIDCardCredential_NoQualifyingDevice(t *testing.T) {
	database := setupIdentityTestDB(t)
	defer database.Close()

	tenantID, userID, _ := seedTenantWithModel(t, database, "icu300n") // controller, not in whitelist
	h := &IdentityHandlers{db: database}

	created, err := h.ensureFaceIDCardCredential(context.Background(), tenantID, userID)
	if err != nil {
		t.Fatalf("ensureFaceIDCardCredential: %v", err)
	}
	if created {
		t.Fatalf("expected no-op for tenant without qualifying device")
	}

	var count int
	if err := database.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM dm3_identity.credentials
		WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND type = 'face'
	`, tenantID, userID).Scan(&count); err != nil {
		t.Fatalf("read credentials: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 face credentials, got %d", count)
	}
}

func TestEnsureFaceIDCardCredential_NoDevicesAtAll(t *testing.T) {
	database := setupIdentityTestDB(t)
	defer database.Close()

	tenantID, userID, _ := seedTenantWithModel(t, database, "")
	h := &IdentityHandlers{db: database}

	created, err := h.ensureFaceIDCardCredential(context.Background(), tenantID, userID)
	if err != nil {
		t.Fatalf("ensureFaceIDCardCredential: %v", err)
	}
	if created {
		t.Errorf("expected no-op for tenant with zero devices")
	}
}

func TestResetFaceIDCardCredentialStatus_FlipsActiveToInvalid(t *testing.T) {
	database := setupIdentityTestDB(t)
	defer database.Close()

	tenantID, userID, userCode := seedTenantWithModel(t, database, "df970")
	h := &IdentityHandlers{db: database}

	if _, err := h.ensureFaceIDCardCredential(context.Background(), tenantID, userID); err != nil {
		t.Fatalf("ensure: %v", err)
	}
	_, err := database.Pool.Exec(context.Background(), `
		UPDATE dm3_identity.credentials SET status = 'active'
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND type = 'face' AND value = $3
	`, tenantID, userID, "M_"+userCode)
	if err != nil {
		t.Fatalf("pre-flip: %v", err)
	}

	changed, err := h.resetFaceIDCardCredentialStatus(context.Background(), tenantID, userID)
	if err != nil {
		t.Fatalf("reset: %v", err)
	}
	if !changed {
		t.Fatal("expected reset to report change")
	}

	var status string
	if err := database.Pool.QueryRow(context.Background(), `
		SELECT status FROM dm3_identity.credentials
		WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND type = 'face'
	`, tenantID, userID).Scan(&status); err != nil {
		t.Fatalf("read: %v", err)
	}
	if status != "invalid" {
		t.Errorf("status: got %q want invalid", status)
	}

	// Reset again: already invalid → no row affected.
	changed2, err := h.resetFaceIDCardCredentialStatus(context.Background(), tenantID, userID)
	if err != nil {
		t.Fatalf("second reset: %v", err)
	}
	if changed2 {
		t.Errorf("expected second reset to be a no-op")
	}
}
