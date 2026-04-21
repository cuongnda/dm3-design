package gateway

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
)

func TestParseTopic(t *testing.T) {
	tests := []struct {
		topic    string
		want     ParsedTopic
		wantErr  bool
	}{
		{
			topic: "dm/company-1/device/term-001/evt",
			want:  ParsedTopic{TenantID: "company-1", DeviceID: "term-001", Category: "evt"},
		},
		{
			topic: "dm/company-1/device/term-001/sta",
			want:  ParsedTopic{TenantID: "company-1", DeviceID: "term-001", Category: "sta"},
		},
		{
			topic: "dm/company-1/device/term-001/cmd/resp",
			want:  ParsedTopic{TenantID: "company-1", DeviceID: "term-001", Category: "cmd/resp"},
		},
		{
			topic: "dm/company-1/device/term-001/cfg/ack",
			want:  ParsedTopic{TenantID: "company-1", DeviceID: "term-001", Category: "cfg/ack"},
		},
		{
			topic:   "invalid/topic",
			wantErr: true,
		},
		{
			topic:   "dm/company/notdevice/id/evt",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.topic, func(t *testing.T) {
			got, err := ParseTopic(tt.topic)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseTopic(%q) error = %v, wantErr %v", tt.topic, err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("ParseTopic(%q) = %+v, want %+v", tt.topic, got, tt.want)
			}
		})
	}
}

func TestMQTTEnvelopeParsing(t *testing.T) {
	raw := `{
		"v": 1,
		"id": "msg-001",
		"ts": 1740000000000,
		"src": "device:term-001",
		"type": "access.log",
		"data": {"method":"face","door_id":"door-001","direction":"entry","decision":"granted","user_id":"p-1","user_name":"Test","confidence":0.97,"reason":"authorized","credential_type":"face"}
	}`

	var env MQTTEnvelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if env.Version != 1 {
		t.Errorf("version = %d, want 1", env.Version)
	}
	if env.Type != "access.log" {
		t.Errorf("type = %q, want access.log", env.Type)
	}
	if env.TS != 1740000000000 {
		t.Errorf("ts = %d, want 1740000000000", env.TS)
	}

	ts := time.UnixMilli(env.TS)
	if ts.Year() != 2025 {
		t.Errorf("parsed year = %d, want 2025", ts.Year())
	}

	var data accessLogData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatalf("unmarshal data: %v", err)
	}
	if data.Decision != "granted" {
		t.Errorf("decision = %q, want granted", data.Decision)
	}
	if data.Method != "face" {
		t.Errorf("method = %q, want face", data.Method)
	}
	if data.UserName != "Test" {
		t.Errorf("person_name = %q, want Test", data.UserName)
	}
}

func TestHeartbeatParsing(t *testing.T) {
	raw := `{"online":true,"uptime_s":86400,"firmware":"3.2.1","ip":"192.168.1.100","cpu_pct":35,"mem_pct":60,"disk_pct":45,"queue_depth":0}`

	var data heartbeatData
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !data.Online {
		t.Error("expected online=true")
	}
	if data.Firmware != "3.2.1" {
		t.Errorf("firmware = %q, want 3.2.1", data.Firmware)
	}
	if data.CPUPct != 35 {
		t.Errorf("cpu_pct = %d, want 35", data.CPUPct)
	}
}

func TestCommandResponseParsing(t *testing.T) {
	raw := `{
		"v": 1,
		"id": "resp-001",
		"ts": 1740000000500,
		"src": "device:term-001",
		"type": "cmd.door.resp",
		"ref": "cmd-001",
		"status": "ok",
		"data": {"door_id":"door-001","current_state":"unlocked"}
	}`

	var env MQTTEnvelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Ref != "cmd-001" {
		t.Errorf("ref = %q, want cmd-001", env.Ref)
	}
	if env.Status != "ok" {
		t.Errorf("status = %q, want ok", env.Status)
	}
}

// ─── evt.face_result handler ────────────────────────────────────────────────

func randHex(t *testing.T, n int) string {
	t.Helper()
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return hex.EncodeToString(b)
}

