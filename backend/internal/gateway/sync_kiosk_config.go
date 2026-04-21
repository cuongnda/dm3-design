package gateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// kioskTokenPrefix must stay in sync with visitor.KioskTokenPrefix — we
// don't import that package here to avoid a visitor ↔ gateway cycle.
const kioskTokenPrefix = "dm3kiosk_"

// KioskConfigSyncer pushes cfg.kiosk_config to a DM3-provisioned kiosk device.
// The payload carries everything the LPR desktop app needs to call
// POST /register-visit on visitor-svc — the public API base URL, the
// tenant's company code, and a per-device bearer token that the server
// mints (or reuses) from dm3_auth.kiosk_tokens.
//
// Kiosks that are already provisioned (have a bootstrap device JWT and an
// MQTT subscription to dm/{tid}/device/{did}/cfg) receive the token without
// any operator copy-paste. Non-kiosk devices ignore the unknown message
// type and the push is a no-op.
type KioskConfigSyncer struct {
	db         *db.DB
	mqtt       *mqtt.Client
	apiBaseURL string
}

func NewKioskConfigSyncer(database *db.DB, mqttClient *mqtt.Client, apiBaseURL string) *KioskConfigSyncer {
	return &KioskConfigSyncer{db: database, mqtt: mqttClient, apiBaseURL: apiBaseURL}
}

// kioskConfigPayload is the cfg.kiosk_config `data` field. Field names
// intentionally use snake_case to match the rest of the cfg.* protocol.
type kioskConfigPayload struct {
	APIBaseURL  string `json:"api_base_url"`
	CompanyCode string `json:"company_code"`
	KioskToken  string `json:"kiosk_token"`
	Version     int64  `json:"version"` // unix seconds at mint/reuse time — devices can dedupe
}

// PushKioskConfig resolves the device's tenant code, mints-or-reuses a
// per-device kiosk token, and publishes cfg.kiosk_config to
// dm/{tenant_id}/device/{device_id}/cfg at QoS 2.
func (s *KioskConfigSyncer) PushKioskConfig(ctx context.Context, tenantID, deviceID string) error {
	return s.PushKioskConfigJob(ctx, tenantID, deviceID, nil)
}

// PushKioskConfigJob is PushKioskConfig with progress tracking attached.
func (s *KioskConfigSyncer) PushKioskConfigJob(ctx context.Context, tenantID, deviceID string, jobCtx *SyncJobContext) error {
	if jobCtx != nil {
		jobCtx.Registry.SetTypeTotal(jobCtx.JobID, jobCtx.Type, 1)
	}

	// Look up tenant code + device internal id. We do both in one round trip
	// so a rogue tenant_id / device_id mismatch is caught before minting.
	var (
		tenantCode string
		deviceDBID string
	)
	err := s.db.Pool.QueryRow(ctx, `
		SELECT t.code, d.id::text
		FROM dm3_auth.tenants t
		JOIN dm3_devices.devices d ON d.tenant_id = t.id
		WHERE t.id = $1::uuid AND d.device_id = $2
	`, tenantID, deviceID).Scan(&tenantCode, &deviceDBID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("kiosk_config: device %s not found in tenant %s", deviceID, tenantID)
		}
		return fmt.Errorf("kiosk_config: lookup tenant/device: %w", err)
	}

	token, err := s.findOrMintDeviceToken(ctx, tenantID, deviceDBID)
	if err != nil {
		return fmt.Errorf("kiosk_config: token: %w", err)
	}

	payload := kioskConfigPayload{
		APIBaseURL:  s.apiBaseURL,
		CompanyCode: tenantCode,
		KioskToken:  token,
		Version:     time.Now().Unix(),
	}

	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("kiosk_config: marshal data: %w", err)
	}

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      generateUUID(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cfg.kiosk_config",
		Data:    dataBytes,
	}
	if jobCtx != nil {
		envelope.JobID = jobCtx.JobID
		envelope.Index = 1
		envelope.Total = 1
	}

	envBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("kiosk_config: marshal envelope: %w", err)
	}

	topic := fmt.Sprintf("dm/%s/device/%s/cfg", tenantID, deviceID)
	if err := s.mqtt.Publish(ctx, topic, 2, envBytes); err != nil {
		return fmt.Errorf("kiosk_config: publish: %w", err)
	}
	if jobCtx != nil {
		jobCtx.Registry.IncrementPublished(jobCtx.JobID, jobCtx.Type)
	}

	slog.Info("kiosk_config: pushed",
		"tenant", tenantID,
		"device", deviceID,
		"company_code", tenantCode,
		"token_prefix", token[:len(kioskTokenPrefix)+8]+"...",
	)
	return nil
}

// findOrMintDeviceToken returns the active per-device kiosk token's
// cleartext. If no active row exists we mint a new one, persist its
// SHA-256 hash, and return the cleartext — this is the only moment the
// cleartext is available, because we never store it.
//
// A token is "active" when device_id matches AND revoked_at IS NULL.
// Calling this twice in a row returns the SAME cleartext only on the
// first call: once we've minted, there is no way to recover the
// cleartext from the stored hash. Subsequent calls mint fresh tokens
// and revoke the previous row (within a tx) so there is always exactly
// one active row per device.
//
// For real-world use this isn't a problem because PushKioskConfig is
// the only caller — the fresh cleartext is immediately encoded into
// the MQTT payload, published to the device, and then forgotten.
func (s *KioskConfigSyncer) findOrMintDeviceToken(ctx context.Context, tenantID, deviceDBID string) (string, error) {
	tx, err := s.db.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Revoke any prior active token for this device. We always mint fresh
	// so the cleartext we embed in the MQTT payload is trivially correct —
	// there's no "retrieve old cleartext" problem because tokens rotate on
	// every kiosk_config push.
	if _, err := tx.Exec(ctx, `
		UPDATE dm3_auth.kiosk_tokens
		   SET revoked_at = now()
		 WHERE device_id = $1::uuid
		   AND revoked_at IS NULL
	`, deviceDBID); err != nil {
		return "", fmt.Errorf("revoke prior: %w", err)
	}

	clear, err := mintKioskTokenClear()
	if err != nil {
		return "", err
	}
	hash := hashKioskTokenStr(clear)

	if _, err := tx.Exec(ctx, `
		INSERT INTO dm3_auth.kiosk_tokens
		    (tenant_id, device_id, name, token_hash)
		VALUES
		    ($1::uuid, $2::uuid, $3, $4)
	`, tenantID, deviceDBID, "device:"+deviceDBID, hash); err != nil {
		return "", fmt.Errorf("insert: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return clear, nil
}

// mintKioskTokenClear generates the cleartext "dm3kiosk_<64hex>" value. 32
// random bytes → 256 bits of entropy; enough that unsalted SHA-256 at rest
// is fine (nothing to brute-force).
func mintKioskTokenClear() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("rand: %w", err)
	}
	return kioskTokenPrefix + hex.EncodeToString(buf), nil
}

// hashKioskTokenStr mirrors visitor.hashKioskToken. Duplicated to avoid a
// package cycle — kept in sync by convention.
func hashKioskTokenStr(clear string) string {
	sum := sha256.Sum256([]byte(clear))
	return hex.EncodeToString(sum[:])
}
