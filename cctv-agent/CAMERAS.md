# Camera feature matrix

Status of every camera protocol the agent can talk to. One row per
command; implemented means it ships in the current `bin/cctv-agent`,
planned means the vendor API is documented but the adapter isn't
written yet.

Protocol IDs shown here match the `protocol` field on the HTTP
command envelope (`POST /v1/commands`).

---

## Cross-vendor (`protocol: "generic"`)

Utilities that aren't tied to a single vendor API. Use these first
when you don't yet know what's on the LAN.

| Command | Status | Notes |
|---|---|---|
| `brand_probe` | ✅ implemented | HTTP-fingerprints an IP (or list) against 7 vendor detectors (tungson, hikvision, dahua, axis, uniview, hanet, generic_onvif). Unauth — works even when the cam rejects anonymous requests (a `401 Digest` from `/ISAPI/` is a positive Hikvision hit). Returns `vendor` (best match), `matches[]` (all detectors that fired), and `evidence{}` (why each matched). Params: `ip` or `ips[]`, `timeout_ms`, `concurrency`. |

The normal onboarding flow:

```
1. ONVIF discover           → list of cams on the L2 broadcast domain
2. brand_probe on those IPs → which vendor API each speaks
3. per-vendor adapter       → control the cam (today: tungson; roadmap: hikvision, dahua, …)
```

---

## ONVIF (discovery-only) — `protocol: "onvif"`

Cross-vendor standard. Today we only use it for network discovery —
the ONVIF service endpoints exposed on each camera (`/onvif/…`) are
NOT yet driven. Any vendor that answers WS-Discovery multicast will
show up here, regardless of whether we then have a protocol-specific
adapter to control it.

| Command | Status | Notes |
|---|---|---|
| `discover` | ✅ implemented | Multicast probe to `239.255.255.250:3702`, collects `ProbeMatch` for `timeout_ms` (default 3 s). Returns IP, XAddr, Types, Scopes, vendor hint. Works across subnets on the same L2 broadcast domain — solves the factory-default-IP case (e.g. cam lands on 192.168.168.125 when agent is on 192.168.1.x). |
| `ptz_move` | ✅ implemented | SOAP `ContinuousMove` against the cam's `/onvif/ptz_service`. Accepts `pan`, `tilt`, `zoom` velocities in [-1, 1] plus optional `duration_ms` for auto-stop. On first call per cam the agent fetches a Media profile token via `GetProfiles` and caches it. Drives the web console's joystick (press-and-hold). |
| `ptz_stop` | ✅ implemented | SOAP `Stop`, cancels any in-flight ContinuousMove. `stop_pan_tilt` and `stop_zoom` both default true. |
| Device service calls (GetDeviceInformation, GetCapabilities, …) | ⏳ planned | Use `XAddrs[0]` from discover + operator credentials to talk SOAP. Gives vendor-neutral model/firmware/serial extraction. |
| Absolute / relative PTZ moves, presets | ⏳ planned | `AbsoluteMove`, `RelativeMove`, `GotoPreset`, `SetPreset` over ONVIF. Useful when we can't talk a vendor's native API. |
| ONVIF Media, Imaging, Events | ⏳ planned | Stream URI lookup, brightness/contrast, event subscription. |

---

## TungSon — `protocol: "viid_tungson"`

Native HTTP API on `/cgi-bin/vs_cgi_v2`. Vendor docs:
`http://yctx.vs98.com:1381/web/#/601874687` (book 技术文档--可对外共享).
Every implemented method cites its page ID in the source comments.

### Discovery & identity

| Command | Status | Vendor endpoint | Description |
|---|---|---|---|
| `scan` | ✅ | n/a (parallel HTTP probe) | CIDR sweep: probes `cfg_get&name=version` on every host in `params.cidr`, keeps responders that return a TungSon-shaped envelope. Needs known subnet. Params: `cidr`, `timeout_ms` (default 700), `concurrency` (default 64). |
| `get_device_info` | ✅ | `cfg_get&name=dev` | Capabilities: codec/resolution lists, PTZ/wifi/LTE flags, ROI/privacy support, alarm IO counts. |
| `get_run_status` | ✅ | `cfg_get&name=run_status` | Tiny: current cruise state (0/1). |
| `get_version` | ✅ | `cfg_get&name=version` | `chipsn`, `hid`, `model`, `p2p`, `version`, kernel/busybox build dates. |
| `get_user` | ✅ | `cfg_get&name=user` | Current admin username only. |

