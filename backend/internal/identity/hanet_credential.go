package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/cctv"
	"github.com/duali/dm3-backend/pkg/audit"
)

// hanetEmployee is the Hanet person type for a registered user. The DMPW
// constants tree uses 0 = Employee, 1 = Customer, etc.; identity-svc only
// enrolls employees.
const hanetEmployee = "0"

// hanetHTTPTimeout caps any single Hanet round-trip. The /person/register
// upload can be ~100 KB multipart; 15s is comfortable for a LAN MinIO fetch
// plus a WAN POST to partner.hanet.ai.
const hanetHTTPTimeout = 15 * time.Second

// hanetTokenURL matches the constant used in internal/cctv/hanet_handlers.go
// — duplicated here (not imported) because cctv keeps its package unexported.
// When Hanet rotates this endpoint, update both places.
const hanetTokenURL = "https://oauth.hanet.com/token" //nolint:gosec

// SetHanetCipher wires in the CredentialCipher used to decrypt Hanet secrets
// stored in dm3_cctv.cctv_settings. The same key and cipher as cctv-svc —
// identity-svc must be launched with CCTV_CREDENTIAL_KEY pointing at the
// same base64 material, or Hanet enrollment no-ops on every user create.
func (h *IdentityHandlers) SetHanetCipher(c *cctv.CredentialCipher) {
	h.hanetCipher = c
}

// ensureHanetFaceCredential sends the user's avatar to Hanet /person/register
// when the tenant has a complete Hanet config (client_id, client_secret,
// access_token, refresh_token, place_id all set). On success it upserts a
// credential row `{type:'face', value:'H_<personID>', status:'active',
// external_ref:<hanet_personID>}` — the value is keyed by Hanet's personID
// (returned by /person/register) so downstream systems that receive this
// credential via cfg.person_sync can match it directly against Hanet
// webhook payloads without an extra mapping table.
//
// Returns (true, nil) on a new registration, (false, nil) if the preconditions
// aren't met (no cipher, no hanet config, no avatar) or the credential
// already exists, (false, err) on decrypt / network / Hanet API failures.
//
// Side effects:
//   - UPSERTs credentials.H_<personID> on success (ON CONFLICT DO NOTHING
//     via the partial unique index from migration 000045).
//   - Rotates cctv_settings.hanet_access_token_enc if Hanet 401s and we
//     successfully refresh.
//   - Emits an audit entry with the Hanet personID on success (no secrets).
func (h *IdentityHandlers) ensureHanetFaceCredential(ctx context.Context, tenantID, userID string) (bool, error) {
	if h.hanetCipher == nil {
		return false, nil
	}
	if tenantID == "" || userID == "" {
		return false, errors.New("tenant_id and user_id are required")
	}

	cfg, ready, err := h.loadHanetConfig(ctx, tenantID)
	if err != nil {
		return false, err
	}
	if !ready {
		return false, nil
	}

	// Idempotency short-circuit: if the H_ credential already exists for
	// this user, don't re-register. The unique index would kick the INSERT
	// back anyway, but short-circuiting avoids unnecessary Hanet API calls.
	var exists bool
	if err := h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM dm3_identity.credentials
			 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
			   AND type = 'face' AND value LIKE 'H\_%' ESCAPE '\'
		)`, tenantID, userID).Scan(&exists); err != nil {
		return false, err
	}
	if exists {
		return false, nil
	}

	var fullName, position, avatarKey string
	err = h.db.Pool.QueryRow(ctx, `
		SELECT TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))),
		       COALESCE(position,''),
		       COALESCE(avatar,'')
		  FROM dm3_identity.users
		 WHERE id = $1::uuid AND tenant_id = $2::uuid
		   AND (is_deleted = false OR is_deleted IS NULL)`,
		userID, tenantID,
	).Scan(&fullName, &position, &avatarKey)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if avatarKey == "" {
		// No avatar = nothing to enrol with. The credential will be created
		// next time UploadUserAvatar fires.
		return false, nil
	}

	jpeg, err := h.fetchAvatarBytes(ctx, tenantID, userID, avatarKey)
	if err != nil {
		slog.Warn("hanet enroll: avatar fetch failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return false, err
	}

	personID, err := h.hanetRegisterPerson(ctx, tenantID, cfg, fullName, position, jpeg)
	if err != nil {
		slog.Warn("hanet enroll: register failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return false, err
	}

	// Credential value is the Hanet personID (returned by /person/register)
	// prefixed with H_ so it's visually distinguishable from M_ (on-device
	// enrolment) and plain card UIDs. downstream consumers (e.g. LPR Desktop)
	// can match this value directly against the personID in Hanet webhook
	// payloads without an extra external_ref lookup.
	value := "H_" + personID
	var credID string
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_identity.credentials (
			tenant_id, user_id, type, value, status, external_ref,
			valid_from, valid_until
		) VALUES (
			$1::uuid, $2::uuid, 'face', $3, 'active', $4,
			now(), TIMESTAMPTZ '3000-01-01'
		)
		ON CONFLICT (tenant_id, user_id)
			WHERE type = 'face' AND value LIKE 'H\_%' ESCAPE '\'
		DO NOTHING
		RETURNING id`,
		tenantID, userID, value, personID,
	).Scan(&credID)

	if errors.Is(err, pgx.ErrNoRows) {
		// A concurrent request beat us to it — treat as a no-op success.
		return false, nil
	}
	if err != nil {
		slog.Warn("hanet enroll: credential insert failed",
			"tenant_id", tenantID, "user_id", userID, "value", value, "error", err)
		return false, err
	}

	h.audit.Log(audit.Entry{
		TenantID:   tenantID,
		Action:     "identity.credential.hanet_enroll",
		EntityType: "credential",
		EntityID:   credID,
		EntityName: value,
		Status:     "success",
		NewValues: map[string]any{
			"type":            "face",
			"value":           value,
			"hanet_person_id": personID,
			"user_id":         userID,
		},
	})

	h.publishPersonChanged(tenantID, userID, "credential.hanet_enroll")
	return true, nil
}

