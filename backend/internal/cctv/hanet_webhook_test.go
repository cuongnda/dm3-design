package cctv

import (
	"context"
	"crypto/md5"  //nolint:gosec // matches Hanet's wire protocol
	"crypto/rand" //nolint:gosec // test-only entropy
	"encoding/hex"
	"os"
	"testing"

	"github.com/duali/dm3-backend/pkg/db"
)

func setupCCTVTestDB(t *testing.T) *db.DB {
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

// TestMatchHanetWebhookTenant verifies the MD5(client_secret + id) ==
// hash && place_id match returns the correct tenant_id.
func TestMatchHanetWebhookTenant(t *testing.T) {
	database := setupCCTVTestDB(t)
	defer database.Close()

	cipher, err := NewCredentialCipher("nzcgx1Q+dM/32/z/PQ1GJ6qnlDTF8uttoN8nRs0BXbA=")
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}
	h := &CCTVHandlers{db: database, cipher: cipher}

	ctx := context.Background()

	// Two tenants, each with different Hanet config.
	tenantA := mustSeedTenant(t, database)
	tenantB := mustSeedTenant(t, database)
	t.Cleanup(func() {
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_cctv.cctv_settings WHERE tenant_id IN ($1::uuid, $2::uuid)`, tenantA, tenantB)
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_auth.tenants WHERE id IN ($1::uuid, $2::uuid)`, tenantA, tenantB)
	})

	seedSettings := func(tenantID, secret, placeID string) {
		enc, err := cipher.Encrypt(secret)
		if err != nil {
			t.Fatalf("encrypt: %v", err)
		}
		_, err = database.Pool.Exec(ctx, `
			INSERT INTO dm3_cctv.cctv_settings
				(tenant_id, hanet_client_id, hanet_client_secret_enc, hanet_place_id, hanet_server_url)
			VALUES ($1::uuid, 'client', $2, $3, 'https://partner.hanet.ai')
			ON CONFLICT (tenant_id) DO UPDATE SET
				hanet_client_id = EXCLUDED.hanet_client_id,
				hanet_client_secret_enc = EXCLUDED.hanet_client_secret_enc,
				hanet_place_id = EXCLUDED.hanet_place_id`,
			tenantID, enc, placeID,
		)
		if err != nil {
			t.Fatalf("seed settings: %v", err)
		}
	}

	// Unique per-run place and secret suffixes so leftover rows from
	// interrupted prior runs can't match the MD5 signature and fool the
	// lookup into returning the wrong tenant.
	var r [6]byte
	if _, err := rand.Read(r[:]); err != nil {
		t.Fatalf("rand: %v", err)
	}
	suffix := hex.EncodeToString(r[:])
	placeA := "place-a-" + suffix
	placeB := "place-b-" + suffix
	placeC := "place-c-" + suffix
	secretA := "secretA-" + suffix
	secretB := "secretB-" + suffix

	seedSettings(tenantA, secretA, placeA)
	seedSettings(tenantB, secretB, placeB)

	mkHash := func(secret, id string) string {
		sum := md5.Sum([]byte(secret + id)) //nolint:gosec
		return hex.EncodeToString(sum[:])
	}

	cases := []struct {
		name    string
		hash    string
		id      string
		placeID string
		want    string
	}{
		{"tenant A valid", mkHash(secretA, "nonce1"), "nonce1", placeA, tenantA},
		{"tenant B valid", mkHash(secretB, "nonce2"), "nonce2", placeB, tenantB},
		{"wrong hash", "deadbeef", "nonce1", placeA, ""},
		{"wrong place", mkHash(secretA, "nonce1"), "nonce1", placeB, ""},
		{"swapped secret", mkHash(secretB, "nonce1"), "nonce1", placeA, ""},
		{"unknown place", mkHash(secretA, "nonce1"), "nonce1", placeC, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := h.matchHanetWebhookTenant(ctx, c.hash, c.id, c.placeID)
			if err != nil {
				t.Fatalf("match: %v", err)
			}
			if got != c.want {
				t.Errorf("got tenant=%q want %q", got, c.want)
			}
		})
	}
}

func mustSeedTenant(t *testing.T, database *db.DB) string {
	t.Helper()
	var suffix [6]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatalf("rand: %v", err)
	}
	code := "hw-" + hex.EncodeToString(suffix[:])
	var id string
	if err := database.Pool.QueryRow(context.Background(), `
		INSERT INTO dm3_auth.tenants (name, code, status, created_at, updated_at)
		VALUES ($1, $1, 'active', now(), now()) RETURNING id`,
		code,
	).Scan(&id); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	return id
}
