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
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/config"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
)

// ProvisioningHandlers handles device provisioning endpoints.
type ProvisioningHandlers struct {
	db   *db.DB
	mqtt *mqtt.Client
	cfg  *config.Config
}

func NewProvisioningHandlers(database *db.DB, mqttClient *mqtt.Client, cfg *config.Config) *ProvisioningHandlers {
	return &ProvisioningHandlers{db: database, mqtt: mqttClient, cfg: cfg}
}

// ─── QR Flow ─────────────────────────────────────────────────────────────────

type provisionRequest struct {
	DeviceID  string `json:"device_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	TenantID string `json:"tenant_id"`
	SiteID    string `json:"site_id"`
	Location  string `json:"location"`
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

	// Create device with status=provisioning
	var deviceDBID string
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices (device_id, name, type, site_id, location, tenant_id, status, status_detail)
		 VALUES ($1, $2, $3, $4, $5, $6::uuid, 'provisioning', 'awaiting_activation')
		 RETURNING id`,
		req.DeviceID, req.Name, req.Type, req.SiteID, req.Location, companyID,
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

	httputil.JSON(w, http.StatusCreated, map[string]any{
		"device": map[string]any{
			"id":         deviceDBID,
			"device_id":  req.DeviceID,
			"name":       req.Name,
			"type":       req.Type,
			"status":     "provisioning",
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
	if status != "provisioning" {
		httputil.Error(w, http.StatusBadRequest, "device is not in provisioning state")
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
		`UPDATE dm3_devices.devices SET status = 'online', status_detail = 'activated',
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
		 LEFT JOIN dm3_auth.companies c ON c.id = d.tenant_id
		 WHERE d.id = $1::uuid`, qrClaims.DID,
	).Scan(&deviceID, &companyName)

	// Generate device MQTT JWT
	deviceJWT, err := generateDeviceJWT(qrClaims.DID, qrClaims.CID, qrClaims.DType, h.cfg.JWTSecret)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate credentials")
		return
	}

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
	SiteID    string `json:"site_id"`
	Name      string `json:"name"`
	Location  string `json:"location"`
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

	// Update pending registration
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_devices.pending_registrations SET status = 'approved', tenant_id = $1::uuid,
		 assigned_by = $2, reviewed_at = now() WHERE id = $3::uuid`,
		req.TenantID, assignedBy, regID,
	)

	// Create device record
	name := req.Name
	if name == "" {
		name = fmt.Sprintf("Device %s", rid)
	}
	var deviceDBID string
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.devices (device_id, name, type, site_id, location, tenant_id, status, status_detail, firmware_version, hardware_fingerprint, provisioned_at, provisioned_by)
		 VALUES ($1, $2, $3, $4, $5, $6::uuid, 'online', 'bootstrap_approved', $7, $8, now(), $9)
		 ON CONFLICT (device_id) DO UPDATE SET status = 'online', name = $2, type = $3, site_id = $4, location = $5, tenant_id = $6::uuid, firmware_version = $7, hardware_fingerprint = $8, provisioned_at = now(), provisioned_by = $9, status_detail = 'bootstrap_approved', updated_at = now()
		 RETURNING id`,
		rid, name, deviceType, req.SiteID, req.Location, req.TenantID, firmwareVersion, fp, assignedBy,
	).Scan(&deviceDBID)
	if err != nil {
		slog.Error("ApprovePending: insert device failed", "error", err)
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

	// 4. Check RID not already registered
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
	_, err := h.db.Pool.Exec(ctx,
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
