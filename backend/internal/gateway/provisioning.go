package gateway

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/cctv"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// ProvisioningHandlers handles device provisioning endpoints.
type ProvisioningHandlers struct {
	db           *db.DB
	mqtt         *mqtt.Client
	cfg          *config.Config
	audit        *audit.Logger
	cameraCipher *cctv.CredentialCipher // optional; required only for type=camera provisioning
}

func NewProvisioningHandlers(database *db.DB, mqttClient *mqtt.Client, cfg *config.Config, auditLog *audit.Logger) *ProvisioningHandlers {
	return &ProvisioningHandlers{db: database, mqtt: mqttClient, cfg: cfg, audit: auditLog}
}

// WithCameraCipher enables `type=camera` provisioning by supplying the AES
// cipher used to encrypt RTSP passwords at rest. When unset, camera
// provisioning requests are rejected with a 503.
func (h *ProvisioningHandlers) WithCameraCipher(c *cctv.CredentialCipher) *ProvisioningHandlers {
	h.cameraCipher = c
	return h
}

// ─── QR Flow ─────────────────────────────────────────────────────────────────

type provisionRequest struct {
	DeviceID string        `json:"device_id"`
	Name     string        `json:"name"`
	Type     string        `json:"type"`
	TenantID string        `json:"tenant_id"`
	Location string        `json:"location"`
	Config   *deviceConfig `json:"config,omitempty"`
	// Camera is required when Type == "camera". It carries the RTSP and
	// recording parameters so the device row and the dm3_cctv.cameras row
	// are created atomically from a single /provision request.
	Camera *cameraParams `json:"camera,omitempty"`
}

// deviceConfig mirrors the "config" object sent by the console
// CreateDevicePage / EditDevicePage. All fields are optional; nil means
// "don't change".
type deviceConfig struct {
	Model         *string  `json:"model,omitempty"`
	OpenRelayMs   *int     `json:"open_relay_ms,omitempty"`
	Timezone      *string  `json:"timezone,omitempty"`
	VerifyMethods []string `json:"verify_methods,omitempty"`
	VerifyLogic   *string  `json:"verify_logic,omitempty"`
}

// cameraParams carries the CCTV-specific fields supplied when provisioning
// a type=camera device. Defaults mirror cctv.CreateCamera:
// recording_mode="event_only", pre_roll_sec=10, post_roll_sec=20.
type cameraParams struct {
	RTSPURL       string  `json:"rtsp_url"`
	RTSPUsername  *string `json:"rtsp_username,omitempty"`
	RTSPPassword  *string `json:"rtsp_password,omitempty"`
	Brand         *string `json:"brand,omitempty"`
	RecordingMode *string `json:"recording_mode,omitempty"`
	PreRollSec    *int    `json:"pre_roll_sec,omitempty"`
	PostRollSec   *int    `json:"post_roll_sec,omitempty"`
}

type qrTokenClaims struct {
	Purpose string `json:"purpose"`
	DID     string `json:"did"`
	CID     string `json:"cid"`
	DType   string `json:"dtype"`
	jwt.RegisteredClaims
}