// hanetConfig is the subset of dm3_cctv.cctv_settings identity-svc needs to
// call Hanet on behalf of a tenant. Strings hold decrypted plaintext and
// MUST NOT be logged.
type hanetConfig struct {
	ClientID     string
	ClientSecret string
	AccessToken  string
	RefreshToken string
	ServerURL    string
	PlaceID      string
}

func (h *IdentityHandlers) loadHanetConfig(ctx context.Context, tenantID string) (hanetConfig, bool, error) {
	var (
		clientID  *string
		serverURL *string
		placeID   *string
		clientSecretEnc, accessTokenEnc, refreshTokenEnc []byte
	)
	err := h.db.Pool.QueryRow(ctx, `
		SELECT hanet_client_id, hanet_server_url, hanet_place_id,
		       hanet_client_secret_enc, hanet_access_token_enc, hanet_refresh_token_enc
		  FROM dm3_cctv.cctv_settings
		 WHERE tenant_id = $1::uuid`, tenantID,
	).Scan(&clientID, &serverURL, &placeID,
		&clientSecretEnc, &accessTokenEnc, &refreshTokenEnc)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return hanetConfig{}, false, nil
		}
		return hanetConfig{}, false, err
	}

	var cfg hanetConfig
	if clientID != nil {
		cfg.ClientID = *clientID
	}
	if serverURL != nil && *serverURL != "" {
		cfg.ServerURL = *serverURL
	} else {
		cfg.ServerURL = "https://partner.hanet.ai"
	}
	if placeID != nil {
		cfg.PlaceID = *placeID
	}
	if cfg.ClientID == "" || cfg.PlaceID == "" ||
		len(clientSecretEnc) == 0 || len(accessTokenEnc) == 0 || len(refreshTokenEnc) == 0 {
		return hanetConfig{}, false, nil
	}

	if cfg.ClientSecret, err = h.hanetCipher.Decrypt(clientSecretEnc); err != nil {
		return hanetConfig{}, false, fmt.Errorf("decrypt client_secret: %w", err)
	}
	if cfg.AccessToken, err = h.hanetCipher.Decrypt(accessTokenEnc); err != nil {
		return hanetConfig{}, false, fmt.Errorf("decrypt access_token: %w", err)
	}
	if cfg.RefreshToken, err = h.hanetCipher.Decrypt(refreshTokenEnc); err != nil {
		return hanetConfig{}, false, fmt.Errorf("decrypt refresh_token: %w", err)
	}
	return cfg, true, nil
}