### Time / timezone — page 298031305

| Command | Status | Endpoint | Description |
|---|---|---|---|
| `get_timezone` | ✅ | `cfg_get&name=timezone` | Returns minute offset, NTP server, interval, `timing_mode`. |
| `set_time` | ✅ | `cfg_timezone` (POST) | Accepts `time` (unix s), `timezone_minutes`, `ntp_server`, `ntp_interval_sec`, `mode` (0 sync-from-agent, 1 NTP, 2 ONVIF, 3 GB, 4 GA/T1400). |

### Auth — page 298031306

| Command | Status | Endpoint | Description |
|---|---|---|---|
| `set_password` | ✅ | `cfg_user` (POST) | Params `{user, pass}`. `user` must equal the cam's current username or the cam rejects. New password < 64 chars. |

### Network / platforms

| Command | Status | Endpoint | Page |
|---|---|---|---|
| `get_network`, `set_network` | ✅ | `cfg_get&name=network` / `cfg_network` | 298031293. Supports DHCP toggle + static (`ip`, `netmask`, `gateway`, `dns`). |
| `get_ip_conflict` | ✅ | `cfg_get&name=ip_conflict` | 298031315. Probes LAN for duplicate IPs. |
| `get_gat1400`, `set_gat1400` | ✅ | `cfg_get&name=gat1400` / `cfg_gat1400` | 298031311. Platform enable, address, credentials, channel ID, heartbeat interval, offline buffering, image-report mode. |
| `get_gb28181`, `set_gb28181` | ✅ | `cfg_get&name=gb28181[_1]` / `cfg_gb28181[_1]` | 298031310. Primary + secondary (`secondary: true`) SIP registrations, GB/T 35114 security level, protocol version, lat/lon. |
| `get_rtmp`, `set_rtmp` | ✅ | `cfg_get&name=rtmp` / `cfg_rtmp` | 298031307. Push-RTMP target URL + audio toggle + main/sub stream. |

### Stream / media / OSD / recording / snapshot

| Command | Status | Endpoint | Page |
|---|---|---|---|
| `get_stream`, `set_stream` | ✅ | `cfg_get&name=video[1]` / `cfg_video[_1]` | 298031291. Main (`sub: false`) or sub stream. Codec H264/H265, framerate, resolution index, bitrate, GOP, quality, rate-control mode, smart-encode toggle. |
| `get_osd` | ✅ | `cfg_get&name=osd` | 298031308. 8 OSD lines + date/time format. Setter intentionally exposed only via generic `cfg_set` (body shape is nested + vendor-specific). |
| `get_audio` | ✅ | `cfg_get&name=audio` | 298031303. Setter via `cfg_set`. |
| `get_recording`, `set_recording` | ✅ | `cfg_get&name=record` / `cfg_record` | 298031302. Toggle, 24×7 vs schedule, `period[7][5]` of `"H:M~H:M"`, `pre_record` seconds. |
| `get_timed_capture`, `set_timed_capture` | ✅ | `cfg_get&name=timedcapture` / `cfg_timedcapture` | 298031312. Enable, all-day, per-day schedule, interval. |

### Light / ISP / work mode

| Command | Status | Endpoint | Page |
|---|---|---|---|
| `get_light_mode`, `set_light_mode` | ✅ | `cfg_get&name=light_mode` / `cfg_light_mode` | 298031309. Brightness (0-100) + `light_wkmode` (IR / full colour / smart). |
| `get_work_mode`, `set_work_mode` | ✅ | `cfg_get&name=light_work` / `cfg_light_work` | 298031320. "Parameter config per mode" — anti-flicker (50/60 Hz), WDR, flip, mirror, AI-ISP mode (denoise variants), AF mode (auto/manual), light brightness, day/night switch (auto vs timed `light_period`). |
| `get_image_params` | ✅ | `cfg_get&name=image` | 298031457. ISP image tunables (brightness/contrast/etc). Setter via `cfg_set`. |

