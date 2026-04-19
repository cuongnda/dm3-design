# CCTV Plugin Review Verdict

## Scope reviewed
- Backend service wiring and routes:
  - `backend/cmd/cctv-svc/main.go`
  - `backend/internal/cctv/routes.go`
  - `backend/internal/cctv/handlers.go`
  - `backend/internal/cctv/camera_handlers.go`
  - `backend/internal/cctv/clip_handlers.go`
  - `backend/internal/cctv/stream_handlers.go`
  - `backend/internal/cctv/settings_handlers.go`
  - `backend/internal/cctv/access_event_consumer.go`
  - `backend/internal/cctv/cron.go`
  - `backend/internal/cctv/models.go`
  - `backend/internal/cctv/crypto.go`
  - `backend/internal/cctv/mediamtx_client.go`
  - `backend/internal/cctv/url_validator.go`
- Frontend routes and pages:
  - `apps/console/src/app/router.tsx`
  - `apps/console/src/components/common/PluginGuard.tsx`
  - `apps/console/src/features/cctv/CCTVDashboardPage.tsx`
  - `apps/console/src/features/cctv/CCTVCamerasPage.tsx`
  - `apps/console/src/features/cctv/CCTVLiveViewPage.tsx`
  - `apps/console/src/features/cctv/CCTVClipsPage.tsx`
  - `apps/console/src/features/cctv/CCTVSettingsPage.tsx`
  - `apps/console/src/features/cctv/components/LiveTile.tsx`
  - `apps/console/src/features/cctv/components/RecentClipsList.tsx`
  - `apps/console/src/features/cctv/components/CameraFormModal.tsx`
- Shared API client:
  - `packages/api-client/src/cctv.ts`
- Test evidence:
  - `backend/internal/cctv/camera_handlers_test.go`
  - `backend/internal/cctv/access_event_consumer_test.go`
  - `backend/internal/cctv/clip_signer_test.go`
  - `backend/internal/cctv/url_validator_test.go`
  - `go test ./internal/cctv/...` from `backend/` ✅

## Verdict
- **Risk:** MEDIUM
- **Recommendation:** NEEDS CHANGES, but close

The CCTV plugin is materially real, not mockware. Service wiring, tenant scoping, plugin gating, stream URL generation, credential encryption, retention cleanup, and access-event integration are all present and coherent. Backend tests pass, and the frontend live-view work is better than the usual placeholder CCTV page.

But it is **not cleanly merge-safe yet** because the current clip playback happy path appears broken by a backend/client/UI response-contract mismatch, and there are still a few product-contract gaps that will bite operators.

## What looks solid

### 1. Backend service architecture is legitimate
`backend/cmd/cctv-svc/main.go` does the right kind of work for a real service:
- validates CCTV credential-key entropy
- wires DB, migrations, auth, audit, object store, NATS, and MediaMTX integration
- registers CCTV routes with proper auth/plugin middleware
- starts retention / integration flows rather than leaving them as TODO theater

That is a good base. It does not look like a fake plugin shell.

### 2. Route structure and coarse authorization are sensible
`backend/internal/cctv/routes.go` is cleaner than several other DM3 plugins:
- read routes are tenant-scoped and plugin-gated
- operator+ can test connections and manage clips
- manager+ is required for camera CRUD and settings writes

This is coarse-grained, but it is at least coherent and conservative.

### 3. Camera security posture is thoughtful
`backend/internal/cctv/camera_handlers.go`, `crypto.go`, and `url_validator.go` show real care:
- RTSP passwords are encrypted at rest with AES-256-GCM
- embedded credentials in RTSP URLs are rejected
- RTSP URLs are validated before DB / MediaMTX writes
- logs redact credentials instead of leaking them
- MediaMTX path updates are best-effort and do not corrupt DB truth

That is good engineering.

### 4. Live-view path is much stronger than the old secure mock page
The current plugin pages under `apps/console/src/features/cctv/*` are clearly the real implementation, not the old mock-heavy `features/secure/cctv/CCTVPage.tsx` path.

In particular:
- `CCTVLiveViewPage.tsx` supports wall / operate / compact modes
- `LiveTile.tsx` does proper WHEP-first, HLS-fallback behavior
- stream URL fetching is tenant-scoped through backend `GetWHEPEndpoint`
- diagnostics and degraded states are surfaced better than average

This is actually useful operator UI.

### 5. Cross-service event wiring exists
`backend/internal/cctv/access_event_consumer.go` is meaningful, not decorative:
- subscribes to access events
- resolves access points to bound cameras
- creates placeholder `event_clips` rows for downstream clip workflows
- plugin-gates by tenant before doing work

For a P0/P1 CCTV plugin, that is a reasonable integration foundation.

## Current actionable issues

### 1. Clip playback contract is broken across backend, client, and UI
This is the main blocker.

#### Backend
`backend/internal/cctv/clip_handlers.go` returns:
- `playback_url`
- `started_at`
- `ended_at`
- `duration_ms`

#### Shared client
`packages/api-client/src/cctv.ts` declares:
```ts
export interface ClipPlaybackDTO {
  url: string;
}
```

#### Frontend
`apps/console/src/features/cctv/CCTVClipsPage.tsx` does:
```ts
onSuccess: (result, clip) => {
  setPlayingClip(clip);
  setPlayUrl(result.url);
}
```

That means the page is reading `result.url` while the backend sends `playback_url`.

So the clip modal can open with an empty video source even though the backend succeeded. This is exactly the kind of bug that makes a plugin look “mostly done” until somebody actually tries playback.

**Why this matters:** clip playback is not a side feature. It is one of the core operator actions in a CCTV plugin.

