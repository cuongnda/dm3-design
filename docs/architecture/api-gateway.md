# API Gateway

**Status:** In place for local + staging. TLS termination still on nginx.
**Owner:** Platform
**Last updated:** 2026-04-20

## Role

Traefik is DM3's internal API gateway. It sits between nginx (edge) and the
nine backend services, and owns:

- per-route-family **rate limiting** (auth, CRUD, reads, public)
- **CORS** for the API plane
- **security headers** (X-Content-Type-Options, Referrer-Policy, frame-deny, Permissions-Policy)
- **request-ID** propagation (`X-Gateway: traefik`)
- **API-key** gate for `/api/v1/public/*` (third-party integration plane) — stubbed until OAuth2 ships

nginx keeps three jobs: SPA serving, static-asset proxy (`/photos/`, `/assets/tenants/`, `/assets/`), and MediaMTX streams (`/cctv/whep/`, `/cctv/hls/`). Everything under `/api/v1/*` and `/ws/*` flows through Traefik.

```
Browser
  │
  ▼  :3000
┌──────────────┐     /              → webapp (SPA)
│    nginx     │     /assets/*      → webapp
│  (edge)      │     /photos/*      → identity-svc
│              │     /assets/tenants/ → access-svc
│              │     /cctv/whep/*   → mediamtx
│              │     /cctv/hls/*    → mediamtx
└──────────────┘
  │
  ▼  /api/v1/* and /ws/*
┌──────────────┐
│   traefik    │     file-provider routing
│  (gateway)   │     rate-limit, CORS, headers, API-key
└──────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ auth / identity / access / device-gateway / audit /     │
│ visitor / parking / cctv / attend                       │
└─────────────────────────────────────────────────────────┘
```

## Configuration layout

```
deploy/traefik/
├── traefik.yml                # static config (entrypoints, providers, logging)
└── dynamic/
    ├── routers.yml            # path → middleware chain → service
    ├── middlewares.yml        # rate-limits, CORS, headers, API-key forwardAuth
    └── services.yml           # upstream registry (one entry per backend)
```

Traefik watches the `dynamic/` directory and hot-reloads — no container restart needed to change rate limits or add routes.

## Route map

| Path prefix | Service | Rate limit (per IP) | Notes |
|---|---|---|---|
| `/api/v1/auth/*` | auth-svc | 20/min, burst 10 | login + token refresh — tight to cap brute-force |
| `/api/v1/rbac/*` | auth-svc | 120/min, burst 60 | company roles, permissions, assignments |
| `/api/v1/identity/*` | identity-svc | 120/min, burst 60 | users, companies, departments |
| `/api/v1/access/*` | access-svc | 120/min, burst 60 | rules, points, events |
| `/api/v1/gateway/*` | device-gateway | 120/min, burst 60 | provisioning, commands, firmware |
| `/api/v1/audit/*` | audit-svc | 60/min, burst 30 | log reads |
| `/api/v1/visitors/*` | visitor-svc | 120/min, burst 60 | plugin-gated |
| `/api/v1/parking/*` | parking-svc | 120/min, burst 60 | plugin-gated |
| `/api/v1/attendance/*` | attend-svc | 120/min, burst 60 | plugin-gated |
| `/api/v1/cctv/cameras/{id}/test-connection` | cctv-svc | **6/min, burst 3** | credential-probe abuse vector |
| `/api/v1/cctv/*` | cctv-svc | 60/min, burst 30 | lists + clips — plugin-gated |
| `/ws/*` | device-gateway | none | WebSocket; auto-upgrade |
| `/api/v1/public/*` | (api-key → strip prefix → service) | 60/min, burst 30 | **third-party plane — stub, see below** |

## Rate-limit policy

Tokens are per-IP (`X-Forwarded-For` depth 1 — trusts one hop from nginx, no further). Tuning guidance:

- **Auth is tight.** 20/min lets humans retype a password but kills credential-stuffing.
- **CCTV test-connection matches legacy nginx** (6/min). Stays at that value because it's a credential probe against RTSP cameras.
- **CRUD is generous** (120/min). The Console batch-loads a lot on page entry; 60/min causes false positives.
- **Reads are moderate** (60/min). Audit and CCTV listings are read-heavy; enforcement is defense-in-depth only.

When a tenant abuses these, the right lever is the **API token** quota (per-key), not the per-IP gateway cap. That lands with OAuth2 (Option 1).

## API-key plane (stub)

`/api/v1/public/*` is the entry path for third-party integrations. The gateway runs three middlewares in order:

1. `ratelimit-public` — 60/min/IP
2. `apikey-forwardauth` — forwards `X-API-Key` to `auth-svc /api/v1/auth/validate-api-key`
3. `strip-public-prefix` — rewrites `/api/v1/public/foo` → `/api/v1/foo` before the service sees it

Today `auth-svc` does **not** implement `/validate-api-key`, so every request gets 401. This is deliberate — the URL contract is stable, clients can be pointed at `/api/v1/public/*` in integration docs, and turning on OAuth2 flips the auth plane without a URL change.

### When OAuth2 lands (Option 1)

`validate-api-key` will:

- look up the `X-API-Key` hash in `dm3_auth.oauth_api_tokens`
- check scope against the request path (e.g., `identity.user.read`)
- enforce per-key rate limits (quota beyond the gateway's IP cap)
- return `X-Tenant-ID`, `X-Client-ID`, `X-Scope` headers for downstream services

The gateway already captures those response headers (`authResponseHeaders` in `middlewares.yml`), so no gateway change is needed when that endpoint ships.

## CORS

Local dev allows `localhost:*` and `127.0.0.1:*`. Production tightens to the real Console origin(s) by editing `accessControlAllowOriginListRegex` in `middlewares.yml`. Because the gateway owns CORS, we don't duplicate it at the service layer.

## Health + observability

- Traefik dashboard: `http://localhost:8080` (dev only; bound to `127.0.0.1`)
- Ping endpoint: `http://localhost:8080/ping` (used by docker healthcheck)
- Access logs: JSON format, fields include `X-Request-ID`, `X-Forwarded-For`, `X-Real-IP`
- Service logs: each request carries the same `X-Request-ID` — trace end-to-end by grep

## Operational notes

- **Adding a route:** edit `routers.yml` and `services.yml`, save — no restart.
- **Tuning rate limits:** edit `middlewares.yml`, save — takes effect on next request.
- **Adding a service:** register in `services.yml`, add router in `routers.yml`, add `depends_on` to Traefik in `docker-compose.local.yml`.
- **WebSocket upgrade:** Traefik v3 handles this automatically; no `Upgrade/Connection` shim needed.
- **Client max body size:** enforced at nginx (200M) then passed through. Each service enforces its own ceiling.

## Not in this pass

- TLS / ACME (nginx still terminates in prod)
- API token validation logic (stubbed — see Option 1)
- OAuth2 grants (password, client_credentials, device_code) — see `docs/specs/platform/auth.md`
- SSO (SAML 2.0 / OIDC)
- Per-tenant quotas — needs OAuth2 tokens first

## Prior art

This replaces the per-route nginx proxies under `/api/v1/*` in `deploy/nginx/nginx.local.conf` (pre-2026-04-20). The legacy `limit_req_zone cctv_test` is now `ratelimit-cctv-test` in Traefik. The CORS map is now `cors` middleware. Nothing else in nginx changed.

See also:
- `docs/architecture/tech-stack.md` — Traefik was the chosen gateway tool
- `docs/specs/platform/auth.md` — OAuth2 spec that will fill in the API-key stub
- `docs/IMPLEMENTATION_STATUS.md` — roadmap for the rest of the auth plane
