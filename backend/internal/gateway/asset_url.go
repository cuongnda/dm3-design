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
func presignIdentityAsset(ctx context.Context, presigner objectstore.GetURLPresigner, stored string) string {
	if presigner == nil {
		return ""
	}
	key := objectKeyFromStoredAvatar(stored)
	if key == "" {
		return ""
	}

	signCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	u, err := presigner.PresignedGetURL(signCtx, key, AvatarPresignTTL)
	if err != nil {
		slog.Warn("sync: failed to presign avatar",
			"key", key, "error", err)
		return ""
	}
	return u.String()
}

// objectKeyFromStoredAvatar normalizes the variety of avatar references we
// may have in the DB back to a MinIO object key. Returns "" if the reference
// doesn't resolve to a safe tenant-scoped key.
func objectKeyFromStoredAvatar(stored string) string {
	s := strings.TrimSpace(stored)
	if s == "" {
		return ""
	}
	// Reject absolute URLs — we only sign keys we control.
	if strings.Contains(s, "://") {
		return ""
	}
	s = strings.TrimPrefix(s, "/photos/")
	s = strings.TrimPrefix(s, "/")
	if !strings.HasPrefix(s, "tenants/") {
		return ""
	}
	// Defense against traversal — reject any ".." segment.
	for _, seg := range strings.Split(s, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return ""
		}
	}
	return s
}