// fetchAvatarBytes pulls the user's avatar bytes from the object store using
// the stored `avatar` column (typically "/photos/tenants/.../avatar.jpg"
// form — strip the /photos prefix to get the object key).
func (h *IdentityHandlers) fetchAvatarBytes(ctx context.Context, tenantID, userID, avatarKey string) ([]byte, error) {
	if h.objects == nil {
		return nil, errors.New("object store not configured")
	}
	// avatar column may be stored as a public asset path or bare key — the
	// existing ServeManagedPhoto path-normalizer treats "/photos/..." as a
	// valid key reference. We only need the bare object key here.
	key := strings.TrimPrefix(avatarKey, "/photos/")
	// Defence in depth: reject anything that doesn't look like it belongs
	// to this tenant — a tampered avatar path could otherwise leak another
	// tenant's image to Hanet.
	expectedPrefix := "tenants/" + tenantID + "/"
	if !strings.HasPrefix(key, expectedPrefix) {
		return nil, fmt.Errorf("avatar key outside tenant scope: %s", key)
	}
	_ = userID // used by caller for logging; future enhancement could also enforce /users/<id>/ in the key

	reader, _, err := h.objects.GetObject(ctx, key)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(reader)
}

// hanetRegisterPerson POSTs multipart form-data to {server}/person/register
// and returns Hanet's personID on success. Handles 401 via the refresh flow
// and retries once. Any other error — network, 5xx, returnCode != 1 — is
// surfaced as-is.
func (h *IdentityHandlers) hanetRegisterPerson(ctx context.Context, tenantID string, cfg hanetConfig, name, title string, avatar []byte) (string, error) {
	endpoint := strings.TrimRight(cfg.ServerURL, "/") + "/person/register"

	personID, status, err := h.hanetRegisterOnce(ctx, endpoint, cfg.AccessToken, cfg.PlaceID, name, title, avatar)
	if err == nil {
		return personID, nil
	}
	if status != http.StatusUnauthorized {
		return "", err
	}

	// Try refreshing and retry once. refresh updates cctv_settings for the
	// tenant; we pass the tenant_id so the UPDATE targets the right row.
	newAccess, refreshErr := h.refreshHanetAccessToken(ctx, tenantID, cfg)
	if refreshErr != nil {
		return "", fmt.Errorf("401 and refresh failed: %w", refreshErr)
	}
	return h.hanetRegisterOnce2(ctx, endpoint, newAccess, cfg.PlaceID, name, title, avatar)
}

// hanetRegisterOnce sends the multipart request. Split from the parent so
// the 401 retry path can bypass response-envelope-status mapping.
func (h *IdentityHandlers) hanetRegisterOnce(ctx context.Context, endpoint, accessToken, placeID, name, title string, avatar []byte) (string, int, error) {
	body, contentType, err := buildHanetRegisterBody(accessToken, placeID, name, title, avatar)
	if err != nil {
		return "", 0, err
	}
	ctx, cancel := context.WithTimeout(ctx, hanetHTTPTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", resp.StatusCode, err
	}
	if resp.StatusCode != http.StatusOK {
		return "", resp.StatusCode, fmt.Errorf("hanet register status %d: %s", resp.StatusCode, trimPayload(raw))
	}

	var env struct {
		ReturnCode    json.Number     `json:"returnCode"`
		ReturnMessage string          `json:"returnMessage"`
		Data          json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return "", resp.StatusCode, fmt.Errorf("decode hanet envelope: %w", err)
	}
	if env.ReturnCode.String() != "1" {
		// Hanet treats an expired token as returnCode=2 at HTTP 200. Normalize
		// to 401 so the caller's refresh path triggers.
		if env.ReturnCode.String() == "2" {
			return "", http.StatusUnauthorized, fmt.Errorf("hanet: %s", env.ReturnMessage)
		}
		return "", resp.StatusCode, fmt.Errorf("hanet returnCode=%s: %s", env.ReturnCode.String(), env.ReturnMessage)
	}
	var data struct {
		PersonID json.RawMessage `json:"personID"`
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		return "", resp.StatusCode, fmt.Errorf("decode hanet data: %w", err)
	}
	personID := strings.Trim(string(data.PersonID), `"`)
	if personID == "" {
		return "", resp.StatusCode, errors.New("hanet register: missing personID in response")
	}
	return personID, resp.StatusCode, nil
}

