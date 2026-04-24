# cctv-agent

LAN-side service that exposes a local HTTP API + web console for
commanding cameras on the customer's private network. Eventual goal:
bridge DM3 cloud → cam, but the current build runs **standalone** and
is driven either from the browser console at `http://<agent>:8088/`
or by a direct HTTP client (curl, Postman, a future server).

See [`CAMERAS.md`](./CAMERAS.md) for the per-vendor feature matrix.

---

## Why this exists

`cctv-svc` on the DM3 server can receive events *from* cameras (cams
initiate the connection) but **cannot** open commands *into* the
customer's LAN because cams sit on private IPs. This agent runs on a
small Ubuntu / Windows box on the same LAN as the cams, speaks every
vendor's HTTP/SOAP dialect, and exposes a single clean JSON surface
(`POST /v1/commands`) for callers.

```
Today:
  [you / browser] --HTTP--> [cctv-agent on LAN] --HTTP/SOAP--> [cam]

Tomorrow (when we wire MQTT — see "Connecting to DM3 server"):
  [cctv-svc] --MQTT--> [EMQX] --MQTT--> [cctv-agent on LAN] --HTTP/SOAP--> [cam]
```

The agent never makes outbound connections to the internet at
runtime. Fully air-gap-capable once the binary is in place.

---

## Build & run

```bash
cd cctv-agent
go mod tidy                         # one-time, online
make build-linux VERSION=0.1.0      # bin/cctv-agent-linux-amd64
make build-windows VERSION=0.1.0    # bin/cctv-agent-windows-amd64.exe

cp agent.yml.example agent.yml      # fill http.addr if you like
./bin/cctv-agent -config agent.yml
```

- Default listen: `127.0.0.1:8088` (loopback).
- To accept commands from other LAN hosts, set `http.addr: "0.0.0.0:8088"`
  in `agent.yml`. There is **no transport-level auth** today — only open
  on trusted networks.

### systemd unit (Ubuntu)

```ini
[Unit]
Description=DM3 CCTV LAN Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/cctv-agent
ExecStart=/opt/cctv-agent/cctv-agent -config /opt/cctv-agent/agent.yml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Windows service

Build with `make build-windows VERSION=0.1.0`, drop the `.exe` +
`agent.yml` into `C:\ProgramData\cctv-agent\`, and register via NSSM
or `sc.exe create`.

---

## Web console (recommended for manual ops)

Open `http://<agent-host>:8088/` in a browser. A single-page UI
ships embedded in the binary (no internet required).

Layout:

```
┌──────────────────┬─────────────────────────────────────────┐
│ Target camera    │ Tungson commands                        │
│ IP, user, pass   │ ┌────────────────────┐                  │
│                  │ │ Identity:          │                  │
│ Discovery        │ │   get_device_info  │                  │
│ [ONVIF discover] │ │   get_version …    │                  │
│ [CIDR scan]      │ │                    │                  │
│                  │ │ PTZ — directional: │                  │
│ Discovered cams  │ │       ▲            │                  │
│ 192.168.1.234    │ │   ◀  ■  ▶   (hold) │                  │
│ 192.168.1.251    │ │       ▼            │                  │
│ …                │ │   +zoom  −zoom     │                  │
│                  │ │                    │                  │
│                  │ │ Preset / lens /    │                  │
│                  │ │ system / …         │                  │
│                  │ └────────────────────┘                  │
│                  │ Last response panel (JSON, timing)      │
└──────────────────┴─────────────────────────────────────────┘
```

- Credentials (cam IP, user, pass, CIDR, preset ID) are kept in
  `localStorage` so a browser reload preserves them.
- PTZ direction buttons are **press-and-hold**: `mousedown` sends an
  ONVIF `ContinuousMove`, `mouseup` sends `Stop`. Speed slider
  (0.1–1.0) scales velocity.
- Clicking a row in the discovered-cams list autofills the IP field.

---

## HTTP API

### Envelope

```http
POST /v1/commands
Content-Type: application/json

{
  "type":      "<command>",
  "protocol":  "viid_tungson" | "onvif",
  "camera_ip": "192.168.1.234",      // optional for scan/discover/ptz_move (see below)
  "username":  "admin",
  "password":  "…",
  "params":    { ... type-specific ... }
}
```

Response is always HTTP 200 (unless the envelope itself is malformed):

