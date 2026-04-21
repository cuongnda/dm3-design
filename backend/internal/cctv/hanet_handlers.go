package cctv

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// errHanetCipherMissing is surfaced when the handler is asked to encrypt a
// Hanet secret but the CCTV credential cipher is not wired in (env var
// CCTV_CREDENTIAL_KEY missing / invalid). Same cipher the RTSP password flow
// uses — if it's not configured, neither code path can persist secrets.
var errHanetCipherMissing = errors.New("cctv: credential cipher not configured")

const (
	hanetDefaultServerURL = "https://partner.hanet.ai"
	hanetGetPlacesPath    = "/place/getPlaces"
	hanetTokenURL         = "https://oauth.hanet.com/token" //nolint:gosec // vendor-documented endpoint, not a credential

	hanetHTTPTimeout = 10 * time.Second
)

// hanetEnvelope is the common Hanet response envelope. returnCode 1 means OK;
// anything else is an API-level failure that we surface verbatim to the caller.
type hanetEnvelope struct {
	ReturnCode    json.Number     `json:"returnCode"`
	ReturnMessage string          `json:"returnMessage"`
	Data          json.RawMessage `json:"data"`
}

// hanetTokenResponse covers the oauth.hanet.com /token grant_type=refresh_token
// reply. Hanet omits or renames fields between their docs and production
// payloads, so the minimal subset we rely on is access_token and refresh_token.
type hanetTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// ListHanetPlaces handles GET /api/v1/cctv/hanet/places.
//
// Forwards the tenant's stored access token to Hanet /place/getPlaces and
// returns the normalized list to the frontend as the option list for the
// place_id selector. If Hanet returns 401 (token expired) AND we have a
// refresh_token + client_id + client_secret saved, we transparently refresh
// and retry once. The rotated tokens are persisted — subsequent calls reuse
// them without another refresh round-trip.
func (h *CCTVHandlers) ListHanetPlaces(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("hanet places: load settings", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !settings.HasAccessToken {
		httputil.Error(w, http.StatusPreconditionFailed, "hanet access token is not configured")
		return
	}
	if h.cipher == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "credential cipher unavailable")
		return
	}

	accessToken, err := h.getHanetAccessToken(r.Context(), cid)
	if err != nil || accessToken == "" {
		slog.Error("hanet places: decrypt access token", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "could not read hanet access token")
		return
	}

	serverURL := settings.HanetServerURL
	if serverURL == "" {
		serverURL = hanetDefaultServerURL
	}

	places, status, err := h.fetchHanetPlaces(r.Context(), serverURL, accessToken)
	if err == nil {
		httputil.JSON(w, http.StatusOK, places)
		return
	}

	// On 401 attempt a refresh and retry once. Any other failure mode is
	// surfaced as-is so the UI can show the upstream reason.
	if status != http.StatusUnauthorized || !settings.HasRefreshToken || settings.HanetClientID == "" || !settings.HasClientSecret {
		slog.Warn("hanet places: upstream failed",
			"tenant", cid, "status", status, "error", err)
		httputil.Error(w, http.StatusBadGateway, fmt.Sprintf("hanet: %v", err))
		return
	}

	newAccess, err := h.refreshHanetToken(r.Context(), cid)
	if err != nil {
		slog.Warn("hanet places: token refresh failed", "tenant", cid, "error", err)
		httputil.Error(w, http.StatusUnauthorized, "hanet refresh failed; please re-enter tokens")
		return
	}
	places, _, err = h.fetchHanetPlaces(r.Context(), serverURL, newAccess)
	if err != nil {
		slog.Warn("hanet places: retry after refresh failed", "tenant", cid, "error", err)
		httputil.Error(w, http.StatusBadGateway, fmt.Sprintf("hanet: %v", err))
		return
	}
	httputil.JSON(w, http.StatusOK, places)
}