**Needed change:** align the response contract in one place, then make client and page match it exactly.

### 2. Clip list / DTO surface still looks partially out of sync with backend model
The backend `EventClip` model in `backend/internal/cctv/models.go` exposes fields like:
- `device_id`
- `duration_ms`
- `object_key`
- `trigger`

But the client `ClipDTO` in `packages/api-client/src/cctv.ts` expects fields like:
- `camera_id`
- `camera_name`
- `duration_sec`
- `storage_ref`
- `thumbnail_ref`
- `size_bytes`

The clips page is already relying on several of those frontend-friendly fields. I did not see enough evidence in the reviewed handler code that the backend list/get responses are consistently shaping the data into that richer contract.

Maybe some of those are being filled elsewhere, maybe not, but today the contract looks muddy.

**Why this matters:** this is exactly how DM3 pages end up with lots of `??`, blank cells, and fragile assumptions.

**Needed change:** either normalize the backend clip response to the richer DTO intentionally, or simplify the shared client to match the actual backend payload. Right now it smells half-migrated.

### 3. Access-point linkage is present in the UI contract but not convincingly persisted in reviewed backend create/update flow
Frontend camera forms and pages assume camera linkage to `access_point_id`:
- `CameraFormModal.tsx` submits `access_point_id`
- `CCTVCamerasPage.tsx` reads `r.access_point_id`
- `CCTVLiveViewPage.tsx` groups cameras by access point

But the reviewed backend camera create/update SQL in `backend/internal/cctv/camera_handlers.go` does not clearly persist any access-point binding itself. The actual camera record insert is into `dm3_cctv.cameras`, while the access-event consumer later depends on access-point/device relations living in access tables.

That may be supported elsewhere, but from the reviewed create/update path the contract is not convincing enough.

**Why this matters:** if camera-to-access-point association is not reliably written and read through one clean source of truth, event-linked clips and UI grouping become flaky.

**Needed change:** confirm and simplify the write path for camera/access-point binding, or adjust the frontend to reflect the true data model.

### 4. Settings UX is narrower than the backend settings contract
Backend settings support:
- `retention_days`
- `retention_days_max`
- `pre_roll_sec_default`
- `post_roll_sec_default`
- `storage_quota_gb`

Frontend settings page only edits:
- `retention_days`
- `pre_roll_sec_default`
- `post_roll_sec_default`
- `storage_quota_gb`

That may be intentional, but then `retention_days_max` is effectively a backend-only policy cap with no visible explanation in the UI beyond the slider bound.

That is not a blocker by itself, but it is a sign the operator-facing policy model is not fully surfaced yet.

### 5. The RTSP validator may be too restrictive for real on-prem CCTV deployments
`backend/internal/cctv/url_validator.go` rejects loopback, link-local, unspecified, and **private** IPs.

Security-wise, I get it. SSRF hardening matters.

Operationally, this is awkward because many real CCTV deployments use private LAN RTSP endpoints like:
- `rtsp://192.168.x.x/...`
- `rtsp://10.x.x.x/...`

So the current validation policy may block entirely normal on-prem camera setups unless DM3 expects MediaMTX and cameras to always live on publicly routable addresses, which would be unusual.

This is not automatically wrong, but it is a product-policy decision that should be explicit. Right now it looks like a security rule that may surprise deployment reality.

## Frontend / UX observations

### Good
- Live view is the strongest part of the plugin
- WHEP-first, HLS-fallback is the right call
- diagnostics modal is useful
- wall/operate/compact modes feel like actual operations UI
- cameras page has reasonable density and status cues

### Still rough
- clips workflow is too fragile given the contract mismatch above
- dashboard recent clips list is passive, and playback action is optional rather than obviously wired
- there is still coexistence between old `features/secure/cctv/*` mock-style surfaces and the newer real plugin pages, which creates conceptual noise in routing and maintenance

## Security / merge-safety read

### Good
- tenant scoping is present throughout reviewed handlers
- plugin gating is present in backend routes and frontend `PluginGuard`
- password encryption and redaction are solid
- object-key validation prevents obvious path traversal abuse

### Caution
- `PluginGuard` is only plugin-presence gating, not authorization. That is fine as long as backend remains the source of truth.
- MediaMTX operations are best-effort, which is acceptable, but drift recovery is still TODO-based.
- The no-op signer fallback is fine for dev, but production behavior must ensure object-store signer is actually configured where clip playback matters.

## Test evidence
I re-ran:
```bash
cd backend && go test ./internal/cctv/...
```
Result:
- `ok github.com/duali/dm3-backend/internal/cctv (cached)`

That is a good sign. The package is not in a broken compile/test state.

But passing tests do **not** cover the response-contract mismatch strongly enough, otherwise the `playback_url` vs `url` bug would likely have been caught.

## Recommendation before merge
I would merge this plugin **after** these are fixed:

1. **Fix clip playback response contract**
   - backend, shared client, and `CCTVClipsPage.tsx` must agree on the exact field name
2. **Clean up clip DTO alignment**
   - make sure list/get responses match what the frontend actually renders
3. **Confirm camera ↔ access-point binding path**
   - either make it explicit in backend create/update flow or stop pretending the UI can edit it
4. **Decide whether private-LAN RTSP URLs are intentionally unsupported**
   - if yes, document it clearly
   - if no, relax validation in a controlled way

## Final recommendation
- **Risk:** MEDIUM
- **Recommendation:** NEEDS CHANGES, but close

This plugin is much closer to mergeable than some of the earlier DM3 modules I reviewed. The core service shape is solid.

But the clip playback contract bug is too central to wave away. Fix that first, then I’d be comfortable doing a final quick re-review.