// hanetRegisterOnce2 is the retry-after-refresh helper; collapses (id, _, err)
// to (id, err) since the retry path doesn't need the status code.
func (h *IdentityHandlers) hanetRegisterOnce2(ctx context.Context, endpoint, accessToken, placeID, name, title string, avatar []byte) (string, error) {
	id, _, err := h.hanetRegisterOnce(ctx, endpoint, accessToken, placeID, name, title, avatar)
	return id, err
}

// removeHanetPerson deletes `personID` from the tenant's Hanet place. Best
// effort: logs and returns the error on upstream failure, but callers should
// not abort their DM3-side deletion if this fails — the local record has to
// be removed regardless, and a stale entry on Hanet is an operational concern
// (cleaned up manually from their console) rather than a data-integrity one.
//
// Skips silently when the tenant has no Hanet config or the cipher isn't
// wired, so test / dev environments don't spam errors.
func (h *IdentityHandlers) removeHanetPerson(ctx context.Context, tenantID, personID string) error {
	if h.hanetCipher == nil || tenantID == "" || personID == "" {
		return nil
	}
	cfg, ready, err := h.loadHanetConfig(ctx, tenantID)
	if err != nil {
		return err
	}
	if !ready {
		return nil
	}
	endpoint := strings.TrimRight(cfg.ServerURL, "/") + "/person/removePersonByID"
	status, err := h.hanetRemoveOnce(ctx, endpoint, cfg.AccessToken, cfg.PlaceID, personID)
	if err == nil {
		return nil
	}
	if status != http.StatusUnauthorized {
		return err
	}
	// 401 → refresh + retry once, same pattern as hanetRegisterPerson.
	newAccess, refreshErr := h.refreshHanetAccessToken(ctx, tenantID, cfg)
	if refreshErr != nil {
		return fmt.Errorf("401 and refresh failed: %w", refreshErr)
	}
	_, err = h.hanetRemoveOnce(ctx, endpoint, newAccess, cfg.PlaceID, personID)
	return err
}