### AI — algorithm switch

| Command | Status | Endpoint | Notes |
|---|---|---|---|
| `get_ai_type`, `set_ai_type` | ✅ | `cfg_get&name=ai_type` / `cfg_ai_type` | Exposed under device capability `ai_choose` (page 298031290). Setter names are best-effort — if a given firmware uses different suffixes, fall back to generic `cfg_set`. |

### Privacy / ROI / occlusion / silent

| Command | Status | Page | Notes |
|---|---|---|---|
| `get_privacy_cover` | ✅ | 298031455 | Frame regions masked out. Setter via `cfg_set`. |
| `get_roi` | ✅ | 298031454 | Regions of interest (higher quality). Setter via `cfg_set`. |
| `get_occlusion` | ✅ | 298031453 | Lens-cover detection. Setter via `cfg_set`. |
| `get_silent` | ✅ | 298031456 | Suppress non-essential alarms. Setter via `cfg_set`. |

### Alarm IO

| Command | Status | Page | Notes |
|---|---|---|---|
| `get_alarm_out` | ✅ | 298031313 | Relay states. Write (trigger) via `cfg_set` with action `alarm_out`. |
| `get_alarm_in` | ✅ | 298031314 | Input channel config. Write via `cfg_set` with action `alarm_in`. |

### Storage

| Command | Status | Page | Notes |
|---|---|---|---|
| `get_tf_card` | ✅ | 298031304 | Status, capacity, filesystem type. |
| `format_tf_card` | ✅ | 298031304 | ⚠ Wipes all recordings. |

### PTZ / presets — page 298031664

| Command | Status | Endpoint | Description |
|---|---|---|---|
| `get_presets` | ✅ | `cfg_get&name=preset` | Returns `max_num` + `id_list`. |
| `goto_preset` | ✅ | `cfg_goto_preset` (POST) | `{id: 1..224}` for user presets; 0/226-251 for vendor-reserved actions. |
| `set_preset` | ✅ | `cfg_set_preset` (POST) | Save current pan/tilt/zoom. |
| `ptz_action` | ✅ | → `goto_preset` with special ID | Symbolic shortcut. Values: `guard`, `cruise_start`, `cruise_stop`, `line_scan_start`, `line_scan_stop`, `refocus`, `lens_self_check`, `ptz_self_check`, `stop_tracking`, `clear_presets`. |
| Direct joystick pan/tilt/zoom | ✅ **via ONVIF** | — | Not a TungSon-native feature. Use `protocol: onvif`, `type: ptz_move` — see the ONVIF section above. |
| Cruise path config | ⏳ planned (via `cfg_set`) | `cfg_cruise` | Page 298031860. Define multi-preset cruise routes. |

### Lens — page 298031316

| Command | Status | Endpoint | Description |
|---|---|---|---|
| `align_zoom_curve` | ✅ | `cfg_align_curve` | Recalibrate zoom travel curve. |
| `focus_assist` | ✅ | `cfg_focus_assist` | One-shot autofocus helper. |
| `lens_init` | ✅ | `cfg_lens_init` | Reset lens motors to zero. |

### System — page 298031317

| Command | Status | Endpoint | Description |
|---|---|---|---|
| `reboot` | ✅ | `reboot` | Cam acks BEFORE rebooting. |
| `factory_reset` | ✅ | `reset` | ⚠ Destructive. |
| `enable_file_list` | ✅ | `cfg_ftp&enable=1/0` | Toggle `/record/` browsable listing. |

### Motion / intrusion

| Command | Status | Endpoint | Page |
|---|---|---|---|
| `get_motion_detect` | ✅ | `cfg_get&name=md` | 298031297. Setter via `cfg_set` — nested schedule/area, easier to form-shape on server. |
| `get_area_intrusion` | ✅ | `cfg_get&name=invade` | 298031299. Setter via `cfg_set`. |