// ProvisionDevice handles POST /api/v1/devices/provision
func (h *ProvisioningHandlers) ProvisionDevice(w http.ResponseWriter, r *http.Request) {
	var req provisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DeviceID == "" || req.Type == "" {
		httputil.Error(w, http.StatusBadRequest, "device_id and type are required")
		return
	}
	if !models.IsValidDeviceType(req.Type) {
		httputil.Error(w, http.StatusBadRequest, "invalid device type: must be terminal, controller, camera, or sensor")
		return
	}

	companyID := req.TenantID
	if companyID == "" {
		companyID = authsvc.CompanyIDFromContext(r.Context())
	}
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	var createdBy *string
	if claims != nil {
		createdBy = &claims.Sub
	}

	// Unpack config — all fields optional. NULLs fall back to column
	// defaults (open_relay_ms=3000, timezone='Asia/Ho_Chi_Minh',
	// verify_methods='{}', verify_logic='or').
	var (
		model         any
		openRelayMs   any
		timezone      any
		verifyMethods any
		verifyLogic   any
	)
	if req.Config != nil {
		if req.Config.Model != nil && *req.Config.Model != "" {
			model = *req.Config.Model
		}
		if req.Config.OpenRelayMs != nil {
			openRelayMs = *req.Config.OpenRelayMs
		}
		if req.Config.Timezone != nil && *req.Config.Timezone != "" {
			timezone = *req.Config.Timezone
		}
		if req.Config.VerifyMethods != nil {
			verifyMethods = req.Config.VerifyMethods
		}
		if req.Config.VerifyLogic != nil && *req.Config.VerifyLogic != "" {
			verifyLogic = *req.Config.VerifyLogic
		}
	}

	// Validate+encrypt camera params up-front so we fail fast before touching
	// the DB. For non-camera types this block is a no-op.
	var (
		encryptedPass []byte
		trimmedRTSP   string
		recordingMode = "event_only"
		preRoll       = 10
		postRoll      = 20
	)
	if req.Type == "camera" {
		if h.cameraCipher == nil {
			httputil.Error(w, http.StatusServiceUnavailable, "camera provisioning is not configured on this server (CCTV_CREDENTIAL_KEY missing)")
			return
		}
		if req.Camera == nil || strings.TrimSpace(req.Camera.RTSPURL) == "" {
			httputil.Error(w, http.StatusBadRequest, "camera.rtsp_url is required when type=camera")
			return
		}
		trimmedRTSP = strings.TrimSpace(req.Camera.RTSPURL)
		if err := cctv.ValidateRTSPURL(trimmedRTSP); err != nil {
			httputil.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		if req.Camera.RecordingMode != nil && *req.Camera.RecordingMode != "" {
			recordingMode = *req.Camera.RecordingMode
		}
		if recordingMode != "event_only" && recordingMode != "disabled" {
			httputil.Error(w, http.StatusBadRequest, "invalid recording_mode; expected one of: event_only, disabled")
			return
		}
		if req.Camera.PreRollSec != nil {
			preRoll = *req.Camera.PreRollSec
		}
		if req.Camera.PostRollSec != nil {
			postRoll = *req.Camera.PostRollSec
		}
		if preRoll < 0 || preRoll > 60 {
			httputil.Error(w, http.StatusBadRequest, "pre_roll_sec must be between 0 and 60")
			return
		}
		if postRoll < 0 || postRoll > 120 {
			httputil.Error(w, http.StatusBadRequest, "post_roll_sec must be between 0 and 120")
			return
		}
		if req.Camera.RTSPPassword != nil && *req.Camera.RTSPPassword != "" {
			var err error
			encryptedPass, err = h.cameraCipher.Encrypt(*req.Camera.RTSPPassword)
			if err != nil {
				slog.Error("ProvisionDevice: encrypt rtsp password failed", "error", err)
				httputil.Error(w, http.StatusInternalServerError, "internal server error")
				return
			}
		}
	}

	// Create device (+ optional cctv.cameras row) in a single transaction so
	// the device and its CCTV extension are atomically linked.
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("ProvisionDevice: begin tx failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer tx.Rollback(r.Context())

	var deviceDBID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices
		   (device_id, name, type, location, tenant_id, status,
		    model, open_relay_ms, timezone, verify_methods, verify_logic)
		 VALUES ($1, $2, $3, $4, $5::uuid, 'offline',
		    $6, COALESCE($7::int, 3000),
		    COALESCE($8::text, 'Asia/Ho_Chi_Minh'),
		    COALESCE($9::text[], '{}'::text[]),
		    COALESCE($10::text, 'or'))
		 RETURNING id`,
		req.DeviceID, req.Name, req.Type, req.Location, companyID,
		model, openRelayMs, timezone, verifyMethods, verifyLogic,
	).Scan(&deviceDBID)
	if err != nil {
		if isUniqueViolation(err) {
			httputil.Error(w, http.StatusConflict, "device_id already exists")
			return
		}
		slog.Error("ProvisionDevice: insert failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if req.Type == "camera" {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO dm3_cctv.cameras
			(device_id, tenant_id, brand, rtsp_url, rtsp_username, rtsp_password_enc, recording_mode, pre_roll_sec, post_roll_sec)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
			deviceDBID, companyID, req.Camera.Brand, trimmedRTSP, req.Camera.RTSPUsername, encryptedPass,
			recordingMode, preRoll, postRoll,
		)
		if err != nil {
			slog.Error("ProvisionDevice: insert cctv camera failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("ProvisionDevice: commit failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Generate QR token
	qrToken, expiresAt, err := h.generateQRToken(deviceDBID, companyID, req.Type)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate QR token")
		return
	}

	// Store token hash
	tokenHash := sha256Hash(qrToken)
	_, err = h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_devices.provisioning_tokens (device_id, token_hash, expires_at, created_by)
		 VALUES ($1::uuid, $2, $3, $4)`,
		deviceDBID, tokenHash, expiresAt, createdBy,
	)
	if err != nil {
		slog.Error("failed to store provisioning token", "error", err)
	}

	h.audit.LogFromRequest(r, "device.provision", "device", deviceDBID, req.Name, "success", nil, map[string]any{"device_id": req.DeviceID, "type": req.Type})
	httputil.JSON(w, http.StatusCreated, map[string]any{
		"device": map[string]any{
			"id":        deviceDBID,
			"device_id": req.DeviceID,
			"name":      req.Name,
			"type":      req.Type,
			"status":    "offline",
			"tenant_id": companyID,
		},
		"provisioning": map[string]any{
			"qr_token":    qrToken,
			"qr_data":     fmt.Sprintf("https://dm3.duali.vn/activate?t=%s", qrToken),
			"expires_at":  expiresAt.Format(time.RFC3339),
			"ttl_minutes": 30,
		},
	})
}

// RegenerateQR handles GET /api/v1/devices/provision/{id}/qr
func (h *ProvisioningHandlers) RegenerateQR(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")

	// Get device info
	var companyID, deviceType, status string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id, type, status FROM dm3_devices.devices WHERE id = $1::uuid`, deviceDBID,
	).Scan(&companyID, &deviceType, &status)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}
	if status != "offline" {
		httputil.Error(w, http.StatusBadRequest, "device is not in offline state for provisioning")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	var createdBy *string
	if claims != nil {
		createdBy = &claims.Sub
	}

	qrToken, expiresAt, err := h.generateQRToken(deviceDBID, companyID, deviceType)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate QR token")
		return
	}

	tokenHash := sha256Hash(qrToken)
	_, err = h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_devices.provisioning_tokens (device_id, token_hash, expires_at, created_by)
		 VALUES ($1::uuid, $2, $3, $4)`,
		deviceDBID, tokenHash, expiresAt, createdBy,
	)
	if err != nil {
		slog.Error("failed to store provisioning token", "error", err)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"qr_token":    qrToken,
		"qr_data":     fmt.Sprintf("https://dm3.duali.vn/activate?t=%s", qrToken),
		"expires_at":  expiresAt.Format(time.RFC3339),
		"ttl_minutes": 30,
	})
}

