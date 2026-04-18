# Feature: Authentication & Authorization

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: **Implementing** | Owner: Platform Team
> Updated: 2026-04-18 — RBAC canonicalized into company-rbac.md

## Current Implementation (v1)

The v1 auth system is a lightweight Go service (auth-svc) with:
- **JWT access tokens** (15min, HS256) + **refresh tokens** (7d, stored in DB with rotation + replay detection)
- **Company-scoped users** — every user belongs to a Company (except system_admin)
- **Role-based access**: see canonical role model in `docs/specs/platform/company-rbac.md`
- **Device tokens** for MQTT authentication (24h, scoped to company + device)
- **bcrypt** password hashing
- No Keycloak dependency yet (planned for v2 SSO/MFA)

### JWT Access Token Claims (v1)
```json
{
  "sub": "user-uuid",
  "cid": "company-uuid",        // null for system_admin
  "email": "user@company.com",
  "name": "User Name",
  "role": "primary_manager",
  "exp": 1740000000,
  "iat": 1739900000
}
```

Canonical role definitions and migration rules now live in `docs/specs/platform/company-rbac.md`.

### Device JWT Claims (v1)
```json
{
  "sub": "device:000001",
  "cid": "company-uuid",
  "did": "000001",
  "dtype": "terminal",
  "permissions": ["pub:evt", "pub:sta", "sub:cmd", "sub:cfg"],
  "exp": 1740000000
}
```

### Default Users
| Email | Password | Role | Company |
|-------|----------|------|---------|
| sysadmin@duali.com | sysadmin123 | system_admin | — (none) |
| admin@duali.com | admin123 | primary_manager | Duali Demo |

Role semantics are defined in `docs/specs/platform/company-rbac.md`.

### v1 API Endpoints (auth-svc, port 8005)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/login` | Public | Email + password → JWT |
| POST | `/api/v1/auth/refresh` | Public | Refresh token → new access token |
| POST | `/api/v1/auth/logout` | Bearer | Invalidate refresh token |
| GET | `/api/v1/auth/me` | Bearer | Current user profile |
| POST | `/api/v1/auth/device-token` | Bearer | Issue device MQTT JWT |
| GET | `/api/v1/roles` | Bearer | List available roles |
| CRUD | `/api/v1/users` | Admin | User management (within company) |
| CRUD | `/api/v1/system/companies` | system_admin | Company management |

---

## Full Spec (v2 — Future)

## Overview

The Authentication & Authorization system is the security foundation of DM3 — managing identity verification, session lifecycle, and API access control. Built on Keycloak with a Go shim layer, it supports JWT + refresh tokens, SSO via SAML 2.0 and OpenID Connect, MFA (TOTP/SMS/WebAuthn), OAuth2 flows for third-party integrations, API token management, and tier-based rate limiting. **All services validate JWTs locally using cached public keys — no auth service call required per request.** The system enforces password policies, session management, and provides a complete security audit trail.

## Data Models

### User (auth identity, separate from User in identity-svc)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key (maps to Keycloak subject) |
| tenant_id | uuid | yes | - | Tenant isolation |
| user_id | uuid | no | null | Linked user in identity-svc |
| username | string(100) | yes | - | Login username (unique per tenant) |
| email | string(200) | yes | - | Email address |
| email_verified | boolean | yes | false | Email verification status |
| phone | string(20) | no | null | Phone for SMS MFA |
| phone_verified | boolean | yes | false | Phone verification status |
| status | UserStatusEnum | yes | active | Account status |
| roles | string[] | yes | ["viewer"] | Assigned canonical roles from `company-rbac.md` |
| sites | uuid[] | yes | [] | Accessible sites |
| mfa_enabled | boolean | yes | false | MFA active |
| mfa_methods | string[] | no | [] | Active MFA methods |
| password_changed_at | timestamp | no | null | Last password change |
| password_expires_at | timestamp | no | null | Password expiry |
| failed_login_count | int | yes | 0 | Consecutive failures |
| locked_until | timestamp | no | null | Account lockout expiry |
| last_login_at | timestamp | no | null | Last successful login |
| last_login_ip | inet | no | null | Last login IP |
| sso_provider | string(50) | no | null | External IdP (if SSO user) |
| sso_subject | string(200) | no | null | External IdP subject ID |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Session
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Session ID |
| user_id | uuid | yes | - | Session owner |
| tenant_id | uuid | yes | - | Tenant isolation |
| refresh_token_hash | string(64) | yes | - | SHA-256 of refresh token |
| device_info | jsonb | no | {} | User-agent, device type, OS |
| ip_address | inet | yes | - | Session IP |
| location | string(100) | no | null | Geo-IP location |
| status | SessionStatusEnum | yes | active | Session status |
| mfa_verified | boolean | yes | false | MFA completed for session |
| created_at | timestamp | yes | now() | Login time |
| expires_at | timestamp | yes | - | Refresh token expiry |
| last_activity_at | timestamp | yes | now() | Last token refresh |
| revoked_at | timestamp | no | null | Revocation time |
| revoke_reason | string(100) | no | null | Why revoked |

