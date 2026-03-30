# 2026-03-30: Documentation ↔ Code Alignment

## Summary

Aligned architecture documentation with actual implementation state.

## Changes

### 1. Port Mapping (Appendix B)

Fixed service port map to match actual docker-compose.prod.yml:
- device-gateway: 8002, access-svc: 8003, identity-svc: 8004, auth-svc: 8005
- Infrastructure ports: TimescaleDB 5433, Valkey 6380, EMQX 1884, MinIO 9002
- Marked planned services clearly vs implemented ones

### 2. Auth Strategy Clarified

- **Phase 1 (current):** Custom JWT auth in auth-svc (bcrypt + JWT + refresh tokens)
- **Phase 2+ (future):** Keycloak as optional IdP for enterprise SSO/SAML/LDAP
- Removed misleading Keycloak references from current architecture diagrams
- Updated Container Diagram, Auth flow, HA table, tech stack appendix

### 3. Reverse Proxy: Nginx (current) vs Traefik (K8s future)

- **Current:** Nginx with dynamic Docker DNS resolution
- **Future:** Traefik for Kubernetes auto-discovery
- Added Section 2.4 documenting the proxy strategy
- Updated all Traefik references throughout docs

### 4. Row Level Security (Migration 009)

- Added `009_row_level_security.sql` — enables RLS on all tenant-scoped tables
- Pattern: `SET LOCAL app.current_tenant = '<uuid>'` per transaction
- Superuser (dm3) bypasses RLS for migrations and system_admin operations
- Includes integration notes for Go service middleware

### 5. Implementation Status Markers

- Added ✅ markers to implemented services in Service Boundary Map
- Container Diagram now shows IMPLEMENTED vs PLANNED sections
- Port map distinguishes active vs planned services

## Decision Rationale

- Docs should reflect reality, not aspirational architecture
- Planned features clearly marked to avoid confusion
- RLS adds defense-in-depth for multi-tenant isolation before production data
