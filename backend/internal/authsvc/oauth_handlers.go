package authsvc

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── API Token shape ─────────────────────────────────────────────────────────

type apiToken struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Prefix        string     `json:"prefix"`
	Scopes        []string   `json:"scopes"`
	Environment   string     `json:"environment"`
	Status        string     `json:"status"`
	RateLimitTier string     `json:"rate_limit_tier"`
	IPWhitelist   []string   `json:"ip_whitelist,omitempty"`
	LastUsedAt    *time.Time `json:"last_used_at,omitempty"`
	LastUsedIP    *string    `json:"last_used_ip,omitempty"`
	UsageCount    int64      `json:"usage_count"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type createAPITokenRequest struct {
	Name          string     `json:"name"`
	Scopes        []string   `json:"scopes"`
	IPWhitelist   []string   `json:"ip_whitelist"`
	Environment   string     `json:"environment"` // "live" | "test"
	RateLimitTier string     `json:"rate_limit_tier"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

type createAPITokenResponse struct {
	apiToken
	Token string `json:"token"` // shown ONCE
}

// ─── validate-api-key (Traefik forwardAuth callback) ─────────────────────────

// ValidateAPIKey is the public endpoint Traefik's `apikey-forwardauth`
// middleware calls for every /api/v1/public/* request. It reads X-API-Key,
// looks up the sha256 hash in oauth_api_tokens, and on match responds 200
// with X-Tenant-ID / X-Client-ID / X-Scope headers that Traefik's
// authResponseHeaders clause copies onto the upstream request.
//
// No request body is returned — only headers and status.
func (h *AuthHandlers) ValidateAPIKey(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(r.Header.Get("X-API-Key"))
	if key == "" {
		// Also allow "Authorization: Bearer dm3_live_..." as a fallback shape.
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			key = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		}
	}
	if !strings.HasPrefix(key, "dm3_live_") && !strings.HasPrefix(key, "dm3_test_") {
		httputil.Error(w, http.StatusUnauthorized, "invalid or missing api key")
		return
	}

	hash := sha256Hex(key)

	var (
		tokenID     string
		tenantID    string
		clientID    *string
		scopes      []string
		status      string
		ipWhitelist []string
		expiresAt   *time.Time
		rateTier    string
	)
	// Join oauth_api_tokens with the owning tenant so we can reject tokens
	// whose tenant has had the api_integration plugin disabled. This is the
	// kill switch: a system admin disabling the plugin for a tenant
	// immediately invalidates every token that tenant has issued, even
	// though the tokens still exist in the table.
	var pluginEnabled bool
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT t.id::text, t.tenant_id::text, t.client_id::text, t.scopes,
		        COALESCE(
		            (SELECT array_agg(host(ip)::text)
		               FROM unnest(t.ip_whitelist) AS ip),
		            '{}'::text[]
		        ) AS ip_whitelist_text,
		        t.status, t.expires_at, t.rate_limit_tier,
		        'api_integration' = ANY(tn.enabled_plugins) AS plugin_enabled
		   FROM dm3_auth.oauth_api_tokens t
		   JOIN dm3_auth.tenants tn ON tn.id = t.tenant_id
		  WHERE t.token_hash = $1
		  LIMIT 1`,
		hash,
	).Scan(&tokenID, &tenantID, &clientID, &scopes, &ipWhitelist, &status, &expiresAt, &rateTier, &pluginEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.Error(w, http.StatusUnauthorized, "api key not recognized")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "api key lookup failed")
		return
	}
	if !pluginEnabled {
		httputil.Error(w, http.StatusForbidden, "api integration is not enabled for this tenant")
		return
	}

	if status != "active" {
		httputil.Error(w, http.StatusUnauthorized, "api key is "+status)
		return
	}
	if expiresAt != nil && expiresAt.Before(time.Now()) {
		httputil.Error(w, http.StatusUnauthorized, "api key has expired")
		return
	}

	// IP whitelist enforcement (if set).
	if len(ipWhitelist) > 0 {
		caller := audit.IPFromRequest(r)
		if !ipMatches(caller, ipWhitelist) {
			httputil.Error(w, http.StatusUnauthorized, "caller ip not in whitelist")
			return
		}
	}

	// Bump usage counter async (fire-and-forget).
	go func(id, ip string) {
		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.oauth_api_tokens
			    SET last_used_at = now(),
			        last_used_ip = NULLIF($2,'')::inet,
			        usage_count = usage_count + 1
			  WHERE id = $1`, id, ip)
	}(tokenID, audit.IPFromRequest(r))

	// Populate response headers Traefik will copy to the upstream request.
	w.Header().Set("X-Tenant-ID", tenantID)
	if clientID != nil {
		w.Header().Set("X-Client-ID", *clientID)
	}
	w.Header().Set("X-Scope", strings.Join(scopes, " "))
	w.Header().Set("X-Rate-Limit-Tier", rateTier)
	w.WriteHeader(http.StatusOK)
}