type activateRequest struct {
	QRToken             string         `json:"qr_token"`
	HardwareFingerprint map[string]any `json:"hardware_fingerprint"`
}

// ActivateDevice handles POST /api/v1/devices/activate (no auth required)
func (h *ProvisioningHandlers) ActivateDevice(w http.ResponseWriter, r *http.Request) {
	var req activateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.QRToken == "" {
		httputil.Error(w, http.StatusBadRequest, "qr_token is required")
		return
	}

	// Validate QR token
	token, err := jwt.ParseWithClaims(req.QRToken, &qrTokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(h.cfg.JWTSecret), nil
	})
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "invalid or expired QR token")
		return
	}
	qrClaims, ok := token.Claims.(*qrTokenClaims)
	if !ok || !token.Valid || qrClaims.Purpose != "device_activation" {
		httputil.Error(w, http.StatusUnauthorized, "invalid QR token")
		return
	}

	// Atomically mark the token as used. Checking used_at IS NULL in the WHERE
	// clause prevents a TOCTOU race where two concurrent requests both pass a
	// separate SELECT check before either UPDATE commits.
	tokenHash := sha256Hash(req.QRToken)
	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_devices.provisioning_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL`,
		tokenHash,
	)
	if err != nil {
		slog.Error("ActivateDevice: failed to mark token used", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if tag.RowsAffected() == 0 {
		// Either token not found or already used.
		httputil.Error(w, http.StatusConflict, "token not found or already used")
		return
	}

	// Store hardware fingerprint and update device status
	fpJSON, _ := json.Marshal(req.HardwareFingerprint)
	_, err = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_devices.devices SET status = 'online',
		 hardware_fingerprint = $1, provisioned_at = now(), updated_at = now()
		 WHERE id = $2::uuid`,
		fpJSON, qrClaims.DID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to activate device")
		return
	}

	// Get device info for response
	var deviceID, companyName string
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT d.device_id, COALESCE(c.name, '') FROM dm3_devices.devices d
		 LEFT JOIN dm3_auth.tenants c ON c.id = d.tenant_id
		 WHERE d.id = $1::uuid`, qrClaims.DID,
	).Scan(&deviceID, &companyName)

	// Generate device MQTT JWT
	deviceJWT, err := generateDeviceJWT(qrClaims.DID, qrClaims.CID, qrClaims.DType, h.cfg.JWTSecret)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate credentials")
		return
	}

	h.audit.Log(audit.Entry{
		TenantID:   qrClaims.CID,
		ActorIP:    audit.IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     "device.activate",
		EntityType: "device",
		EntityID:   qrClaims.DID,
		EntityName: deviceID,
		Status:     "success",
		NewValues:  map[string]any{"device_id": deviceID, "type": qrClaims.DType},
	})
	httputil.JSON(w, http.StatusOK, map[string]any{
		"status":    "activated",
		"device_id": deviceID,
		"company": map[string]any{
			"id":   qrClaims.CID,
			"name": companyName,
		},
		"mqtt": map[string]any{
			"broker":           h.cfg.MQTTBroker,
			"username":         fmt.Sprintf("device:%s", deviceID),
			"token":            deviceJWT,
			"token_expires_at": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			"refresh_url":      "/api/v1/devices/refresh-token",
		},
		"config": map[string]any{
			"heartbeat_interval_sec": 30,
			"sync_url":               "/api/v1",
			"tenant_id":              qrClaims.CID,
		},
	})
}

// ─── Bootstrap Flow ──────────────────────────────────────────────────────────

// ListPending handles GET /api/v1/devices/pending
func (h *ProvisioningHandlers) ListPending(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, rid, device_type, COALESCE(firmware_version,''), hardware_fingerprint,
		 hmac_verified, signature_verified, status, tenant_id, created_at
		 FROM dm3_devices.pending_registrations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		slog.Error("ListPending: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	var results []map[string]any
	for rows.Next() {
		var id, rid, deviceType, firmwareVersion, status string
		var fp json.RawMessage
		var hmacVerified, sigVerified bool
		var assignedCompanyID *string
		var createdAt time.Time
		if err := rows.Scan(&id, &rid, &deviceType, &firmwareVersion, &fp, &hmacVerified, &sigVerified, &status, &assignedCompanyID, &createdAt); err != nil {
			slog.Error("ListPending: scan failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		item := map[string]any{
			"id":                 id,
			"rid":                rid,
			"device_type":        deviceType,
			"firmware_version":   firmwareVersion,
			"hardware_fingerprint": fp,
			"hmac_verified":      hmacVerified,
			"signature_verified": sigVerified,
			"status":             status,
			"assigned_tenant_id": assignedCompanyID,
			"created_at":         createdAt,
		}
		results = append(results, item)
	}
	if results == nil {
		results = []map[string]any{}
	}
	httputil.JSON(w, http.StatusOK, results)
}

type approveRequest struct {
	TenantID string `json:"tenant_id"`
	Name     string `json:"name"`
	Location string `json:"location"`
	// Optional: override the auto-detected (type, model) derived from
	// pending_registrations.device_type. When either is empty, the
	// handler falls back to validateDeviceType(pending.device_type).
	Type  string `json:"type,omitempty"`
	Model string `json:"model,omitempty"`
}

// resolveApprovalTypeModel decides which (type, model) to persist for
// an approved device. If the admin supplied explicit values in the
// request they win (after validation); otherwise the pending row's
// device_type is classified.
func resolveApprovalTypeModel(req approveRequest, pendingDeviceType string) (typ, model string, err error) {
	if req.Model != "" {
		for _, m := range validDeviceModels {
			if m.Model == req.Model {
				resolved := m.Type
				if req.Type != "" {
					resolved = req.Type
				}
				switch resolved {
				case "terminal", "controller", "camera", "sensor":
					return resolved, m.Model, nil
				}
				return "", "", fmt.Errorf("invalid type %q: must be terminal, controller, camera, or sensor", resolved)
			}
		}
		return "", "", fmt.Errorf("unknown model %q; see /api/v1/gateway/devices/pending for accepted values", req.Model)
	}
	return validateDeviceType(pendingDeviceType)
}

// validDeviceModels lists every canonical model name accepted by the
// dm3_devices.devices CHECK constraint (chk_device_model) paired with its
// top-level type (chk_device_type). Keep in sync with
// backend/pkg/db/migrations/000001_initial.up.sql AND with the frontend
// map in apps/console/src/lib/device-models.ts — the frontend Edit page
// uses (type, model) to populate the model dropdown, so the type
// assignment below MUST match DEVICE_TYPE_MODELS or the dropdown will
// render empty. This is the single source of truth for `device_type`
// values a device may send in its bootstrap payload.
var validDeviceModels = []struct{ Model, Type string }{
	// terminal (full-capability access control)
	{"ra08", "terminal"},
	{"ba8300", "terminal"},
	{"df970", "terminal"},
	{"dq200", "terminal"},
	{"dq8500", "terminal"},
	{"bd8500", "terminal"},
	{"icu970", "terminal"},
	{"lpr_desktop", "terminal"},
	// controller (face + nfc + qr + pin)
	{"icu300n", "controller"},
	{"ipopx", "controller"},
	{"itouch_pop_x", "controller"},
	{"icu400", "controller"},
	{"dqmini_plus", "controller"},
	// camera
	{"camera_dc", "camera"},
	{"cctv", "camera"},
	{"tungson", "camera"},
	{"tbvision", "camera"},
	// sensor / reader
	{"door_sensor", "sensor"},
	{"de960", "sensor"},
	{"de950", "sensor"},
}

// validateDeviceType resolves the raw `device_type` string from the
// bootstrap payload to a (type, model) pair. The match is exact — no
// case folding, no alias table. Devices must send one of the canonical
// model names listed in validDeviceModels. If the value does not match,
// an error is returned so the caller can reject the registration with
// a clear message instead of silently coercing it to a default.
func validateDeviceType(raw string) (typ, model string, err error) {
	for _, m := range validDeviceModels {
		if raw == m.Model {
			return m.Type, m.Model, nil
		}
	}
	names := make([]string, len(validDeviceModels))
	for i, m := range validDeviceModels {
		names[i] = m.Model
	}
	return "", "", fmt.Errorf("unknown device_type %q; must be one of: %s",
		raw, strings.Join(names, ", "))
}

// ApprovePending handles POST /api/v1/devices/pending/{id}/approve
func (h *ProvisioningHandlers) ApprovePending(w http.ResponseWriter, r *http.Request) {
	regID := chi.URLParam(r, "id")

	var req approveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TenantID == "" {
		httputil.Error(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	// Get pending registration
	var rid, deviceType, firmwareVersion string
	var fp json.RawMessage
	var status string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT rid, device_type, COALESCE(firmware_version,''), hardware_fingerprint, status
		 FROM dm3_devices.pending_registrations WHERE id = $1::uuid`, regID,
	).Scan(&rid, &deviceType, &firmwareVersion, &fp, &status)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "registration not found")
		return
	}
	if status != "pending" {
		httputil.Error(w, http.StatusBadRequest, "registration already processed")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	var assignedBy *string
	if claims != nil {
		assignedBy = &claims.Sub
	}

	// Resolve (type, model): admin can override via request body; otherwise
	// auto-classify from the pending row's device_type. Validate BEFORE
	// opening the transaction so a bad value can't flip status=approved.
	typ, model, err := resolveApprovalTypeModel(req, deviceType)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	name := req.Name
	if name == "" {
		name = fmt.Sprintf("Device %s", rid)
	}

	// Run the UPDATE of pending_registrations and the INSERT into devices
	// in a single transaction. Previously these were separate Pool.Exec
	// calls, so an INSERT failure (e.g. CHECK constraint violation) left
	// the pending row marked `approved` with no corresponding device,
	// creating orphans that could never be reconciled.
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("ApprovePending: begin tx failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	if _, err := tx.Exec(r.Context(),
		`UPDATE dm3_devices.pending_registrations SET status = 'approved', tenant_id = $1::uuid,
		 assigned_by = $2, reviewed_at = now() WHERE id = $3::uuid`,
		req.TenantID, assignedBy, regID,
	); err != nil {
		slog.Error("ApprovePending: update pending failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var deviceDBID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices (device_id, name, type, model, location, tenant_id, status, firmware_version, hardware_fingerprint, provisioned_at, provisioned_by)
		 VALUES ($1, $2, $3, $10, $4, $5::uuid, $9, $6, $7, now(), $8)
		 ON CONFLICT (device_id) DO UPDATE SET status = $9, name = $2, type = $3, model = $10, location = $4, tenant_id = $5::uuid, firmware_version = $6, hardware_fingerprint = $7, provisioned_at = now(), provisioned_by = $8, updated_at = now()
		 RETURNING id`,
		rid, name, typ, req.Location, req.TenantID, firmwareVersion, fp, assignedBy, models.DeviceStatusOnline, model,
	).Scan(&deviceDBID)
	if err != nil {
		slog.Error("ApprovePending: insert device failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("ApprovePending: commit failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Generate device JWT
	deviceJWT, err := generateDeviceJWT(deviceDBID, req.TenantID, deviceType, h.cfg.JWTSecret)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate credentials")
		return
	}

	// Publish credentials to bootstrap channel
	responsePayload, err := json.Marshal(map[string]any{
		"type":   "device.approved",
		"rid":    rid,
		"status": "approved",
		"credentials": map[string]any{
			"mqtt_username":    fmt.Sprintf("device:%s", rid),
			"mqtt_token":       deviceJWT,
			"token_expires_at": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			"refresh_url":      "/api/v1/devices/refresh-token",
		},
		"company": map[string]any{
			"id": req.TenantID,
		},
		"config": map[string]any{
			"heartbeat_interval_sec": 30,
			"sync_url":               "/api/v1",
			"tenant_id":              req.TenantID,
		},
	})
	if err != nil {
		slog.Error("ApprovePending: marshal response failed", "error", err)
		responsePayload = []byte(`{"type":"device.approved","status":"approved"}`)
	}
	topic := fmt.Sprintf("dm/bootstrap/%s/response", rid)
	if err := h.mqtt.Publish(r.Context(), topic, 1, responsePayload); err != nil {
		slog.Error("failed to publish approval to bootstrap channel", "error", err, "rid", rid)
	}

	h.audit.LogFromRequest(r, "device.approve", "device", deviceDBID, rid, "success", nil, map[string]any{"rid": rid, "tenant_id": req.TenantID})
	httputil.JSON(w, http.StatusOK, map[string]any{
		"status":    "approved",
		"device_id": deviceDBID,
		"rid":       rid,
	})
}

// RejectPending handles POST /api/v1/devices/pending/{id}/reject
func (h *ProvisioningHandlers) RejectPending(w http.ResponseWriter, r *http.Request) {
	regID := chi.URLParam(r, "id")

	var rid, status string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT rid, status FROM dm3_devices.pending_registrations WHERE id = $1::uuid`, regID,
	).Scan(&rid, &status)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "registration not found")
		return
	}
	if status != "pending" {
		httputil.Error(w, http.StatusBadRequest, "registration already processed")
		return
	}

	claims := authsvc.ClaimsFromContext(r.Context())
	var assignedBy *string
	if claims != nil {
		assignedBy = &claims.Sub
	}

	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_devices.pending_registrations SET status = 'rejected', assigned_by = $1, reviewed_at = now() WHERE id = $2::uuid`,
		assignedBy, regID,
	)

	// Publish rejection
	responsePayload, err := json.Marshal(map[string]any{
		"type":    "device.rejected",
		"rid":     rid,
		"status":  "rejected",
		"message": "Registration rejected by administrator",
	})
	if err != nil {
		slog.Error("RejectPending: marshal response failed", "error", err)
		responsePayload = []byte(`{"type":"device.rejected","status":"rejected"}`)
	}
	topic := fmt.Sprintf("dm/bootstrap/%s/response", rid)
	if err := h.mqtt.Publish(r.Context(), topic, 1, responsePayload); err != nil {
		slog.Error("failed to publish rejection", "error", err, "rid", rid)
	}

	h.audit.LogFromRequest(r, "device.reject", "device", regID, rid, "success", nil, map[string]any{"rid": rid})
	httputil.JSON(w, http.StatusOK, map[string]any{"status": "rejected", "rid": rid})
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

// RefreshToken handles POST /api/v1/devices/refresh-token
// Accepts both valid AND expired JWTs (within grace period) for offline resilience.
// Grace period: 7 days after expiry (configurable via DEVICE_REFRESH_GRACE_DAYS).
func (h *ProvisioningHandlers) RefreshToken(w http.ResponseWriter, r *http.Request) {
	// Extract device JWT from Authorization header
	header := r.Header.Get("Authorization")
	if header == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing authorization header")
		return
	}
	tokenStr := header
	if len(header) > 7 && header[:7] == "Bearer " {
		tokenStr = header[7:]
	}

	// Parse WITHOUT expiry validation — we handle expiry ourselves with grace period
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	token, err := parser.ParseWithClaims(tokenStr, &deviceJWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(h.cfg.JWTSecret), nil
	})
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "invalid device token")
		return
	}
	dc, ok := token.Claims.(*deviceJWTClaims)
	if !ok {
		httputil.Error(w, http.StatusUnauthorized, "invalid device token claims")
		return
	}

	// Check grace period: if token expired, it must be within 7 days
	graceDays := 7
	if dc.ExpiresAt != nil && dc.ExpiresAt.Before(time.Now()) {
		expiredDuration := time.Since(dc.ExpiresAt.Time)
		if expiredDuration > time.Duration(graceDays)*24*time.Hour {
			slog.Warn("device token refresh rejected: beyond grace period",
				"device_id", dc.DID, "expired_at", dc.ExpiresAt.Time, "expired_days", int(expiredDuration.Hours()/24))
			httputil.Error(w, http.StatusUnauthorized, "Token expired beyond grace period. Re-provisioning required.")
			return
		}
		slog.Info("device token refresh: expired token within grace period",
			"device_id", dc.DID, "expired_hours_ago", int(expiredDuration.Hours()))
	}

	// Verify device still exists and is not decommissioned
	var deviceStatus string
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT COALESCE(status, 'unknown') FROM dm3_devices.devices WHERE device_id = $1", dc.DID).Scan(&deviceStatus)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "device not found")
		return
	}
	if deviceStatus == "decommissioned" || deviceStatus == "disabled" {
		slog.Warn("device token refresh rejected: device deactivated", "device_id", dc.DID, "status", deviceStatus)
		httputil.Error(w, http.StatusForbidden, "Device has been deactivated.")
		return
	}

	// Generate new token
	newToken, err := generateDeviceJWT(dc.DID, dc.CID, dc.DType, h.cfg.JWTSecret)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Update last_seen
	_, _ = h.db.Pool.Exec(r.Context(),
		"UPDATE dm3_devices.devices SET last_seen = now(), status = 'online' WHERE device_id = $1", dc.DID)

	slog.Info("device token refreshed", "device_id", dc.DID, "tenant_id", dc.CID)
	h.audit.Log(audit.Entry{
		TenantID:   dc.CID,
		ActorIP:    audit.IPFromRequest(r),
		UserAgent:  r.Header.Get("User-Agent"),
		Action:     "device.token_refresh",
		EntityType: "device",
		EntityID:   dc.DID,
		Status:     "success",
	})

	httputil.JSON(w, http.StatusOK, map[string]any{
		"token":      newToken,
		"expires_at": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
	})
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type deviceJWTClaims struct {
	Sub         string   `json:"sub"`
	CID         string   `json:"cid"`
	DID         string   `json:"did"`
	DType       string   `json:"dtype"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

