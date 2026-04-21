package identity

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/audit"
)

// faceEnrollDeviceModels lists the hardware models that enrol faces
// on-device from the user's avatar photo. When a user in a tenant that
// owns one of these devices is created or has their avatar changed, the
// identity service seeds an "M_<user_code>" face credential with
// status='invalid'. The credential stays invalid (and hidden from the
// web UI) until a device replies with evt.face_result success — at which
// point the device-gateway flips it to 'active' and it starts appearing
// in PushPersonSync payloads for every online device in the tenant.
//
// Keep in sync with:
//   - backend/pkg/db/migrations/000043_face_enrollment.up.sql
//   - automation/tests/api/test_face_enrollment.py
var faceEnrollDeviceModels = []string{"df970", "ba8300", "bd8500", "ra08", "dq200"}

// ensureFaceIDCardCredential seeds the auto-enrollment face credential
// for a user iff their tenant owns at least one qualifying device AND
// the credential does not already exist. Safe to call repeatedly — it
// relies on idx_credentials_face_m_card (partial unique index) for
// idempotency under concurrent create/edit.
//
// Returns (true, nil) when a new credential row is inserted, (false, nil)
// when the tenant has no qualifying device or the credential already
// exists. Errors are logged internally; the caller may ignore them
// because the primary write (user insert / avatar upload) has already
// succeeded and face enrollment is best-effort.
func (h *IdentityHandlers) ensureFaceIDCardCredential(ctx context.Context, tenantID, userID string) (bool, error) {
	if tenantID == "" || userID == "" {
		return false, errors.New("tenant_id and user_id are required")
	}

	var hasDevice bool
	if err := h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM dm3_devices.devices
			WHERE tenant_id = $1::uuid AND model = ANY($2::text[])
		)
	`, tenantID, faceEnrollDeviceModels).Scan(&hasDevice); err != nil {
		slog.Warn("face_enroll: qualifying-device lookup failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return false, err
	}
	if !hasDevice {
		return false, nil
	}

	var userCode string
	if err := h.db.Pool.QueryRow(ctx, `
		SELECT COALESCE(NULLIF(user_code, ''), id::text)
		FROM dm3_identity.users
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND (is_deleted = false OR is_deleted IS NULL)
	`, userID, tenantID).Scan(&userCode); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		slog.Warn("face_enroll: user lookup failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return false, err
	}

	value := "M_" + userCode

	var credID string
	err := h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials (
			tenant_id, user_id, type, value, status, valid_from, valid_until
		) VALUES (
			$1::uuid, $2::uuid, 'face', $3, 'invalid',
			now(), TIMESTAMPTZ '3000-01-01'
		)
		ON CONFLICT (tenant_id, user_id)
			WHERE type = 'face' AND value LIKE 'M\_%' ESCAPE '\'
		DO NOTHING
		RETURNING id
	`, tenantID, userID, value).Scan(&credID)

	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		slog.Warn("face_enroll: insert failed",
			"tenant_id", tenantID, "user_id", userID, "value", value, "error", err)
		return false, err
	}

	h.audit.Log(audit.Entry{
		TenantID:   tenantID,
		Action:     "identity.credential.auto_create",
		EntityType: "credential",
		EntityID:   credID,
		EntityName: value,
		Status:     "success",
		NewValues: map[string]any{
			"type":           "face",
			"value":          value,
			"status":         "invalid",
			"user_id":        userID,
			"trigger_models": faceEnrollDeviceModels,
		},
	})

	h.publishPersonChanged(tenantID, userID, "credential.auto_create")
	return true, nil
}

// resetFaceIDCardCredentialStatus flips an existing M_<user_code> face
// credential back to status='invalid' so the next PushPersonSync drops
// it from devices and the next face_result ack can re-validate it.
// Used when the user's avatar changes after the initial enrollment: the
// old template on the device no longer matches the new photo, so we
// retract it and re-enrol.
//
// Returns true iff a row was updated. No-op (returns false) if no such
// credential exists — the caller is expected to call
// ensureFaceIDCardCredential first to seed the row.
func (h *IdentityHandlers) resetFaceIDCardCredentialStatus(ctx context.Context, tenantID, userID string) (bool, error) {
	if tenantID == "" || userID == "" {
		return false, errors.New("tenant_id and user_id are required")
	}

	cmd, err := h.db.Pool.Exec(ctx, `
		UPDATE dm3_identity.credentials
		   SET status = 'invalid', updated_at = now()
		 WHERE tenant_id = $1::uuid
		   AND user_id   = $2::uuid
		   AND type      = 'face'
		   AND value     LIKE 'M\_%' ESCAPE '\'
		   AND status   <> 'invalid'
	`, tenantID, userID)
	if err != nil {
		slog.Warn("face_enroll: reset failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return false, err
	}
	if cmd.RowsAffected() == 0 {
		return false, nil
	}

	h.audit.Log(audit.Entry{
		TenantID:   tenantID,
		Action:     "identity.credential.face_reset",
		EntityType: "credential",
		EntityID:   userID,
		Status:     "success",
		NewValues:  map[string]any{"reason": "avatar_changed"},
	})

	h.publishPersonChanged(tenantID, userID, "credential.face_reset")
	return true, nil
}
