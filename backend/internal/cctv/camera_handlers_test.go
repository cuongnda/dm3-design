package cctv

import (
	"testing"
)

// TestListCameras_EmptyResult is an integration skeleton.
// It requires a live dm3 database (TimescaleDB on :5433).
// Run with: go test ./internal/cctv/... -run TestListCameras_EmptyResult
//
// Pattern reference: backend/internal/parking/handlers_integration_test.go
// To run for real: ensure DB is up and DM3_DATABASE_URL is set.
func TestListCameras_EmptyResult(t *testing.T) {
	t.Skip("integration — requires dm3 DB (see backend/internal/parking/handlers_integration_test.go for pattern)")

	// When wired:
	// 1. Connect to test DB via db.Connect(ctx, os.Getenv("DM3_DATABASE_URL"))
	// 2. Run migrations
	// 3. Create a test tenant
	// 4. Construct CCTVHandlers with NoopMediaMTXClient and a test CredentialCipher
	// 5. Issue GET /api/v1/cctv/cameras with valid JWT claims for that tenant
	// 6. Assert 200 and empty data array
}
