package gateway

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/objectstore"
)

// AvatarPresignTTL is how long the presigned GET URLs embedded in
// cfg.person_sync / cfg.visitor_sync payloads stay valid. One hour is a
// comfortable window: far longer than a device needs to process a sync and
// fetch the image, short enough that a leaked URL is mostly harmless. Every
// subsequent sync hands the device a fresh URL, so devices that stay online
// never see an expired one.
const AvatarPresignTTL = time.Hour

// presignIdentityAsset turns the stored avatar reference on
// dm3_identity.users.avatar / dm3_visitor.visitors.photo_ref into a presigned
// MinIO GET URL that a device can download without authentication.
//
// Accepted input shapes:
//   - "/photos/tenants/{tid}/identity/users/{uid}/avatar.jpg" (identity-svc public path)
//   - "tenants/{tid}/...key" (raw object key)
//   - "" → returns "" (no avatar uploaded)
//
// Anything else (legacy absolute URLs, non-tenant keys) returns "" — we
// refuse to sign keys outside the tenants/ prefix to avoid leaking arbitrary
// object paths. When the presigner is nil or the sign call fails, the empty
// string is returned too so the device simply sees no avatar rather than a
// dead URL.
//
// `subjectID` is a log-only hint (e.g. user_id / visit_id) so operators can
// pinpoint which row has a dropped avatar when diagnosing "sync has no
// avatar" reports. Every drop path that happens while `stored != ""` emits a
// warn log — if the user uploaded an avatar but the device never sees it,
// one of these warnings tells you why.
func presignIdentityAsset(ctx context.Context, presigner objectstore.GetURLPresigner, stored, subjectID string) string {
	trimmed := strings.TrimSpace(stored)
	if trimmed == "" {
		// No avatar uploaded — silent and expected; not a misconfiguration.
		return ""
	}

	if presigner == nil {
		slog.Warn("sync: avatar dropped — asset presigner not configured on this service",
			"subject_id", subjectID,
			"stored_preview", truncateForLog(trimmed, 80),
		)
		return ""
	}

	key, reason := classifyStoredAvatar(trimmed)
	if key == "" {
		slog.Warn("sync: avatar dropped — stored value is not a safe tenant-scoped object key",
			"subject_id", subjectID,
			"reason", reason,
			"stored_preview", truncateForLog(trimmed, 80),
		)
		return ""
	}

	signCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	u, err := presigner.PresignedGetURL(signCtx, key, AvatarPresignTTL)
	if err != nil {
		slog.Warn("sync: avatar dropped — MinIO presign call failed",
			"subject_id", subjectID,
			"key", key,
			"error", err,
		)
		return ""
	}
	return u.String()
}

// objectKeyFromStoredAvatar is kept as a thin wrapper around
// classifyStoredAvatar so existing call sites (tests, and any future helpers)
// can still ask "is this reference safe to sign?" without caring about the
// reject reason.
func objectKeyFromStoredAvatar(stored string) string {
	key, _ := classifyStoredAvatar(strings.TrimSpace(stored))
	return key
}

// classifyStoredAvatar normalizes the variety of avatar references we may
// have in the DB back to a MinIO object key. On reject it returns ("",
// reason) so callers can log *why* the value was dropped — the most common
// production mystery has been "avatar column has a value but device sees
// nothing" where the value is a legacy absolute URL or a bare filename.
//
// Caller is expected to have already trimmed whitespace.
func classifyStoredAvatar(s string) (key, reason string) {
	if s == "" {
		return "", "empty_after_trim"
	}
	// Reject absolute URLs — we only sign keys we control. Legacy DM2
	// imports often land values like "https://cdn.example.com/...".
	if strings.Contains(s, "://") {
		return "", "absolute_url_not_allowed"
	}
	s = strings.TrimPrefix(s, "/photos/")
	s = strings.TrimPrefix(s, "/")
	if !strings.HasPrefix(s, "tenants/") {
		return "", "missing_tenants_prefix"
	}
	for _, seg := range strings.Split(s, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", "unsafe_path_segment"
		}
	}
	return s, ""
}

// truncateForLog caps a preview string to n chars so log payloads stay
// bounded when the stored value is a massive legacy URL.
func truncateForLog(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
