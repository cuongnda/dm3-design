# CCTV → VMS Rename — Refactor Plan

> Status: **Draft for team discussion** — not approved
> Owner: TBD
> Last updated: 2026-04-25
> Related: `docs/VISION.md` (v2.5+ adopts VMS as canonical product term)

## 1. Why this exists

`docs/VISION.md` v2.4+ adopts **Video Management (VMS)** as the canonical product term, replacing **CCTV**. The vision-doc rename is done. This plan covers what it would take to align the rest of the codebase.

The intent is to discuss scope and impact with the team before committing — the change is mechanically simple but touches a lot of surface area, and several decisions affect customer-facing contracts.

## 2. Scope inventory

Survey from a full-repo grep (April 2026). Counts are approximate but order-of-magnitude correct.

### 2.1 By surface

| Surface | What changes | Count / examples |
|---|---|---|
| Backend Go service | `backend/cmd/cctv-svc/`, `backend/internal/cctv/` (15+ files), `backend/internal/gateway/cctv_ws_consumer.go` | ~20 files |
| RBAC catalog | `PluginCCTV` constant, key prefix `cctv.*` (camera.read, camera.manage, clip.read, etc.) | `backend/internal/rbac/catalog.go` |
| Plugin registration | Plugin ID string `"cctv"`, display name `"CCTV"` | `backend/internal/authsvc/plugins.go` |
| Database schema | `dm3_cctv` schema; 5 migrations: 000013, 000042, 000044, 000048, 000049 | All `.up.sql` + `.down.sql` |
| HTTP API | `/api/v1/cctv/*` routes (incl. **Hanet webhook** `/api/v1/cctv/hanet/webhook`) | `backend/internal/cctv/routes.go` |
| NATS / WebSocket | Stream name `CCTV`, subjects `dm3.cctv.ws.*` | `backend/internal/gateway/cctv_ws_consumer.go`, `backend/internal/cctv/status_monitor.go`, `tungson_handlers.go` |
| Frontend feature dir | `apps/console/src/features/cctv/` (10+ files: CCTVDashboardPage, CCTVCamerasPage, CCTVLiveViewPage, CCTVClipsPage, CCTVSettingsPage, CCTVEventRulesPage, components/) | ~12 TSX files |
| Frontend routing | `/cctv/dashboard`, `/cctv/cameras`, `/cctv/live`, `/cctv/clips` | `apps/console/src/app/router.tsx` |
| Frontend nav | nav id `cctv`, label `"CCTV"` | `packages/ui/src/config/navConfig.ts` |
| API client | `packages/api-client/src/cctv.ts` | 1 file |
| i18n | 191 entries in `en/common.json`, 191 in `vi/common.json`, 18 in `en/secure.json`, 18 in `vi/secure.json` (mix of keys + values) | 4 files |
| `data-testid` attributes | `cctv-*` testids consumed by automation tests | Multiple TSX + automation files |
| External agent | `cctv-agent/` (separate Go module, deploys to camera hardware) | Whole subdirectory |
| Docs / specs | `docs/IMPLEMENTATION_STATUS.md`, `docs/specs/secure/cctv.md`, `docs/architecture/module-isolation.md`, `docs/ux/webapp-ux.md`, `docs/review-verdict-cctv.md`, `AGENTS.md`, `CLAUDE.md` | ~10 files |
| Marketing / mockups | `website/{en,vi,ko}/`, `website/platform/`, `website/pricing/`, `website/solutions/`, `mockups/webapp/cctv.html`, `mockups/webapp/cctv-screenshot.png` | ~15 files |
| Infra / scripts | `docker-compose.local.yml`, `docker-compose.prod.yml`, `backend/Makefile`, `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `scripts/watch-camera.sh` | ~7 files |

### 2.2 External contracts (the parts that "leak" outside the repo)

These are the only items that affect anything beyond our own builds:

1. **HTTP API path** `/api/v1/cctv/*` — consumed by frontend, mobile apps, and any external integrator that has wired against it.
2. **Hanet webhook URL** `/api/v1/cctv/hanet/webhook` — registered in Hanet's portal. URL change requires updating their config.
3. **Plugin ID string** `"cctv"` — stored in tenant config rows (`dm3_auth.tenants.enabled_plugins` or equivalent). Renaming requires data migration **or** DB wipe.
4. **RBAC permission keys** `cctv.camera.read`, `cctv.camera.manage`, etc. — stored in role assignment rows. Same data-migration question.
5. **NATS stream + subjects** `CCTV` / `dm3.cctv.ws.*` — internal to backend, but breaking between producer (cctv-svc) and consumer (device-gateway) during rolling deploy.
6. **`cctv-agent` binary** — if deployed to any camera test hardware, that hardware needs a rebuild/redeploy.
7. **DB schema name** `dm3_cctv` — affects backup procedures, ad-hoc ops queries, monitoring queries.

## 3. Strategic options

There are three credible approaches. The right choice depends on whether DM3 has live customers / data we must preserve.

### Option A — UX/brand rename only (Tier 1)
- Change everything user-facing: labels, docs, marketing, mockups, i18n values
- Keep all internal identifiers as `cctv-*` / `dm3_cctv` / `/api/v1/cctv/*` / plugin ID `"cctv"`
- Pattern: same as Apple ("DarwinOS" internally, "macOS" publicly), Microsoft NT, etc.
- **Effort:** ~4-6 hours, single dev
- **Risk:** zero — no breaking changes, no data migration, no external coordination
- **Downside:** permanent split between product term and code term; mild confusion for new devs reading code while looking at UI

### Option B — Full coordinated rename, production-safe path (Tier 1 + Tier 2 with care)
- Everything in Option A, plus rename code, schema, API, NATS, plugin ID, RBAC keys, agent binary
- Requires: dual-mount HTTP routes during transition, dual-publish NATS subjects, data migrations for tenant config + role assignments, deprecation window, coordinated multi-service deploy, Hanet portal coordination
- **Effort:** ~30+ hours over weeks
- **Risk:** medium — every external contract change is a place a bug can land in production
- **Downside:** real engineering cost for a renaming exercise that doesn't add user value

### Option C — Full rename, dev-shortcut path (only viable pre-production)
- Same surface as Option B, but **wipe DB and skip migration choreography**
- Edit existing migrations in place rather than writing rename migrations
- Single coordinated commit; nuke local infra (`docker compose down -v`); re-migrate from scratch; re-seed
- Hanet webhook: update their portal once, post-cutover
- **Effort:** ~6-9 hours, single dev
- **Risk:** low IF no production tenants exist at the moment of cutover
- **Downside:** burns the bridge — once anyone runs production data on `dm3_cctv`, this option is gone

**Per project owner (April 2026):** system has no production deployments. Option C is on the table. This is the central decision the team needs to confirm.

## 4. Recommended plan (Option C)

Assumes Option C is chosen. If Option A is chosen instead, skip §4.2 (schema), §4.3 (NATS/API path), §4.5 (agent), and most of §4.7 (cutover).

### 4.1 Code: backend Go

- `backend/internal/cctv/` → `backend/internal/vms/`
- `backend/cmd/cctv-svc/` → `backend/cmd/vms-svc/`
- Type renames: `CCTVService` → `VMSService`, similar throughout
- `backend/internal/gateway/cctv_ws_consumer.go` → `vms_ws_consumer.go`
- `backend/internal/rbac/catalog.go`: `PluginCCTV` → `PluginVMS`, key prefix `cctv.*` → `vms.*`
- `backend/internal/authsvc/plugins.go`: ID `"cctv"` → `"vms"`, name `"CCTV"` → `"Video Management"`
- Build infra: `Makefile` build targets, `Dockerfile`, `docker-compose.local.yml`, `docker-compose.prod.yml`, `backend/docker-entrypoint.sh`

### 4.2 Database: edit migrations in place

- `000013_cctv_schema.up.sql` → `000013_vms_schema.up.sql`; rename schema, function names, comments inside
- Same for `000042_cctv_clip_extractor_columns`, `000044_cctv_hanet_settings`, `000048_cctv_event_rules`, `000049_cctv_clip_thumbnail`
- Same for all matching `.down.sql` files
- Schema name decision: **`dm3_vms`** recommended for parity with UX. (`dm3_video` is the alternative if VMS acronym clash with future modules is a concern.)

### 4.3 External contracts: NATS / HTTP / WebSocket

- NATS stream `CCTV` → `VMS`; subjects `dm3.cctv.ws.>` → `dm3.vms.ws.>`
- HTTP routes `/api/v1/cctv/*` → `/api/v1/vms/*` (including Hanet webhook)
- WebSocket subjects same as NATS

### 4.4 Frontend

- `apps/console/src/features/cctv/` → `apps/console/src/features/vms/`
- Component renames: `CCTVDashboardPage` → `VMSDashboardPage`, etc.
- Routes in `router.tsx`: `/cctv/*` → `/vms/*`
- `packages/api-client/src/cctv.ts` → `vms.ts`
- `packages/ui/src/config/navConfig.ts`: nav id `cctv` → `vms`, label `"CCTV"` → `"Video Management"`
- i18n: rename keys (`secure.cctv.*` → `secure.vms.*`) and update values (`"CCTV"` → `"Video Management"`)
- `data-testid`: `cctv-*` → `vms-*`; **must update automation tests in lockstep** (`automation/tests/web/`)

### 4.5 External agent

- `cctv-agent/` → `vms-agent/`
- Binary name, README, `agent.yml.example`, `cmd/cctv-agent/` → `cmd/vms-agent/`
- Open question: is the agent currently running on any hardware (even internal test cameras)? If yes, plan a rebuild/redeploy.

### 4.6 Docs, marketing, mockups

- All `.md` mentioning CCTV in `docs/`, `website/`, `cctv-agent/docs/`
- `mockups/webapp/cctv.html` → `vms.html` (and rebuild screenshot)
- `AGENTS.md`, `CLAUDE.md` (specific sections about cctv-svc, dm3_cctv schema, plugin gating)
- Convention for prose:
  - First mention per document: `Video Management (VMS)`
  - Subsequent: `VMS` or `video management` per context
  - Customer-voice / UX prose: `video`
- Auto-regenerate `graphify-out/`

### 4.7 Cutover

```bash
# 1. Stop everything and wipe volumes
docker compose -f docker-compose.local.yml down -v

# 2. Bring infra back up clean
docker compose -f docker-compose.local.yml up -d

# 3. Build new binaries
cd backend && make clean && make build

# 4. Run migrations (now applies renamed schemas from scratch)
make migrate

# 5. Re-seed
make seed-all

# 6. Start services
make dev

# 7. (If Hanet wired) update webhook URL in Hanet portal
```

### 4.8 Verification

- `cd backend && make test` — Go tests pass
- `npm run build` — frontend builds
- Manual smoke: login console → navigate to Video Management → camera list loads → live view works → clip playback works
- `cd automation && pytest` — automation suite passes
- `make swag-check` — OpenAPI spec stays in sync

## 5. Migration consolidation — separate decision

The question came up: should we also collapse the 55 existing migrations into a baseline while we're in there?

**Short answer for this rename:** consolidation does not materially make the rename easier. The mechanical work (changing `dm3_cctv` → `dm3_vms` text) is the same whether the statements live in 5 files or 1.

**Longer answer:** consolidation is a separate, defensible cleanup with its own tradeoffs.

| Pro | Con |
|---|---|
| Onboarding: 1 file vs 55 to understand current schema | Loses inline narrative of how schema evolved (git log retains it) |
| Faster dev DB spin-up | Any in-flight branch with new migrations must rebase |
| Good moment — no users, already nuking DB | Expands scope of this task significantly |
| Allows rethinking schema names cleanly | After consolidation, production DBs accumulate migrations from baseline again — finite benefit |

**Recommendation:** **do not combine in this task.** If consolidation is desired, do it as an independent follow-up so review and rollback stay clean. Mixing them makes it hard to attribute bugs to either change.

## 6. Open decisions for the team

Before any work starts:

1. **Approve Option C** (single coordinated rename, DB wipe, no production data preserved).  
   *Alternative:* Option A (UX-only rename, defer code rename indefinitely).
2. **Schema name:** `dm3_vms` or `dm3_video`?
3. **i18n keys:** rename keys (`secure.cctv.*` → `secure.vms.*`) or keep keys, only update values? Recommend rename for consistency.
4. **`cctv-agent` deployment status:** is the agent running on any camera hardware right now (even internal test cameras)? If yes, scope a redeploy step.
5. **Hanet webhook:** is `/api/v1/cctv/hanet/webhook` actually wired into Hanet's portal currently, or only used by local test fixtures? If wired, scope a portal-side update step.
6. **Migration consolidation:** confirm explicitly **out of scope** for this task; defer to a separate decision.

## 7. Effort and ownership

| Phase | Effort | Owner |
|---|---|---|
| §4.1 backend code rename | 1.5 hours | Backend |
| §4.2 migration edits | 30 min | Backend |
| §4.3 external contracts | 1 hour | Backend |
| §4.4 frontend rename | 2-3 hours | Frontend |
| §4.5 agent rename | 1 hour | Backend |
| §4.6 docs / mockups / website | 1.5 hours | Anyone |
| §4.7 cutover | 30 min | Backend |
| §4.8 verification | 1 hour | Backend + QA |
| **Total** | **~9 hours wall time** | Best executed by 1-2 devs in a single coordinated session |

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hanet webhook not updated post-cutover, integration silently broken | Medium (if wired) | High | Pre-confirm registration, add post-cutover smoke test that sends a test webhook |
| `cctv-agent` running on test hardware fails to reconnect after rename | Medium (if deployed) | Medium | Identify all deployed agents before cutover, plan redeploy |
| Automation tests broken by `data-testid` changes, blocks CI | High | Low (caught immediately) | Update tests in same commit/PR as testid changes |
| Hidden grep miss in scripts/, deploy/, or generated artifacts | Medium | Low | Final repo-wide grep for `cctv` (case-insensitive) before cutover; review remaining hits manually |
| Production deployment happens *during* this work and ships a broken state | Low | High | Freeze main during cutover window; do work on a feature branch, merge in single coordinated push |
| New tenants seeded with `cctv` plugin ID before cutover, become orphaned post-rename | Low | Low | Coordinate with anyone seeding test tenants during the cutover window |

## 9. Out of scope

- Migration consolidation (see §5)
- Functional changes to the VMS module — this is a pure rename
- Changes to MediaMTX, RTSP/WebRTC infra naming (only product-side rename)
- Changes to the `cameras` table column names (already neutral — table holds cameras, not "cctv records")
- Renaming the `Camera` Go struct or related domain types (those are camera-domain, not VMS-domain)

---

*If Option A (UX-only rename) is chosen instead of Option C, this document still applies — execute §4.4 (frontend), §4.6 (docs/marketing), and the i18n value updates only. Skip everything else.*
