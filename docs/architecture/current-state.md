# DM3 — Current Deployment State

**Status:** Reflects what is actually running, not the long-term vision.
**Source of truth:** `docker-compose.prod.yml` on the `develop` branch.
**Companion diagram:** [`diagrams/current-deployment.drawio`](../../diagrams/current-deployment.drawio)
**Last verified:** 2026-04-13 (deployed to `dm3.demasterpro.com`)

> For the aspirational architecture (full vertical apps, AI/ML pipeline, all integrations),
> see [`system-architecture.md`](./system-architecture.md). This file is the **as-built**
> view — it omits anything we have not deployed yet.

---

## 1. What is actually deployed

### 1.1 Backend services (8 Go binaries, one Go module)

| Service          | Port | Schema          | Role                                                                |
| ---------------- | ---- | --------------- | ------------------------------------------------------------------- |
| `auth-svc`       | 8005 | `dm3_auth`      | login, JWT issue/refresh, two-step (company code → credentials)     |
| `identity-svc`   | 8004 | `dm3_identity`  | users, companies, departments, photos                               |
| `access-svc`     | 8003 | `dm3_access`    | rules, schedules, doors, **access_events** (TimescaleDB hypertable) |
| `device-gateway` | 8002 | `dm3_devices`   | MQTT bridge, device provisioning, WS push to webapp                 |
| `audit-svc`      | 8001 | `dm3_audit`     | NATS consumer + query API; **audit_logs** is INSERT+SELECT only     |
| `visitor-svc`    | 8006 | `dm3_visitor`   | plugin-gated visitor management                                     |
| `parking-svc`    | 8007 | `dm3_parking`   | plugin-gated parking sessions / ANPR-fed                            |
| `cctv-svc`       | 8008 | `dm3_cctv`      | cameras, clips, MediaMTX control plane                              |

Init container (runs once, then exits):

| Container | Role |
| --------- | ---- |
| `migrate` | `golang-migrate` against TimescaleDB; current head = `000014_parking_matched_by_expand` |

Profile-gated (not in default `up`):

| Container | Profile | Role |
| --------- | ------- | ---- |
| `simulator`  | `staging` | Synthetic device fleet (5 devices) for staging smoke |

### 1.2 Frontend

| Container | What it serves                                                              |
| --------- | --------------------------------------------------------------------------- |
| `webapp`  | Vite + React 19 build of `apps/console`, served by an internal nginx on :80 |

The other vertical apps (`school`, `factory`, `apartment`) referenced in the high-level
architecture **do not exist as deployable artifacts yet** — only `apps/console` is built
and shipped. Treat them as roadmap.

### 1.3 Infrastructure

| Container        | Image                          | Role                                                       |
| ---------------- | ------------------------------ | ---------------------------------------------------------- |
| `timescaledb`    | `timescale/timescaledb:2.17.2-pg16` | All app data + hypertables (access_events, audit_logs) |
| `nats`           | `nats:2.10-alpine`             | JetStream message bus                                      |
| `emqx`           | `emqx/emqx:5.8.3`              | MQTT broker for devices                                    |
| `valkey`         | `valkey/valkey:8.0-alpine`     | Cache / device sessions / rate limit                       |
| `minio`          | `minio/minio:latest`           | S3-compatible object store (CCTV clips today, blobs later) |
| `mediamtx`       | `bluenviron/mediamtx:1.9.3`    | RTSP ingest + WebRTC/WHEP + LL-HLS egress                  |
| `nginx`          | `nginx:alpine`                 | Reverse proxy; joins `dm3-internal` and external `dmpw-net` |

### 1.4 Volumes

`timescaledb_data`, `emqx_data`, `nats_data`, `valkey_data`, `minio_data`,
`certbot_webroot`.

### 1.5 Networks

* **`dm3-internal`** — bridge, all containers join.
* **`dmpw-net`** — external, only `nginx` joins; this is how the host's main reverse
  proxy reaches us by container name.

---

## 2. Data flows

The numbering matches the arrows in `current-deployment.drawio`.

### Request plane (browser ⇄ services)

1. **Browser → nginx** (HTTPS, via dmpw-net). nginx terminates TLS at the host proxy,
   serves the webapp static bundle, and reverse-proxies `/api/*` to the appropriate
   `*-svc` on `dm3-internal`. **(arrows ① ② ⑳)**

### Device plane (MQTT)

3. **Devices → EMQX** (`tcp://emqx:1883`, MQTT/MQTTS). Persistent sessions; bootstrap
   creds gated by `BOOTSTRAP_SECRET` and signed by `KNOWN_APP_SIGNATURES`. **(③)**
4. **EMQX ⇄ device-gateway** — device-gateway subscribes to device topics and publishes
   commands. **(④)**
5. **device-gateway ⇄ Valkey** — short-lived session/rate-limit/last-seen cache. **(⑤)**

### Access decision plane (NATS)

6. **device-gateway → NATS** publishes access events on `dm3.devices.{tenantId}.{deviceId}.evt`.
   `tenantId` is encoded in the subject (do not trust payload alone). **(⑥)**
7. **NATS → access-svc** consumes the access-event stream, evaluates rules, and writes to
   the database. **(⑦)**
8. **access-svc → TimescaleDB** — INSERT into `dm3_access.access_events` hypertable. **(⑧)**

