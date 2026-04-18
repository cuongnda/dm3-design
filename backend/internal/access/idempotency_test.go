package access

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
)

// TestAccessEventIdempotency verifies the partial unique index + ON CONFLICT
// combo added in 16c95619: a redelivered NATS message with the same event_id
// and tenant_id (at the same time) is silently dropped instead of duplicating
// the row.
//
// This protects against JetStream redelivery on consumer-ack failures. The
// index key is (tenant_id, time, event_id) because access_events is a
// TimescaleDB hypertable partitioned by `time` — the partitioning column must
// be part of every unique index.
func TestAccessEventIdempotency(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"
	}
	database, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		t.Skipf("database not available: %v", err)
	}
	defer database.Close()

	ctx := context.Background()

	var tenantID string
	if err := database.Pool.QueryRow(ctx,
		`SELECT id::text FROM dm3_auth.tenants ORDER BY created_at LIMIT 1`).Scan(&tenantID); err != nil {
		t.Skipf("no tenants available for test: %v", err)
	}

	eventID := "test-idempotency-" + time.Now().Format("20060102T150405.000000")
	evtTime := time.Now().UTC()

	defer func() {
		_, _ = database.Pool.Exec(ctx,
			`DELETE FROM dm3_access.access_events WHERE event_id = $1`, eventID)
	}()

	insert := `INSERT INTO dm3_access.access_events
		    (time, tenant_id, event_id, decision, decided_locally)
		VALUES ($1, $2::uuid, $3, 'granted', false)
		ON CONFLICT (tenant_id, "time", event_id) WHERE event_id IS NOT NULL DO NOTHING`

	tag1, err := database.Pool.Exec(ctx, insert, evtTime, tenantID, eventID)
	if err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if tag1.RowsAffected() != 1 {
		t.Fatalf("first insert rows affected = %d, want 1", tag1.RowsAffected())
	}

	// Simulate JetStream redelivery: identical payload at the same time.
	tag2, err := database.Pool.Exec(ctx, insert, evtTime, tenantID, eventID)
	if err != nil {
		t.Fatalf("duplicate insert: %v", err)
	}
	if tag2.RowsAffected() != 0 {
		t.Fatalf("duplicate insert rows affected = %d, want 0 (ON CONFLICT DO NOTHING)",
			tag2.RowsAffected())
	}

	var count int
	if err := database.Pool.QueryRow(ctx,
		`SELECT count(*) FROM dm3_access.access_events WHERE event_id = $1`, eventID).
		Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("row count = %d, want 1", count)
	}
}
