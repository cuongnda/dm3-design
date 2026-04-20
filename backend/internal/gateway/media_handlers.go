package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// MediaPresigner is the subset of objectstore.MinIOStore that MediaHandlers
// depends on, narrowed so tests can substitute a fake.
type MediaPresigner interface {
	PresignedPutURL(ctx context.Context, key string, expires time.Duration) (*url.URL, error)
}

// MediaHandlers issues presigned MinIO PUT URLs to provisioned devices so they
// can stream snapshots and event clips directly to object storage. Devices
// authenticate with their device JWT (the same one used for MQTT). The handler
// never touches the binary payload — only signs a URL the device PUTs to.
//
// Two-step flow (see docs/architecture/mqtt-protocol.md §15 "Media uploads"):
//  1. POST /api/v1/gateway/devices/{id}/media-url  → { upload_url, object_key }
//  2. PUT  <upload_url> with Content-Type matching what the device requested
//  3. Device publishes the access.log MQTT event with the object_key in
//     the `photo` (snapshot) or `clip_object_key` (video) field.
type MediaHandlers struct {
	presigner    MediaPresigner
	jwtSecret    string
	uploadExpiry time.Duration
}

func NewMediaHandlers(presigner MediaPresigner, jwtSecret string) *MediaHandlers {
	return &MediaHandlers{
		presigner:    presigner,
		jwtSecret:    jwtSecret,
		uploadExpiry: time.Hour,
	}
}

type issueUploadURLRequest struct {
	Kind        string `json:"kind"`
	ContentType string `json:"content_type"`
}

type issueUploadURLResponse struct {
	UploadURL   string    `json:"upload_url"`
	ObjectKey   string    `json:"object_key"`
	ContentType string    `json:"content_type"`
	ExpiresAt   time.Time `json:"expires_at"`
	Method      string    `json:"method"`
}

// IssueUploadURL handles POST /api/v1/gateway/devices/{id}/media-url.
//
// The device must present its device JWT (the token issued during bootstrap
// approval). The {id} path parameter must match the JWT's `did` claim — a
// device can only upload media for itself.
func (h *MediaHandlers) IssueUploadURL(w http.ResponseWriter, r *http.Request) {
	if h.presigner == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}

	dc, err := parseDeviceJWT(r, h.jwtSecret)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, err.Error())
		return
	}

	pathDeviceID := chi.URLParam(r, "id")
	if pathDeviceID == "" || pathDeviceID != dc.DID {
		httputil.Error(w, http.StatusForbidden, "device id mismatch")
		return
	}
	if dc.CID == "" {
		httputil.Error(w, http.StatusForbidden, "device token missing tenant")
		return
	}

	var req issueUploadURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid json body")
		return
	}

	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	contentType := strings.ToLower(strings.TrimSpace(req.ContentType))
	ext, ok := mediaExtensionFor(kind, contentType)
	if !ok {
		httputil.Error(w, http.StatusBadRequest, "unsupported kind/content_type combination")
		return
	}

	objectKey := fmt.Sprintf("events/%s/%s/%s/%s.%s",
		dc.CID, dc.DID, kind, uuid.NewString(), ext)

	signed, err := h.presigner.PresignedPutURL(r.Context(), objectKey, h.uploadExpiry)
	if err != nil {
		slog.Error("media: presign put failed", "device_id", dc.DID, "key", objectKey, "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to issue upload url")
		return
	}

	httputil.JSON(w, http.StatusOK, issueUploadURLResponse{
		UploadURL:   signed.String(),
		ObjectKey:   objectKey,
		ContentType: contentType,
		ExpiresAt:   time.Now().Add(h.uploadExpiry),
		Method:      http.MethodPut,
	})
}

// IssueSnapshotPutURL signs a single PUT URL for a snapshot the server is
// about to ask a device to capture. Used by SendCommand when forwarding a
// `cmd.snapshot` so the device gets the URL embedded in the command — no
// extra HTTP round-trip on the device side. Returns the signed URL, the
// object key, and the absolute expiry time.
//
// expiry should be at least the device command timeout (10s per
// docs/architecture/mqtt-protocol.md §7) plus a generous capture+upload
// window. 5 minutes is a safe default — far longer than any device should
// take to respond, but short enough that a leaked URL is mostly harmless.
func IssueSnapshotPutURL(ctx context.Context, presigner MediaPresigner, tenantID, deviceID string, expiry time.Duration) (uploadURL, objectKey string, expiresAt time.Time, err error) {
	if presigner == nil {
		return "", "", time.Time{}, fmt.Errorf("media: presigner not configured")
	}
	if tenantID == "" || deviceID == "" {
		return "", "", time.Time{}, fmt.Errorf("media: tenant_id and device_id are required")
	}
	objectKey = fmt.Sprintf("events/%s/%s/snapshot/%s.jpg",
		tenantID, deviceID, uuid.NewString())
	signed, err := presigner.PresignedPutURL(ctx, objectKey, expiry)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("media: presign snapshot put: %w", err)
	}
	return signed.String(), objectKey, time.Now().Add(expiry), nil
}

// mediaExtensionFor validates the (kind, content_type) pair and returns the
// file extension to append to the object key. Devices must declare the kind
// up front so the gateway can enforce per-kind content-type allowlists —
// e.g. an event "clip" must be a video, not a JSON blob masquerading as one.
func mediaExtensionFor(kind, contentType string) (string, bool) {
	switch kind {
	case "snapshot":
		switch contentType {
		case "image/jpeg":
			return "jpg", true
		case "image/png":
			return "png", true
		case "image/webp":
			return "webp", true
		}
	case "clip":
		switch contentType {
		case "video/mp4":
			return "mp4", true
		case "video/webm":
			return "webm", true
		}
	}
	return "", false
}

// parseDeviceJWT validates a device JWT from the Authorization header. Unlike
// the user JWT middleware, expiry IS enforced strictly here — the refresh
// flow (with a 7-day grace) lives at /devices/refresh-token, not on this
// endpoint. A stolen device token must stop being able to mint upload URLs
// the moment it expires.
func parseDeviceJWT(r *http.Request, secret string) (*deviceJWTClaims, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return nil, fmt.Errorf("missing authorization header")
	}
	tokenStr := strings.TrimPrefix(header, "Bearer ")
	if tokenStr == header {
		return nil, fmt.Errorf("authorization header must use Bearer scheme")
	}

	token, err := jwt.ParseWithClaims(tokenStr, &deviceJWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid device token")
	}
	dc, ok := token.Claims.(*deviceJWTClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid device token claims")
	}
	if dc.DID == "" {
		return nil, fmt.Errorf("device token missing did claim")
	}
	return dc, nil
}
