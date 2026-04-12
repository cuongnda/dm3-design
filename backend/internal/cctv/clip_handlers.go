package cctv

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ClipSigner abstracts object-storage URL signing.
// A no-op default returns the object_key as a relative path.
// Use ObjectStoreClipSigner (clip_signer.go) for real MinIO presigned URLs.
type ClipSigner interface {
	Sign(ctx interface{}, objectKey string) (string, error)
}

// noopClipSigner returns the object_key unchanged.
type noopClipSigner struct{}

func (noopClipSigner) Sign(_ interface{}, objectKey string) (string, error) {
	return objectKey, nil
}

// DefaultClipSigner is the no-op signer used when no object store is configured.
var DefaultClipSigner ClipSigner = noopClipSigner{}

// ListClips handles GET /clips
// Supports: ?camera_id=, ?access_event_id=, ?from=, ?to=, ?page=, ?limit=
func (h *CCTVHandlers) ListClips(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	q := r.URL.Query()
	cameraID := q.Get("camera_id")
	accessEventID := q.Get("access_event_id")
	from := q.Get("from")
	to := q.Get("to")

	args := []any{cid}
	conditions := []string{"tenant_id = $1::uuid"}
	argIdx := 2

	if cameraID != "" {
		conditions = append(conditions, "device_id = $"+itoa(argIdx)+"::uuid")
		args = append(args, cameraID)
		argIdx++
	}
	if accessEventID != "" {
		conditions = append(conditions, "access_event_id = $"+itoa(argIdx)+"::uuid")
		args = append(args, accessEventID)
		argIdx++
	}
	if from != "" {
		conditions = append(conditions, "started_at >= $"+itoa(argIdx)+"::timestamptz")
		args = append(args, from)
		argIdx++
	}
	if to != "" {
		conditions = append(conditions, "started_at <= $"+itoa(argIdx)+"::timestamptz")
		args = append(args, to)
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")

	var total int64
	if err := h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_cctv.event_clips "+where, args...,
	).Scan(&total); err != nil {
		logInternalError(w, "list clips count error", err)
		return
	}

	listArgs := append(args, limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, tenant_id, device_id, access_event_id, started_at, ended_at, duration_ms, object_key, trigger, created_at
		FROM dm3_cctv.event_clips `+where+`
		ORDER BY started_at DESC
		LIMIT $`+itoa(argIdx)+` OFFSET $`+itoa(argIdx+1), listArgs...)
	if err != nil {
		logInternalError(w, "list clips query error", err)
		return
	}
	defer rows.Close()

	clips := make([]EventClip, 0)
	for rows.Next() {
		clip, err := scanClip(rows)
		if err != nil {
			logInternalError(w, "list clips scan error", err)
			return
		}
		clips = append(clips, clip)
	}

	httputil.Paginated(w, clips, total, page, limit)
}

// GetClip handles GET /clips/{id}
func (h *CCTVHandlers) GetClip(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	clip, err := h.fetchClip(r, cid, id)
	if err != nil {
		if err == pgx.ErrNoRows {
			httputil.Error(w, http.StatusNotFound, "clip not found")
			return
		}
		logInternalError(w, "get clip error", err)
		return
	}
	httputil.JSON(w, http.StatusOK, clip)
}

// CreateClip handles POST /clips
// Body: {device_id, started_at, ended_at, object_key, access_event_id?, trigger?}
func (h *CCTVHandlers) CreateClip(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	var req struct {
		DeviceID      string  `json:"device_id"`
		StartedAt     string  `json:"started_at"`
		EndedAt       *string `json:"ended_at"`
		ObjectKey     string  `json:"object_key"`
		AccessEventID *string `json:"access_event_id"`
		Trigger       *string `json:"trigger"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		httputil.Error(w, http.StatusBadRequest, "device_id is required")
		return
	}
	if strings.TrimSpace(req.StartedAt) == "" {
		httputil.Error(w, http.StatusBadRequest, "started_at is required")
		return
	}
	if strings.TrimSpace(req.ObjectKey) == "" {
		httputil.Error(w, http.StatusBadRequest, "object_key is required")
		return
	}

	trigger := "manual"
	if req.Trigger != nil && *req.Trigger != "" {
		trigger = *req.Trigger
	}

	var clip EventClip
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_cctv.event_clips (tenant_id, device_id, access_event_id, started_at, ended_at, object_key, trigger)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, $6, $7)
		RETURNING id, tenant_id, device_id, access_event_id, started_at, ended_at, duration_ms, object_key, trigger, created_at`,
		cid, req.DeviceID, req.AccessEventID, req.StartedAt, req.EndedAt, req.ObjectKey, trigger,
	).Scan(&clip.ID, &clip.TenantID, &clip.DeviceID, &clip.AccessEventID,
		&clip.StartedAt, &clip.EndedAt, &clip.DurationMs, &clip.ObjectKey, &clip.Trigger, &clip.CreatedAt)
	if err != nil {
		logInternalError(w, "create clip error", err)
		return
	}

	h.audit.LogFromRequest(r, "cctv.clip.create", "event_clip", clip.ID, clip.ObjectKey, "success", nil, map[string]any{
		"device_id": clip.DeviceID,
		"trigger":   clip.Trigger,
	})
	httputil.JSON(w, http.StatusCreated, clip)
}

// DeleteClip handles DELETE /clips/{id}
// Note: does NOT delete the MinIO object — that is the retention worker's responsibility.
// The RetentionWorker (cron.go) sweeps expired clips from object storage on a schedule.
func (h *CCTVHandlers) DeleteClip(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	var objectKey string
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT object_key FROM dm3_cctv.event_clips WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid).Scan(&objectKey)

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_cctv.event_clips WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, cid)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "clip not found")
		return
	}

	h.audit.LogFromRequest(r, "cctv.clip.delete", "event_clip", id, objectKey, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// GetClipPlayback handles GET /clips/{id}/playback
// Returns a presigned GET URL for the clip's object key, valid for 5 minutes.
// Falls back to returning the object_key unchanged when no signer is configured.
func (h *CCTVHandlers) GetClipPlayback(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	clip, err := h.fetchClip(r, cid, id)
	if err != nil {
		if err == pgx.ErrNoRows {
			httputil.Error(w, http.StatusNotFound, "clip not found")
			return
		}
		logInternalError(w, "get clip playback error", err)
		return
	}

	playbackURL, err := h.signer.Sign(r.Context(), clip.ObjectKey)
	if err != nil {
		logInternalError(w, "sign clip playback url error", err)
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"playback_url": playbackURL,
		"started_at":   clip.StartedAt,
		"ended_at":     clip.EndedAt,
		"duration_ms":  clip.DurationMs,
	})
}

// fetchClip retrieves a single EventClip by id, scoped to tenant.
func (h *CCTVHandlers) fetchClip(r *http.Request, tenantID, clipID string) (EventClip, error) {
	row := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, tenant_id, device_id, access_event_id, started_at, ended_at, duration_ms, object_key, trigger, created_at
		FROM dm3_cctv.event_clips
		WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		clipID, tenantID,
	)
	return scanClip(row)
}

func scanClip(row scannable) (EventClip, error) {
	var clip EventClip
	err := row.Scan(
		&clip.ID, &clip.TenantID, &clip.DeviceID, &clip.AccessEventID,
		&clip.StartedAt, &clip.EndedAt, &clip.DurationMs, &clip.ObjectKey, &clip.Trigger, &clip.CreatedAt,
	)
	return clip, err
}

// itoa converts an int to string for SQL placeholder building.
func itoa(i int) string {
	return strconv.Itoa(i)
}