func setupGatewayTestDB(t *testing.T) *db.DB {
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

// seedFaceEnrollment seeds a tenant + qualifying-model device + user and
// inserts an M_<user_code> face credential at status='invalid'. Returns
// the identifiers the test uses to publish a face_result.
func seedFaceEnrollment(t *testing.T, database *db.DB) (tenantID, userID, deviceID, credValue string) {
	t.Helper()
	ctx := context.Background()
	suffix := randHex(t, 6)

	if err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_auth.tenants (name, code, status, created_at, updated_at)
		VALUES ($1, $1, 'active', now(), now()) RETURNING id
	`, "fr-"+suffix).Scan(&tenantID); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	deviceID = "dev-" + suffix
	if _, err := database.Pool.Exec(ctx, `
		INSERT INTO dm3_devices.devices (tenant_id, device_id, name, type, model, status, created_at, updated_at)
		VALUES ($1::uuid, $2, 'test-term', 'terminal', 'df970', 'online', now(), now())
	`, tenantID, deviceID); err != nil {
		t.Fatalf("seed device: %v", err)
	}

	userCode := "888" + suffix[:3]
	credValue = "M_" + userCode
	if err := database.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.users (tenant_id, first_name, last_name, email, user_code, status, created_at, updated_at)
		VALUES ($1::uuid, 'Face', 'Result', $2, $3, 'active', now(), now()) RETURNING id
	`, tenantID, "fr."+suffix+"@example.com", userCode).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := database.Pool.Exec(ctx, `
		INSERT INTO dm3_identity.credentials (tenant_id, user_id, type, value, status, valid_from, valid_until)
		VALUES ($1::uuid, $2::uuid, 'face', $3, 'invalid', now(), TIMESTAMPTZ '3000-01-01')
	`, tenantID, userID, credValue); err != nil {
		t.Fatalf("seed credential: %v", err)
	}

	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_devices.device_events WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_identity.credentials WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_identity.users WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_devices.devices WHERE tenant_id = $1::uuid`, tenantID)
		_, _ = database.Pool.Exec(ctx, `DELETE FROM dm3_auth.tenants WHERE id = $1::uuid`, tenantID)
	})
	return tenantID, userID, deviceID, credValue
}

func readCredentialStatus(t *testing.T, database *db.DB, tenantID, userID, value string) string {
	t.Helper()
	var status string
	if err := database.Pool.QueryRow(context.Background(), `
		SELECT status FROM dm3_identity.credentials
		WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND type = 'face' AND value = $3
	`, tenantID, userID, value).Scan(&status); err != nil {
		t.Fatalf("read credential status: %v", err)
	}
	return status
}

func faceResultEnv(t *testing.T, userID, value, status, reason string) MQTTEnvelope {
	t.Helper()
	data, err := json.Marshal(faceResultData{
		UserID:          userID,
		CredentialValue: value,
		Status:          status,
		Reason:          reason,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return MQTTEnvelope{Type: "evt.face_result", Data: data}
}

func TestHandleFaceResult_SuccessFlipsToActive(t *testing.T) {
	database := setupGatewayTestDB(t)
	defer database.Close()

	tenantID, userID, deviceID, credValue := seedFaceEnrollment(t, database)
	h := &MQTTHandler{db: database, appCtx: context.Background()}

	pt := ParsedTopic{TenantID: tenantID, DeviceID: deviceID, Category: "evt"}
	h.handleFaceResult(context.Background(), pt, faceResultEnv(t, userID, credValue, "success", ""))

	if got := readCredentialStatus(t, database, tenantID, userID, credValue); got != "active" {
		t.Errorf("status: got %q want active", got)
	}
}

func TestHandleFaceResult_FailedFlipsToFailed(t *testing.T) {
	database := setupGatewayTestDB(t)
	defer database.Close()

	tenantID, userID, deviceID, credValue := seedFaceEnrollment(t, database)
	h := &MQTTHandler{db: database, appCtx: context.Background()}

	pt := ParsedTopic{TenantID: tenantID, DeviceID: deviceID, Category: "evt"}
	h.handleFaceResult(context.Background(), pt, faceResultEnv(t, userID, credValue, "failed", "no_face_detected"))

	if got := readCredentialStatus(t, database, tenantID, userID, credValue); got != "failed" {
		t.Errorf("status: got %q want failed", got)
	}
}

func TestHandleFaceResult_LateFailedAfterSuccessIsIgnored(t *testing.T) {
	database := setupGatewayTestDB(t)
	defer database.Close()

	tenantID, userID, deviceID, credValue := seedFaceEnrollment(t, database)
	h := &MQTTHandler{db: database, appCtx: context.Background()}
	pt := ParsedTopic{TenantID: tenantID, DeviceID: deviceID, Category: "evt"}

	h.handleFaceResult(context.Background(), pt, faceResultEnv(t, userID, credValue, "success", ""))
	// Second device's late 'failed' ack — must NOT regress a successful enrolment.
	h.handleFaceResult(context.Background(), pt, faceResultEnv(t, userID, credValue, "failed", "low_quality"))

	if got := readCredentialStatus(t, database, tenantID, userID, credValue); got != "active" {
		t.Errorf("status: got %q want active (late failure must be ignored)", got)
	}
}

func TestHandleFaceResult_TenantSpoofDropped(t *testing.T) {
	database := setupGatewayTestDB(t)
	defer database.Close()

	tenantA, userA, _, credValueA := seedFaceEnrollment(t, database)
	_, _, deviceB, _ := seedFaceEnrollment(t, database)

	h := &MQTTHandler{db: database, appCtx: context.Background()}
	// deviceB publishes a face_result payload naming tenantA's user +
	// credential. The handler must scope by the tenant_id from the topic
	// (an unrelated zero-UUID tenant here), not the payload, so zero rows
	// match and tenantA's credential stays 'invalid'.
	spoofTopic := ParsedTopic{TenantID: "00000000-0000-0000-0000-000000000000", DeviceID: deviceB, Category: "evt"}
	h.handleFaceResult(context.Background(), spoofTopic, faceResultEnv(t, userA, credValueA, "success", ""))

	if got := readCredentialStatus(t, database, tenantA, userA, credValueA); got != "invalid" {
		t.Errorf("status: got %q want invalid (cross-tenant spoof must be dropped)", got)
	}
}

func TestHandleFaceResult_SoftDeletedUserDropped(t *testing.T) {
	database := setupGatewayTestDB(t)
	defer database.Close()

	tenantID, userID, deviceID, credValue := seedFaceEnrollment(t, database)
	if _, err := database.Pool.Exec(context.Background(),
		`UPDATE dm3_identity.users SET is_deleted = true WHERE id = $1::uuid`, userID); err != nil {
		t.Fatalf("soft-delete: %v", err)
	}

	h := &MQTTHandler{db: database, appCtx: context.Background()}
	pt := ParsedTopic{TenantID: tenantID, DeviceID: deviceID, Category: "evt"}
	h.handleFaceResult(context.Background(), pt, faceResultEnv(t, userID, credValue, "success", ""))

	if got := readCredentialStatus(t, database, tenantID, userID, credValue); got != "invalid" {
		t.Errorf("status: got %q want invalid (soft-deleted user ack must be dropped)", got)
	}
}