### APIToken
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| user_id | uuid | yes | - | Token owner |
| name | string(100) | yes | - | Token name (e.g. "HR Integration") |
| token_prefix | string(8) | yes | - | First 8 chars for identification |
| token_hash | string(64) | yes | - | SHA-256 of full token |
| scopes | string[] | yes | - | Allowed API scopes |
| rate_limit_tier | string(20) | yes | standard | Rate limit tier |
| ip_whitelist | inet[] | no | null | Allowed source IPs (null = any) |
| last_used_at | timestamp | no | null | Last API call |
| usage_count | bigint | yes | 0 | Total requests |
| expires_at | timestamp | no | null | Token expiry (null = no expiry) |
| status | TokenStatusEnum | yes | active | Token status |
| created_at | timestamp | yes | now() | Creation time |

### PasswordPolicy
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| min_length | int | yes | 12 | Minimum password length |
| require_uppercase | boolean | yes | true | Require uppercase letter |
| require_lowercase | boolean | yes | true | Require lowercase letter |
| require_digit | boolean | yes | true | Require number |
| require_special | boolean | yes | true | Require special character |
| max_age_days | int | yes | 90 | Password expiry (0 = never) |
| history_count | int | yes | 5 | Cannot reuse last N passwords |
| max_failed_attempts | int | yes | 5 | Lock after N failures |
| lockout_duration_minutes | int | yes | 30 | Lockout duration |
| mfa_required_roles | string[] | yes | ["primary_manager","admin","system_admin"] | Roles requiring MFA |
| session_max_age_hours | int | yes | 24 | Max session duration |
| session_idle_timeout_minutes | int | yes | 60 | Idle timeout |
| updated_at | timestamp | yes | now() | Last update |