func generateDeviceJWT(deviceID, companyID, deviceType, secret string) (string, error) {
	claims := deviceJWTClaims{
		Sub:   fmt.Sprintf("device:%s", deviceID),
		CID:   companyID,
		DID:   deviceID,
		DType: deviceType,
		Permissions: []string{"pub:evt", "pub:sta", "sub:cmd", "sub:cfg"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func (h *ProvisioningHandlers) generateQRToken(deviceDBID, companyID, deviceType string) (string, time.Time, error) {
	expiresAt := time.Now().Add(30 * time.Minute)
	claims := qrTokenClaims{
		Purpose: "device_activation",
		DID:     deviceDBID,
		CID:     companyID,
		DType:   deviceType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

func sha256Hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ─── Bootstrap MQTT Handler ──────────────────────────────────────────────────

// BootstrapMQTTHandler handles bootstrap registration messages.
type BootstrapMQTTHandler struct {
	db     *db.DB
	mqtt   *mqtt.Client
	cfg    *config.Config
	appCtx context.Context
}

func NewBootstrapMQTTHandler(database *db.DB, mqttClient *mqtt.Client, cfg *config.Config) *BootstrapMQTTHandler {
	return &BootstrapMQTTHandler{db: database, mqtt: mqttClient, cfg: cfg, appCtx: context.Background()}
}

// SetAppContext sets the application-level context used to derive timeouts.
// Call this after construction so that shutdown signals cancel in-flight handlers.
func (h *BootstrapMQTTHandler) SetAppContext(ctx context.Context) {
	h.appCtx = ctx
}

type bootstrapRegisterMsg struct {
	Type                string         `json:"type"`
	RID                 string         `json:"rid"`
	DeviceType          string         `json:"device_type"`
	FirmwareVersion     string         `json:"firmware_version"`
	HardwareFingerprint map[string]any `json:"hardware_fingerprint"`
	HMAC                string         `json:"hmac"`
	Timestamp           int64          `json:"timestamp"`
	Nonce               string         `json:"nonce"`
}

// Handle processes dm/bootstrap/register messages.
func (h *BootstrapMQTTHandler) Handle(topic string, payload []byte) {
	slog.Info("bootstrap registration received", "topic", topic)

	var msg bootstrapRegisterMsg
	if err := json.Unmarshal(payload, &msg); err != nil {
		slog.Warn("bootstrap: invalid message", "error", err)
		return
	}

	if msg.RID == "" || msg.DeviceType == "" {
		slog.Warn("bootstrap: missing required fields")
		return
	}

	ctx, cancel := context.WithTimeout(h.appCtx, 10*time.Second)
	defer cancel()

	// 1. Validate HMAC
	hmacValid := h.validateHMAC(payload, msg.HMAC)
	if !hmacValid {
		slog.Warn("bootstrap: HMAC verification failed", "rid", msg.RID)
		h.publishResponse(ctx, msg.RID, "device.register_nack", "error", "HMAC verification failed")
		return
	}

	// 1b. Validate device_type against the canonical model list. Reject
	// unknown values early so they never enter pending_registrations.
	if _, _, err := validateDeviceType(msg.DeviceType); err != nil {
		slog.Warn("bootstrap: invalid device_type", "rid", msg.RID, "device_type", msg.DeviceType)
		h.publishResponse(ctx, msg.RID, "device.register_nack", "error", err.Error())
		return
	}

	// 2. Check app signature (if configured)
	sigVerified := true
	if len(h.cfg.KnownAppSignatures) > 0 {
		sigVerified = false
		if fp, ok := msg.HardwareFingerprint["app_signature_hash"]; ok {
			if sigHash, ok := fp.(string); ok {
				for _, known := range h.cfg.KnownAppSignatures {
					if sigHash == known {
						sigVerified = true
						break
					}
				}
			}
		}
		if !sigVerified {
			slog.Warn("bootstrap: app signature not recognized", "rid", msg.RID)
			h.publishResponse(ctx, msg.RID, "device.register_nack", "error", "Unrecognized app signature")
			return
		}
	}

	// 3. Check nonce not replayed — atomic INSERT eliminates SELECT+INSERT TOCTOU window.
	if msg.Nonce != "" {
		tag, err := h.db.Pool.Exec(ctx,
			`INSERT INTO dm3_devices.used_nonces (nonce) VALUES ($1) ON CONFLICT (nonce) DO NOTHING`, msg.Nonce,
		)
		if err != nil {
			slog.Error("bootstrap: failed to record nonce", "error", err, "rid", msg.RID)
			return
		}
		if tag.RowsAffected() == 0 {
			slog.Warn("bootstrap: nonce replay detected", "rid", msg.RID, "nonce", msg.Nonce)
			h.publishResponse(ctx, msg.RID, "device.register_nack", "error", "Replay detected")
			return
		}
	}

	// 4a. Check if device is already provisioned in devices table.
	// Devices re-bootstrap after OTA or factory reset — recognize them and
	// respond with full credentials so they resume normal MQTT operation.
	var existingDBID, existingTenantID, existingDeviceID, existingType string
	err := h.db.Pool.QueryRow(ctx,
		`SELECT id, tenant_id, device_id, type FROM dm3_devices.devices WHERE device_id = $1`, msg.RID,
	).Scan(&existingDBID, &existingTenantID, &existingDeviceID, &existingType)
	if err == nil {
		// Device already exists — update firmware_version and mark online.
		if msg.FirmwareVersion != "" {
			_, _ = h.db.Pool.Exec(ctx,
				`UPDATE dm3_devices.devices SET firmware_version = $1, status = 'online', last_seen = now(), updated_at = now()
				  WHERE device_id = $2`,
				msg.FirmwareVersion, msg.RID)
		}
		slog.Info("bootstrap: device already provisioned, sending credentials",
			"rid", msg.RID, "tenant_id", existingTenantID, "firmware", msg.FirmwareVersion)

		// Generate fresh device JWT
		deviceJWT, jwtErr := generateDeviceJWT(existingDBID, existingTenantID, existingType, h.cfg.JWTSecret)
		if jwtErr != nil {
			slog.Error("bootstrap: failed to generate JWT for re-bootstrap", "error", jwtErr, "rid", msg.RID)
			h.publishResponse(ctx, msg.RID, "device.register_nack", "error", "Failed to generate credentials")
			return
		}

		// Publish full credentials (same format as ApprovePending)
		responsePayload, _ := json.Marshal(map[string]any{
			"type":   "device.approved",
			"rid":    msg.RID,
			"status": "approved",
			"credentials": map[string]any{
				"mqtt_username":    fmt.Sprintf("device:%s", msg.RID),
				"mqtt_token":       deviceJWT,
				"token_expires_at": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
				"refresh_url":      "/api/v1/devices/refresh-token",
			},
			"company": map[string]any{
				"id": existingTenantID,
			},
			"config": map[string]any{
				"heartbeat_interval_sec": 30,
				"sync_url":               "/api/v1",
				"tenant_id":              existingTenantID,
			},
		})
		topic := fmt.Sprintf("dm/bootstrap/%s/response", msg.RID)
		if pubErr := h.mqtt.Publish(ctx, topic, 1, responsePayload); pubErr != nil {
			slog.Error("bootstrap: failed to publish re-approval credentials", "error", pubErr, "rid", msg.RID)
		}

		// Record device event
		go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
			TenantID:    existingTenantID,
			DeviceID:    existingDeviceID,
			EventType:   "online",
			Description: fmt.Sprintf("Device re-bootstrapped — credentials re-issued (firmware: %s)", msg.FirmwareVersion),
		})
		return
	}

	// 4b. Check RID not already pending
	var existingCount int
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_devices.pending_registrations WHERE rid = $1 AND status = 'pending'`, msg.RID,
	).Scan(&existingCount)
	if existingCount > 0 {
		slog.Info("bootstrap: RID already pending", "rid", msg.RID)
		h.publishResponse(ctx, msg.RID, "device.register_ack", "pending_approval", "Registration already pending")
		return
	}

	// 5. Create pending registration
	fpJSON, _ := json.Marshal(msg.HardwareFingerprint)
	_, err = h.db.Pool.Exec(ctx,
		`INSERT INTO dm3_devices.pending_registrations (rid, device_type, firmware_version, hardware_fingerprint, hmac_verified, signature_verified, nonce)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		msg.RID, msg.DeviceType, msg.FirmwareVersion, fpJSON, hmacValid, sigVerified, msg.Nonce,
	)
	if err != nil {
		slog.Error("bootstrap: failed to create pending registration", "error", err, "rid", msg.RID)
		return
	}

	// 6. Publish ack
	h.publishResponse(ctx, msg.RID, "device.register_ack", "pending_approval", "Registration received. Awaiting admin approval.")
	slog.Info("bootstrap: registration created", "rid", msg.RID, "device_type", msg.DeviceType)
}

func (h *BootstrapMQTTHandler) validateHMAC(payload []byte, providedHMAC string) bool {
	// Remove hmac field from payload for validation
	// Use json.Number to preserve integer formatting (avoid float64 scientific notation)
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.UseNumber()
	var raw map[string]any
	if err := dec.Decode(&raw); err != nil {
		return false
	}
	delete(raw, "hmac")
	canonical, err := json.Marshal(raw)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(h.cfg.BootstrapSecret))
	mac.Write(canonical)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(providedHMAC))
}

func (h *BootstrapMQTTHandler) publishResponse(ctx context.Context, rid, msgType, status, message string) {
	resp, err := json.Marshal(map[string]any{
		"type":    msgType,
		"rid":     rid,
		"status":  status,
		"message": message,
	})
	if err != nil {
		slog.Error("bootstrap: marshal response failed", "error", err, "rid", rid)
		return
	}
	topic := fmt.Sprintf("dm/bootstrap/%s/response", rid)
	if err := h.mqtt.Publish(ctx, topic, 1, resp); err != nil {
		slog.Error("bootstrap: failed to publish response", "error", err, "topic", topic)
	}
}
