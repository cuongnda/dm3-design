package cctv

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// CCTVHandlers holds dependencies for all CCTV HTTP handlers.
type CCTVHandlers struct {
	db          *db.DB
	audit       *audit.Logger
	nats        *natsutil.Client
	mediamtx    MediaMTXClient
	cipher      *CredentialCipher
	signer      ClipSigner
	objectStore objectstore.Store
}

// NewCCTVHandlers constructs a CCTVHandlers with the given dependencies.
// signer is used to produce playback URLs for clips; pass DefaultClipSigner
// (the no-op) when object storage is not configured.
// objectStore is optional (may be nil) and is used for best-effort deletes.
func NewCCTVHandlers(database *db.DB, auditLog *audit.Logger, natsClient *natsutil.Client, mediamtx MediaMTXClient, cipher *CredentialCipher, signer ClipSigner, objectStore objectstore.Store) *CCTVHandlers {
	if signer == nil {
		signer = DefaultClipSigner
	}
	return &CCTVHandlers{
		db:          database,
		audit:       auditLog,
		nats:        natsClient,
		mediamtx:    mediamtx,
		cipher:      cipher,
		signer:      signer,
		objectStore: objectStore,
	}
}

// getTenantID extracts the company/tenant ID from the request context.
// Returns empty string if not set; callers should reject with 403.
func (h *CCTVHandlers) getTenantID(r *http.Request) string {
	return authsvc.CompanyIDFromContext(r.Context())
}

// maxPage caps the pagination page number to prevent abuse of OFFSET.
const maxPage = 10000

// parsePagination extracts page and limit from query params with safe defaults.
// Returns an error when page exceeds maxPage so callers can respond with 400.
func parsePagination(r *http.Request) (page, limit int, err error) {
	page = 1
	limit = 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, perr := strconv.Atoi(p); perr == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, lerr := strconv.Atoi(l); lerr == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	if page > maxPage {
		return 0, 0, fmt.Errorf("page must not exceed %d", maxPage)
	}
	return page, limit, nil
}

// getOrCreateSettings retrieves or lazily creates the CCTV settings row for a tenant.
func (h *CCTVHandlers) getOrCreateSettings(ctx context.Context, tenantID string) (CCTVSettings, error) {
	s, err := h.scanSettings(ctx, tenantID)
	if err == nil {
		return s, nil
	}

	// Insert default settings row
	_, err = h.db.Pool.Exec(ctx, `
		INSERT INTO dm3_cctv.cctv_settings (tenant_id)
		VALUES ($1::uuid)
		ON CONFLICT (tenant_id) DO NOTHING`,
		tenantID,
	)
	if err != nil {
		return CCTVSettings{}, err
	}
	return h.scanSettings(ctx, tenantID)
}

// scanSettings reads the full cctv_settings row and maps the encrypted Hanet
// columns into bool flags on the returned struct. Tokens themselves never
// leave this package.
func (h *CCTVHandlers) scanSettings(ctx context.Context, tenantID string) (CCTVSettings, error) {
	var s CCTVSettings
	var clientID, serverURL, placeID *string
	var clientSecretEnc, accessTokenEnc, refreshTokenEnc []byte
	err := h.db.Pool.QueryRow(ctx, `
		SELECT tenant_id, retention_days, retention_days_max,
		       pre_roll_sec_default, post_roll_sec_default, storage_quota_gb,
		       rolling_buffer_sec, max_clip_duration_sec, max_concurrent_extractions,
		       default_snapshot_enabled, default_record_enabled,
		       created_at, updated_at,
		       hanet_client_id, hanet_server_url, hanet_place_id,
		       hanet_client_secret_enc, hanet_access_token_enc, hanet_refresh_token_enc
		FROM dm3_cctv.cctv_settings
		WHERE tenant_id = $1::uuid`, tenantID,
	).Scan(
		&s.TenantID, &s.RetentionDays, &s.RetentionDaysMax,
		&s.PreRollSecDefault, &s.PostRollSecDefault, &s.StorageQuotaGB,
		&s.RollingBufferSec, &s.MaxClipDurationSec, &s.MaxConcurrentExtractions,
		&s.DefaultSnapshotEnabled, &s.DefaultRecordEnabled,
		&s.CreatedAt, &s.UpdatedAt,
		&clientID, &serverURL, &placeID,
		&clientSecretEnc, &accessTokenEnc, &refreshTokenEnc,
	)
	if err != nil {
		return s, err
	}
	if clientID != nil {
		s.HanetClientID = *clientID
	}
	if serverURL != nil {
		s.HanetServerURL = *serverURL
	}
	if placeID != nil {
		s.HanetPlaceID = *placeID
	}
	s.HasClientSecret = len(clientSecretEnc) > 0
	s.HasAccessToken = len(accessTokenEnc) > 0
	s.HasRefreshToken = len(refreshTokenEnc) > 0
	return s, nil
}