### Audit plane (NATS, fan-in)

9. **Every app service → NATS** — services publish audit entries on `dm3.audit.{service}`
   via `pkg/audit.Logger`. (Fire-and-forget from the service's perspective.) **(⑨)**
10. **NATS → audit-svc** consumes `dm3.audit.>` and **batch-INSERTs** into
    `dm3_audit.audit_logs`. The application DB role has UPDATE/DELETE revoked on this
    table — audit is INSERT+SELECT only. Retention: 2 years, compression after 30 days. **(⑩)**

### Video plane (MediaMTX)

11. **Cameras → MediaMTX** push RTSP on :8554. **(⑪)**
12. **cctv-svc → MediaMTX** controls the broker via its HTTP API on :9997 (provision
    paths, fetch path state). Auth uses `MEDIAMTX_API_USER` / `MEDIAMTX_API_PASS`. **(⑫)**
13. **cctv-svc → NATS** subscribes to access events to drive clip-on-event. **(⑬)**
14. **cctv-svc → MinIO** writes clip blobs (S3 PUT). **(⑭)**
15. **Browser → nginx → MediaMTX** for live view: WebRTC/WHEP on :8889 or LL-HLS on :8888.
    The browser never reaches MediaMTX directly — nginx fronts it on
    `MEDIAMTX_WHEP_BASE` / `MEDIAMTX_HLS_BASE`. **(⑮)**

### Storage plane

16. **All app services ⇄ TimescaleDB.** Every query touching tenant data has an
    explicit `WHERE tenant_id = $N`; INSERTs bind `tenant_id` as a real column.
    **No magic query rewriter** — we removed one because string-matching SQL to inject
    tenant filters masked isolation bugs. Cross-tenant lookups go through
    `internal/tenant/middleware.go::ValidateResourceAccess`. **(⑯)**
17. **identity-svc ⇄ MinIO** — profile photos are S3 PUT to bucket `${OBJECT_STORE_BUCKET:-dm3}`
    under key `tenants/{tenantId}/identity/users/{userId}/{variant}{ext}`. Browsers
    fetch them through `nginx → identity-svc /photos/{key}`, which streams from MinIO
    after a tenant-prefix isolation check (`ServeManagedPhoto` in
    `internal/identity/storage.go`). No local-FS photo path is configured in compose. **(⑰)**
18. **migrate → TimescaleDB** runs once per deploy and exits 0; every app service
    `depends_on: migrate: service_completed_successfully`. **(⑱)**

---

## 3. Notable deltas from `system-architecture.md`

If you only ever read the C4 doc, here is what is different on the ground today:

* **Vertical apps:** only `console` exists. School / factory / apartment forks are
  documented intent, not running services.
* **AI/ML pipeline:** not deployed. No vector DB, no inference workers, no pipeline
  containers. The `ai-pipeline-diagram.drawio` is roadmap.
* **External integrations:** none of the HR / LDAP / Calendar / Payment / Messaging
  integrations are wired up in production yet.
* **Audit:** the C4 doc treats audit as in-process. In reality `audit-svc` is a
  standalone NATS consumer + query API and the audit table is restricted to
  INSERT+SELECT for the app role.
* **Plugins:** `visitor-svc`, `parking-svc`, `cctv-svc` are gated by tenant plugin
  flags — they ship in the image but only do work for tenants that enable them.
* **Cache & object store:** Valkey is deployed but lightly used today (device
  sessions / rate-limit only). MinIO holds CCTV clips and identity profile photos
  (single bucket `${OBJECT_STORE_BUCKET:-dm3}`, prefixed by tenant).
* **Reverse proxy:** the C4 doc does not show `nginx`. In reality nginx is the only
  thing on `dmpw-net`; everything else is reachable only on `dm3-internal`.

---

## 4. Operational notes

* **Secrets** are sourced from GitLab CI/CD project variables (Settings → CI/CD →
  Variables, Protected + Masked). `scripts/write-ci-env.sh` materializes `.env` from
  those at job time, with `trap 'rm -f .env' EXIT` for cleanup.
  `scripts/check-deploy-env.sh` is a second-line fast-fail.
* **Required secrets:** `DB_PASSWORD`, `JWT_SECRET`, `MINIO_ROOT_PASSWORD`,
  `BOOTSTRAP_SECRET`, `CCTV_CREDENTIAL_KEY` (must base64-decode to exactly 32 bytes —
  generate with `openssl rand -base64 32`).
* **Stale-container cleanup:** the deploy job runs `docker rm -f` on any `dm3-*`
  container before `compose up`, because compose's `down` only touches the current
  project name and our `container_name:` values are global.
* **Healthchecks:** every app service exposes `/healthz`; nginx waits on all of them.
  cctv-svc must be healthy before nginx will start (compose `depends_on:
  service_healthy`).
* **CI flow:** `verify:compose`, `verify:backend`, `verify:frontend` run on `develop`
  and tag pushes; `deploy:staging` runs on `develop` only; `deploy:production` is
  manual on `vX.Y.Z` tags.

---

## 5. Maintaining this document

When you add or remove a container, change a port, or wire a new data flow, update
**both** the diagram (`current-deployment.drawio`) and this file. The C4 docs in
`system-architecture.md` describe intent and can drift from reality — this file is the
contract that says "this is what is running right now."