func ipMatches(caller string, whitelist []string) bool {
	ip := net.ParseIP(caller)
	if ip == nil {
		return false
	}
	for _, entry := range whitelist {
		if _, cidr, err := net.ParseCIDR(entry); err == nil {
			if cidr.Contains(ip) {
				return true
			}
			continue
		}
		if net.ParseIP(entry).Equal(ip) {
			return true
		}
	}
	return false
}

// ─── API Token CRUD ──────────────────────────────────────────────────────────

// ListAPITokens returns all tokens in the caller's tenant.
func (h *AuthHandlers) ListAPITokens(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil || claims.CID == "" {
		httputil.Error(w, http.StatusUnauthorized, "no tenant in token")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id::text, name, token_prefix, scopes, environment, status,
		        rate_limit_tier, last_used_at, last_used_ip::text, usage_count,
		        expires_at, created_at
		   FROM dm3_auth.oauth_api_tokens
		  WHERE tenant_id = $1::uuid
		  ORDER BY created_at DESC`,
		claims.CID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	out := make([]apiToken, 0)
	for rows.Next() {
		var t apiToken
		var ip *string
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &t.Scopes, &t.Environment, &t.Status,
			&t.RateLimitTier, &t.LastUsedAt, &ip, &t.UsageCount, &t.ExpiresAt, &t.CreatedAt); err != nil {
			continue
		}
		t.LastUsedIP = ip
		out = append(out, t)
	}
	httputil.JSON(w, http.StatusOK, out)
}

// CreateAPIToken issues a new API token for the caller's tenant.
// The raw token is returned ONCE in the response — only the hash is stored.
func (h *AuthHandlers) CreateAPIToken(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil || claims.CID == "" || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createAPITokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Environment == "" {
		req.Environment = "live"
	}
	if req.Environment != "live" && req.Environment != "test" {
		httputil.Error(w, http.StatusBadRequest, "environment must be live or test")
		return
	}
	if req.RateLimitTier == "" {
		req.RateLimitTier = "standard"
	}

	// Generate a 32-byte random secret. Encoded as base64url (43 chars).
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "random source unavailable")
		return
	}
	secret := base64.RawURLEncoding.EncodeToString(buf)
	raw := "dm3_" + req.Environment + "_" + secret
	// Prefix stored for identification: first 16 chars of the raw token
	// (dm3_live_<first 7 of secret>).
	prefix := raw
	if len(prefix) > 16 {
		prefix = prefix[:16]
	}
	hash := sha256Hex(raw)

	// Normalize ip_whitelist to NULL if empty so we don't store an empty array.
	var ipWhitelist interface{}
	if len(req.IPWhitelist) == 0 {
		ipWhitelist = nil
	} else {
		ipWhitelist = req.IPWhitelist
	}

	var id string
	var createdAt time.Time
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.oauth_api_tokens
		    (tenant_id, account_id, name, token_prefix, token_hash, scopes,
		     ip_whitelist, rate_limit_tier, environment, expires_at)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::inet[], $8, $9, $10)
		 RETURNING id::text, created_at`,
		claims.CID, claims.Sub, req.Name, prefix, hash, req.Scopes,
		ipWhitelist, req.RateLimitTier, req.Environment, req.ExpiresAt,
	).Scan(&id, &createdAt)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create api token: "+err.Error())
		return
	}

	h.audit.LogFromRequest(r, "auth.api_token.created", "api_token", id, req.Name, "success", nil,
		map[string]any{"scopes": req.Scopes, "environment": req.Environment})

	httputil.JSON(w, http.StatusCreated, createAPITokenResponse{
		apiToken: apiToken{
			ID:            id,
			Name:          req.Name,
			Prefix:        prefix,
			Scopes:        req.Scopes,
			Environment:   req.Environment,
			Status:        "active",
			RateLimitTier: req.RateLimitTier,
			IPWhitelist:   req.IPWhitelist,
			ExpiresAt:     req.ExpiresAt,
			CreatedAt:     createdAt,
		},
		Token: raw,
	})
}