### Generic escape hatches

These two commands let you call ANY TungSon config page — typed or
not — without rebuilding the agent.

| Command | Params | Calls |
|---|---|---|
| `cfg_get` | `{name}` | `GET ?act=cfg_get&name={name}` |
| `cfg_set` | `{action, body}` | `POST ?act=cfg_{action}` with JSON `body` |

Example: rotate password by hand via the escape hatch (equivalent to
`set_password` but works even if the typed command is missing):

```json
{"type":"cfg_set","protocol":"viid_tungson",
 "camera_ip":"192.168.1.234","username":"admin","password":"OLD",
 "params":{"action":"user","body":{"user":"admin","pass":"NEW"}}}
```

### Still-planned (not typed, not exposed via UI)

These are documented but haven't been wired as typed commands /
dedicated UI buttons. All are callable today via the `cfg_get` /
`cfg_set` escape hatches — the list is here so the next maintainer
knows what's available.

| Area | Page | Notes |
|---|---|---|
| WiFi config + scan | 298031295, 298031823 | Set SSID/pass, list nearby networks. |
| Firmware upgrade | 298031306 §3 | Push .bin firmware; cam reboots into new image. |
| Alarm audio file upload | 298031319 | Load custom alarm clips. |
| OBS cloud storage | 298031902 | Upload clips to vendor cloud / S3-compatible. |
| Cruise path config | 298031860 | Multi-preset routes + dwell/speed. |
| Log retrieval | 298031922 | Cam-side log export. |
| Remote audio playback | 298031928 | Push audio file for speaker out. |
| Transparent serial | 298031937 | Serial passthrough over the cam. |
| AI subscription (SDK-only) | 298031329 | Requires SDK/P2P bridge; out of scope for HTTP adapter. |
| Linkage config | 298031301 | How motion/intrusion/etc trigger outputs. |
| MagicMirror AI gateway | 298031318 | Vendor-specific AI hub integration. |
| MWP protocol | 298031959, 298031968-298031998 | Vendor's own IoT message protocol. |

### Known vendor quirks

These are baked into the adapter as defensive measures, so callers
don't need to know about them:

- **Face list is hard-capped by byte size.** Cam firmware advertises
  `Size=4` in its `ExtendFaceList` poll, but the device locks up
  (Keepalive + recognition frozen for minutes) past ~2 MB response.
  When bridging face sync from the cloud, cap by **bytes**, not
  count — the server-side fix lives at
  `backend/internal/cctv/tungson_handlers.go` `HandleExtendFaceList`.
- **`DC_<user_code>` is a marker, not an image.** After the cam
  confirms an add, the server plants a synthetic "face" credential
  with value `DC_000001` to remember the cam has that user. If the
  credential list is later re-used verbatim as base64 image data,
  the cam rejects every add as garbage. Adapters must skip `DC_*`
  values when producing face payloads.
- **`goto_preset` 0 is "go home", not "stop".** Preset 0 returns to
  the guard position (看守位). There is no "stop PTZ" — send another
  `goto_preset` to a new target.
- **Factory reset does not clear credentials the cam learned via
  VIID face sync** unless you also wipe via `clear_presets` or
  the cloud-side `EnqueueFullSync` deletes. Track this in cloud DB.

---

## Hikvision — `protocol: "hik_isapi"` (detector only, no commands yet)

Hikvision cameras speak **ISAPI** — a well-documented XML-over-HTTP
protocol also used by many OEM brands (LTS, CCTV-Direct, and any
Hik-based rebrand). `brand_probe` identifies them via `GET /ISAPI/System/deviceInfo`
(returns `HTTP 401 Digest` on factory default, `HTTP 200 <DeviceInfo>`
when anonymous probe is enabled).

