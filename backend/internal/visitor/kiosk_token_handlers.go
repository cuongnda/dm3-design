package visitor

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// kioskTokenDTO is the public-facing shape of a kiosk token row. The cleartext
// `token` is only ever set on the create response — list and get calls hide it.
type kioskTokenDTO struct {
	ID         string     `json:"id"`
	TenantID   string     `json:"tenant_id"`
	Name       string     `json:"name"`
	Token      string     `json:"token,omitempty"` // populated only on create
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}

type createKioskTokenRequest struct {
	Name string `json:"name"`
}

// CreateKioskToken mints a new long-lived bearer token for a kiosk (e.g. the
// LPR desktop app) to call /api/v1/visitors/legacy-register. The cleartext
// token is returned in the HTTP response once; only the SHA-256 hash is
// stored. Admins who lose the token must create a new one and revoke the old.
func (h *VisitorHandlers) CreateKioskToken(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req createKioskTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	clear, err := generateKioskToken()
	if err != nil {
		slog.Error("kiosk token: generate failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	hash := hashKioskToken(clear)

	claims := authsvc.ClaimsFromContext(r.Context())
	var createdBy *string
	if claims != nil && claims.Sub != "" {
		sub := claims.Sub
		createdBy = &sub
	}

	var (
		id        string
		createdAt time.Time
	)
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_auth.kiosk_tokens (tenant_id, name, token_hash, created_by)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id::text, created_at
	`, cid, req.Name, hash, createdBy).Scan(&id, &createdAt)
	if err != nil {
		slog.Error("kiosk token: insert failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create kiosk token")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "visitor.kiosk_token.created", "kiosk_token", id, req.Name, "success", nil,
			map[string]any{"name": req.Name})
	}

	httputil.JSON(w, http.StatusCreated, kioskTokenDTO{
		ID:        id,
		TenantID:  cid,
		Name:      req.Name,
		Token:     clear, // visible exactly once
		CreatedAt: createdAt,
	})
}

// ListKioskTokens returns the set of kiosk tokens for the tenant. The
// cleartext is never included — just metadata.
func (h *VisitorHandlers) ListKioskTokens(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id::text, name, created_at, last_used_at, revoked_at
		FROM dm3_auth.kiosk_tokens
		WHERE tenant_id = $1::uuid
		ORDER BY created_at DESC
	`, cid)
	if err != nil {
		slog.Error("kiosk token: list failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list kiosk tokens")
		return
	}
	defer rows.Close()

	out := []kioskTokenDTO{}
	for rows.Next() {
		var t kioskTokenDTO
		t.TenantID = cid
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt, &t.LastUsedAt, &t.RevokedAt); err != nil {
			slog.Warn("kiosk token: scan failed", "error", err)
			continue
		}
		out = append(out, t)
	}
	httputil.JSON(w, http.StatusOK, out)
}

// RevokeKioskToken disables a token by setting revoked_at. The row is kept
// so audit trails remain resolvable.
func (h *VisitorHandlers) RevokeKioskToken(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "id is required")
		return
	}

	var name string
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_auth.kiosk_tokens
		   SET revoked_at = COALESCE(revoked_at, now())
		 WHERE id = $1::uuid AND tenant_id = $2::uuid
		 RETURNING name
	`, id, cid).Scan(&name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "kiosk token not found")
			return
		}
		slog.Error("kiosk token: revoke failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to revoke kiosk token")
		return
	}

	if h.audit != nil {
		h.audit.LogFromRequest(r, "visitor.kiosk_token.revoked", "kiosk_token", id, name, "success", nil, nil)
	}

	w.WriteHeader(http.StatusNoContent)
}
