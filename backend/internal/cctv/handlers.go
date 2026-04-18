package cctv

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

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
	var s CCTVSettings
	err := h.db.Pool.QueryRow(ctx, `
		SELECT tenant_id, retention_days, retention_days_max, pre_roll_sec_default, post_roll_sec_default, storage_quota_gb, created_at, updated_at
		FROM dm3_cctv.cctv_settings
		WHERE tenant_id = $1::uuid`, tenantID,
	).Scan(&s.TenantID, &s.RetentionDays, &s.RetentionDaysMax, &s.PreRollSecDefault, &s.PostRollSecDefault, &s.StorageQuotaGB, &s.CreatedAt, &s.UpdatedAt)
	if err == nil {
		return s, nil
	}

	// Insert default settings row
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_cctv.cctv_settings (tenant_id, retention_days, retention_days_max, pre_roll_sec_default, post_roll_sec_default, storage_quota_gb)
		VALUES ($1::uuid, 14, 90, 10, 20, 100)
		ON CONFLICT (tenant_id) DO NOTHING
		RETURNING tenant_id, retention_days, retention_days_max, pre_roll_sec_default, post_roll_sec_default, storage_quota_gb, created_at, updated_at`,
		tenantID,
	).Scan(&s.TenantID, &s.RetentionDays, &s.RetentionDaysMax, &s.PreRollSecDefault, &s.PostRollSecDefault, &s.StorageQuotaGB, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		// ON CONFLICT DO NOTHING fired; re-query
		err = h.db.Pool.QueryRow(ctx, `
			SELECT tenant_id, retention_days, retention_days_max, pre_roll_sec_default, post_roll_sec_default, storage_quota_gb, created_at, updated_at
			FROM dm3_cctv.cctv_settings
			WHERE tenant_id = $1::uuid`, tenantID,
		).Scan(&s.TenantID, &s.RetentionDays, &s.RetentionDaysMax, &s.PreRollSecDefault, &s.PostRollSecDefault, &s.StorageQuotaGB, &s.CreatedAt, &s.UpdatedAt)
	}
	return s, err
}

// composeRTSPURLWithAuth builds the full RTSP URL including credentials for MediaMTX source.
// Format: rtsp://username:password@host/path or rtsp://host/path if no credentials.
func composeRTSPURLWithAuth(rtspURL string, username, password string) string {
	if username == "" && password == "" {
		return rtspURL
	}

	// Parse scheme + rest manually to insert credentials
	// Expected: rtsp://host:port/path  or  rtsps://host:port/path
	for _, scheme := range []string{"rtsps://", "rtsp://"} {
		if len(rtspURL) > len(scheme) && rtspURL[:len(scheme)] == scheme {
			rest := rtspURL[len(scheme):]
			if password != "" {
				return fmt.Sprintf("%s%s:%s@%s", scheme, username, password, rest)
			}
			return fmt.Sprintf("%s%s@%s", scheme, username, rest)
		}
	}
	// Fallback: return as-is
	return rtspURL
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