// hanetRemoveOnce POSTs application/x-www-form-urlencoded `token/placeID/personID`
// to /person/removePersonByID. Returns (status, error); status is the HTTP
// status (or Hanet's 401-equivalent returnCode=2 mapped to 401) so the caller's
// refresh-retry path can key on it.
func (h *IdentityHandlers) hanetRemoveOnce(ctx context.Context, endpoint, accessToken, placeID, personID string) (int, error) {
	form := url.Values{}
	form.Set("token", accessToken)
	form.Set("placeID", placeID)
	form.Set("personID", personID)

	ctx, cancel := context.WithTimeout(ctx, hanetHTTPTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode != http.StatusOK {
		return resp.StatusCode, fmt.Errorf("hanet remove status %d: %s", resp.StatusCode, trimPayload(raw))
	}
	var env struct {
		ReturnCode    json.Number `json:"returnCode"`
		ReturnMessage string      `json:"returnMessage"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return resp.StatusCode, fmt.Errorf("decode hanet envelope: %w", err)
	}
	// returnCode=1 = OK in Hanet's docs. Treat 2 as 401-equivalent so the
	// caller's refresh path kicks in.
	if env.ReturnCode.String() == "1" {
		return resp.StatusCode, nil
	}
	if env.ReturnCode.String() == "2" {
		return http.StatusUnauthorized, fmt.Errorf("hanet: %s", env.ReturnMessage)
	}
	return resp.StatusCode, fmt.Errorf("hanet returnCode=%s: %s", env.ReturnCode.String(), env.ReturnMessage)
}

// removeUserHanetEnrolments looks up every H_* face credential for a user
// and asks Hanet to delete each one. Intended for the user-delete path; the
// DB rows themselves get removed by the outer DELETE/soft-delete.
//
// Returns the count of Hanet calls attempted (not the count that succeeded);
// errors are logged internally so the caller can make the DB change even if
// Hanet is unreachable.
func (h *IdentityHandlers) removeUserHanetEnrolments(ctx context.Context, tenantID, userID string) int {
	if h.hanetCipher == nil {
		return 0
	}
	rows, err := h.db.Pool.Query(ctx, `
		SELECT COALESCE(external_ref,'')
		  FROM dm3_identity.credentials
		 WHERE tenant_id = $1::uuid AND user_id = $2::uuid
		   AND type = 'face' AND value LIKE 'H\_%' ESCAPE '\'`,
		tenantID, userID,
	)
	if err != nil {
		slog.Warn("hanet remove: list user credentials failed",
			"tenant_id", tenantID, "user_id", userID, "error", err)
		return 0
	}
	defer rows.Close()
	var personIDs []string
	for rows.Next() {
		var ref string
		if err := rows.Scan(&ref); err != nil {
			continue
		}
		if ref != "" {
			personIDs = append(personIDs, ref)
		}
	}
	for _, pid := range personIDs {
		if err := h.removeHanetPerson(ctx, tenantID, pid); err != nil {
			slog.Warn("hanet remove: person delete failed",
				"tenant_id", tenantID, "user_id", userID, "person_id", pid, "error", err)
		}
	}
	return len(personIDs)
}

// buildHanetRegisterBody writes a multipart body matching the Hanet API
// contract (mirrored from dmpw-api Helpers.PostFormDataFile): fields first,
// then the `file` part carrying the JPEG bytes.
func buildHanetRegisterBody(accessToken, placeID, name, title string, avatar []byte) (io.Reader, string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	fields := map[string]string{
		"token":   accessToken,
		"placeID": placeID,
		"name":    name,
		"title":   title,
		"type":    hanetEmployee,
	}
	for k, v := range fields {
		if v == "" {
			continue
		}
		if err := mw.WriteField(k, v); err != nil {
			return nil, "", err
		}
	}
	part, err := mw.CreateFormFile("file", fmt.Sprintf("avatar-%d.jpg", time.Now().Unix()))
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(avatar); err != nil {
		return nil, "", err
	}
	if err := mw.Close(); err != nil {
		return nil, "", err
	}
	return &buf, mw.FormDataContentType(), nil
}

// refreshHanetAccessToken mints a new access_token via the Hanet OAuth token
// endpoint, persists the rotated pair back to cctv_settings for the given
// tenant, and returns the fresh access_token for the caller's immediate
// retry. Mirrors internal/cctv/hanet_handlers.go refreshHanetToken so both
// services stay in sync when Hanet rotates tokens.
func (h *IdentityHandlers) refreshHanetAccessToken(ctx context.Context, tenantID string, cfg hanetConfig) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("refresh_token", cfg.RefreshToken)

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
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("hanet refresh status %d: %s", resp.StatusCode, trimPayload(raw))
	}

	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &tok); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	if tok.AccessToken == "" {
		return "", errors.New("hanet refresh: missing access_token")
	}

	newAccessEnc, err := h.hanetCipher.Encrypt(tok.AccessToken)
	if err != nil {
		return "", fmt.Errorf("encrypt new access_token: %w", err)
	}
	if tok.RefreshToken != "" {
		newRefreshEnc, err := h.hanetCipher.Encrypt(tok.RefreshToken)
		if err != nil {
			return "", fmt.Errorf("encrypt new refresh_token: %w", err)
		}
		if _, err := h.db.Pool.Exec(ctx, `
			UPDATE dm3_cctv.cctv_settings
			   SET hanet_access_token_enc = $2,
			       hanet_refresh_token_enc = $3,
			       updated_at = now()
			 WHERE tenant_id = $1::uuid`,
			tenantID, newAccessEnc, newRefreshEnc,
		); err != nil {
			return "", err
		}
	} else {
		if _, err := h.db.Pool.Exec(ctx, `
			UPDATE dm3_cctv.cctv_settings
			   SET hanet_access_token_enc = $2, updated_at = now()
			 WHERE tenant_id = $1::uuid`,
			tenantID, newAccessEnc,
		); err != nil {
			return "", err
		}
	}
	return tok.AccessToken, nil
}

// trimPayload clamps upstream error bodies for logging so a misbehaving
// Hanet edge node can't blow up our log volume.
func trimPayload(b []byte) string {
	const max = 200
	s := strings.TrimSpace(string(b))
	if len(s) > max {
		s = s[:max] + "…"
	}
	return s
}