// RevokeAPIToken marks a token as revoked. The raw token is unusable after this.
func (h *AuthHandlers) RevokeAPIToken(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil || claims.CID == "" {
		httputil.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "token id required")
		return
	}

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.oauth_api_tokens
		    SET status = 'revoked',
		        revoked_at = now(),
		        revoked_by = $3::uuid
		  WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
		id, claims.CID, claims.Sub)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "revoke failed")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "token not found or already revoked")
		return
	}

	h.audit.LogFromRequest(r, "auth.api_token.revoked", "api_token", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ─── OAuth Client CRUD ───────────────────────────────────────────────────────

type oauthClient struct {
	ID            string    `json:"id"`
	TenantID      *string   `json:"tenant_id,omitempty"`
	ClientID      string    `json:"client_id"`
	Name          string    `json:"name"`
	Description   string    `json:"description,omitempty"`
	RedirectURIs  []string  `json:"redirect_uris"`
	GrantTypes    []string  `json:"grant_types"`
	Scopes        []string  `json:"scopes"`
	RateLimitTier string    `json:"rate_limit_tier"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

type createOAuthClientRequest struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	RedirectURIs  []string `json:"redirect_uris"`
	GrantTypes    []string `json:"grant_types"`
	Scopes        []string `json:"scopes"`
	RateLimitTier string   `json:"rate_limit_tier"`
	TenantID      string   `json:"tenant_id"` // system_admin only; else implicit from JWT
}

type createOAuthClientResponse struct {
	oauthClient
	ClientSecret string `json:"client_secret"` // shown ONCE
}

// ListOAuthClients lists OAuth2 clients. system_admin sees all; others see
// only their tenant's clients.
func (h *AuthHandlers) ListOAuthClients(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var (
		rows pgx.Rows
		err  error
	)
	if claims.Role == "system_admin" {
		rows, err = h.db.Pool.Query(r.Context(),
			`SELECT id::text, tenant_id::text, client_id, name, COALESCE(description,''),
			        redirect_uris, grant_types, scopes, rate_limit_tier, status, created_at
			   FROM dm3_auth.oauth_clients
			  ORDER BY created_at DESC`)
	} else {
		if claims.CID == "" {
			httputil.Error(w, http.StatusForbidden, "no tenant in token")
			return
		}
		rows, err = h.db.Pool.Query(r.Context(),
			`SELECT id::text, tenant_id::text, client_id, name, COALESCE(description,''),
			        redirect_uris, grant_types, scopes, rate_limit_tier, status, created_at
			   FROM dm3_auth.oauth_clients
			  WHERE tenant_id = $1::uuid
			  ORDER BY created_at DESC`, claims.CID)
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	out := make([]oauthClient, 0)
	for rows.Next() {
		var c oauthClient
		var tid *string
		if err := rows.Scan(&c.ID, &tid, &c.ClientID, &c.Name, &c.Description,
			&c.RedirectURIs, &c.GrantTypes, &c.Scopes, &c.RateLimitTier, &c.Status, &c.CreatedAt); err != nil {
			continue
		}
		c.TenantID = tid
		out = append(out, c)
	}
	httputil.JSON(w, http.StatusOK, out)
}

// CreateOAuthClient creates a new OAuth2 client. client_secret is shown ONCE.
func (h *AuthHandlers) CreateOAuthClient(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createOAuthClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(req.GrantTypes) == 0 {
		req.GrantTypes = []string{"client_credentials"}
	}
	if req.RateLimitTier == "" {
		req.RateLimitTier = "standard"
	}

	// Determine target tenant.
	var tenantID interface{}
	if claims.Role == "system_admin" {
		if req.TenantID != "" {
			tenantID = req.TenantID
		} else {
			tenantID = nil // system-wide client
		}
	} else {
		if claims.CID == "" {
			httputil.Error(w, http.StatusForbidden, "no tenant in token")
			return
		}
		tenantID = claims.CID
	}

	// Generate client_id (opaque, 24 chars) and client_secret (32 bytes b64url).
	clientIDBuf := make([]byte, 18)
	if _, err := rand.Read(clientIDBuf); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "random source unavailable")
		return
	}
	clientID := "dm3c_" + base64.RawURLEncoding.EncodeToString(clientIDBuf)
	secretBuf := make([]byte, 32)
	if _, err := rand.Read(secretBuf); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "random source unavailable")
		return
	}
	clientSecret := base64.RawURLEncoding.EncodeToString(secretBuf)
	secretHash, err := bcrypt.GenerateFromPassword([]byte(clientSecret), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "hash failed")
		return
	}

	var id string
	var createdAt time.Time
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.oauth_clients
		    (tenant_id, client_id, client_secret_hash, name, description,
		     redirect_uris, grant_types, scopes, rate_limit_tier, created_by)
		 VALUES (CASE WHEN $1::text IS NULL THEN NULL ELSE $1::uuid END,
		         $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
		 RETURNING id::text, created_at`,
		tenantID, clientID, string(secretHash), req.Name, req.Description,
		req.RedirectURIs, req.GrantTypes, req.Scopes, req.RateLimitTier, claims.Sub,
	).Scan(&id, &createdAt)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create client: "+err.Error())
		return
	}

	h.audit.LogFromRequest(r, "auth.oauth_client.created", "oauth_client", id, req.Name, "success", nil,
		map[string]any{"grant_types": req.GrantTypes, "scopes": req.Scopes})

	var tidOut *string
	if s, ok := tenantID.(string); ok {
		tidOut = &s
	}
	httputil.JSON(w, http.StatusCreated, createOAuthClientResponse{
		oauthClient: oauthClient{
			ID:            id,
			TenantID:      tidOut,
			ClientID:      clientID,
			Name:          req.Name,
			Description:   req.Description,
			RedirectURIs:  req.RedirectURIs,
			GrantTypes:    req.GrantTypes,
			Scopes:        req.Scopes,
			RateLimitTier: req.RateLimitTier,
			Status:        "active",
			CreatedAt:     createdAt,
		},
		ClientSecret: clientSecret,
	})
}