```json
{ "success": true,  "data": { ... cam JSON ... }, "duration_ms": 142 }
{ "success": false, "error": "cam returned status=-1 msg=\"bad preset\"", "duration_ms": 27 }
```

### Commands — `protocol: "onvif"`

| `type` | Params | Purpose |
|---|---|---|
| `discover` | `timeout_ms`, `interface` (optional) | Multicast WS-Discovery probe to `239.255.255.250:3702`. Finds cameras on the same L2 broadcast domain even when they're on a different subnet (factory-default IPs). |
| `ptz_move` | `xaddr` (required), `pan`, `tilt`, `zoom` (all -1..1), `duration_ms` (0 = hold until stop) | ONVIF ContinuousMove joystick. When called with `duration_ms > 0`, the agent blocks for that duration and then auto-sends Stop. When `duration_ms = 0`, the caller issues `ptz_stop` on release. |
| `ptz_stop` | `xaddr`, `stop_pan_tilt`, `stop_zoom` (both default true) | ONVIF Stop. |

`xaddr` is the ONVIF device_service URL from a prior `discover`
response, e.g. `http://192.168.1.222:8091/onvif/device_service`.
When absent we fall back to `http://{camera_ip}:80/onvif/device_service`,
which works for cams that publish on the default port.

### Commands — `protocol: "viid_tungson"`

See [`CAMERAS.md`](./CAMERAS.md) for the authoritative feature matrix
and vendor doc page references. Summary by area:

| Area | Gets (read-only) | Typed sets | Generic escape hatch |
|---|---|---|---|
| Discovery | `scan` (params `cidr`, `timeout_ms`, `concurrency`) | — | — |
| Identity / status | `get_device_info`, `get_run_status`, `get_version`, `get_user` | — | — |
| Time / timezone | `get_timezone` | `set_time` (`time` unix s, `timezone_minutes`, `ntp_server`, `ntp_interval_sec`, `mode`) | — |
| Network | `get_network`, `get_ip_conflict` | `set_network` (`dhcp`, `ip`, `netmask`, `gateway`, `dns`) | — |
| Platforms — GB/T 28181 | `get_gb28181` (`secondary`) | `set_gb28181` (full server/port/id/proto_type/protocol_version/gb35114_level…) | — |
| Platforms — GA/T 1400 | `get_gat1400` | `set_gat1400` (`enable`, `gat_1400_addr`, `user`, `password`, `hart_time`, `hart_num`, `re_upload`, `report_image_mode`, `channel_id`, `device_id`) | — |
| Stream (main/sub) | `get_stream` (`sub: bool`) | `set_stream` (`sub`, `bm_type`, `frame`, `fbl`, `bitrate`, `I_interval`, `quality`, `rc_mode`, `smart_encode`) | — |
| RTMP push | `get_rtmp` | `set_rtmp` (`enable`, `audio`, `addr`, `stream_no`) | — |
| OSD | `get_osd` | — (use generic `cfg_set` with `action: "osd"`) | — |
| Audio | `get_audio` | — | — |
| Recording | `get_recording` | `set_recording` (`enable`, `all_time`, `period`, `pre_record`) | — |
| Timed snapshot | `get_timed_capture` | `set_timed_capture` (`enable`, `all_time`, `interval_time`, `period`) | — |
| Light | `get_light_mode` | `set_light_mode` (`light_level`, `light_wkmode` 1=IR/2=color/3=smart) | — |
| Work mode (ISP + light schedule) | `get_work_mode` | `set_work_mode` (`antiflicker`, `wdr`, `flip`, `mirror`, `ai_isp_mode`, `af_mode`, `light_level`, `light_mode`, `light_period`) | — |
| Image params (ISP) | `get_image_params` | — (use generic `cfg_set` with `action: "image"`) | — |
| AI algorithm switch | `get_ai_type` | `set_ai_type` (`ai_type`) | — |
| Privacy / ROI / occlusion / silent | `get_privacy_cover`, `get_roi`, `get_occlusion`, `get_silent` | — | — |
| Alarms | `get_alarm_out`, `get_alarm_in` | — | — |
| Storage | `get_tf_card` | — | `format_tf_card` (destructive) |
| Auth | — | `set_password` (`user` required = current user, `pass` new < 64 chars) | — |
| Preset / PTZ | `get_presets` | `goto_preset` (`id`), `set_preset` (`id`), `ptz_action` (`action`) | — |
| Lens | — | `align_zoom_curve`, `focus_assist`, `lens_init` | — |
| System | — | `reboot`, `factory_reset` (⚠), `enable_file_list` (`enable`) | — |
| **Generic escape hatches** | `cfg_get` (`name`) — any documented `cfg_get&name=<name>` | `cfg_set` (`action`, `body`) — any `cfg_<action>` POST with raw JSON body | — |