// fetchHanetPlaces POSTs a urlencoded `token=<access>` to
// {server}/place/getPlaces and decodes the envelope. Returns the parsed place
// list, the HTTP status (for 401 detection), and error.
func (h *CCTVHandlers) fetchHanetPlaces(ctx context.Context, serverURL, accessToken string) ([]HanetPlace, int, error) {
	endpoint := strings.TrimRight(serverURL, "/") + hanetGetPlacesPath

	form := url.Values{}
	form.Set("token", accessToken)

	ctx, cancel := context.WithTimeout(ctx, hanetHTTPTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("hanet status %d: %s", resp.StatusCode, trimPayload(body))
	}

	var env hanetEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("hanet: decode envelope: %w", err)
	}
	// returnCode 1 = OK in Hanet's docs. We treat any other value as an error
	// (their 401 equivalents usually come as HTTP 200 + returnCode=2/-1).
	if env.ReturnCode.String() != "1" {
		// Hanet's "token invalid" is returnCode=2 with HTTP 200. Normalize
		// that to 401 so the caller's refresh path kicks in.
		if env.ReturnCode.String() == "2" {
			return nil, http.StatusUnauthorized, fmt.Errorf("%s", env.ReturnMessage)
		}
		return nil, resp.StatusCode, fmt.Errorf("hanet: %s", env.ReturnMessage)
	}

	var rawPlaces []struct {
		ID   any    `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(env.Data, &rawPlaces); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("hanet: decode places: %w", err)
	}
	out := make([]HanetPlace, 0, len(rawPlaces))
	for _, p := range rawPlaces {
		out = append(out, HanetPlace{ID: coerceString(p.ID), Name: p.Name})
	}
	return out, resp.StatusCode, nil
}

// refreshHanetToken hits oauth.hanet.com with refresh_token=... and persists
// the rotated pair to dm3_cctv.cctv_settings. Returns the fresh access token
// for the caller's immediate retry.
func (h *CCTVHandlers) refreshHanetToken(ctx context.Context, tenantID string) (string, error) {
	// Load the encrypted secrets we need to mint a new token.
	var clientID *string
	var clientSecretEnc, refreshTokenEnc []byte
	err := h.db.Pool.QueryRow(ctx, `
		SELECT hanet_client_id, hanet_client_secret_enc, hanet_refresh_token_enc
		FROM dm3_cctv.cctv_settings
		WHERE tenant_id = $1::uuid`,
		tenantID,
	).Scan(&clientID, &clientSecretEnc, &refreshTokenEnc)
	if err != nil {
		return "", err
	}
	if clientID == nil || *clientID == "" || len(clientSecretEnc) == 0 || len(refreshTokenEnc) == 0 {
		return "", errors.New("hanet: client_id / client_secret / refresh_token not all set")
	}
	secret, err := h.cipher.Decrypt(clientSecretEnc)
	if err != nil {
		return "", fmt.Errorf("decrypt client_secret: %w", err)
	}
	refresh, err := h.cipher.Decrypt(refreshTokenEnc)
	if err != nil {
		return "", fmt.Errorf("decrypt refresh_token: %w", err)
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", *clientID)
	form.Set("client_secret", secret)
	form.Set("refresh_token", refresh)

	ctx, cancel := context.WithTimeout(ctx, hanetHTTPTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, hanetTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("hanet refresh status %d: %s", resp.StatusCode, trimPayload(body))
	}
	var tok hanetTokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("hanet: decode token: %w", err)
	}
	if tok.AccessToken == "" {
		return "", errors.New("hanet: refresh response missing access_token")
	}

	newAccessEnc, err := h.cipher.Encrypt(tok.AccessToken)
	if err != nil {
		return "", fmt.Errorf("encrypt new access_token: %w", err)
	}
	// Hanet may or may not return a new refresh_token; persist whichever it
	// sends so we don't lose the rotation window.
	var newRefreshEnc []byte
	if tok.RefreshToken != "" {
		newRefreshEnc, err = h.cipher.Encrypt(tok.RefreshToken)
		if err != nil {
			return "", fmt.Errorf("encrypt new refresh_token: %w", err)
		}
	}

	if newRefreshEnc != nil {
		_, err = h.db.Pool.Exec(ctx, `
			UPDATE dm3_cctv.cctv_settings
			   SET hanet_access_token_enc = $2,
			       hanet_refresh_token_enc = $3,
			       updated_at = now()
			 WHERE tenant_id = $1::uuid`,
			tenantID, newAccessEnc, newRefreshEnc)
	} else {
		_, err = h.db.Pool.Exec(ctx, `
			UPDATE dm3_cctv.cctv_settings
			   SET hanet_access_token_enc = $2, updated_at = now()
			 WHERE tenant_id = $1::uuid`,
			tenantID, newAccessEnc)
	}
	if err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}

// coerceString normalizes whatever Hanet returns for place.id — sometimes a
// string, sometimes a JSON number — into a stable string for our UI.
func coerceString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case json.Number:
		return x.String()
	case float64:
		return fmt.Sprintf("%d", int64(x))
	case int64:
		return fmt.Sprintf("%d", x)
	}
	return fmt.Sprint(v)
}

// trimPayload clips upstream error bodies so a misbehaving Hanet edge node
// can't blow up our logs or our response to the frontend.
func trimPayload(b []byte) string {
	const max = 200
	s := strings.TrimSpace(string(b))
	if len(s) > max {
		s = s[:max] + "…"
	}
	return s
}
