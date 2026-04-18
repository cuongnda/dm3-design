package visitor

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

func (h *VisitorHandlers) ListWatchlist(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	where := "WHERE tenant_id = $1::uuid"
	args := []any{cid}
	idx := 2

	if et := r.URL.Query().Get("entry_type"); et != "" {
		where += fmt.Sprintf(" AND entry_type = $%d", idx)
		args = append(args, et)
		idx++
	}

	countArgs := append([]any(nil), args...)
	var total int64
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_visitor.watchlist "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, tenant_id, entry_type, match_field, match_value,
		       face_template_ref, reason, added_by, expires_at, created_at
		FROM dm3_visitor.watchlist %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list watchlist query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	entries := []WatchlistEntry{}
	for rows.Next() {
		var e WatchlistEntry
		if err := rows.Scan(&e.ID, &e.TenantID, &e.EntryType, &e.MatchField, &e.MatchValue, &e.FaceTemplateRef, &e.Reason, &e.AddedBy, &e.ExpiresAt, &e.CreatedAt); err != nil {
			slog.Error("list watchlist scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.Paginated(w, entries, total, page, limit)
}

type createWatchlistRequest struct {
	EntryType       string     `json:"entry_type"`
	MatchField      string     `json:"match_field"`
	MatchValue      string     `json:"match_value"`
	FaceTemplateRef *string    `json:"face_template_ref"`
	Reason          string     `json:"reason"`
	ExpiresAt       *time.Time `json:"expires_at"`
}

func (h *VisitorHandlers) CreateWatchlistEntry(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireWatchlistAdmin(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req createWatchlistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EntryType == "" || req.MatchField == "" || req.MatchValue == "" || req.Reason == "" {
		httputil.Error(w, http.StatusBadRequest, "entry_type, match_field, match_value, and reason are required")
		return
	}
	if req.EntryType != WatchlistVIP && req.EntryType != WatchlistBlacklisted {
		httputil.Error(w, http.StatusBadRequest, "invalid entry_type")
		return
	}

	addedBy := "system"
	if claims := authsvc.ClaimsFromContext(r.Context()); claims != nil && claims.Sub != "" {
		addedBy = claims.Sub
	}

	var entry WatchlistEntry
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.watchlist
		  (tenant_id, entry_type, match_field, match_value, face_template_ref, reason, added_by, expires_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8)
		RETURNING id, tenant_id, entry_type, match_field, match_value, face_template_ref, reason, added_by, expires_at, created_at`,
		cid, req.EntryType, req.MatchField, req.MatchValue, req.FaceTemplateRef, req.Reason, addedBy, req.ExpiresAt,
	).Scan(&entry.ID, &entry.TenantID, &entry.EntryType, &entry.MatchField, &entry.MatchValue, &entry.FaceTemplateRef, &entry.Reason, &entry.AddedBy, &entry.ExpiresAt, &entry.CreatedAt)
	if err != nil {
		slog.Error("create watchlist entry error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "watchlist.added", "watchlist", entry.ID, req.MatchValue, "success", nil, entry)
	}
	httputil.JSON(w, http.StatusCreated, entry)
}

func (h *VisitorHandlers) DeleteWatchlistEntry(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireWatchlistAdmin(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id := chi.URLParam(r, "id")

	tag, err := h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_visitor.watchlist WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, cid)
	if err != nil {
		slog.Error("delete watchlist entry error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "watchlist entry not found")
		return
	}
	if h.audit != nil {
		h.audit.LogFromRequest(r, "watchlist.removed", "watchlist", id, "", "success", nil, nil)
	}
	w.WriteHeader(http.StatusNoContent)
}