PTZ `action` values: `guard`, `cruise_start`, `cruise_stop`,
`line_scan_start`, `line_scan_stop`, `refocus`, `lens_self_check`,
`ptz_self_check`, `stop_tracking`, `clear_presets`.

**Why the escape hatches matter:** TungSon ships many more config
pages than we've typed (page 298031302/303/304 audio/tf_card/…,
308 OSD structure, 455 privacy polygons, …). `cfg_get {name: "audio"}`
and `cfg_set {action: "audio", body: {…}}` let an operator drive
any of them without us rebuilding the agent — the cam endpoint is
always `/cgi-bin/vs_cgi_v2?act=cfg_get&name=<name>` for reads and
`?act=cfg_<action>` for writes.

### Minimal curl examples

```bash
# Discover cams on the LAN (cross-subnet)
curl -s http://127.0.0.1:8088/v1/commands -H 'Content-Type: application/json' \
  -d '{"type":"discover","protocol":"onvif","params":{"timeout_ms":5000}}'

# ONVIF joystick — pan right at 0.5 speed for 800 ms
curl -s http://127.0.0.1:8088/v1/commands -H 'Content-Type: application/json' \
  -d '{"type":"ptz_move","protocol":"onvif",
       "username":"admin","password":"PASS",
       "params":{"xaddr":"http://192.168.1.234:8091/onvif/device_service",
                 "pan":0.5,"tilt":0,"zoom":0,"duration_ms":800}}'

# Sync cam clock to agent's clock, UTC+7
curl -s http://127.0.0.1:8088/v1/commands -H 'Content-Type: application/json' \
  -d '{"type":"set_time","protocol":"viid_tungson",
       "camera_ip":"192.168.1.234","username":"admin","password":"PASS",
       "params":{"timezone_minutes":420,"mode":0}}'

# Reboot
curl -s http://127.0.0.1:8088/v1/commands -H 'Content-Type: application/json' \
  -d '{"type":"reboot","protocol":"viid_tungson",
       "camera_ip":"192.168.1.234","username":"admin","password":"PASS"}'
```

---

## Connecting to the DM3 server (roadmap)

The current agent is local-only. To bridge it to cloud `cctv-svc`
we'll add MQTT subscribe/publish. Nothing in the dispatcher or
adapters needs to change — just a new transport.

### Wire protocol (planned)

Server and agent agree on two MQTT topics under the existing EMQX:

```
dm/agent/{tenant_id}/{agent_id}/cmd    ← server publishes commands
dm/agent/{tenant_id}/{agent_id}/resp   ← agent publishes responses
```

Message payload on `cmd` is exactly today's `commands.Request`
envelope (JSON). Response on `resp` is exactly `commands.Response`
with an additional `id` field for ack correlation:

```json
// cmd topic
{
  "id":        "<uuid>",
  "type":      "ptz_move",
  "protocol":  "onvif",
  "camera_ip": "192.168.1.234",
  "username":  "admin",
  "password":  "…",
  "params":    { "xaddr": "…", "pan": 0.5, "duration_ms": 800 }
}

// resp topic
{
  "id":           "<uuid>",       // echoes cmd.id
  "success":      true,
  "data":         { … },
  "error":        "",
  "duration_ms":  142
}
```

### Agent-side work remaining

1. Add `internal/mqttbridge/` package that subscribes `cmd` and
   pushes each parsed message through the existing `commands.Dispatcher`,
   then publishes to `resp`.
2. Wire it in `cmd/cctv-agent/main.go` behind a config flag so
   `mqtt.broker_url` empty → standalone; populated → also run bridge.
3. Populate the `agent:` / `mqtt:` sections of `agent.yml` at install
   time. The fields are already defined in `internal/config/config.go`;
   the bridge just needs to consume them.
4. On bridge startup, publish a one-shot `dm/agent/{tenant_id}/{agent_id}/online`
   heartbeat so the server knows the agent is alive and can register it.

### Server-side work remaining

1. Extend `backend/internal/cctv/` with an `AgentCommandPublisher`
   (mirror of the existing terminal sync pattern) that publishes a
   command envelope + waits for matching `resp.id` with a timeout.