// RevokeOAuthClient marks a client as revoked and invalidates all tokens
// issued by it (status = 'revoked').
func (h *AuthHandlers) RevokeOAuthClient(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "client id required")
		return
	}

	// Tenant scoping: non-system_admin can only touch their tenant's clients.
	var rowsAffected int64
	if claims.Role == "system_admin" {
		tag, err := h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.oauth_clients
			    SET status = 'revoked', revoked_at = now()
			  WHERE id = $1::uuid AND status = 'active'`, id)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "revoke failed")
			return
		}
		rowsAffected = tag.RowsAffected()
	} else {
		if claims.CID == "" {
			httputil.Error(w, http.StatusForbidden, "no tenant in token")
			return
		}
		tag, err := h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_auth.oauth_clients
			    SET status = 'revoked', revoked_at = now()
			  WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
			id, claims.CID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "revoke failed")
			return
		}
		rowsAffected = tag.RowsAffected()
	}
	if rowsAffected == 0 {
		httputil.Error(w, http.StatusNotFound, "client not found or already revoked")
		return
	}

	// Cascade: revoke all API tokens issued by this client.
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.oauth_api_tokens
		    SET status = 'revoked', revoked_at = now(), revoke_reason = 'parent client revoked'
		  WHERE client_id = $1::uuid AND status = 'active'`, id)

	h.audit.LogFromRequest(r, "auth.oauth_client.revoked", "oauth_client", id, "", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ─── OAuth2 Token Endpoint (POST /api/v1/auth/token) ─────────────────────────

type tokenRequest struct {
	GrantType    string `json:"grant_type"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	RefreshToken string `json:"refresh_token"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Scope        string `json:"scope"`
	TenantID     string `json:"tenant_id"`
}

type oauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// Token is the OAuth2 token endpoint. Accepts form-encoded or JSON body.
// Grants supported: client_credentials, password (delegates to Login logic).
// Device code and authorization_code are defined in the spec but not yet
// implemented — they return 400 invalid_grant so clients fail fast.
func (h *AuthHandlers) Token(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest

	// Support both application/x-www-form-urlencoded (RFC 6749 default) and JSON.
	ctype := r.Header.Get("Content-Type")
	switch {
	case strings.HasPrefix(ctype, "application/x-www-form-urlencoded"):
		if err := r.ParseForm(); err != nil {
			oauthError(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		req.GrantType = r.FormValue("grant_type")
		req.Username = r.FormValue("username")
		req.Password = r.FormValue("password")
		req.RefreshToken = r.FormValue("refresh_token")
		req.ClientID = r.FormValue("client_id")
		req.ClientSecret = r.FormValue("client_secret")
		req.Scope = r.FormValue("scope")
		req.TenantID = r.FormValue("tenant_id")
	default:
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			oauthError(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
	}

	// Fall back to HTTP Basic auth for client credentials (RFC 6749 §2.3.1).
	if req.ClientID == "" {
		if cid, csec, ok := r.BasicAuth(); ok {
			req.ClientID = cid
			req.ClientSecret = csec
		}
	}

	switch req.GrantType {
	case "client_credentials":
		h.tokenClientCredentials(w, r, req)
	case "password":
		// Password grant is not implemented in-place yet. Clients should
		// continue to use POST /api/v1/auth/login (two-step) until this
		// grant is wired to the same code path. We return a clear error
		// rather than silently falling back.
		oauthError(w, http.StatusBadRequest, "unsupported_grant_type",
			"password grant is not yet available; use POST /api/v1/auth/login")
	case "refresh_token":
		oauthError(w, http.StatusBadRequest, "unsupported_grant_type",
			"refresh_token grant not yet wired to /token; use POST /api/v1/auth/refresh")
	case "urn:ietf:params:oauth:grant-type:device_code":
		oauthError(w, http.StatusBadRequest, "authorization_pending",
			"device code flow is not yet implemented")
	case "":
		oauthError(w, http.StatusBadRequest, "invalid_request", "grant_type is required")
	default:
		oauthError(w, http.StatusBadRequest, "unsupported_grant_type", "unknown grant_type: "+req.GrantType)
	}
}

// tokenClientCredentials verifies the client credentials and issues a short
// JWT access token scoped to the client's tenant.
func (h *AuthHandlers) tokenClientCredentials(w http.ResponseWriter, r *http.Request, req tokenRequest) {
	if req.ClientID == "" || req.ClientSecret == "" {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "client_id and client_secret required")
		return
	}

	var (
		id           string
		tenantID     *string
		secretHash   string
		grantTypes   []string
		scopes       []string
		status       string
	)
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id::text, tenant_id::text, client_secret_hash, grant_types, scopes, status
		   FROM dm3_auth.oauth_clients
		  WHERE client_id = $1
		  LIMIT 1`,
		req.ClientID,
	).Scan(&id, &tenantID, &secretHash, &grantTypes, &scopes, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "unknown client")
		return
	}
	if err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "client lookup failed")
		return
	}
	if status != "active" {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "client is "+status)
		return
	}
	if !containsStr(grantTypes, "client_credentials") {
		oauthError(w, http.StatusBadRequest, "unauthorized_client", "client_credentials not allowed for this client")
		return
	}
	// Tenant-scoped clients are gated on the api_integration plugin. System-wide
	// clients (tenant_id NULL) are managed by system_admin and aren't gated.
	if tenantID != nil {
		var pluginEnabled bool
		if err := h.db.Pool.QueryRow(r.Context(),
			`SELECT 'api_integration' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
			*tenantID).Scan(&pluginEnabled); err != nil || !pluginEnabled {
			oauthError(w, http.StatusForbidden, "access_denied", "api integration is not enabled for this tenant")
			return
		}
	}
	if bcrypt.CompareHashAndPassword([]byte(secretHash), []byte(req.ClientSecret)) != nil {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "bad client secret")
		return
	}

	// Validate requested scopes against client's allowed scopes.
	requested := strings.Fields(req.Scope)
	if len(requested) > 0 {
		for _, rs := range requested {
			if !containsStr(scopes, rs) {
				oauthError(w, http.StatusBadRequest, "invalid_scope", "scope not allowed: "+rs)
				return
			}
		}
		scopes = requested
	}

	// Issue a 1-hour access token impersonating the client.
	tid := ""
	if tenantID != nil {
		tid = *tenantID
	}
	sub := "client:" + req.ClientID
	access, err := h.generateAccessToken(sub, tid, req.ClientID, req.ClientID,
		[]string{}, tid, "", nil, "", nil)
	if err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "token signing failed")
		return
	}

	h.audit.Log(audit.Entry{
		TenantID:   tid,
		ActorEmail: req.ClientID,
		ActorIP:    audit.IPFromRequest(r),
		Action:     "auth.token.issued",
		EntityType: "oauth_client",
		EntityID:   id,
		EntityName: req.ClientID,
		Status:     "success",
		NewValues:  map[string]any{"grant": "client_credentials", "scopes": scopes},
	})

	httputil.JSON(w, http.StatusOK, oauthTokenResponse{
		AccessToken: access,
		TokenType:   "Bearer",
		ExpiresIn:   900, // 15 min, matches generateAccessToken
		Scope:       strings.Join(scopes, " "),
	})
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func containsStr(haystack []string, needle string) bool {
	for _, s := range haystack {
		if subtle.ConstantTimeCompare([]byte(s), []byte(needle)) == 1 {
			return true
		}
	}
	return false
}

// oauthError writes an RFC 6749 §5.2 error response.
func oauthError(w http.ResponseWriter, status int, code, description string) {
	httputil.JSON(w, status, map[string]string{
		"error":             code,
		"error_description": description,
	})
}