| Command | Status | Notes |
|---|---|---|
| `brand_probe` → `hikvision` | ✅ | Fingerprint only; no control yet. |
| `get_device_info` (model/firmware/serial) | ⏳ planned | `GET /ISAPI/System/deviceInfo`, Digest auth. |
| `reboot`, `factory_reset` | ⏳ planned | `PUT /ISAPI/System/reboot`, `POST /ISAPI/System/factoryReset`. |
| `set_time` | ⏳ planned | `PUT /ISAPI/System/time` (XML body). |
| `ptz_move`, `ptz_stop`, `goto_preset`, `set_preset` | ⏳ planned (or use `onvif` today) | `PUT /ISAPI/PTZCtrl/channels/1/continuous`, `/presets/{id}/goto`. Meanwhile Hik cams respond to the ONVIF adapter. |
| Stream / OSD / image / motion / recording | ⏳ planned | Rich ISAPI surface covering most everything TungSon does. |

---

## Dahua — `protocol: "dahua"` (detector only, no commands yet)

Dahua + any Dahua-OEM brand (Lorex, Amcrest, …). Identified via
`GET /cgi-bin/magicBox.cgi?action=getSystemInfo` (401 or key=value
text body).

| Command | Status | Notes |
|---|---|---|
| `brand_probe` → `dahua` | ✅ | Fingerprint only. |
| Any control commands | ⏳ planned | Dahua uses `/cgi-bin/*.cgi?action=...` with Digest auth. Most operations exist on both the native CGI and via ONVIF. |

---

## Axis — `protocol: "axis"` (detector only)

`brand_probe` → `axis` via `GET /axis-cgi/param.cgi?action=list&group=Brand`.
Excellent ONVIF support — use the `onvif` protocol for control today.

---

## Uniview — `protocol: "uniview"` (detector only)

`brand_probe` → `uniview` via `GET /LAPI/V1.0/System/DeviceInfo`.
Uses LAPI (JSON/REST). Decent ONVIF support for basic operations.

---

## Hanet — `protocol: "hanet"` (detector only, largely cloud-managed)

Hanet cameras are primarily cloud-managed: they phone home to
Hanet's platform and pull config from there. For most workflows the
LAN agent is not in the path.

| Command | Status | Notes |
|---|---|---|
| `brand_probe` → `hanet` | ✅ (weak signal) | Matches on "hanet" string in the root page HTML; often the cam's login page. |
| Local HTTP control | ⏳ not documented publicly | Would need to reverse the firmware's local HTTP API. |
| Face sync / event push | out of scope | Goes via Hanet cloud from `cctv-svc`. |
| Basic PTZ / stream | ⏳ often works via `onvif` | Try ONVIF WS-Discovery — many Hanet models expose `/onvif/`. |

If a Hanet cam doesn't show up in discover, try pinging common ports
(554 for RTSP, 80 for HTTP login) to confirm it's on the LAN at all.

---

## TBVision — `protocol: "http_tbvision"` (not implemented)

Generic RTSP-only today: the repo models them with
`camera_protocol='http_tbvision'` and builds an RTSP URL at
`rtsp://{ip}:554/stream1`. HTTP control surface is vendor-specific
and not documented in our references.

| Command | Status |
|---|---|
| Any control | ⏳ needs vendor docs |
| ONVIF fallback | ✅ if the cam implements it |

---

## Generic RTSP — `protocol: "rtsp_only"` (not implemented)

Fallback used by `cctv-svc` when a camera doesn't match any known
vendor. No control surface exists beyond playing the RTSP stream.

| Command | Status |
|---|---|
| `discover` via ONVIF | ✅ (handled under the `onvif` protocol section above) |
| anything else | ❌ |

---

## Adding a new vendor

1. Create `internal/adapters/<name>/` with a `Client` type for
   per-cam session state and one exported function per API page.
   Cite the page ID in a comment above each method so the next
   maintainer can cross-check the wire format.
2. Add a `case "<protocol>":` branch to `dispatcher.go:Dispatch`,
   plus a `dispatch<Name>` helper that routes by command `type`.
3. Keep a `<name>KnownType(t string) bool` allow-list so unknown
   command types fail fast without hitting the camera.
4. Add a section to this file: implemented commands + planned,
   plus vendor quirks worth flagging for future maintainers.
5. Update `README.md` usage table with the new commands.
