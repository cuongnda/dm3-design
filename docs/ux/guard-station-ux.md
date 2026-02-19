# Duall Master 3.0 — Guard Station UI/UX Design

**Version:** 1.0  
**Date:** February 2026  
**Platform:** Desktop (21–32" displays)  
**Theme:** Dark only  
**Kanban:** task-1771437376

> The Guard Station is a dedicated, always-on desktop interface for security operations centers. Optimized for information density, rapid response, and low-light environments.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Guard Station Adaptations](#2-guard-station-adaptations)
3. [Global Keyboard Shortcuts](#3-global-keyboard-shortcuts)
4. [Audio System](#4-audio-system)
5. [Main Operations View](#5-main-operations-view)
6. [Incident Response Mode](#6-incident-response-mode)
7. [Camera Management](#7-camera-management)
8. [Intercom Interface](#8-intercom-interface)
9. [Patrol Monitoring](#9-patrol-monitoring)
10. [AI Voice Assistant Panel](#10-ai-voice-assistant-panel)
11. [Alert Management](#11-alert-management)
12. [Status Bar](#12-status-bar)

---

## 1. Design Philosophy

| Principle | Rationale |
|-----------|-----------|
| **Always visible** | Guards can't scroll or hunt — everything critical is on-screen at all times |
| **Red = act now** | Critical alerts use pulsing `--error` borders; guards respond to color before text |
| **Keyboard-first** | Mouse is secondary; function keys and number keys execute actions in <1s |
| **Audio-layered** | Three tiers of sound: ambient chirps, warning tones, critical sirens |
| **No decorative elements** | Zero chrome. Every pixel serves a purpose. |
| **Burn-in prevention** | Subtle pixel shifting (±2px every 5 min) on static elements for OLED/LCD longevity |

---

## 2. Guard Station Adaptations

Overrides and extensions to the base design system for the Guard Station context.

### Color Overrides (Dark Only)

| Token | Guard Station Value | Reason |
|-------|-------------------|--------|
| `--bg-primary` | `#070A12` | Deeper black — reduces ambient light in dark rooms |
| `--bg-secondary` | `#0D1117` | Panel backgrounds |
| `--surface-1` | `#161B26` | Cards, camera borders |
| `--border-default` | `#1C2333` | Subtler borders |
| `--text-primary` | `#E8ECF0` | Slightly dimmed white — reduces eye strain on long shifts |

### Critical State Colors (Enhanced)

| State | Color | Animation |
|-------|-------|-----------|
| **CRITICAL** | `#EF4444` | 2s pulsing box-shadow + border glow |
| **HIGH** | `#F97316` (orange) | Solid border, no pulse |
| **MEDIUM** | `#EAB308` (amber) | Left accent bar only |
| **LOW** | `#3B82F6` (blue) | No special treatment |
| **INFO** | `#64748B` (gray) | No special treatment |

### Typography Overrides

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Clock display | 36px | 700 | `font-variant-numeric: tabular-nums`, monospace |
| Camera label | 12px | 600 | All-caps, letter-spacing +0.05em |
| Event feed text | 12px | 400 | Monospace for timestamps |
| Stat numbers | 30px (`--text-4xl`) | 700 | Domain-colored |
| Panel titles | 13px | 600 | All-caps, `--text-secondary` |
| Quick-action labels | 11px | 500 | Under icon buttons |

### Panel System

All panels use:
- Background: `--bg-secondary` (`#0D1117`)
- Border: 1px solid `--border-default`
- Header: 32px tall, `--surface-1` background, title left, collapse button right
- Padding: 8px (compact) — space is precious
- Resize: drag handles between panels (cursor: col-resize / row-resize)
- Minimum panel width: 280px
- Border radius: 0px (panels are edge-to-edge, no rounded corners)

---

## 3. Global Keyboard Shortcuts

These work from **any** screen/mode.

| Key | Action | Audio Feedback |
|-----|--------|---------------|
| `F1` | Switch to Main Operations View | — |
| `F2` | Switch to Camera Management | — |
| `F3` | Switch to Alert Management | — |
| `F4` | Switch to Patrol Monitoring | — |
| `F5` | Switch to Intercom Interface | — |
| `F11` | Toggle fullscreen | — |
| `F12` | Toggle AI Voice Assistant panel | Activation chime |
| `Esc` | Close modal / exit focused mode / cancel action | — |
| `Space` | Acknowledge topmost alert | Ack beep |
| `Enter` | Confirm action in modal | — |
| `1-9` | Select camera in grid (positional) | — |
| `0` | Show all cameras (reset grid) | — |
| `D` | Open door (when door selected) | Door unlock tone |
| `L` | Trigger lockdown mode | Siren |
| `A` | Answer incoming intercom call | Ring stop |
| `R` | Reject incoming intercom call | — |
| `Ctrl+E` | Emergency mode toggle | Siren |
| `Ctrl+Shift+L` | Building-wide lockdown (requires confirmation) | — |
| `Tab` | Cycle focus between panels | — |
| `` ` `` (backtick) | Activate AI voice assistant ("Hey Duall") | Listening chime |

---

## 4. Audio System

### Alert Tiers

| Tier | Sound | Duration | Repeat | Examples |
|------|-------|----------|--------|----------|
| **Ambient** | Soft chirp (800Hz, 50ms) | Once | No | Door access granted, system event |
| **Attention** | Two-tone beep (600–900Hz, 150ms) | Once | No | Visitor waiting, device offline |
| **Warning** | Rising tone (400→800Hz, 400ms) | 2× | Every 30s until ack | Forced door, tailgating, alarm zone triggered |
| **Critical** | Siren pattern (alternating 600/1200Hz) | Continuous | Until ack | Intrusion, fire alarm, lockdown trigger, panic button |

### Voice Announcements (TTS)

| Event | Announcement |
|-------|-------------|
| Incoming intercom call | "Incoming call from [location]" |
| Critical alarm | "Critical alarm: [type] at [location]" |
| Lockdown activated | "Lockdown activated. All exits secured." |
| Guard patrol missed | "Missed checkpoint: [name] at [time]" |

### Volume Control

- Master volume: status bar slider
- Per-tier mute: can mute ambient without muting critical
- Critical alerts **cannot** be muted (hardware override)
- Night mode: reduce ambient/attention volume by 50%

---

## 5. Main Operations View

The default screen. Guards see this 90% of their shift.

### Layout (Wireframe)

```
┌──────┬────────────────────────────────────────┬──────────────────┐
│ NAV  │              CAMERA GRID               │   EVENT FEED     │
│      │                                        │                  │
│ [🏠] │  ┌─────────┬─────────┬─────────┐      │  ● 10:23:01      │
│ [📹] │  │ CAM 01  │ CAM 02  │ CAM 03  │      │  Door 3 - Access │
│ [🚨] │  │ Lobby   │ Gate N  │ Park B1 │      │  Nguyen Van A    │
│ [🗺️] │  ├─────────┼─────────┼─────────┤      │                  │
│ [👮] │  │ CAM 04  │ CAM 05  │ CAM 06  │      │  ● 10:22:58      │
│ [🎤] │  │ Elev 1  │ Stair W │ Roof    │      │  Gate 1 - Open   │
│ [🤖] │  ├─────────┼─────────┼─────────┤      │  Visitor QR      │
│      │  │ CAM 07  │ CAM 08  │ CAM 09  │      │                  │
│      │  │ Hall 2F │ Server  │ Recept  │      │  ⚠ 10:22:45      │
│      │  └─────────┴─────────┴─────────┘      │  Sensor Z3 -     │
│      │                                        │  Motion detected  │
│      ├──────────────────┬─────────────────────┤                  │
│      │   BUILDING MAP   │  QUICK ACTIONS      │  🔴 10:22:30     │
│      │                  │                     │  Door 7 - Forced  │
│      │   [Floor plan    │  [🔓Open] [🚪Lock]  │  ALARM            │
│      │    with icons    │  [🔔Alarm] [📹Rec]  │                  │
│      │    for doors,    │  [📞Call]  [🔊Ann]  │                  │
│      │    cameras,      │                     │                  │
│      │    sensors]      │  GUARD STATUS       │                  │
│      │                  │  👮 Tran B - Patrol  │                  │
│      │                  │  👮 Le C - Station   │                  │
│      │                  │  👮 Pham D - Break   │                  │
│      │                  │                     │                  │
├──────┴──────────────────┴─────────────────────┴──────────────────┤
│ STATUS: 🟢 42 Doors Online │ 🟢 16 Cameras │ 🔴 1 Alarm │ 👮 3 On Duty │ 🕐 14:32:07 │ 🔊 Vol ██░░ │
└──────────────────────────────────────────────────────────────────┘
```

### Panel Specifications

| Panel | Position | Width/Height | Content |
|-------|----------|-------------|---------|
| **Sidebar Nav** | Left | 56px fixed | Icon-only navigation, tooltips on hover |
| **Camera Grid** | Center-top | Flex (fills available) | 2×2 / 3×3 / 4×4 configurable. Default: 3×3 |
| **Event Feed** | Right | 320px fixed | Auto-scrolling event log, newest on top |
| **Building Map** | Center-bottom-left | 50% of bottom area | Interactive SVG floor plan |
| **Quick Actions** | Center-bottom-right | 50% of bottom area, split | 6 action buttons + guard status list |
| **Status Bar** | Bottom | 100% × 36px | System-wide status summary |

### Camera Grid Details

- **Grid options:** 2×2 (4 cams), 3×3 (9 cams), 4×4 (16 cams), 1+5 (1 large + 5 small)
- **Shortcut:** `Ctrl+2/3/4` to switch grid size
- **Camera tile:** Video feed with overlay label (bottom-left: name, bottom-right: time)
- **Click camera:** Expands to double-size in grid; double-click → fullscreen
- **Number keys 1-9:** Focus that camera position
- **Motion highlight:** Yellow border pulse when motion detected
- **Offline camera:** Dark tile with `--error` text "OFFLINE" + last-seen time
- **Recording indicator:** Red dot (8px, pulsing) top-right corner

### Event Feed Details

- **Width:** 320px, fixed right panel
- **Items per row:** Single event, compact format
- **Event format:**
  ```
  ● 10:23:01  Door 3 - Access Granted
  Nguyen Van A (Card #4821)
  ```
- **Color coding:** Left dot uses semantic color (green=granted, red=denied/alarm, amber=warning, gray=info)
- **Critical events:** Full red background (`--error-muted`), bold text
- **Auto-scroll:** New events appear at top, auto-scroll enabled (pause on hover)
- **Filter tabs:** All | Access | Alarms | System (tab bar at top of panel)
- **Max visible:** ~20 events before scroll
- **Click event:** Opens detail modal with linked camera footage

### Building Map Details

- **Renders:** SVG floor plan with interactive overlays
- **Door icons:** Green (normal), Red (alarm), Gray (offline), Blue (locked)
- **Camera icons:** Cone showing FOV direction, click to focus in grid
- **Sensor icons:** Small dots, color-coded by status
- **Floor selector:** Tabs or dropdown at top of map panel
- **Click door:** Shows door status popup + quick open/lock buttons
- **Click camera:** Focuses that camera in the grid
- **Zoom:** Scroll wheel, pinch, or +/- buttons

### Quick Action Buttons

| Button | Icon | Shortcut | Color | Confirmation |
|--------|------|----------|-------|-------------|
| Open Door | `DoorOpen` | `D` | `--accent-500` | Select door first |
| Lock Door | `Lock` | `Shift+D` | `--warning` | Select door first |
| Trigger Alarm | `Bell` | `Ctrl+A` | `--error` | Yes — modal |
| Start Recording | `Video` | `Ctrl+R` | `--error` | No |
| Intercom Call | `Phone` | `A` | `--success` | No |
| Announcement | `Megaphone` | `Ctrl+M` | `--accent-500` | Yes — mic opens |

Button size: 48×48px icon area + 11px label below. Arranged in 3×2 grid.

### Guard Status Panel

| Column | Width | Content |
|--------|-------|---------|
| Avatar | 24px | Initials or photo |
| Name | Flex | Guard name, 13px |
| Status | 80px | Badge: Patrol / Station / Break / Off |

- Active patrol guards show blinking green dot
- Click guard name → view their current patrol or location

---

## 6. Incident Response Mode

Triggered automatically by critical alarm or manually via `Ctrl+E`. Takes over the full screen.

### Layout (Wireframe)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔴 INCIDENT RESPONSE — Intrusion: Zone B, Server Room  [✕ Exit] │
├──────────────────────────────────────┬───────────────────────────┤
│                                      │   INCIDENT DETAIL         │
│         PRIMARY CAMERA               │                           │
│         (auto-selected)              │   Type: Intrusion         │
│                                      │   Zone: B - Server Room   │
│         [Large video feed]           │   Time: 14:32:07          │
│                                      │   Source: Motion Sensor 4 │
│                                      │   Severity: CRITICAL 🔴   │
│                                      │                           │
├──────────┬──────────┬────────────────┤   ACTIONS                 │
│ CAM 12   │ CAM 13   │ CAM 14        │   [✓ Acknowledge] (Space) │
│ Adjacent │ Hallway  │ Exit B        │   [👮 Dispatch]   (G)     │
│          │          │               │   [⬆ Escalate]   (E)     │
│          │          │               │   [🔒 Lockdown]   (L)     │
├──────────┴──────────┴────────────────┤                           │
│            TIMELINE                  │   COMMS                   │
│  14:32:07 Motion detected Zone B    │   [📻 Radio]              │
│  14:32:08 Camera 12 auto-focused    │   [📞 Intercom]           │
│  14:32:10 Alert sent to guards      │   [☎ Phone]              │
│  14:32:15 Guard Tran B dispatched   │   [📝 Log Note]           │
│  ▶ NOW ─────────────────────        │                           │
└──────────────────────────────────────┴───────────────────────────┘
```

### Panel Specifications

| Panel | Position | Size | Content |
|-------|----------|------|---------|
| **Alert Banner** | Top | 100% × 40px | Red background, incident type, location, exit button |
| **Primary Camera** | Left-top | 60% × 60% | Largest feed — auto-selects nearest camera to incident |
| **Adjacent Cameras** | Left-bottom row | 60% × 20% | 2-3 nearby cameras, auto-selected by proximity |
| **Timeline** | Left-bottom | 60% × 20% | Chronological event log for this incident |
| **Incident Detail** | Right-top | 40% × 40% | Structured info: type, zone, time, source, severity |
| **Action Buttons** | Right-middle | 40% × 30% | Large action buttons with shortcuts |
| **Comms Panel** | Right-bottom | 40% × 30% | Communication quick-launchers |

### Action Button Details

| Action | Shortcut | Effect | Confirmation |
|--------|----------|--------|-------------|
| **Acknowledge** | `Space` | Marks incident as seen, stops audio alarm | No |
| **Dispatch Guard** | `G` | Opens guard selector → sends alert to selected guard | Guard selection modal |
| **Escalate** | `E` | Sends to supervisor/manager, increases priority | Confirmation modal |
| **Lockdown** | `L` | Locks all doors in affected zone | Double confirmation (type "LOCKDOWN") |

Button size: 64px height, full-width within panel. Bold text, icon left-aligned.

### Timeline Details

- Vertical timeline, newest at bottom (natural reading order for incidents)
- Each entry: timestamp (monospace, 12px) + description
- Auto-generated entries from system + manual notes from guard
- Current time marker: animated blue line
- Entries color-coded: blue (system), green (guard action), red (alarm), gray (info)

### Auto-Focus Logic

When incident triggers:
1. Primary camera = nearest camera to alarm source
2. Adjacent cameras = cameras covering exit routes from that zone
3. If PTZ available, auto-pan to alarm zone
4. All selected cameras start recording (if not already)

### Exit Incident Mode

- `Esc` or click `[✕ Exit]` button
- Requires incident to be in Acknowledged state
- Unacknowledged incidents: "Are you sure? Incident is not acknowledged."
- Returns to Main Operations View

---

## 7. Camera Management

Full-featured camera control mode. Accessed via `F2` or sidebar.

### Layout (Wireframe)

```
┌──────┬───────────────────────────────────────┬──────────────────┐
│ NAV  │                                       │  CAMERA LIST     │
│      │         SELECTED CAMERA               │                  │
│      │         (Full-size feed)               │  🔍 Search...    │
│      │                                       │                  │
│      │                                       │  ▸ Floor 1       │
│      │                                       │    ● CAM 01 ✓    │
│      │                                       │    ○ CAM 02      │
│      │                                       │    ○ CAM 03      │
│      │                                       │  ▸ Floor 2       │
│      │                                       │    ○ CAM 04      │
│      │                                       │  ▸ Exterior      │
│      ├───────────────────────────────────────┤    ○ CAM 10      │
│      │  PTZ CONTROLS        │ CAMERA INFO    │                  │
│      │  [◀][▲][●][▼][▶]    │ Name: CAM 01   │  BOOKMARKS       │
│      │  Zoom: [−]███[+]     │ Location: Lobby│  📌 14:20 Lobby  │
│      │  Presets: [1][2][3]  │ Status: 🟢 REC │  📌 13:55 Gate   │
│      │  Speed: [Slow][Fast] │ IP: 10.0.1.41  │                  │
│      │                      │ Model: DS-2CD  │  CLIPS           │
│      │  TOUR: [▶Start][⏭]  │ Uptime: 47d    │  🎬 13:50-13:55  │
│      │  Cycle: 10s ▾        │                │  🎬 12:30-12:31  │
├──────┴──────────────────────┴────────────────┴──────────────────┤
│ STATUS BAR                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Panel Specifications

| Panel | Content |
|-------|---------|
| **Camera Feed** | Single camera, full resolution. Aspect ratio maintained (16:9 or 4:3) |
| **PTZ Controls** | Directional pad (5 buttons), zoom slider, preset positions (1-8), speed control |
| **Camera Info** | Name, location, IP, model, uptime, recording status, storage remaining |
| **Camera List** | Searchable tree grouped by floor/zone. Active camera highlighted in `--accent-500` |
| **Bookmarks** | Saved moments — click to jump to playback. Guard can add with `B` key |
| **Clips** | Saved video segments. Create with `Ctrl+S` (set start) → `Ctrl+E` (set end) |

### Camera Tour

- **Start/Stop:** Click `▶ Start` button or press `T`
- **Cycle time:** Configurable 5s / 10s / 15s / 30s per camera
- **Tour order:** Drag-reorder in camera list, or use predefined tour routes
- **Skip:** `→` next camera, `←` previous camera
- **Pause on motion:** Auto-pause tour if motion detected, resume after 30s

### Keyboard Shortcuts (Camera Mode)

| Key | Action |
|-----|--------|
| `←→↑↓` | PTZ pan/tilt |
| `+` / `-` | Zoom in/out |
| `1-8` | Jump to PTZ preset |
| `T` | Start/stop camera tour |
| `→` / `←` | Next/previous camera (in list or tour) |
| `B` | Create bookmark at current time |
| `Ctrl+S` | Start clip recording |
| `Ctrl+E` | End clip recording |
| `P` | Toggle playback mode |
| `M` | Toggle motion detection overlay |

### Motion Detection Overlay

- Green bounding boxes around detected motion areas
- Motion intensity bar (bottom of feed): low/medium/high
- Option to highlight motion zones with semi-transparent color fill
- Motion events logged in event feed

---

## 8. Intercom Interface

Handles all intercom/SIP communications. Accessed via `F5` or triggered by incoming call.

### Incoming Call (Auto-popup)

```
┌──────────────────────────────────────────────┐
│  📞 INCOMING CALL                            │
│                                              │
│  ┌──────────────┐  Location: Main Gate       │
│  │              │  Door Station: DS-01       │
│  │  [Video      │  Time: 14:32:07            │
│  │   Preview]   │                            │
│  │              │  Visitor: Unknown           │
│  │              │  (or recognized name)       │
│  └──────────────┘                            │
│                                              │
│  [🟢 Answer (A)]  [🔴 Reject (R)]  [→ Transfer]  │
│                                              │
│  [🔓 Unlock Door]  (available during call)   │
└──────────────────────────────────────────────┘
```

- Auto-appears as modal overlay on any screen when call comes in
- Audio: phone ring tone, repeating until answered/rejected (15s timeout)
- Video preview: live feed from door station camera
- If face is recognized: show name, photo, access level

### Full Intercom Panel Layout

```
┌──────┬────────────────────────────┬──────────────────────────────┐
│ NAV  │    ACTIVE CALL / IDLE      │  CALL HISTORY                │
│      │                            │                              │
│      │  ┌────────────────────┐    │  14:32 Main Gate → Answered  │
│      │  │                    │    │  14:15 Side Door → Missed    │
│      │  │   Video Feed       │    │  13:50 Lobby → Answered      │
│      │  │   (door station)   │    │  13:20 Gate B → Rejected     │
│      │  │                    │    │  ...                         │
│      │  └────────────────────┘    │                              │
│      │                            │  DOOR STATIONS               │
│      │  [🔓 Unlock] [🔇 Mute]     │                              │
│      │  [→ Transfer] [📞 End]     │  ● DS-01 Main Gate    🟢     │
│      │                            │  ● DS-02 Side Door    🟢     │
│      │  ─────────────────────     │  ● DS-03 Parking      🟡     │
│      │  ANNOUNCEMENT              │  ● DS-04 Roof Access  🔴     │
│      │  Zone: [All ▾]            │                              │
│      │  [🔊 Start Announcement]   │                              │
│      │  "Attention please..."     │                              │
├──────┴────────────────────────────┴──────────────────────────────┤
│ STATUS BAR                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Intercom Shortcuts

| Key | Action |
|-----|--------|
| `A` | Answer incoming call |
| `R` | Reject incoming call |
| `D` | Unlock door (during active call) |
| `H` | Hang up / end call |
| `Ctrl+T` | Transfer call |
| `Ctrl+M` | Start/stop announcement |

### Announcement System

- Zone selector: All Building / specific floors / specific areas
- Push-to-talk style: hold `Ctrl+M` to talk, release to stop
- Pre-recorded messages: selectable from dropdown (fire evacuation, closing, etc.)
- Volume override: announcement plays at max volume on all intercoms in selected zone

---

## 9. Patrol Monitoring

Real-time guard patrol tracking. Accessed via `F4`.

### Layout (Wireframe)

```
┌──────┬────────────────────────────────────┬──────────────────────┐
│ NAV  │          PATROL MAP               │  PATROL STATUS       │
│      │                                    │                      │
│      │  [Floor plan with:                │  ACTIVE PATROLS      │
│      │   - Route lines (colored per      │                      │
│      │     guard)                        │  👮 Tran B            │
│      │   - Checkpoint markers            │  Route: Night-A       │
│      │     (●done ○pending ✕missed)      │  Progress: ████░ 80% │
│      │   - Guard location dots           │  Next: Checkpoint 5   │
│      │     (real-time, pulsing)]         │  ETA: 2 min           │
│      │                                    │                      │
│      │                                    │  👮 Nguyen E          │
│      │                                    │  Route: Perimeter-B   │
│      │                                    │  Progress: ██░░░ 40% │
│      │                                    │  Next: Gate North     │
│      │                                    │  ETA: 5 min           │
│      ├────────────────────────────────────┤                      │
│      │        PATROL SCHEDULE             │  ALERTS              │
│      │                                    │  ⚠ CP-3 Missed       │
│      │  Route        Guard     Time       │    by Tran B (3 min) │
│      │  Night-A      Tran B    22:00-06:00│                      │
│      │  Perimeter-B  Nguyen E  22:00-06:00│  STATISTICS          │
│      │  Morning-A    Le C      06:00-14:00│  Today: 12/15 CPs ✓  │
│      │  Morning-B    Pham D    06:00-14:00│  Missed: 3           │
│      │                                    │  Avg time/CP: 4.2min │
├──────┴────────────────────────────────────┴──────────────────────┤
│ STATUS BAR                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Checkpoint Status Icons

| Icon | State | Color |
|------|-------|-------|
| `●` | Completed on time | `--success` |
| `◐` | Completed late | `--warning` |
| `✕` | Missed | `--error` |
| `○` | Upcoming/pending | `--text-tertiary` |
| `◉` | Current target | `--accent-500` (pulsing) |

### Guard Location Tracking

- Real-time GPS dots on map (update every 5s)
- Each guard: unique color (matches their route line)
- Trail: last 5 minutes of movement shown as fading line
- Click guard dot → show name, current route, last checkpoint

### Patrol Alerts

| Alert | Trigger | Severity |
|-------|---------|----------|
| Missed checkpoint | Guard didn't scan within time window | Warning |
| Patrol not started | Route should have started >10 min ago | Warning |
| Guard stationary | No movement for >10 min during patrol | Attention |
| Off-route | Guard significantly deviates from planned route | Attention |
| SOS | Guard presses panic button | Critical |

---

## 10. AI Voice Assistant Panel

Persistent sidebar panel or overlay. Toggled with `F12` or backtick (`` ` ``).

### Layout (Wireframe)

```
┌────────────────────────────┐
│  🤖 DUALL AI ASSISTANT     │
│                            │
│  ┌────────────────────┐   │
│  │  ◉ LISTENING...    │   │  ← Pulsing blue ring when active
│  │  (or 💤 Idle)       │   │
│  └────────────────────┘   │
│                            │
│  COMMAND HISTORY           │
│  ─────────────────────    │
│  🗣 "Show camera 5"       │
│  ✅ Switched to CAM 05    │
│                            │
│  🗣 "Open main gate"      │
│  ⚠ Confirm: Open Gate 1?  │
│  [✓ Yes] [✕ No]          │
│                            │
│  🗣 "Who entered today?"  │
│  📊 247 entries today.    │
│  Top: Nguyen A (12x)     │
│                            │
│  SUGGESTED COMMANDS        │
│  ─────────────────────    │
│  "Lock all doors"         │
│  "Show parking status"    │
│  "Call main gate"         │
│  "Start camera tour"      │
│                            │
│  ┌────────────────────┐   │
│  │ Type or say command │   │
│  └────────────────────┘   │
└────────────────────────────┘
```

### Panel Specifications

| Element | Spec |
|---------|------|
| Width | 320px (side panel) or 400px (overlay) |
| Position | Right side, overlays event feed when open |
| Activation indicator | 48px circle, `--accent-500` pulsing glow when listening |
| Idle state | Gray circle, "Say 'Hey Duall' or press `` ` ``" |
| Command history | Scrollable, max 20 entries |
| Command text | `--accent-300`, 13px, italic |
| Response text | `--text-primary`, 13px |
| Confirmation | Inline buttons, auto-timeout 10s (cancels if no response) |

### Voice States

| State | Visual | Audio |
|-------|--------|-------|
| **Idle** | Gray mic icon, dim circle | — |
| **Listening** | Blue pulsing ring, "LISTENING..." text | Short activation chime |
| **Processing** | Spinning indicator, "PROCESSING..." | — |
| **Responding** | Green check or info icon, response text | Optional TTS response |
| **Error** | Red icon, error message | Error tone |
| **Confirmation needed** | Amber icon, Yes/No buttons | Attention beep |

### Permission-Aware Commands

The AI respects the guard's role. Actions beyond their permission show:
```
🔒 Insufficient permission. This action requires Supervisor role.
   Contact: Supervisor Nguyen (ext. 201)
```

---

## 11. Alert Management

Centralized alert queue. Accessed via `F3`.

### Layout (Wireframe)

```
┌──────┬──────────────────────────────────────┬────────────────────┐
│ NAV  │           ALERT QUEUE                │  ALERT DETAIL      │
│      │                                      │                    │
│      │  FILTER: [All▾] [Critical▾] [Today▾] │  ── Selected ──   │
│      │                                      │                    │
│      │  🔴 14:32 Intrusion - Zone B         │  Type: Intrusion   │
│      │     Server Room | Motion Sensor 4    │  Zone: B           │
│      │     ⏱ 2 min ago | UNACKNOWLEDGED     │  Location: Server  │
│      │                                      │  Time: 14:32:07    │
│      │  🟠 14:28 Tailgating - Gate 1        │  Source: Motion #4 │
│      │     Main Entrance | AI Detection     │  Severity: CRIT    │
│      │     ⏱ 6 min ago | UNACKNOWLEDGED     │                    │
│      │                                      │  LINKED MEDIA      │
│      │  🟡 14:15 Door Held Open - Door 12   │  📹 CAM 12 clip   │
│      │     2F Hallway | Sensor              │  📷 Snapshot       │
│      │     ⏱ 19 min ago | ACKNOWLEDGED      │                    │
│      │                                      │  SOP               │
│      │  🔵 14:00 Device Offline - CAM 08    │  ─────────────     │
│      │     Server Room | Heartbeat missed   │  1. Acknowledge    │
│      │     ⏱ 34 min ago | ACKNOWLEDGED      │  2. Check camera   │
│      │                                      │  3. Dispatch guard │
│      │  ────── Older ──────                 │  4. If person seen │
│      │  (load more...)                      │     → Lockdown zone│
│      │                                      │  5. Call supervisor │
│      │                                      │                    │
│      │                                      │  ACTIONS           │
│      │                                      │  [✓ Ack] [⬆ Esc]  │
│      │                                      │  [✕ Dismiss] [📝]  │
├──────┴──────────────────────────────────────┴────────────────────┤
│ STATUS BAR                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Alert Queue Details

- **Sorted by:** Priority (critical first) → then time (newest first)
- **Unacknowledged:** Bold text, left accent bar in severity color
- **Acknowledged:** Normal weight, dimmed left bar
- **Dismissed:** Hidden from default view (toggle to show)
- **Age indicator:** Relative time ("2 min ago"), turns red if unacknowledged >5 min

### Alert Priority & Visual Treatment

| Priority | Left Bar | Row BG | Text | Badge |
|----------|----------|--------|------|-------|
| **CRITICAL** | 4px `--error` | `--error-muted` | Bold, `--text-primary` | Red pulsing dot |
| **HIGH** | 4px `#F97316` | transparent | Bold, `--text-primary` | Orange dot |
| **MEDIUM** | 4px `--warning` | transparent | Normal, `--text-primary` | Amber dot |
| **LOW** | 4px `--info` | transparent | Normal, `--text-secondary` | Blue dot |
| **INFO** | 2px `--text-tertiary` | transparent | Normal, `--text-tertiary` | Gray dot |

### SOP (Standard Operating Procedure) Display

Each alert type has an associated SOP — displayed in the detail panel when an alert is selected.

| Alert Type | SOP Steps |
|------------|-----------|
| Intrusion | 1. Acknowledge → 2. View cameras → 3. Dispatch guard → 4. If confirmed: Lockdown → 5. Call supervisor → 6. File report |
| Fire Alarm | 1. Verify (check cameras) → 2. If real: Activate fire mode → 3. Call fire dept → 4. Announce evacuation → 5. Unlock all exits |
| Tailgating | 1. Review camera clip → 2. If confirmed: Alert guard at entry → 3. Log incident |
| Door Forced | 1. View camera → 2. If unauthorized: Dispatch guard → 3. Lock adjacent doors → 4. Call supervisor |
| Device Offline | 1. Check network → 2. Attempt remote restart → 3. If no recovery: Create work order |

SOPs are displayed as numbered checklists. Guard can check off each step as completed.

### Alert Management Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Acknowledge selected alert |
| `Delete` | Dismiss selected alert |
| `E` | Escalate selected alert |
| `↑` / `↓` | Navigate alert list |
| `Enter` | Open incident response mode for selected alert |
| `N` | Add note to selected alert |
| `C` | View linked camera footage |

---

## 12. Status Bar

Persistent at the bottom of every screen. 36px height.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ 🟢 42/44 Doors │ 🟢 16/16 Cams │ 🔴 2 Alarms │ 👮 3 On Duty │ ☀ Day Mode │ 🔊 ██░░ │ 🕐 14:32:07 │
└──────────────────────────────────────────────────────────────────┘
```

### Elements (Left to Right)

| Element | Content | Click Action |
|---------|---------|-------------|
| **Door Status** | `🟢 42/44 Doors` (online/total) | Opens door management overlay |
| **Camera Status** | `🟢 16/16 Cams` | Opens camera list |
| **Active Alarms** | `🔴 2 Alarms` (red if >0) | Opens alert management |
| **Guards on Duty** | `👮 3 On Duty` | Opens guard status overlay |
| **Mode Indicator** | Current operating mode (Day/Night/Emergency) | — |
| **Volume** | Volume bar + mute toggle | Click to toggle mute |
| **Clock** | `14:32:07` — 24h, seconds, monospace | — |

### Status Bar States

- **Normal:** Dark background (`--bg-secondary`)
- **Warning:** Amber left border (when warnings exist)
- **Critical:** Full red background pulsing when unacknowledged critical alarms exist
- **Lockdown:** Red background with "🔒 LOCKDOWN ACTIVE" flashing text

---

## Appendix A: Screen Transition Map

```
                    ┌─────────────┐
                    │   STARTUP   │
                    │  (Auto-login)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
         ┌─────────│    MAIN     │──────────┐
         │   F2    │  OPERATIONS │   F3     │
         │         │   (F1)      │          │
         │         └──┬───┬───┬──┘          │
         │            │   │   │             │
    ┌────▼────┐  F4 ┌▼┐ F5┌▼┐ F12   ┌─────▼─────┐
    │ CAMERA  │  ┌──┘ └┐  │ │  ┌──┐ │   ALERT   │
    │ MGMT    │  │PATROL│  │ │  │AI│ │   MGMT    │
    └─────────┘  └──────┘  │ │  └──┘ └───────────┘
                     ┌─────▼─┘
                     │INTERCOM│
                     └────────┘

         INCIDENT RESPONSE MODE
         (triggered by critical alarm — overlays everything)
```

---

## Appendix B: Display Requirements

| Requirement | Spec |
|-------------|------|
| **Minimum resolution** | 1920×1080 (Full HD) |
| **Recommended** | 2560×1440 (QHD) or 3840×2160 (4K) |
| **Screen size** | 21–32 inches |
| **Multi-monitor** | Support for 2-3 monitors (camera grid spans, panels distribute) |
| **Refresh rate** | 60Hz minimum (for smooth camera feeds) |
| **Color depth** | 8-bit minimum for accurate alert color rendering |
| **Brightness** | Auto-dim capability (or manual) for night shifts |
| **Always-on** | No screensaver, no sleep. Pixel-shift burn-in prevention enabled. |

---

## Appendix C: Multi-Monitor Configuration

For 2-3 monitor setups:

| Monitor | Content |
|---------|---------|
| **Primary (center)** | Main Operations View — camera grid + status bar |
| **Secondary (left)** | Building map (full-size) + patrol monitoring |
| **Tertiary (right)** | Event feed (full-height) + alert queue + AI assistant |

Each monitor operates independently but shares the same session. Alerts appear on all monitors simultaneously.

---

*Guard Station UX v1.0 — Duall Master 3.0*  
*Created February 2026*