2. Add a DB table `dm3_cctv.agents (id, tenant_id, agent_id, last_seen, version)`
   so the UI can list registered agents and show online/offline state.
3. Expose REST endpoints that the console UI will call:
   - `POST /api/v1/cctv/agents/{agent_id}/commands` — forwards to the
     agent via MQTT and returns the agent's response.
   - `GET /api/v1/cctv/agents` — list + status.
4. Add an Agents page to the console UI with a toolbar that mirrors
   the agent's local web console (joystick, scan, set_time, reboot, …).

### Configuration at install time (planned)

`agent.yml` will look like this once the bridge exists:

```yaml
http:
  addr: "127.0.0.1:8088"        # keep for local console

agent:
  tenant_id: "00000000-0000-0000-0000-000000000001"
  agent_id:  "lan-hanoi-office-main"

mqtt:
  broker_url: "tcp://dm3-mqtt.example.com:1883"   # or tls:// in prod
  username:   "agent-client"
  password:   "<provisioned>"
```

Provisioning flow (sketch):

1. Operator adds a new agent in the DM3 console. Server generates
   tenant_id + agent_id + a one-shot bootstrap token.
2. Operator installs the binary on the LAN box and runs
   `./cctv-agent register --token <bootstrap>` (future CLI). That
   subcommand exchanges the token for permanent MQTT creds and writes
   `agent.yml`.
3. `systemctl start cctv-agent` (or Windows equivalent) — the agent
   starts both the local HTTP console AND the MQTT bridge.

### What doesn't change when we add the bridge

Everything under `internal/adapters/` and `internal/commands/` is
transport-agnostic. The same dispatcher that serves the local HTTP
handler today will serve MQTT messages tomorrow. That's the whole
point of keeping it a single `Dispatcher.Dispatch(ctx, Request)` call.

---

## Project layout

```
cctv-agent/
  cmd/cctv-agent/main.go            entry point
  internal/
    config/config.go                YAML loader
    httpapi/
      httpapi.go                    POST /v1/commands, GET /healthz, GET /
      ui.html                       embedded single-page console
    commands/dispatcher.go          routes Request → adapter call
    adapters/
      onvif/
        discover.go                 WS-Discovery multicast
        ptz.go                      ContinuousMove / Stop + profile cache
        wssec.go                    WS-Security username+digest helper
      tungson/
        client.go                   login + cfg_get/cfg_set/action primitives
        tungson.go                  per-API wrappers (time, reboot, …)
        ptz.go                      preset + special-preset actions
        scan.go                     CIDR HTTP sweep
  agent.yml.example                 config template
  Makefile                          build-linux / build-windows / run / lint
  README.md                         this file
  CAMERAS.md                        per-vendor feature matrix
```

## Adding a new command (Tungson)

1. Implement the HTTP call as a method on `tungson.Client`
   (`internal/adapters/tungson/`), citing the vendor doc page ID in
   a comment.
2. Add a `case "<name>":` branch in `dispatcher.go:dispatchTungson`.
3. Add the name to `tungsonKnownType` so unknown types fail fast
   without a login round-trip.
4. Add a button in `ui.html` under the appropriate group.
5. Document it in the table above + `CAMERAS.md`.

## Adding a new protocol

1. Create `internal/adapters/<vendor>/` with a `Client` and per-API
   methods.
2. Add a `case "<protocol>":` branch in `dispatcher.go:Dispatch`
   plus a matching `dispatch<Vendor>` helper.
3. Add a panel to `ui.html` and a section to `CAMERAS.md`.

---

## Ports

| Port | Purpose |
|---|---|
| 8088 | Local HTTP API + web console |
| Cam HTTP (80, 8091, …) | Outbound only, agent → cam |
| UDP 3702 multicast | ONVIF WS-Discovery |
| MQTT 1883/8883 | **Not used today**; planned for the server bridge |

## Vendor references

- TungSon VIID / HTTP docs book: `http://yctx.vs98.com:1381/web/#/601874687`
  (技术文档--可对外共享). Each implemented TungSon method cites its
  page ID in the source comment.
- ONVIF Core 2.12 + PTZ 2.4 WSDL: `https://www.onvif.org/profiles/specifications/`.
  We don't pull the WSDL; requests and responses are hand-built SOAP
  because the protocol is small and generated clients are heavy.