// getHanetAccessToken returns the decrypted current access token for a tenant
// (or "" if unset). Errors are returned so the caller can distinguish
// "never configured" from "decrypt failed" — if decrypt fails, the caller
// should clear the stored ciphertext rather than silently masking the issue.
func (h *CCTVHandlers) getHanetAccessToken(ctx context.Context, tenantID string) (string, error) {
	if h.cipher == nil {
		return "", errors.New("cctv: credential cipher not configured")
	}
	var enc []byte
	err := h.db.Pool.QueryRow(ctx,
		`SELECT hanet_access_token_enc FROM dm3_cctv.cctv_settings WHERE tenant_id = $1::uuid`,
		tenantID,
	).Scan(&enc)
	if err != nil {
		return "", err
	}
	if len(enc) == 0 {
		return "", nil
	}
	return h.cipher.Decrypt(enc)
}

// composeRTSPURLWithAuth builds the full RTSP URL including credentials for
// MediaMTX source. If the URL already embeds credentials (rtsp://u:p@host/...)
// those are stripped first so we don't end up with the double-userinfo shape
// `rtsp://newu:newp@oldu:oldp@host/...`, which many camera RTSP servers reject
// as 401 Unauthorized.
func composeRTSPURLWithAuth(rtspURL string, username, password string) string {
	// Strip any existing userinfo so we can reinject cleanly.
	stripped := rtspURL
	for _, scheme := range []string{"rtsps://", "rtsp://"} {
		if strings.HasPrefix(rtspURL, scheme) {
			rest := rtspURL[len(scheme):]
			if at := strings.Index(rest, "@"); at >= 0 {
				// If '@' appears before the path/query, it's userinfo. Path
				// components are safe because '@' isn't valid in a bare host.
				slash := strings.IndexAny(rest, "/?")
				if slash < 0 || at < slash {
					// Preserve the creds we're about to replace in case the
					// caller passed empty user/pass — re-use the embedded
					// ones so URL-only configs still work.
					if username == "" && password == "" {
						embedded := rest[:at]
						if col := strings.Index(embedded, ":"); col >= 0 {
							username, password = embedded[:col], embedded[col+1:]
						} else {
							username = embedded
						}
					}
					stripped = scheme + rest[at+1:]
				}
			}
			break
		}
	}

	if username == "" && password == "" {
		return stripped
	}

	for _, scheme := range []string{"rtsps://", "rtsp://"} {
		if strings.HasPrefix(stripped, scheme) {
			rest := stripped[len(scheme):]
			if password != "" {
				return fmt.Sprintf("%s%s:%s@%s", scheme, username, password, rest)
			}
			return fmt.Sprintf("%s%s@%s", scheme, username, rest)
		}
	}
	return stripped
}

// requireTenant validates tenant context and writes 403 if missing.
// Returns false if the caller should abort.
func requireTenant(w http.ResponseWriter, tenantID string) bool {
	if tenantID == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return false
	}
	return true
}

// logInternalError logs the error with slog and responds with 500.
func logInternalError(w http.ResponseWriter, msg string, err error) {
	slog.Error(msg, "error", err)
	httputil.Error(w, http.StatusInternalServerError, "internal error")
}