### OAuthClient (for third-party integrations)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| client_id | string(50) | yes | auto | OAuth2 client ID |
| client_secret_hash | string(64) | yes | - | Hashed client secret |
| name | string(100) | yes | - | Application name |
| description | string(500) | no | null | Description |
| redirect_uris | string[] | yes | - | Allowed redirect URIs |
| grant_types | string[] | yes | - | Allowed grant types |
| scopes | string[] | yes | - | Allowed scopes |
| rate_limit_tier | string(20) | yes | standard | Rate limit tier |
| status | TokenStatusEnum | yes | active | Client status |
| created_by | uuid | yes | - | Creator |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
UserStatusEnum: active | inactive | suspended | locked | pending_verification
SessionStatusEnum: active | expired | revoked
TokenStatusEnum: active | revoked | expired
MFAMethodEnum: totp | sms | webauthn
```

## API Endpoints

### POST /api/v1/auth/token
- **Auth:** None (public endpoint)
- **Description:** OAuth2 token endpoint — supports multiple grant types
- **Body (password grant):**
  ```json
  {
    "grant_type": "password",
    "username": "user@example.com",
    "password": "string",
    "tenant_id": "uuid",
    "mfa_code": "123456"
  }
  ```
- **Body (client credentials):**
  ```json
  {
    "grant_type": "client_credentials",
    "client_id": "string",
    "client_secret": "string"
  }
  ```
- **Body (authorization code):**
  ```json
  {
    "grant_type": "authorization_code",
    "code": "string",
    "redirect_uri": "string",
    "client_id": "string",
    "code_verifier": "string"
  }
  ```
- **Response 200:**
  ```json
  {
    "access_token": "eyJhbGciOiJSUzI1NiJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g...",
    "scope": "openid profile access:read access:write"
  }
  ```
- **Response 200 (MFA required):**
  ```json
  {
    "mfa_required": true,
    "mfa_token": "temporary-token",
    "mfa_methods": ["totp", "sms"],
    "expires_in": 300
  }
  ```
- **Side effects:** Creates session, audit log
- **Errors:** 400 (invalid grant), 401 (bad credentials), 403 (account locked/suspended), 429 (rate limited)

### POST /api/v1/auth/refresh
- **Auth:** None (uses refresh token)
- **Body:** `{ "refresh_token": "string" }`
- **Response 200:** New access_token + refresh_token (rotation)
- **Side effects:** Invalidates old refresh token, updates session last_activity
- **Errors:** 401 (invalid/expired refresh token), 403 (session revoked)

### POST /api/v1/auth/logout
- **Auth:** Bearer token
- **Body:** `{ "all_sessions": false }`
- **Side effects:** Revokes session(s), audit log
- **Response 204**

### POST /api/v1/auth/mfa/verify
- **Auth:** MFA token (from initial auth)
- **Body:** `{ "mfa_token": "string", "method": "totp", "code": "123456" }`
- **Response 200:** Full token response (access + refresh)
- **Errors:** 401 (invalid code), 429 (too many attempts)

### POST /api/v1/auth/mfa/setup
- **Auth:** Bearer token
- **Body:** `{ "method": "totp" }`
- **Response 200:**
  ```json
  {
    "method": "totp",
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_code_uri": "otpauth://totp/DM3:user@example.com?secret=...",
    "backup_codes": ["12345678", "87654321", "..."]
  }
  ```

### POST /api/v1/auth/mfa/confirm
- **Auth:** Bearer token
- **Body:** `{ "method": "totp", "code": "123456" }`
- **Description:** Confirm MFA setup with a valid code
- **Side effects:** Enables MFA, audit log
- **Response 200:** `{ "mfa_enabled": true, "method": "totp" }`

### DELETE /api/v1/auth/mfa
- **Auth:** Bearer token + password confirmation
- **Body:** `{ "password": "string" }`
- **Side effects:** Disables MFA, audit log
- **Response 204**

### GET /api/v1/auth/sessions
- **Auth:** Bearer token
- **Description:** List user's active sessions
- **Response 200:** Array of sessions with device info, IP, location

### DELETE /api/v1/auth/sessions/{id}
- **Auth:** Bearer token (own sessions), role >= admin (others)
- **Side effects:** Revokes session, audit log
- **Response 204**

### POST /api/v1/auth/password/change
- **Auth:** Bearer token
- **Body:** `{ "current_password": "string", "new_password": "string" }`
- **Side effects:** Updates password, revokes all other sessions, audit log
- **Response 204**
- **Errors:** 401 (wrong current), 422 (policy violation)

### POST /api/v1/auth/password/reset-request
- **Auth:** None
- **Body:** `{ "email": "string", "tenant_id": "uuid" }`
- **Side effects:** Sends reset email with one-time token (expires 1 hour)
- **Response 202** (always, even if email not found — prevents enumeration)

### POST /api/v1/auth/password/reset
- **Auth:** None (uses reset token)
- **Body:** `{ "token": "string", "new_password": "string" }`
- **Side effects:** Resets password, revokes all sessions, audit log
- **Response 204**

### GET /api/v1/auth/api-tokens
- **Auth:** Bearer token
- **Response 200:** List of user's API tokens (without secrets)

### POST /api/v1/auth/api-tokens
- **Auth:** Bearer token, role >= admin
- **Body:**
  ```json
  {
    "name": "HR Integration",
    "scopes": ["identity:read", "identity:write", "provisioning:read"],
    "ip_whitelist": ["10.0.0.0/8"],
    "expires_at": "2027-01-01T00:00:00Z"
  }
  ```
- **Response 201:**
  ```json
  {
    "id": "uuid",
    "token": "dm3_live_aBcDeFgHiJkLmNoPqRsT...",
    "name": "HR Integration",
    "prefix": "dm3_live",
    "expires_at": "2027-01-01T00:00:00Z"
  }
  ```
  ⚠️ Token is shown ONCE — cannot be retrieved again.
- **Side effects:** Audit log

### DELETE /api/v1/auth/api-tokens/{id}
- **Auth:** Bearer token (own tokens), role >= site_admin (others)
- **Side effects:** Revokes token, audit log
- **Response 204**

### GET /api/v1/auth/oauth-clients
- **Auth:** role >= site_admin
- **Response 200:** List of OAuth2 clients

### POST /api/v1/auth/oauth-clients
- **Auth:** role >= site_admin
- **Body:** OAuthClient creation payload
- **Response 201:** Client with client_id and client_secret (shown once)

### DELETE /api/v1/auth/oauth-clients/{id}
- **Auth:** role >= site_admin
- **Side effects:** Revokes all tokens issued by this client
- **Response 204**

### GET /api/v1/auth/password-policy
- **Auth:** role >= admin
- **Response 200:** Current password policy for tenant

### PUT /api/v1/auth/password-policy
- **Auth:** role >= site_admin
- **Body:** PasswordPolicy fields
- **Side effects:** Audit log
- **Response 200:** Updated policy

### GET /api/v1/auth/.well-known/openid-configuration
- **Auth:** None
- **Response 200:** Standard OIDC discovery document

### GET /api/v1/auth/jwks
- **Auth:** None
- **Response 200:** JSON Web Key Set for JWT verification

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| N/A | - | - | - | Auth service does not use MQTT directly |

## Business Rules

1. **BR-AUTH-001 — JWT Local Validation:** All services validate JWTs locally using cached JWKS public keys (refreshed every 5 minutes). No auth-svc call per API request. Token claims contain tenant_id, roles, permissions, and sites.
2. **BR-AUTH-002 — Access Token Short-Lived:** Access tokens expire in 15 minutes (configurable, max 60 min). Refresh tokens expire in 24 hours (configurable, max 30 days). Device authorization tokens expire in 90 days.
3. **BR-AUTH-003 — Refresh Token Rotation:** Every refresh call issues a new refresh token and invalidates the old one. If a revoked refresh token is reused (token replay), ALL sessions for that user are immediately revoked (compromise detection).
4. **BR-AUTH-004 — MFA Enforcement:** Users with roles in `mfa_required_roles` MUST enable MFA. Login without MFA returns `mfa_required` response with temporary token valid for 5 minutes.
5. **BR-AUTH-005 — Account Lockout:** After `max_failed_attempts` consecutive failed logins, account is locked for `lockout_duration_minutes`. Each additional failed attempt during lockout extends the duration by 2x (exponential backoff, max 24 hours).
6. **BR-AUTH-006 — Password Policy Enforcement:** New passwords are validated against tenant PasswordPolicy. Passwords are checked against a breach database (HaveIBeenPwned k-Anonymity API) and rejected if compromised.
7. **BR-AUTH-007 — Password Expiry:** When `max_age_days > 0`, users with expired passwords receive a 403 with `password_expired` error. Only password change endpoints are accessible until password is updated.
8. **BR-AUTH-008 — Session Idle Timeout:** Sessions with no activity (no token refresh) for `session_idle_timeout_minutes` are automatically revoked by a background job.
9. **BR-AUTH-009 — SSO Integration:** SAML 2.0 and OIDC providers are configured per tenant. SSO users are auto-provisioned on first login (JIT provisioning) with roles mapped from IdP attributes.
10. **BR-AUTH-010 — API Token Scoping:** API tokens have fine-grained scopes (e.g., `access:read`, `identity:write`). Requests outside the token's scope are rejected with 403.
11. **BR-AUTH-011 — Rate Limiting:** Tier-based rate limits (see architecture doc §3.4). Login endpoint is additionally limited to 10 attempts per IP per minute to prevent brute force.
12. **BR-AUTH-012 — Tenant Isolation:** Tokens are scoped to a single tenant. A token from tenant A cannot access tenant B's resources. Cross-tenant access requires `system_admin` role.
13. **BR-AUTH-013 — Concurrent Session Limit:** Configurable max concurrent sessions per user (default: 5). When exceeded, oldest session is revoked.
14. **BR-AUTH-014 — Device Authorization Flow:** Android terminals and guard stations use the OAuth2 Device Authorization flow (RFC 8628) — display a code, user authorizes on their phone/computer.

## Permissions Matrix

Auth-specific permissions must follow the canonical role model in `docs/specs/platform/company-rbac.md`.

| Action | viewer | operator | manager | admin | primary_manager | system_admin |
|--------|--------|----------|---------|-------|-----------------|-------------|
| Login/logout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Change own password | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage own MFA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own sessions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Revoke own sessions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create API tokens | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Revoke others' sessions | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| View password policy | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit password policy | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage OAuth clients | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Force password reset (others) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Disable MFA (others) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cross-tenant access | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Offline Behavior

- **Device-side:** Devices (Android terminals, guard stations) cache a valid JWT and refresh token locally. If the auth server is unreachable, the device continues operating with the cached token until it expires. Device authorization tokens have 90-day expiry for this reason.
- **JWT validation:** Services cache JWKS public keys. If auth-svc is unreachable, cached keys are used for JWT validation (max cache age: 24 hours). After 24 hours without key refresh, services reject all tokens as a safety measure.
- **Sync strategy:** On reconnect, devices attempt token refresh. If the refresh token is expired (>24h offline), the device requires re-authorization via the device authorization flow.
- **Conflict resolution:** Server is authoritative. If a user's role changes while a device holds a cached token, the old permissions persist until token refresh.
- **Local storage:** Devices store: access_token (encrypted), refresh_token (encrypted), JWKS cache. Tokens are stored in device secure enclave (Android Keystore / hardware security module).

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /login | Login | Username/password form, SSO buttons, MFA dialog |
| /auth/mfa-setup | MFA Setup | QR code display, backup codes, method selection |
| /settings/security | Security Settings | Password change, MFA management, active sessions list |
| /settings/api-tokens | API Tokens | Token list, create dialog with scope picker, IP whitelist |
| /admin/auth/password-policy | Password Policy | Policy editor with strength meter preview |
| /admin/auth/oauth-clients | OAuth Clients | Client list, create/edit dialog, scope configuration |
| /admin/auth/sso | SSO Configuration | SAML/OIDC provider setup, metadata upload, attribute mapping |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| auth.login.success | Successful login | user_id, ip, device, method | 2 years |
| auth.login.failed | Failed login | username, ip, reason | 2 years |
| auth.login.mfa_required | MFA challenge issued | user_id, methods | 1 year |
| auth.login.mfa_verified | MFA code verified | user_id, method | 2 years |
| auth.login.mfa_failed | Wrong MFA code | user_id, method, ip | 2 years |
| auth.logout | Logout | user_id, session_id | 1 year |
| auth.token.refreshed | Token refresh | user_id, session_id | 90 days |
| auth.token.replay_detected | Revoked refresh token reused | user_id, ip, all_sessions_revoked | permanent |
| auth.account.locked | Lockout triggered | user_id, failed_count | 2 years |
| auth.account.unlocked | Lockout expired or manual | user_id, actor | 2 years |
| auth.password.changed | Password change | user_id | permanent |
| auth.password.reset | Password reset via email | user_id | permanent |
| auth.password.expired | Password expiry detected | user_id | 1 year |
| auth.mfa.enabled | MFA setup completed | user_id, method | permanent |
| auth.mfa.disabled | MFA removed | user_id, actor | permanent |
| auth.session.revoked | Session revoked | user_id, session_id, actor, reason | 1 year |
| auth.api_token.created | API token created | token_id, user_id, scopes | permanent |
| auth.api_token.revoked | API token revoked | token_id, actor | permanent |
| auth.api_token.used | API token first use | token_id, ip | 90 days |
| auth.oauth_client.created | OAuth client created | client_id, actor | permanent |
| auth.oauth_client.deleted | OAuth client deleted | client_id, actor | permanent |
| auth.policy.updated | Password policy changed | actor, diff | permanent |
| auth.sso.configured | SSO provider added/updated | provider, actor | permanent |

## Integration Points

- **Depends on:**
  - Keycloak — Core identity provider, token issuance, SSO federation
  - Valkey — Session cache, rate limit counters, JWKS cache
  - `notif-svc` — Password reset emails, MFA SMS codes, security alerts
- **Consumed by:**
  - ALL services — JWT validation via cached JWKS
  - `identity-svc` — User↔User linking, JIT provisioning on SSO login
  - `tenant-svc` — Tenant-scoped authentication configuration
  - `audit-svc` — All auth events for security compliance
  - API Gateway (Traefik) — JWT validation middleware, rate limiting
- **External:**
  - SAML 2.0 Identity Providers (Azure AD, Okta, OneLogin)
  - OIDC Providers (Google Workspace, Auth0)
  - Active Directory / LDAP (user sync + authentication)
  - SMS Gateway (Twilio, local providers) — MFA OTP delivery
  - HaveIBeenPwned API — password breach checking (k-Anonymity)

## Notes

- Keycloak is the core IdP but is wrapped by a Go shim (auth-svc) that adds DM3-specific logic: tenant isolation, custom claims, API token management, rate limiting.
- JWT signing uses RS256 with 2048-bit RSA keys. Key rotation happens every 90 days with 30-day overlap for graceful transition.
- Refresh token rotation with replay detection is critical for security — any reuse of a revoked refresh token triggers immediate session revocation for the entire user.
- API tokens use a prefix format (`dm3_live_...` / `dm3_test_...`) for easy identification in logs and rotation.
- The device authorization flow is essential for headless devices (terminals, guard stations) that don't have web browsers for standard OAuth flows.
