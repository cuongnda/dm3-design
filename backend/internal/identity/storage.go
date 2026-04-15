package identity

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	pathpkg "path"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
)

const identityImageMaxBytes = 10 << 20

type identityImageVariant string

const (
	identityPhotoVariant  identityImageVariant = "photo"
	identityAvatarVariant identityImageVariant = "avatar"
)

type uploadError struct {
	status  int
	message string
}

func (h *IdentityHandlers) uploadUserImage(r *http.Request, userID, companyID, formField string, variant identityImageVariant) (string, *uploadError) {
	if companyID == "" {
		return "", &uploadError{status: http.StatusForbidden, message: "company context required"}
	}
	if h.objects == nil {
		return "", &uploadError{status: http.StatusInternalServerError, message: "object storage is not configured"}
	}

	var exists bool
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM dm3_identity.users
			WHERE id = $1::uuid AND tenant_id = $2::uuid
			  AND (is_deleted = false OR is_deleted IS NULL)
		)
	`, userID, companyID).Scan(&exists)
	if err != nil {
		return "", &uploadError{status: http.StatusInternalServerError, message: "database error"}
	}
	if !exists {
		return "", &uploadError{status: http.StatusNotFound, message: "user not found"}
	}

	if err := r.ParseMultipartForm(identityImageMaxBytes); err != nil {
		return "", &uploadError{status: http.StatusBadRequest, message: "file too large or invalid multipart"}
	}

	file, header, err := r.FormFile(formField)
	if err != nil {
		return "", &uploadError{status: http.StatusBadRequest, message: formField + " field required"}
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, identityImageMaxBytes+1))
	if err != nil {
		return "", &uploadError{status: http.StatusInternalServerError, message: "failed to read uploaded file"}
	}
	if len(data) == 0 {
		return "", &uploadError{status: http.StatusBadRequest, message: "uploaded file is empty"}
	}
	if len(data) > identityImageMaxBytes {
		return "", &uploadError{status: http.StatusBadRequest, message: "file too large or invalid multipart"}
	}

	ext, contentType, ok := identityImageExtension(header.Header.Get("Content-Type"), header.Filename, data)
	if !ok {
		return "", &uploadError{status: http.StatusBadRequest, message: formField + " must be a PNG, JPEG, GIF, or WEBP image"}
	}

	objectKey := buildIdentityImageObjectKey(companyID, userID, variant, ext)
	if err := h.objects.PutObject(r.Context(), objectKey, bytes.NewReader(data), int64(len(data)), contentType); err != nil {
		return "", &uploadError{status: http.StatusInternalServerError, message: "failed to save uploaded file"}
	}

	assetURL := buildIdentityImagePublicPath(objectKey)

	// Both photo and avatar variants currently write to the `avatar` column —
	// historical behavior preserved. The column name is a compile-time constant
	// (not derived from user input) so the query is bound, not interpolated.
	// If a separate `photo` column is ever introduced, branch on `variant` with
	// a switch over an allowlist — NEVER fmt.Sprintf a column name into SQL.
	var previous *string
	const query = `UPDATE dm3_identity.users SET avatar = $2, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3::uuid RETURNING avatar`
	if err := h.db.Pool.QueryRow(r.Context(), query, userID, assetURL, companyID).Scan(&previous); err != nil {
		if derr := h.objects.DeleteObject(r.Context(), objectKey); derr != nil {
			slog.Warn("failed to delete orphaned identity image after DB error", "key", objectKey, "error", derr)
		}
		if err == pgx.ErrNoRows {
			return "", &uploadError{status: http.StatusNotFound, message: "user not found"}
		}
		return "", &uploadError{status: http.StatusInternalServerError, message: "failed to update user image"}
	}

	if previousKey, ok := managedIdentityAssetObjectKey(derefString(previous)); ok && previousKey != objectKey {
		if derr := h.objects.DeleteObject(r.Context(), previousKey); derr != nil {
			slog.Warn("failed to delete superseded identity image", "key", previousKey, "error", derr)
		}
	}

	return assetURL, nil
}

func (h *IdentityHandlers) ServeManagedPhoto(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	objectKey, ok := managedIdentityAssetObjectKey(r.URL.Path)
	if !ok || h.objects == nil {
		http.NotFound(w, r)
		return
	}
	// Enforce tenant isolation
	if cid != "" && !strings.HasPrefix(objectKey, "tenants/"+cid+"/") {
		http.Error(w, "access denied", http.StatusForbidden)
		return
	}

	reader, info, err := h.objects.GetObject(r.Context(), objectKey)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer reader.Close()

	if info.ContentType != "" {
		w.Header().Set("Content-Type", info.ContentType)
	}
	if info.ETag != "" {
		w.Header().Set("ETag", info.ETag)
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	if info.Size > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size))
	}
	_, _ = io.Copy(w, reader)
}

func buildIdentityImageObjectKey(companyID, userID string, variant identityImageVariant, ext string) string {
	return fmt.Sprintf("tenants/%s/identity/users/%s/%s%s", companyID, userID, variant, ext)
}

func buildIdentityImagePublicPath(objectKey string) string {
	return "/photos/" + objectKey
}

func managedIdentityAssetObjectKey(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "/photos/")
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "" {
		return "", false
	}
	for _, segment := range strings.Split(trimmed, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", false
		}
	}
	cleaned := pathpkg.Clean("/" + trimmed)
	if cleaned == "/" || cleaned == "." {
		return "", false
	}
	key := strings.TrimPrefix(cleaned, "/")
	if !strings.HasPrefix(key, "tenants/") {
		return "", false
	}
	return key, true
}

func identityImageExtension(contentType, filename string, data []byte) (string, string, bool) {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	switch ct {
	case "image/png":
		return ".png", "image/png", true
	case "image/jpeg", "image/jpg":
		return ".jpg", "image/jpeg", true
	case "image/gif":
		return ".gif", "image/gif", true
	case "image/webp":
		return ".webp", "image/webp", true
	}

	switch strings.ToLower(pathpkg.Ext(filename)) {
	case ".png":
		return ".png", "image/png", true
	case ".jpg", ".jpeg":
		return ".jpg", "image/jpeg", true
	case ".gif":
		return ".gif", "image/gif", true
	case ".webp":
		return ".webp", "image/webp", true
	}

	detected := strings.ToLower(http.DetectContentType(data))
	switch detected {
	case "image/png":
		return ".png", "image/png", true
	case "image/jpeg":
		return ".jpg", "image/jpeg", true
	case "image/gif":
		return ".gif", "image/gif", true
	case "image/webp":
		return ".webp", "image/webp", true
	default:
		return "", "", false
	}
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
