# Duall Master 3.0 — Mobile App UI/UX Design

**Version:** 1.0  
**Date:** February 2026  
**Kanban:** task-1771437374

> Complete screen-by-screen UI/UX specification for both mobile applications.

---

## Table of Contents

1. [Shared Foundations](#1-shared-foundations)
2. [App 1: Admin App](#2-admin-app)
3. [App 2: Resident App](#3-resident-app)

---

## 1. Shared Foundations

### 1.1 Platform Conventions

| Aspect | Spec |
|--------|------|
| Min touch target | 44×44px (Apple HIG) |
| Screen padding | `--space-4` (16px) |
| Card gap | `--space-3` (12px) |
| Typography base | 14px body (`--text-md`), 11px min |
| Theme | Dark-first; light theme secondary |
| Safe areas | Respect notch, home indicator, status bar |
| Bottom nav height | 56px |
| Pull-to-refresh | Standard platform pattern on all list screens |
| Swipe actions | Left-swipe on list items for quick actions |
| FAB | 56px, `--accent-500`, bottom-right 16px inset (where applicable) |
| Bottom sheets | Detail views, max 90% screen height, drag handle 36×4px |
| Icons | Lucide, 24px in nav, 20px inline |
| Status bar | Light content (dark theme) / dark content (light theme) |
| Font | Inter (system fallback: SF Pro / Roboto) |

### 1.2 Navigation Patterns

- **Bottom Tab Bar:** 5 items max. Icon (24px) + label (10px, `--font-medium`). Active: `--accent-500`. Inactive: `--text-tertiary`.
- **Stack Navigation:** Push/pop with horizontal slide. Back arrow top-left.
- **Top App Bar:** 48px. Title left-aligned (`--text-lg`, 600). Actions right-aligned.
- **Bottom Sheets:** For filters, detail previews, confirmations. Draggable.
- **Modals:** Fullscreen on phone. Card-style on tablet.

### 1.3 Common Components

**List Item (standard):**
```
┌────────────────────────────────────────┐
│ [Icon/Avatar]  Title Text        [>]  │
│                Subtitle/meta          │
└────────────────────────────────────────┘
Height: 64px. Padding: 16px. Divider: --border-default.
```

**Stat Card (compact mobile):**
```
┌──────────────────┐
│ Label     --text-secondary, 12px
│ 128       --domain color, --text-3xl
│ ↑ 12%     --success, 12px
└──────────────────┘
Padding: 12px. Radius: --radius-lg.
```

**Empty State:**
```
┌────────────────────────────────────────┐
│                                        │
│          [Icon 48px, tertiary]         │
│          No items yet                  │
│          Description text              │
│          [Primary Button]              │
│                                        │
└────────────────────────────────────────┘
```

---

## 2. Admin App

**Purpose:** Real-time building security & facility operations for guards, security managers, and facility teams.

### 2.1 Navigation Structure

**Bottom Tab Bar:**

| # | Label | Icon (Lucide) | Color Active |
|---|-------|---------------|--------------|
| 1 | Dashboard | `LayoutDashboard` | `--accent-500` |
| 2 | Alerts | `Bell` | `--accent-500` (+ red badge count) |
| 3 | Doors | `DoorOpen` | `--accent-500` |
| 4 | Cameras | `Video` | `--accent-500` |
| 5 | More | `Menu` | `--accent-500` |

**"More" menu items:** Visitors, Guard Tour, Incidents, Maintenance, AI Assistant, Settings, Profile.

### 2.2 Screen: Home Dashboard

**Purpose:** At-a-glance building status. The guard's command center.

**Layout:**

```
┌────────────────────────────────────────┐
│ ● Duall Master     [Site ▾]  [🔔 3]  │  ← Top bar
├────────────────────────────────────────┤
│                                        │
│  Good morning, Minh 👋                │  ← Greeting, --text-xl
│  Sunrise Tower • All systems normal   │  ← Site + status badge
│                                        │
│  ┌─────────┐ ┌─────────┐              │
│  │ Alerts  │ │ Doors   │              │  ← 2×2 stat grid
│  │   3     │ │  42     │              │
│  │ ⚠ 1 crit│ │ online  │              │
│  └─────────┘ └─────────┘              │
│  ┌─────────┐ ┌─────────┐              │
│  │ Cameras │ │ Visitors│              │
│  │  128    │ │   7     │              │
│  │ streams │ │ on-site │              │
│  └─────────┘ └─────────┘              │
│                                        │
│  ── Quick Actions ──────────────────  │
│  [🔓 Unlock Gate] [📷 View Cameras]  │  ← Horizontal scroll chips
│  [👤 Approve Visitor] [📝 Log Incident]│
│                                        │
│  ── Recent Events ──────────────────  │
│  ● 10:23  Door 3 forced open   ⚠     │
│  ● 10:21  Visitor arrived — Lobby     │
│  ● 10:18  Guard tour completed  ✓     │
│  ● 10:15  Card denied — Floor 5       │
│                            [See All →]│
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Greeting section:** Time-based greeting + user name. Site selector dropdown. Notification bell with badge count.
- **Stat cards:** 2×2 grid. Each card: `--surface-1` bg, 12px padding, `--radius-lg`. Number in domain color. Subtitle in `--text-secondary`.
- **Quick actions:** Horizontal scrollable chip row. Each chip: 40px height, `--surface-1` bg, icon (20px) + label (13px), `--radius-full`.
- **Recent events:** Vertical list. Each row 52px. Left dot (semantic color), time (mono, `--text-tertiary`), description, severity icon right.

**Interactions:**
- Pull-to-refresh: Reloads all dashboard data.
- Tap stat card → navigates to respective module.
- Tap quick action → navigates to action screen.
- Tap event → opens event detail bottom sheet.
- Site selector → dropdown with saved sites.

**Gestures:**
- Swipe down: refresh.
- Horizontal swipe on quick actions row.

---

### 2.3 Screen: Real-time Alerts & Event Feed

**Purpose:** Chronological feed of all security events with filtering and priority.

```
┌────────────────────────────────────────┐
│ ←  Alerts              [Filter] [⋮]  │
├────────────────────────────────────────┤
│ [All] [Critical] [Warning] [Info]     │  ← Segmented control / chip filter
├────────────────────────────────────────┤
│                                        │
│  ── Today ──────────────────────────  │
│                                        │
│  🔴 10:23 AM                          │
│  Door Forced Open — Door 3, Floor 2   │
│  Sensor triggered. No matching access. │
│  [View Camera] [Acknowledge]          │
│                                        │
│  ── divider ──                        │
│                                        │
│  🟡 10:15 AM                          │
│  Access Denied — Card expired          │
│  User: Tran Van B, Floor 5 reader     │
│  [View Details]                        │
│                                        │
│  🟢 10:12 AM                          │
│  Visitor Checked In — Lobby            │
│  Nguyen Thi C → Host: Le Van D        │
│  [View Visitor]                        │
│                                        │
│  ... (infinite scroll)                 │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [●Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Filter bar:** Horizontal scrollable chips. Active chip: `--accent-500` bg, white text. Inactive: `--surface-1` bg, `--text-secondary`.
- **Event card:** Full-width. Left color bar (3px, semantic color). Time in `--text-tertiary` mono. Title bold `--text-primary`. Description `--text-secondary`. Action buttons: ghost style, small.
- **Section headers:** "Today", "Yesterday" etc. Sticky. `--text-tertiary`, 11px, uppercase.

**Interactions:**
- Tap event card → full detail bottom sheet (event metadata, linked camera clip, user info, map location).
- Tap "Acknowledge" → marks event as seen (changes to checkmark).
- Tap "View Camera" → opens camera view with event timestamp.
- Pull-to-refresh. Infinite scroll.
- Swipe left on event → quick acknowledge / dismiss.

---

### 2.4 Screen: Remote Door Control

**Purpose:** Monitor all doors and remotely lock/unlock.

```
┌────────────────────────────────────────┐
│ ←  Doors                    [Search]  │
├────────────────────────────────────────┤
│ [All 42] [Open 3] [Locked 38] [Alarm 1]│
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🚪 Main Entrance Gate    🟢   │   │
│  │    Floor: Ground  •  Locked    │   │
│  │    Last event: 10:21 — Granted │   │
│  │              [🔓 Unlock]       │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🚪 Door 3 — Floor 2      🔴   │   │
│  │    Status: FORCED OPEN ⚠       │   │
│  │    Alert since: 10:23          │   │
│  │       [🔒 Lock]  [📷 Camera]  │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🚪 Server Room — Floor 3  🟢  │   │
│  │    Floor: 3  •  Locked         │   │
│  │    Last event: 09:45 — Denied  │   │
│  │              [🔓 Unlock]       │   │
│  └────────────────────────────────┘   │
│                                        │
│  ... (scrollable list)                 │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [●Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Filter tabs:** Chip-style count badges. "Alarm" chip uses `--error` bg.
- **Door card:** `--surface-1` bg. Status dot right (green=locked, red=alarm, amber=open). Door name `--text-lg`. Location + status `--text-secondary`. Last event mono. Action button(s) bottom-right.
- **Unlock/Lock button:** Primary button with icon. Requires confirmation dialog.

**Interactions:**
- Tap "Unlock" → confirmation bottom sheet: "Unlock Main Entrance Gate? This will remain unlocked for 10 seconds." with countdown timer option. [Cancel] [Unlock Now].
- After unlock: command sent to server → server sends unlock command to device via MQTT. Button changes to "Locking in 8s..." with countdown ring animation.
- **Note:** Remote unlock is one of the few server→device commands. Normal access decisions (face/card/QR) are always made locally on the device.
- Tap door card → detail screen: event history (from synced event logs), access schedule, sync status (last sync, user DB version), linked cameras, manual override toggle.
- Search: filters by door name or location.
- Long press door → quick action menu (lock, unlock, view camera, view log).

**Confirmation Bottom Sheet:**
```
┌────────────────────────────────────────┐
│         ─── (drag handle) ───         │
│                                        │
│  🔓 Unlock Main Entrance Gate?        │
│                                        │
│  Door will auto-relock after:         │
│  [5s] [10s] [30s] [Keep Open]         │
│                                        │
│  ┌────────────────────────────────┐   │
│  │       [Cancel]  [Unlock Now]   │   │
│  └────────────────────────────────┘   │
└────────────────────────────────────────┘
```

---

### 2.5 Screen: Visitor Approval

**Purpose:** Approve or reject visitors waiting at reception, with photo and details.

```
┌────────────────────────────────────────┐
│ ←  Visitor Approvals         [History]│
├────────────────────────────────────────┤
│ 3 visitors waiting for approval       │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │  ┌──────┐                      │   │
│  │  │ PHOTO│  Nguyen Thi Lan      │   │
│  │  │ 80px │  Company: ABC Corp   │   │
│  │  └──────┘  Host: Le Van Minh   │   │
│  │            Purpose: Meeting     │   │
│  │            Arrived: 10:21 AM    │   │
│  │                                 │   │
│  │  [❌ Reject]        [✅ Approve]│   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │  ┌──────┐                      │   │
│  │  │ PHOTO│  Tran Quoc Bao       │   │
│  │  │ 80px │  Company: XYZ Ltd    │   │
│  │  └──────┘  Host: Pham Anh      │   │
│  │            Purpose: Delivery    │   │
│  │            Arrived: 10:18 AM    │   │
│  │                                 │   │
│  │  [❌ Reject]        [✅ Approve]│   │
│  └────────────────────────────────┘   │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Visitor card:** Photo thumbnail (80×80, `--radius-lg`), name (`--text-lg`, 600), metadata fields (`--text-secondary`, 13px). Two full-width action buttons at card bottom.
- **Approve button:** `--success` bg, white text, checkmark icon.
- **Reject button:** `--error` bg outlined (ghost-danger), red text.

**Interactions:**
- Tap Approve → success haptic + card slides out with green animation + toast "Visitor approved. Access granted to Floor 3."
- Tap Reject → bottom sheet: "Reject reason" (optional text input) + [Reject] button.
- Tap photo → fullscreen photo viewer.
- Tap visitor name → full detail sheet (ID photo, pre-registration info, past visits, watchlist status).
- Push notification arrives → tapping opens this screen directly.
- Swipe right on card → quick approve. Swipe left → quick reject.

---

### 2.6 Screen: Camera Quick View

**Purpose:** Quick grid view of live camera feeds.

```
┌────────────────────────────────────────┐
│ ←  Cameras           [Grid ▾] [Search]│
├────────────────────────────────────────┤
│ [All] [Entrance] [Parking] [Floors]   │
├────────────────────────────────────────┤
│                                        │
│  ┌─────────────┐ ┌─────────────┐      │
│  │             │ │             │      │
│  │  LIVE FEED  │ │  LIVE FEED  │      │
│  │  (thumb)    │ │  (thumb)    │      │
│  │             │ │             │      │
│  │ Main Gate 🔴│ │ Lobby    🟢│      │
│  └─────────────┘ └─────────────┘      │
│                                        │
│  ┌─────────────┐ ┌─────────────┐      │
│  │             │ │             │      │
│  │  LIVE FEED  │ │  LIVE FEED  │      │
│  │  (thumb)    │ │  (thumb)    │      │
│  │             │ │             │      │
│  │ Parking P1🟢│ │ Floor 2  🟢│      │
│  └─────────────┘ └─────────────┘      │
│                                        │
│  ┌─────────────┐ ┌─────────────┐      │
│  │             │ │             │      │
│  │  LIVE FEED  │ │  LIVE FEED  │      │
│  │  (thumb)    │ │  (thumb)    │      │
│  │             │ │             │      │
│  │ Stairwell🟢│ │ Rooftop  🟢│      │
│  └─────────────┘ └─────────────┘      │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [●Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Grid selector:** Toggle 2×n (default), 1×n (large), list view.
- **Camera thumbnail:** 16:9 aspect, `--radius-lg`. Name overlay bottom-left (12px, white, text-shadow). Recording indicator dot top-right (red pulse for recording, green for online, gray for offline).
- **Category filter:** Horizontal scrollable chips filtering by camera group.

**Interactions:**
- Tap thumbnail → fullscreen live view with controls: PTZ (if supported), snapshot, record clip, digital zoom (pinch), timeline scrubber.
- Long press → picture-in-picture mode (iOS).
- Double-tap → zoom 2×.
- Grid toggle → animates between layouts.
- Pull-to-refresh: reconnects feeds.

**Fullscreen Camera View:**
```
┌────────────────────────────────────────┐
│                                        │
│                                        │
│          LIVE VIDEO FEED               │
│          (full screen)                 │
│                                        │
│                                        │
├────────────────────────────────────────┤
│ [⟲ PTZ] [📸 Snap] [⏺ Record] [🔍]  │
│                                        │
│ ──────●──────────────── timeline      │
│ 10:00    10:15    10:30    NOW        │
└────────────────────────────────────────┘
```

---

### 2.7 Screen: Incident Logging

**Purpose:** Quick incident reporting with photo, description, and location tagging.

```
┌────────────────────────────────────────┐
│ ←  Log Incident              [Cancel] │
├────────────────────────────────────────┤
│                                        │
│  Incident Type                        │
│  [Security ▾]                         │  ← Dropdown: Security, Safety,
│                                        │    Maintenance, Other
│  Priority                             │
│  (●Low) (○Medium) (○High) (○Critical)│  ← Radio pills
│                                        │
│  Title *                              │
│  ┌────────────────────────────────┐   │
│  │ Brief description...           │   │
│  └────────────────────────────────┘   │
│                                        │
│  Description                          │
│  ┌────────────────────────────────┐   │
│  │                                │   │
│  │ What happened...               │   │
│  │                                │   │
│  └────────────────────────────────┘   │
│                                        │
│  Photos / Evidence                    │
│  ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ +📷  │ │ img1 │ │ img2 │         │
│  │ Add  │ │  ×   │ │  ×   │         │
│  └──────┘ └──────┘ └──────┘         │
│                                        │
│  Location                             │
│  📍 Floor 2, Zone B  [Change]        │  ← Auto-detected or manual
│                                        │
│  Assign To (optional)                 │
│  [Select team member ▾]              │
│                                        │
│  ┌────────────────────────────────┐   │
│  │         [Submit Incident]       │   │
│  └────────────────────────────────┘   │
│                                        │
└────────────────────────────────────────┘
```

**Components:**
- **Type dropdown:** Bottom sheet picker with icons per type.
- **Priority pills:** Horizontal radio buttons. Color-coded: Low=`--info`, Medium=`--warning`, High=`--error` muted, Critical=`--error` solid.
- **Photo picker:** Horizontal scroll row. First item is "Add" button (dashed border, camera icon). Tapping opens camera or gallery picker. Each photo shows × to remove.
- **Location:** Auto-filled from GPS/BLE beacon. Editable via location picker (floor plan or list).
- **Submit button:** Full-width primary, `--accent-600`. Disabled until required fields filled.

**Interactions:**
- Camera button opens native camera with flash, switch lens.
- Photos can be reordered via long-press drag.
- Location "Change" opens floor/zone picker bottom sheet.
- Submit → loading spinner → success animation (checkmark lottie) → returns to dashboard.
- Form auto-saves draft on background/cancel.

---

### 2.8 Screen: Guard Tour Execution

**Purpose:** Execute patrol routes by scanning NFC/QR checkpoints.

```
┌────────────────────────────────────────┐
│ ←  Night Patrol Route A       [Pause] │
├────────────────────────────────────────┤
│                                        │
│  Progress: 4 of 12 checkpoints        │
│  ████████░░░░░░░░░░░░  33%           │
│  Time elapsed: 00:23:15               │
│                                        │
│  ── Next Checkpoint ────────────────  │
│                                        │
│  ┌────────────────────────────────┐   │
│  │                                │   │
│  │    5️⃣  Parking Level B1        │   │
│  │                                │   │
│  │    Scan NFC tag or QR code     │   │
│  │                                │   │
│  │        ┌──────────┐           │   │
│  │        │  [SCAN]  │           │   │
│  │        │  (large) │           │   │
│  │        └──────────┘           │   │
│  │                                │   │
│  └────────────────────────────────┘   │
│                                        │
│  ── Completed ──────────────────────  │
│  ✅ 4. Stairwell B       10:20 AM    │
│  ✅ 3. Floor 2 Corridor  10:16 AM    │
│  ✅ 2. Lobby Reception   10:08 AM    │
│  ✅ 1. Main Gate         09:55 AM    │
│                                        │
│  ── Upcoming ───────────────────────  │
│  ○ 6. Loading Dock                    │
│  ○ 7. Fire Escape A                  │
│  ... 5 more                           │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Progress bar:** Full-width, `--accent-500` fill, percentage + count label.
- **Timer:** Elapsed time, mono font, `--text-secondary`.
- **Scan button:** Large (80×80px), prominent `--accent-600` bg, pulsing border animation to draw attention. Tap to activate NFC reader or QR camera.
- **Checkpoint list:** Completed items (green check, strikethrough-subtle, timestamp). Upcoming (hollow circle, `--text-tertiary`).
- **Pause button:** Top-right, ghost style. Pauses timer.

**Interactions:**
- Tap Scan → activates NFC reader (or QR camera viewfinder). On successful scan: success haptic + checkpoint animates to completed + confetti-lite.
- If wrong checkpoint scanned → error haptic + "Wrong checkpoint. Expected: Parking Level B1."
- At each checkpoint, optional: "Report Issue" button appears → opens mini incident form.
- Tour complete → celebration animation + summary screen (time, missed checkpoints, incidents logged).
- Background mode: notification reminds guard if idle >5 min.

---

### 2.9 Screen: Maintenance Work Orders

**Purpose:** View and manage work orders assigned to the user or team.

```
┌────────────────────────────────────────┐
│ ←  Work Orders                    [+] │
├────────────────────────────────────────┤
│ [My Tasks 5] [Team 12] [Completed]    │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🔴 HIGH                        │   │
│  │ AC Unit — Floor 3 not cooling  │   │
│  │ Assigned: You • Due: Today     │   │
│  │ Created by: Facility Mgr       │   │
│  │                        [Start] │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🟡 MEDIUM                      │   │
│  │ Light flickering — Lobby B     │   │
│  │ Assigned: You • Due: Tomorrow  │   │
│  │ Created by: Guard Minh         │   │
│  │                    [In Progress]│   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🟢 LOW                         │   │
│  │ Door closer adjustment — D12   │   │
│  │ Assigned: Team • Due: This week│   │
│  │                         [View] │   │
│  └────────────────────────────────┘   │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Tab filter:** My Tasks (assigned to me), Team (all team orders), Completed.
- **Work order card:** Priority badge (color-coded pill), title (`--text-lg`), assignment + due date (`--text-secondary`), status button right.
- **Status flow:** Open → In Progress → Completed. Button label matches next action.
- **FAB (+):** Create new work order.

**Interactions:**
- Tap card → detail screen: full description, photos, comments thread, status history, parts used.
- Tap status button → advances status with optional note/photo.
- Completing: requires photo proof + completion notes.
- Swipe left → reassign or snooze.
- FAB → create form (similar to incident but with asset selection, priority, due date).

---

### 2.10 Screen: Push Notification Handling

**Purpose:** Not a screen per se, but defines how push notifications route users.

**Notification Types & Deep Links:**

| Notification | Banner Text | Sound | Tap Action |
|-------------|-------------|-------|------------|
| Critical alarm | "🔴 Door 3 Forced Open — Floor 2" | Alert tone | → Alert detail |
| Visitor waiting | "👤 Visitor waiting: Nguyen Thi Lan" | Default | → Visitor approval |
| Access denied | "⚠ Access denied at Server Room" | Default | → Event detail |
| Tour reminder | "🔄 Night Patrol starts in 5 min" | Gentle | → Guard tour |
| Work order assigned | "🔧 New task: AC Unit Floor 3" | Default | → Work order detail |
| Device offline | "📵 Camera Parking P1 offline" | Default | → Device health |

**Notification Banner (in-app):**
```
┌────────────────────────────────────────┐
│ 🔴 Door 3 Forced Open                │
│    Floor 2 • 10:23 AM                 │
│              [View] [Acknowledge]      │
└────────────────────────────────────────┘
Slides down from top. Auto-dismiss 8s (critical: persistent).
```

**Interactions:**
- In-app banner: appears overlaying current screen. Tap anywhere → deep link. Swipe up → dismiss.
- Lock screen: rich notification with action buttons (Approve/Reject for visitors).
- Grouped: multiple events grouped by type with count.

---

### 2.11 Screen: Profile & Settings

```
┌────────────────────────────────────────┐
│ ←  Profile & Settings                 │
├────────────────────────────────────────┤
│                                        │
│        ┌────────┐                     │
│        │ Avatar │                     │
│        │  80px  │                     │
│        └────────┘                     │
│       Nguyen Van Minh                 │
│       Security Guard • Sunrise Tower  │
│                                        │
│  ── Account ────────────────────────  │
│  [👤] Edit Profile                 >  │
│  [🔔] Notification Preferences     >  │
│  [🌐] Language (Vietnamese)        >  │
│  [🌙] Theme (Dark / Light / Auto)  >  │
│                                        │
│  ── Security ───────────────────────  │
│  [🔑] Change Password              >  │
│  [📱] Biometric Login (enabled)    >  │
│  [📍] Location Services            >  │
│                                        │
│  ── App ────────────────────────────  │
│  [ℹ] About                         >  │
│  [📋] Terms & Privacy              >  │
│  [🐛] Report a Bug                 >  │
│                                        │
│  [Sign Out]                           │  ← Ghost-danger button
│                                        │
│  v3.0.1 (build 142)                  │
│                                        │
├────────────────────────────────────────┤
│ [Dashboard] [Alerts] [Doors] [Cam] [⋯]│
└────────────────────────────────────────┘
```

**Components:**
- **Profile header:** Centered avatar (80px, `--radius-full`), name (`--text-xl`, 600), role + site (`--text-secondary`).
- **Settings groups:** Section headers (`--text-tertiary`, 11px, uppercase). List items: 52px height, left icon (20px, `--text-secondary`), label, chevron-right. Toggle items (biometric) show switch instead of chevron.
- **Sign out:** Ghost-danger at bottom. Requires confirmation.

**Interactions:**
- Tap avatar → edit photo (camera/gallery).
- Notification preferences → granular toggles per notification type.
- Theme toggle → immediate preview.
- Biometric → system biometric enrollment check.

---

## 3. Resident App

**Purpose:** Building life made convenient. Digital keys, visitor management, community services.

### 3.1 Navigation Structure

**Bottom Tab Bar:**

| # | Label | Icon (Lucide) | Color Active |
|---|-------|---------------|--------------|
| 1 | Home | `Home` | `--accent-500` |
| 2 | Keys | `Key` | `--accent-500` |
| 3 | Visitors | `UserPlus` | `--accent-500` |
| 4 | Services | `Grid2x2` | `--accent-500` |
| 5 | Profile | `User` | `--accent-500` |

**"Services" grid items:** Packages, Facility Booking, Announcements, Maintenance, Parking, Intercom History, Community, Payments.

---

### 3.2 Screen: Home

**Purpose:** Digital key front-and-center, quick access to everything.

```
┌────────────────────────────────────────┐
│  Sunrise Tower          [🔔 2]        │
├────────────────────────────────────────┤
│                                        │
│  Good evening, Linh 🌙                │
│  Unit 1203 • Block A                  │
│                                        │
│  ┌────────────────────────────────┐   │
│  │                                │   │
│  │     ┌──────────────────┐      │   │
│  │     │                  │      │   │
│  │     │    🔑  UNLOCK    │      │   │  ← Large circular button
│  │     │                  │      │   │     150px diameter
│  │     │   Main Entrance  │      │   │     --accent-600 bg
│  │     └──────────────────┘      │   │
│  │                                │   │
│  │  [Gate ▾] change door target   │   │
│  │                                │   │
│  └────────────────────────────────┘   │
│                                        │
│  ── Quick Actions ──────────────────  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│  │ 👤 │ │ 📦 │ │ 🔧 │ │ 🅿 │       │
│  │Inv.│ │Pkg │ │Fix │ │Park│       │
│  └────┘ └────┘ └────┘ └────┘       │
│                                        │
│  ── Announcements ──────────────────  │
│  📢 Water shutdown Feb 20, 9-11AM    │
│  📢 Lunar New Year event — RSVP      │
│                          [See All →]  │
│                                        │
│  ── Upcoming ───────────────────────  │
│  📦 Package waiting at reception      │
│  👤 Visitor: Mom — Tomorrow 2PM      │
│                                        │
├────────────────────────────────────────┤
│  [●Home]  [Keys]  [Visitors] [Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Unlock button:** Centered, circular (150px), `--accent-600` bg, white key icon (48px) + "UNLOCK" text. Pulsing subtle glow animation when in BLE range. Door selector dropdown below.
- **Quick actions:** 4-item grid. Each: 72×72px, `--surface-1` bg, `--radius-lg`, icon (28px, domain color) + label (11px).
- **Announcements:** Compact list, icon + title, `--text-primary`. Tap → detail.
- **Upcoming:** Smart feed of time-sensitive items (packages, visitors, bookings).

**Interactions:**
- Tap unlock → BLE handshake animation (expanding rings from button) → success: button turns green with checkmark, haptic. Fail: shake animation + error message.
- Long-press unlock → QR code fallback displayed.
- Door selector → bottom sheet listing available doors (Main Gate, Building Door, Parking, Unit Door).
- Quick action icons → navigate to respective screen.

---

### 3.3 Screen: Digital Keys

**Purpose:** Manage all digital credentials. BLE/QR unlock with visual feedback.

```
┌────────────────────────────────────────┐
│ ←  My Keys                            │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │  🏢 Main Entrance              │   │
│  │  Status: In Range (BLE) 📶     │   │
│  │  Valid: Always                  │   │
│  │                                 │   │
│  │  ┌──────────────────────────┐  │   │
│  │  │                          │  │   │
│  │  │     🔓  TAP TO UNLOCK   │  │   │  ← 120px round button
│  │  │                          │  │   │
│  │  └──────────────────────────┘  │   │
│  │                                 │   │
│  │  [Show QR Code]                 │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │  🅿 Parking Barrier            │   │
│  │  Status: Out of Range           │   │
│  │  Valid: Always                  │   │
│  │                    [Show QR]    │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │  🚪 Unit 1203                  │   │
│  │  Status: In Range (BLE) 📶     │   │
│  │  Valid: Always                  │   │
│  │                    [Unlock]     │   │
│  └────────────────────────────────┘   │
│                                        │
│  ── Temporary Keys ────────────────── │
│  🔑 Gym — Expires: Feb 28            │
│  🔑 Pool — Weekends only             │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [●Keys]  [Visitors] [Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Key card:** Per-door credential. Shows BLE signal strength when in range (animated bars). Unlock button prominent when in range; QR fallback always available.
- **QR code view:** Bottom sheet with large QR, brightness auto-maxed, auto-refresh timer (QR rotates every 30s for security).
- **Temporary keys:** Separate section for time-limited access.

**Unlock Animation Sequence:**
1. Tap button → button scales down (0.95), ripple effect outward
2. BLE connecting → concentric rings animating outward from button (blue, `--accent-400`)
3. Success → rings turn green, button fills `--success`, lock icon morphs to unlock icon (300ms), haptic success
4. Fail → rings turn red, shake animation, "Try again or use QR code"
5. Button returns to idle state after 2s

**Interactions:**
- In-range keys auto-sort to top.
- Tap "Show QR" → bottom sheet with large QR + countdown timer for rotation.
- Swipe on temporary key → view details / share with family.

---

### 3.4 Screen: Visitor Invitations

**Purpose:** Create invitations, share QR codes, track visitor status.

```
┌────────────────────────────────────────┐
│ ←  Visitors                      [+]  │
├────────────────────────────────────────┤
│ [Upcoming 3] [Active 1] [Past]        │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │  👤 Mom (Nguyen Thi Hoa)       │   │
│  │  📅 Tomorrow, 2:00 PM          │   │
│  │  🏷️ Family Visit               │   │
│  │  Status: QR Sent ✉️            │   │
│  │                                 │   │
│  │  [Share QR]  [Edit]  [Cancel]  │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │  👤 Plumber — Minh Services    │   │
│  │  📅 Feb 22, 9:00 AM            │   │
│  │  🏷️ Service                    │   │
│  │  Status: Pending                │   │
│  │                                 │   │
│  │  [Share QR]  [Edit]  [Cancel]  │   │
│  └────────────────────────────────┘   │
│                                        │
│  ... more                              │
│                                        │
│  ┌────────────────────────────────┐   │
│  │  Currently on-site:            │   │
│  │  👤 Delivery — GrabExpress     │   │
│  │     Arrived: 10:15 AM          │   │
│  │     Status: At Reception 🟢   │   │
│  └────────────────────────────────┘   │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [●Visitors] [Svc] [Me]│
└────────────────────────────────────────┘
```

**Create Invitation (FAB +):**
```
┌────────────────────────────────────────┐
│ ←  New Invitation                     │
├────────────────────────────────────────┤
│                                        │
│  Visitor Name *                       │
│  [                              ]     │
│                                        │
│  Phone or Email                       │
│  [                              ]     │
│                                        │
│  Visit Type                           │
│  [Family] [Friend] [Service] [Other]  │  ← Chip selector
│                                        │
│  Date & Time *                        │
│  [Feb 20, 2026]  [2:00 PM]           │
│                                        │
│  Duration                             │
│  [2 hours ▾]                          │
│                                        │
│  Note to Security (optional)          │
│  [                              ]     │
│                                        │
│  Access Areas                         │
│  ☑ Main Entrance                     │
│  ☑ Parking (1 vehicle)               │
│  ☐ Pool Area                         │
│                                        │
│  [Send Invitation]                    │
│                                        │
└────────────────────────────────────────┘
```

**Interactions:**
- "Send Invitation" → generates QR code → share sheet (SMS, Zalo, copy link).
- "Share QR" on existing → shows QR bottom sheet with share options.
- **Visitor pass data is synced to the relevant terminal device** so check-in works offline (device matches visitor QR locally).
- Active visitor card shows status from synced event logs (At Reception, Checked In, Left).
- Push notification when visitor arrives: "Your visitor Mom has arrived at reception." (triggered by device access.log event)
- Tap visitor card → full timeline (invited → QR sent → synced to terminal → arrived → checked in → left).
- Swipe left → cancel invitation (triggers sync to remove visitor pass from devices).

---

### 3.5 Screen: Intercom (Video Call)

**Purpose:** Answer video intercom calls from door stations.

**Incoming Call:**
```
┌────────────────────────────────────────┐
│                                        │
│                                        │
│         ┌──────────────────┐          │
│         │                  │          │
│         │   LIVE VIDEO     │          │
│         │   from Door      │          │
│         │   Station        │          │
│         │                  │          │
│         │                  │          │
│         └──────────────────┘          │
│                                        │
│        📍 Main Entrance               │
│        Calling Unit 1203...            │
│                                        │
│                                        │
│     ┌──────┐           ┌──────┐      │
│     │  🔴  │           │  🟢  │      │
│     │Decline│           │Answer│      │
│     └──────┘           └──────┘      │
│                                        │
│              [🔓 Unlock]              │  ← Quick unlock without answering
│                                        │
└────────────────────────────────────────┘
```

**Active Call:**
```
┌────────────────────────────────────────┐
│                                        │
│    ┌──────────────────────────────┐   │
│    │                              │   │
│    │                              │   │
│    │      LIVE VIDEO FEED         │   │
│    │      (full width)            │   │
│    │                              │   │
│    │                              │   │
│    └──────────────────────────────┘   │
│                                        │
│    Main Entrance • 00:32              │
│                                        │
│    [🔇 Mute] [🔓 Unlock] [🔴 End]   │
│                                        │
└────────────────────────────────────────┘
```

**Components:**
- **Video preview:** Large, 16:9 or 4:3 from door station camera.
- **Call controls:** 56px circular buttons. Decline (red), Answer (green), Unlock (blue).
- **Quick unlock:** Ghost button below — opens door without answering call.
- **Active call:** Mute toggle, unlock button (can unlock during call), end call.

**Interactions:**
- Incoming call: push notification even when app backgrounded (VoIP push). Full-screen takeover like phone call.
- Answer → two-way audio, one-way video (from door station). Video quality auto-adjusts.
- Unlock during call → confirmation haptic + "Door unlocked" toast + auto-relock timer shown.
- End call → returns to previous screen.
- Missed calls shown in intercom history (accessible from Services).

---

### 3.6 Screen: Package Notifications

**Purpose:** View deliveries, confirm pickup.

```
┌────────────────────────────────────────┐
│ ←  Packages                           │
├────────────────────────────────────────┤
│ [Waiting 2] [Collected] [All]         │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 📦 Package from Shopee         │   │
│  │    Received: Today, 2:30 PM    │   │
│  │    Location: Reception Desk    │   │
│  │    ┌──────┐                    │   │
│  │    │ Photo│  Tracking: SPX123  │   │
│  │    └──────┘                    │   │
│  │           [Confirm Pickup]     │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 📦 Package from Lazada         │   │
│  │    Received: Today, 11:15 AM   │   │
│  │    Location: Locker #14        │   │
│  │    Code: 7823                  │   │
│  │           [Confirm Pickup]     │   │
│  └────────────────────────────────┘   │
│                                        │
│  ── Collected ──────────────────────  │
│  ✅ Amazon package — Feb 18          │
│  ✅ Food delivery — Feb 17           │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [●Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Package card:** Photo thumbnail (if available), sender/courier, receive time, location/locker info, locker code (if smart locker).
- **Confirm Pickup:** Primary button. Tapping confirms collection — requires either scanning a QR at pickup or manual confirmation.

**Interactions:**
- Push notification on delivery: "📦 Package from Shopee waiting at Reception."
- Tap "Confirm Pickup" → bottom sheet: "Pick up confirmation" with options: Scan QR at desk / Mark as Collected. Prevents false confirmations.
- Photo tap → fullscreen viewer.
- Pull-to-refresh.

---

### 3.7 Screen: Facility Booking

**Purpose:** Book meeting rooms, amenities (gym, pool, BBQ area, etc.)

```
┌────────────────────────────────────────┐
│ ←  Book Facilities                    │
├────────────────────────────────────────┤
│ [Rooms] [Gym] [Pool] [BBQ] [Tennis]   │  ← Horizontal scroll categories
├────────────────────────────────────────┤
│                                        │
│  ── February 20, 2026 ────────────── │
│  [< ] [Today] [  Sun  ] [  Mon  ] [>]│  ← Date selector, horizontal scroll
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🏊 Pool                        │   │
│  │ Floor B1 • Capacity: 20        │   │
│  │                                 │   │
│  │ Available Slots:                │   │
│  │ [6:00-8:00] [8:00-10:00]      │   │
│  │ [̲1̲0̲:̲0̲0̲-̲1̲2̲:̲0̲0̲] [14:00-16:00]│   │  ← Selected slot highlighted
│  │ [16:00-18:00] [18:00-20:00]   │   │
│  │                                 │   │
│  │           [Book 10:00-12:00]   │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🎾 Tennis Court                 │   │
│  │ Rooftop • Capacity: 4          │   │
│  │                                 │   │
│  │ Available Slots:                │   │
│  │ [6:00-7:00] [7:00-8:00] ...   │   │
│  │                                 │   │
│  └────────────────────────────────┘   │
│                                        │
│  ── My Bookings ────────────────────  │
│  🏊 Pool — Today 10:00-12:00         │
│  🎾 Tennis — Feb 22, 7:00-8:00       │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [●Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Category chips:** Horizontal scroll, icon + label. Active: `--accent-500`.
- **Date selector:** Horizontal scrollable day chips. Today highlighted.
- **Facility card:** Icon, name, location, capacity. Time slot chips (available: `--surface-1` border; booked by others: `--surface-2` + strikethrough; selected: `--accent-500` bg).
- **Book button:** Appears when slot selected. Primary style.
- **My Bookings:** Bottom section showing upcoming reservations.

**Interactions:**
- Tap time slot → selects it (highlight). Tap again → deselect.
- Tap "Book" → confirmation bottom sheet with summary + rules + [Confirm].
- Booking confirmed → calendar event created (if calendar sync enabled) + push reminder 30min before.
- Tap existing booking → detail with [Cancel Booking] option.
- Swipe left on booking → cancel.

---

### 3.8 Screen: Building Announcements

```
┌────────────────────────────────────────┐
│ ←  Announcements                      │
├────────────────────────────────────────┤
│ [All] [Important] [Events] [Maintenance]│
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 📌 PINNED                      │   │
│  │ Water Supply Shutdown           │   │
│  │ Feb 20, 9:00-11:00 AM          │   │
│  │ Water will be shut off for     │   │
│  │ maintenance on floors 10-15.   │   │
│  │ Posted: Feb 18 by Management   │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🎉 Lunar New Year Celebration  │   │
│  │ Feb 25, 6:00 PM — Lobby        │   │
│  │ Join us for food, games, and   │   │
│  │ lion dance!                     │   │
│  │ Posted: Feb 17                  │   │
│  │                       [RSVP]   │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🔧 Elevator B Maintenance      │   │
│  │ Feb 21, 2:00-5:00 PM           │   │
│  │ Use Elevator A during this...  │   │
│  │ Posted: Feb 16                  │   │
│  └────────────────────────────────┘   │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [●Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Pinned card:** Highlighted with `--warning` left border (3px). "PINNED" badge.
- **Event card:** With RSVP button (`--accent-600`).
- **Standard card:** Title (`--text-lg`, 600), date/time, excerpt (2-line clamp), posted by + date (`--text-tertiary`).

**Interactions:**
- Tap card → full announcement detail (rich text, images, attachments).
- RSVP → bottom sheet: "Attending?" [Yes] [Maybe] [No]. Updates count.
- Push notification for important announcements.
- Filter chips narrow by category.

---

### 3.9 Screen: Maintenance Requests

**Purpose:** Submit and track maintenance requests for the unit.

```
┌────────────────────────────────────────┐
│ ←  Maintenance                   [+]  │
├────────────────────────────────────────┤
│ [Active 2] [Resolved] [All]          │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🔧 Leaking faucet — Kitchen    │   │
│  │    Submitted: Feb 18            │   │
│  │    Status: ████░░ In Progress  │   │
│  │    Assigned: Building Maint.   │   │
│  │    ETA: Feb 21                  │   │
│  │                                 │   │
│  │    💬 1 update from technician  │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 💡 Hallway light out — Floor 12│   │
│  │    Submitted: Feb 15            │   │
│  │    Status: ██░░░░ Scheduled    │   │
│  │    Assigned: Electrician team   │   │
│  │    ETA: Feb 22                  │   │
│  └────────────────────────────────┘   │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [●Svc] [Me]│
└────────────────────────────────────────┘
```

**Create Request (FAB +):**
```
┌────────────────────────────────────────┐
│ ←  New Request                        │
├────────────────────────────────────────┤
│                                        │
│  Category *                           │
│  [Plumbing] [Electrical] [AC/HVAC]    │
│  [Appliance] [Structural] [Other]     │
│                                        │
│  Location *                           │
│  [Kitchen ▾]                          │  ← Room picker
│                                        │
│  Description *                        │
│  ┌────────────────────────────────┐   │
│  │ Describe the issue...          │   │
│  └────────────────────────────────┘   │
│                                        │
│  Photos                               │
│  ┌──────┐ ┌──────┐                   │
│  │ +📷  │ │ img  │                   │
│  └──────┘ └──────┘                   │
│                                        │
│  Preferred Time                       │
│  [Any time] [Morning] [Afternoon]     │
│  [Evening] [Weekend Only]             │
│                                        │
│  [Submit Request]                     │
│                                        │
└────────────────────────────────────────┘
```

**Interactions:**
- Tap request card → detail view: full description, photos, status timeline (Submitted → Acknowledged → Scheduled → In Progress → Resolved), chat with maintenance team.
- Chat thread allows resident to add comments/photos and receive technician updates.
- Push notification on status changes.
- Resolved requests prompt satisfaction rating (1-5 stars).
- FAB → create form.

---

### 3.10 Screen: Parking

**Purpose:** Manage registered vehicles, visitor parking passes.

```
┌────────────────────────────────────────┐
│ ←  Parking                            │
├────────────────────────────────────────┤
│                                        │
│  ── My Vehicles ────────────────────  │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🚗 Toyota Camry                │   │
│  │    51A-123.45                   │   │
│  │    Spot: B1-042 (Monthly)       │   │
│  │    Valid: Jan 1 — Dec 31, 2026  │   │
│  │    Status: Parked 🟢           │   │
│  │              [Show QR] [Renew]  │   │
│  └────────────────────────────────┘   │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🛵 Honda SH                    │   │
│  │    29B1-567.89                  │   │
│  │    Spot: M1-015 (Monthly)       │   │
│  │    Valid: Jan 1 — Dec 31, 2026  │   │
│  │    Status: Not in building     │   │
│  └────────────────────────────────┘   │
│                                        │
│  [+ Add Vehicle]                      │
│                                        │
│  ── Visitor Passes ─────────────────  │
│                                        │
│  ┌────────────────────────────────┐   │
│  │ 🎫 Temporary Pass              │   │
│  │    For: Mom's visit, Feb 21     │   │
│  │    Vehicle: 30A-999.88          │   │
│  │    Valid: Feb 21, 8AM-6PM       │   │
│  │              [Share QR]         │   │
│  └────────────────────────────────┘   │
│                                        │
│  [+ Request Visitor Pass]             │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [●Svc] [Me]│
└────────────────────────────────────────┘
```

**Components:**
- **Vehicle card:** Vehicle icon (type-based), make/model, plate number (mono, `--text-lg`), assigned spot, validity, real-time status (parked/not in building from LPR).
- **QR button:** Shows parking QR for barrier entry.
- **Visitor pass section:** Temporary passes created for guests.

**Interactions:**
- "Add Vehicle" → form: plate number, vehicle type, make/model, color. Requires management approval.
- "Request Visitor Pass" → form: visitor name, plate, date, duration. Auto-generates QR.
- "Share QR" → share sheet to send parking QR to visitor.
- "Renew" → payment/renewal flow.
- Push notification: "Your parking pass expires in 7 days."

---

### 3.11 Screen: Profile & Settings (Resident)

```
┌────────────────────────────────────────┐
│ ←  Profile                            │
├────────────────────────────────────────┤
│                                        │
│        ┌────────┐                     │
│        │ Avatar │                     │
│        │  80px  │                     │
│        └────────┘                     │
│       Nguyen Thi Linh                 │
│       Unit 1203 • Block A             │
│       Sunrise Tower                   │
│                                        │
│  ── My Unit ────────────────────────  │
│  [🏠] Unit Details              >     │
│  [👨‍👩‍👧] Family Members (3)         >     │
│  [🔑] My Access Keys            >     │
│                                        │
│  ── Preferences ────────────────────  │
│  [🔔] Notifications              >    │
│  [🌐] Language (Tiếng Việt)      >    │
│  [🌙] Theme (Auto)               >    │
│                                        │
│  ── Security ───────────────────────  │
│  [🔑] Change Password            >    │
│  [📱] Face ID (enabled)          >    │
│                                        │
│  ── Support ────────────────────────  │
│  [💬] Contact Management         >    │
│  [ℹ️] About                      >    │
│  [📋] Terms & Privacy            >    │
│                                        │
│  [Sign Out]                           │
│                                        │
│  v3.0.1 (build 142)                  │
│                                        │
├────────────────────────────────────────┤
│  [Home]  [Keys]  [Visitors] [Svc] [●Me]│
└────────────────────────────────────────┘
```

**Unique to Resident:**
- **Family Members:** Manage household members who share unit access. Add/remove family, each gets their own digital keys.
- **Unit Details:** Unit number, floor, block, lease dates, management contact.
- **Contact Management:** Direct messaging to building management.

**Interactions:**
- Family Members → list of members with access status. [+ Add Member] → invite via phone/email.
- Notifications → granular: packages, visitors, announcements, maintenance updates, community.
- Contact Management → in-app chat with building admin.

---

## 4. Design Token Reference Summary

### Colors Used Across Mobile

| Element | Token | Value |
|---------|-------|-------|
| Background | `--bg-primary` | `#0A0E1A` (dark) / `#FFFFFF` (light) |
| Card surface | `--surface-1` | `#1E293B` / `#FFFFFF` |
| Primary action | `--accent-600` | `#2563EB` |
| Success (unlock, approve) | `--success` | `#22C55E` |
| Error (alarm, reject) | `--error` | `#EF4444` |
| Warning (expiring) | `--warning` | `#EAB308` |
| Primary text | `--text-primary` | `#F8FAFC` / `#0F172A` |
| Secondary text | `--text-secondary` | `#94A3B8` / `#475569` |
| Tertiary text | `--text-tertiary` | `#64748B` / `#94A3B8` |

### Typography (Mobile — +1px from web base)

| Use | Size | Weight |
|-----|------|--------|
| Page title | 20px (`--text-2xl`) | 600 |
| Section header | 16px (`--text-lg`) | 500 |
| Card title | 16px (`--text-lg`) | 500 |
| Body text | 14px (`--text-md`) | 400 |
| Secondary/meta | 13px (`--text-base`) | 400 |
| Badge/timestamp | 11px (`--text-xs`) | 500 |
| Stat number | 24px (`--text-3xl`) | 600 |

### Spacing

| Element | Value |
|---------|-------|
| Screen padding | 16px |
| Card padding | 12-16px |
| Card gap | 12px |
| Section gap | 24px |
| Bottom nav height | 56px |
| Touch target min | 44×44px |

### Radius

| Element | Value |
|---------|-------|
| Cards | `--radius-lg` (8px) |
| Buttons | `--radius-md` (6px) |
| Input fields | `--radius-md` (6px) |
| Chips/pills | `--radius-full` (9999px) |
| Bottom sheets | 12px (top corners) |
| Avatars | `--radius-full` |

### Motion

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button press | 100ms | `--ease-default` |
| Screen transition | 300ms | `--ease-out` |
| Bottom sheet | 300ms | `--ease-out` |
| Toast enter/exit | 200ms | `--ease-out` / `--ease-in` |
| Unlock animation | 500ms | `--ease-spring` |
| Success/error feedback | 300ms | `--ease-default` |

---

*Mobile UX v1.0 — Duall Master 3.0*  
*Created February 2026*  
*Companion to: duall-master-design-system.md*
