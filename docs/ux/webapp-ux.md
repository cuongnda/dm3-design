# Duall Master 3.0 — Web Console UI/UX Specification

**Version:** 1.0  
**Date:** February 2026  
**Kanban:** task-1771437372

> Complete screen-by-screen UI/UX specification for the Duall Master 3.0 Web Console. References the Design System v1.0 tokens and components throughout.

---

## Table of Contents

1. [Global Screens](#1-global-screens)
2. [Dashboard](#2-dashboard)
3. [SECURE Modules](#3-secure-modules)
4. [MANAGE Modules](#4-manage-modules)
5. [OPERATE Modules](#5-operate-modules)
6. [SMART Layer](#6-smart-layer)

---

## 1. Global Screens

### 1.1 Login / Auth Flow

**Purpose:** Authenticate users with support for SSO, MFA, and standard credentials.

#### Login Screen

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                     ◆ DUALL MASTER 3.0                           │
│                     Building Operating System                    │
│                                                                  │
│              ┌──────────────────────────────┐                    │
│              │  Email                       │                    │
│              └──────────────────────────────┘                    │
│              ┌──────────────────────────────┐                    │
│              │  Password               👁   │                    │
│              └──────────────────────────────┘                    │
│              ☐ Remember this device                              │
│                                                                  │
│              [        Sign In        ]  ← btn-primary, lg       │
│                                                                  │
│              ─────── or continue with ───────                    │
│                                                                  │
│              [ 🏢 Sign in with SSO   ]  ← btn-secondary         │
│                                                                  │
│              Forgot password?  ← link, --accent-500              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Building: Landmark 81  ▾    │  EN | VI               │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Full-screen, centered card (max-width 400px) on `--bg-primary` background
- Logo + wordmark at top (`--text-2xl`, 600)
- Subtle building illustration or abstract pattern in background (very low opacity)
- Dark theme only on login screen

**Components:**
- Text inputs (`md` size, 36px height) for email and password
- Password field: toggle visibility icon (`Eye`/`EyeOff`, 16px)
- Checkbox: "Remember this device"
- Primary button: full-width, `lg` size
- SSO button: secondary variant, full-width
- Forgot password: text link below

**Interactions:**
- Enter key submits form
- Email validation on blur (format check)
- Password: show/hide toggle
- Error state: inline alert below field with `--error` border
- Loading: button shows spinner, disabled state
- Failed login: toast notification (error), shake animation on form

**States:**
- Default → Loading → Success (redirect) or Error (inline message)
- After 5 failed attempts: show CAPTCHA, then temporary lockout (30s)

#### MFA Screen

```
┌──────────────────────────────────────────────────────────────────┐
│                     ◆ DUALL MASTER 3.0                           │
│                                                                  │
│                  Two-Factor Authentication                       │
│                                                                  │
│           Enter the 6-digit code from your                       │
│           authenticator app.                                     │
│                                                                  │
│              ┌──┐ ┌──┐ ┌──┐  ┌──┐ ┌──┐ ┌──┐                   │
│              │  │ │  │ │  │  │  │ │  │ │  │                     │
│              └──┘ └──┘ └──┘  └──┘ └──┘ └──┘                     │
│                                                                  │
│              [       Verify       ]                               │
│                                                                  │
│              Use recovery code instead                            │
│              ← Back to login                                     │
└──────────────────────────────────────────────────────────────────┘
```

- 6 individual digit inputs, auto-advance focus
- Auto-submit when all 6 digits entered
- Recovery code link → shows single text input for backup code

#### SSO Redirect

- Shows "Redirecting to your identity provider..." with spinner
- On return: brief "Verifying..." state, then auto-redirect to dashboard

---

### 1.2 Main Layout

**Purpose:** The shell that wraps all authenticated pages — sidebar navigation, top bar, and content area.

```
┌────────────────────┬─────────────────────────────────────────────────────┐
│                    │  ☰  SECURE > Access Control    🔍 ⌘K  🔔(3)  ☺ ▾  │
│  ◆ DUALL MASTER    ├─────────────────────────────────────────────────────┤
│                    │                                                     │
│  OVERVIEW          │                                                     │
│  ◉ Dashboard       │                                                     │
│  ○ Alerts     12   │              CONTENT AREA                           │
│                    │                                                     │
│  🔒 SECURE         │         (scrollable, padded 24px)                   │
│  ○ Access Control  │                                                     │
│  ○ CCTV            │                                                     │
│  ○ Intrusion       │                                                     │
│  ○ Intercom        │                                                     │
│  ○ AI Detection    │                                                     │
│  ○ Emergency       │                                                     │
│                    │                                                     │
│  👤 MANAGE          │                                                     │
│  ○ Identities      │                                                     │
│  ○ Visitors        │                                                     │
│  ○ Contractors     │                                                     │
│  ○ Attendance      │                                                     │
│  ○ Deliveries      │                                                     │
│  ○ Provisioning    │                                                     │
│                    │                                                     │
│  🏢 OPERATE         │                                                     │
│  ○ Room Booking    │                                                     │
│  ○ Parking         │                                                     │
│  ○ Maintenance     │                                                     │
│  ○ Guard Tour      │                                                     │
│  ○ Keys            │                                                     │
│  ○ IoT & Energy    │                                                     │
│                    │                                                     │
│  ─────────────     │                                                     │
│  🧠 AI Assistant    │                                                     │
│  ⚙ Settings        │                                                     │
│  ☺ Cuong N.    ▾   │                                                     │
└────────────────────┴─────────────────────────────────────────────────────┘
```

**Sidebar (240px expanded / 56px collapsed):**
- Background: `--bg-secondary` (`#111827`)
- Logo area: 48px height, `--space-4` padding
- Section labels: `--text-xs` (11px), 500, uppercase, `--text-tertiary`, domain-colored for domain sections
- Nav items: 32px height, `--text-md` (14px), `--text-secondary` default
- Active item: `--accent-500` text, `--accent-900` bg, 2px left border `--accent-500`
- Hover: `--text-primary`, `--surface-2` bg
- Badge counts: pill badge right-aligned, `--error` for alerts
- Icons: Lucide 18px, 10px gap to text
- Collapsed: icons only, tooltip on hover (`--duration-moderate`)
- Collapse trigger: `☰` button on topbar or `[` keyboard shortcut
- Bottom section: divider, AI Assistant link (`--domain-smart`), Settings, User menu
- Scrollable if content exceeds viewport (custom scrollbar, 6px)

**Top Bar (48px):**
- Background: `--bg-secondary`, border-bottom 1px `--border-default`
- Left: hamburger (mobile) or breadcrumb
- Breadcrumb: domain icon (colored) → module → page, separator `/`, `--text-sm`
- Right cluster (8px gaps):
  - Search trigger: `🔍` icon button (ghost) + "Search..." text + `⌘K` badge
  - Notifications bell: `🔔` with red dot badge (unread count)
  - User avatar (`sm` 24px) + name + chevron-down → dropdown menu

**Content Area:**
- Background: `--bg-primary` (`#0A0E1A`)
- Padding: 24px (all sides)
- Max-width: none (fluid), content components define their own max-widths
- Scrollable: vertical, custom scrollbar
- Page header pattern: title (`--text-2xl`) + optional description + action buttons (right-aligned)

**Responsive:**
- Below 1024px: sidebar collapses to 56px (icons only)
- Below 768px: sidebar becomes overlay (280px), triggered by hamburger
- Content reflows to single column on small screens

---

### 1.3 Global Search (Command Palette)

**Purpose:** Universal search across all entities — people, doors, cameras, events, settings. Triggered by `⌘K`.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  Search anything...                              ESC ×  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  RECENT                                                      │
│  🕐  Main Entrance Door                                     │
│  🕐  Nguyen Van A - Employee                                │
│  🕐  Camera Grid - Floor 3                                  │
│                                                              │
│  QUICK ACTIONS                                               │
│  ⚡  Lock all doors                                          │
│  ⚡  Open visitor check-in                                   │
│  ⚡  Generate attendance report                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   ↵ Select   ⌘K Reopen   ESC Close            │
└──────────────────────────────────────────────────────────────┘
```

**When typing "nguyen":**

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  nguyen                                          ESC ×  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  👤 PEOPLE                                                   │
│  ◉ Nguyen Van A        Employee  •  IT Department           │
│    Nguyen Thi B        Visitor   •  Expected today           │
│    Nguyen Van C        Contractor • ABC Corp                 │
│                                                              │
│  📋 EVENTS                                                   │
│    Nguyen Van A granted - Door 5     Today 09:12            │
│    Nguyen Van A denied - Parking     Yesterday 18:30         │
│                                                              │
│  🔒 ACCESS RULES                                             │
│    "Nguyen Team" access group         12 members             │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   ↵ Open   ⇥ Filter by type                   │
└──────────────────────────────────────────────────────────────┘
```

**Layout:**
- Modal overlay (`#000` 60% opacity)
- Container: `--surface-1`, max-width 640px, centered horizontally, top 20% of viewport
- Border-radius: `--radius-xl` (12px)
- No padding on container — sections handle their own

**Components:**
- Search input: large (40px), no border, transparent bg, `--text-lg`, autofocus
- Right of input: ESC badge + close button (ghost)
- Results grouped by type with section headers (`--text-xs`, uppercase, `--text-tertiary`)
- Result items: 36px height, icon (domain-colored) + name (`--text-primary`) + metadata (`--text-secondary`)
- Active result: `--surface-2` bg, `--accent-500` left border
- Footer: keyboard hints, `--text-xs`, `--text-tertiary`, `--surface-2` bg

**Interactions:**
- `⌘K` or click search in topbar → opens palette
- Type to search (debounced 200ms)
- Arrow keys navigate results, Enter selects
- Tab filters by entity type (People / Doors / Cameras / Events / Settings)
- ESC or click overlay → close
- Results are instant (local index) with async refinement from server

**Search Scope:**
- People (employees, visitors, contractors)
- Devices (doors, cameras, sensors, intercoms)
- Locations (buildings, floors, zones, rooms)
- Events (access events, alarms, incidents)
- Settings & Configuration pages
- Quick actions (commands like "lock all doors")

---

### 1.4 Notification Center

**Purpose:** Centralized alert and notification management with priority levels and actions.

```
┌──────────────────────────────────────────┐
│  Notifications                    ✓ All  │
│  ─────────────────────────────────────── │
│  [All] [Critical] [Warnings] [Info]      │
│  ─────────────────────────────────────── │
│                                          │
│  🔴 CRITICAL  •  2 min ago               │
│  Door 5 forced open — Building A, F3     │
│  [View Camera] [Acknowledge]             │
│                                          │
│  🔴 CRITICAL  •  5 min ago               │
│  Intrusion alarm — Zone B, Perimeter     │
│  [View Zone] [Acknowledge]               │
│                                          │
│  🟡 WARNING  •  12 min ago               │
│  Camera NVR-02 storage at 90%            │
│  [View NVR] [Dismiss]                    │
│                                          │
│  🔵 INFO  •  1 hour ago                  │
│  Visitor John Smith checked in           │
│  [View Visitor]                          │
│                                          │
│  🔵 INFO  •  2 hours ago                 │
│  Scheduled report generated              │
│  [Download]                              │
│                                          │
│  ─────────────────────────────────────── │
│  View all notifications →                │
└──────────────────────────────────────────┘
```

**Layout:**
- Triggered by clicking bell icon in topbar
- Dropdown panel: 400px wide, max-height 480px, anchored top-right
- Background: `--surface-1`, border: `--border-strong`, radius: `--radius-lg`
- Shadow: `--shadow-lg` (light theme only)

**Components:**
- Header: "Notifications" (`--text-lg`, 500) + "✓ All" mark-all-read button (ghost)
- Tab filter: pill tabs (All / Critical / Warnings / Info)
- Notification item:
  - Priority dot: 8px, left-aligned (red=critical, amber=warning, blue=info)
  - Title: `--text-base` (13px), 500, `--text-primary`
  - Description: `--text-sm` (12px), `--text-secondary`
  - Timestamp: `--text-xs`, `--text-tertiary`, right-aligned
  - Action buttons: `xs` ghost buttons, inline
  - Unread: subtle `--surface-2` bg or left border accent
- Dividers: 1px `--border-default` between items
- Footer: "View all notifications →" link to full notifications page

**Interactions:**
- Click bell → toggle panel open/close
- Click notification → navigate to relevant screen
- Action buttons: inline contextual actions
- Mark all read: clears unread state on all
- Swipe right (future mobile): dismiss
- Real-time: new notifications push to top with slide-in animation
- Sound: optional audio alert for critical (configurable in settings)

**Full Notifications Page (`/notifications`):**
- Same list but full-width table format
- Columns: Priority | Type | Message | Source | Time | Status | Actions
- Filters: date range, priority, type, source module
- Bulk actions: mark read, dismiss, export

---

### 1.5 User Profile / Settings

**Purpose:** User account settings, preferences, and system configuration.

#### Profile Dropdown (from topbar avatar)

```
┌────────────────────────────┐
│  ☺ Cuong Nguyen            │
│  cuong@duali.vn            │
│  Admin • Landmark 81       │
│  ─────────────────────     │
│  👤 Profile                │
│  ⚙ Settings               │
│  🎨 Theme: Dark  ▾        │
│  🌐 Language: EN  ▾       │
│  ─────────────────────     │
│  📖 Documentation          │
│  ❓ Help & Support         │
│  ─────────────────────     │
│  🚪 Sign out              │
└────────────────────────────┘
```

- Width: 240px, `--surface-1` bg, `--radius-lg`
- User section: avatar (`lg` 40px) + name + email + role tag
- Menu items: 32px height, icon (16px) + label, ghost style
- Theme toggle: inline dropdown or toggle (Dark/Light/System)
- Sign out: `--error` colored text

#### Settings Page (`/settings`)

```
┌────────────────────┬──────────────────────────────────────────────┐
│                    │                                              │
│  SETTINGS          │  Profile                                    │
│                    │  ──────────────────────────────────────────  │
│  ◉ Profile         │                                              │
│  ○ Security        │  ┌──────┐  Cuong Nguyen                     │
│  ○ Notifications   │  │  ☺   │  cuong@duali.vn                   │
│  ○ Appearance      │  │      │  [Change Photo]                   │
│  ○ Language        │  └──────┘                                    │
│                    │                                              │
│  ADMIN             │  ┌─────────────────────────────────────┐    │
│  ○ Users & Roles   │  │ First Name    │ Last Name           │    │
│  ○ Sites           │  │ Cuong         │ Nguyen              │    │
│  ○ Integrations    │  ├─────────────────────────────────────┤    │
│  ○ Audit Logs      │  │ Email                               │    │
│  ○ Backup          │  │ cuong@duali.vn                      │    │
│  ○ Licensing       │  ├─────────────────────────────────────┤    │
│                    │  │ Phone                               │    │
│                    │  │ +84 xxx xxx xxx                     │    │
│                    │  ├─────────────────────────────────────┤    │
│                    │  │ Department       │ Role              │    │
│                    │  │ IT (read-only)   │ Admin (read-only) │    │
│                    │  └─────────────────────────────────────┘    │
│                    │                                              │
│                    │           [Cancel]  [Save Changes]           │
└────────────────────┴──────────────────────────────────────────────┘
```

**Layout:**
- Settings uses a left tab-nav (200px) + content area pattern
- Tab nav: vertical list inside content area (not the main sidebar)
- Two groups: personal settings + admin settings (role-gated)

**Settings Sections:**

| Section | Contents |
|---------|----------|
| **Profile** | Avatar, name, email, phone, department (read-only from HR sync) |
| **Security** | Change password, MFA setup (enable/disable TOTP), active sessions list with revoke, API keys |
| **Notifications** | Per-type toggles: email, push, in-app. Quiet hours. Critical override. |
| **Appearance** | Theme (Dark/Light/System), sidebar default state, dashboard layout preference, compact/comfortable density |
| **Language** | UI language (EN/VI), date format, time format (12h/24h), timezone |
| **Users & Roles** *(admin)* | User directory, role definitions with permission matrix, invite users |
| **Sites** *(admin)* | Site hierarchy management, zone/floor configuration |
| **Integrations** *(admin)* | API keys, webhook configuration, HR sync, calendar sync, SSO config |
| **Audit Logs** *(admin)* | Immutable log viewer with filters (user, action, date range), export |
| **Backup** *(admin)* | Manual backup trigger, scheduled backup config, restore |
| **Licensing** *(admin)* | Current license tier, module activation, usage counters, upgrade CTA |

---

## 2. Dashboard

### 2.1 Unified Dashboard

**Purpose:** Real-time operational overview across all three domains. The "single pane of glass."

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard                    🏢 Landmark 81 ▾     📅 Today  ▾   ⚙   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ ↗ People │ │🔒 Doors  │ │📹 Cameras│ │⚠ Alerts  │ │🅿 Parking│    │
│  │  1,247   │ │  48/52   │ │  31/32   │ │    3     │ │  78%     │    │
│  │ in bldg  │ │ online   │ │ online   │ │ active   │ │ occupied │    │
│  │ +12% ↑   │ │ 4 issues │ │ 1 offline│ │ 2 crit   │ │ 312/400  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────┐ ┌────────────────────────┐    │
│  │  ACCESS EVENTS (Live)          •    │ │  ACTIVE ALERTS    ▾   │    │
│  │  ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇▆▅▃           │ │                        │    │
│  │  ──────────────────────────────── │ │  🔴 Door 5 forced open│    │
│  │  09:12  Nguyen VA  → Door 3  ✅   │ │     Bldg A, F3  2m    │    │
│  │  09:11  Tran TB    → Gate 1  ✅   │ │                        │    │
│  │  09:11  UNKNOWN    → Door 7  ❌   │ │  🔴 Intrusion Zone B  │    │
│  │  09:10  Le VC      → Lift 2  ✅   │ │     Perimeter   5m    │    │
│  │  09:09  Pham TD    → Door 1  ✅   │ │                        │    │
│  │  09:08  Visitor #42→ Gate 1  ✅   │ │  🟡 NVR-02 storage    │    │
│  │                    [View All →]   │ │     90% full    12m   │    │
│  └─────────────────────────────────────┘ │                        │    │
│                                          │  [View All Alerts →]  │    │
│  ┌──────────────────┐ ┌────────────────┐ └────────────────────────┘    │
│  │  🔒 SECURE        │ │  👤 MANAGE      │ ┌────────────────────────┐    │
│  │  Domain Health    │ │  Domain Health  │ │  🏢 OPERATE            │    │
│  │  ● Access  ✅     │ │  ● Identity ✅  │ │  Domain Health        │    │
│  │  ● CCTV    ⚠     │ │  ● Visitors  ✅ │ │  ● Rooms    ✅        │    │
│  │  ● Intrus. ✅     │ │  ● T&A      ✅  │ │  ● Parking  ✅        │    │
│  │  ● Intercom✅     │ │  ● Delivery ✅  │ │  ● Maint.   ⚠        │    │
│  │  [View →]         │ │  [View →]       │ │  [View →]             │    │
│  └──────────────────┘ └────────────────┘ └────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Page header: title + site selector dropdown + date range picker + settings gear (customize widgets)
- Stat cards row: 5 cards in a row (responsive: wrap to 3+2 or 2+2+1)
- Middle: 2-column layout (65/35 split)
  - Left: Live access events feed with sparkline chart
  - Right: Active alerts panel
- Bottom: 3-column domain health cards (equal width)

**Stat Cards (top row):**
- Use Stat Card component from design system
- Numbers: `--text-3xl` (24px), domain-colored, tabular-nums
- Trend: `--success` (green ↑) or `--error` (red ↓), `--text-xs`
- Sparkline: 40px tall inline trend chart
- Click → navigates to relevant module

**Access Event Logs (from synced device logs):**
- Card with header: title + live indicator (pulsing green dot — indicates events streaming from devices)
- Mini area chart: last 60 minutes of access volume
- Event list: auto-scrolling (newest on top), max 20 visible
- Each row: time (mono, `--text-xs`) | user (avatar+name) | point (door/gate) | status (✅/❌)
- Denied events: `--error` colored row highlight
- Events are logged by devices locally, then synced to server for display
- "View All →" link at bottom

**Active Alerts:**
- Sorted by severity (critical first), then recency
- Each alert: priority dot + title + location + time-ago
- Click → navigates to alert source
- Acknowledge button: inline ghost

**Domain Health Cards:**
- Domain icon + name, domain-colored
- List of modules with status indicator: ✅ (all ok) / ⚠ (warning) / 🔴 (critical)
- Click "View →" → navigates to domain dashboard

**Interactions:**
- Auto-refresh: every 10 seconds for live data
- WebSocket for real-time events (access events, alerts)
- Site selector: switches all dashboard data to selected site
- Gear icon: opens widget customization modal (drag-drop reorder, show/hide)
- All cards are clickable → drill-down navigation

**Customization:**
- Users can rearrange widgets via drag-drop
- Show/hide specific widgets
- Preferences saved per-user in profile

---

### 2.2 Per-Domain Dashboards

Each domain has its own focused dashboard accessible via sidebar or domain health card.

#### SECURE Dashboard (`/secure`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔒 Security Overview                     📅 Today ▾    🔄 Live   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │ Access Pts │ │ Cameras    │ │ Alarms     │ │ Incidents  │      │
│  │  48/52     │ │  31/32     │ │  0 active  │ │  2 today   │      │
│  │  online    │ │  online    │ │  all clear │ │  ↓ from 5  │      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘      │
│                                                                     │
│  ┌────────────────────────────────────┐ ┌──────────────────────┐   │
│  │  Access Events by Hour       📊   │ │  Camera Quick View   │   │
│  │                                    │ │  ┌────┐ ┌────┐      │   │
│  │  ▁▂▃▅▇████▇▅▃▂▁▁▁▁▂▃▅▇▇▅▃▂▁    │ │  │cam1│ │cam2│      │   │
│  │  06 07 08 09 10 11 12 13 14 15    │ │  ├────┤ ├────┤      │   │
│  │                                    │ │  │cam3│ │cam4│      │   │
│  └────────────────────────────────────┘ │  └────┘ └────┘      │   │
│                                          │  [Full Grid →]      │   │
│  ┌────────────────────────────────────┐ └──────────────────────┘   │
│  │  Recent Security Events                                  │      │
│  │  ──────────────────────────────────────────────────────── │      │
│  │  🔴 09:15  Forced door - Door 5, Bldg A F3              │      │
│  │  ⚠  09:12  Denied access - Unknown card at Gate 2        │      │
│  │  ✅  09:11  Alarm cleared - Zone A                        │      │
│  │  ⚠  09:08  Tailgate detected - Turnstile 3               │      │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

- Stat cards: all `--domain-secure` (#3B82F6) colored numbers
- Bar chart: hourly access event distribution
- Camera quick view: 2×2 thumbnail grid of priority cameras
- Recent security events: combined feed from all SECURE modules

#### MANAGE Dashboard (`/manage`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  👤 People Overview                       📅 Today ▾               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │ Employees  │ │ Checked In │ │ Visitors   │ │ Contractors│      │
│  │  1,247     │ │  892       │ │  15 today  │ │  34 active │      │
│  │  total     │ │  71.5%     │ │  3 waiting │ │  2 expiring│      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘      │
│                                                                     │
│  ┌─────────────────────────┐ ┌──────────────────────────────────┐  │
│  │  Attendance Today  📊  │ │  Visitor Queue                   │  │
│  │  ◉ On time    72%      │ │  1. John Smith → Host: Le VC     │  │
│  │  ◉ Late       15%      │ │     Waiting 3m  [Check In]       │  │
│  │  ◉ Absent     8%       │ │  2. Sarah Lee  → Host: Tran TB   │  │
│  │  ◉ On leave   5%       │ │     Waiting 1m  [Check In]       │  │
│  │  [Full Report →]       │ │  3. Pre-reg: 5 expected today    │  │
│  └─────────────────────────┘ │  [Manage Visitors →]             │  │
│                               └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

- Numbers in `--domain-manage` (#8B5CF6)
- Donut chart for attendance breakdown
- Live visitor queue with action buttons

#### OPERATE Dashboard (`/operate`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🏢 Facility Overview                     📅 Today ▾               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │ Rooms      │ │ Parking    │ │ Work Orders│ │ Energy     │      │
│  │  3/12      │ │  78%       │ │  7 open    │ │  142 kWh   │      │
│  │  in use    │ │  occupied  │ │  2 overdue │ │  today     │      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘      │
│                                                                     │
│  ┌─────────────────────────┐ ┌──────────────────────────────────┐  │
│  │  Room Schedule Today   │ │  Open Work Orders               │  │
│  │  Meeting A  ██░░░░░░   │ │  #1042 HVAC F5  🔴 Overdue     │  │
│  │  Meeting B  ░░██░░░░   │ │  #1041 Light F2 🟡 In Progress │  │
│  │  Training   ░░░░████   │ │  #1040 Lock D12 🟡 In Progress │  │
│  │  Board Rm   ████████   │ │  [View All →]                   │  │
│  └─────────────────────────┘ └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

- Numbers in `--domain-operate` (#F59E0B)
- Gantt-style room schedule
- Work order priority list

---

## 3. SECURE Modules

### 3.1 Access Control

#### 3.1.1 Doors List (`/secure/access-control`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Access Control                              [+ Add Door]  [⚙ Rules]  │
│  ─────────────────────────────────────────────────────────────────────  │
│  [All 52] [Online 48] [Offline 4] [Alarm 1]       🔍 Filter doors...  │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  NAME              LOCATION         TYPE      STATUS    LAST EVENT      │
│  ─────────────────────────────────────────────────────────────────────  │
│  Main Entrance     Bldg A, F1       Door      🟢 Online  09:15 Granted │
│  Gate 1            Bldg A, Ext      Barrier   🟢 Online  09:14 Granted │
│  Gate 2            Bldg A, Ext      Barrier   🟢 Online  09:12 Denied  │
│  Door 3            Bldg A, F2       Door      🟢 Online  09:11 Granted │
│  Door 5            Bldg A, F3       Door      🔴 ALARM   09:10 Forced  │
│  Lift 1            Bldg A           Lift      🟢 Online  09:09 Granted │
│  Turnstile 1       Bldg A, Lobby    Turnstile 🟢 Online  09:08 Granted │
│  Server Room       Bldg A, F4       Door      🟡 Warning 08:45 Granted │
│  ...                                                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│  Showing 1-25 of 52                              < 1 2 3 >    25 ▾    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Page header: title + action buttons (Add Door, Rules)
- Tab filters: status-based counts
- Search/filter bar: text search + dropdowns for building, floor, type
- Data table: sortable columns

**Table Columns:**
| Column | Width | Content |
|--------|-------|---------|
| Name | 200px | Door name, `--text-primary`, 500 |
| Location | 180px | Building + floor, `--text-secondary` |
| Type | 100px | Tag badge (Door/Gate/Barrier/Lift/Turnstile) |
| Status | 100px | Colored badge: 🟢 Online / 🔴 Alarm / 🟡 Warning / ⚫ Offline |
| Last Event | 180px | Time + result (Granted in green, Denied in red) |
| Actions | 80px | `⋮` overflow menu (Open, Lock, View, Edit) |

**Interactions:**
- Click row → navigate to door detail
- Right-click / `⋮` menu: Remote Open, Lock, Unlock, View Events, Edit
- Status filter tabs: instant filter
- Bulk select: checkbox column (hidden by default, appears with Shift+click)
- Alarm rows: `--error-muted` bg highlight, pulsing border (subtle)
- Real-time: status updates via WebSocket

#### 3.1.2 Door Detail (`/secure/access-control/:id`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Access Control  /  Main Entrance                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌────────────────────────────────┐  ┌────────────────────────────┐    │
│  │  DOOR STATUS           🟢     │  │  QUICK ACTIONS             │    │
│  │                               │  │                            │    │
│  │  State: Locked                │  │  [🔓 Remote Open]          │    │
│  │  Mode: Normal                 │  │  [🔒 Lock Down ]          │    │
│  │  Last: Granted, 09:15         │  │  [🔧 Maintenance]         │    │
│  │  Device: DM-CR-2000           │  │  [📹 View Camera]         │    │
│  │  Firmware: v2.4.1             │  │                            │    │
│  └────────────────────────────────┘  └────────────────────────────┘    │
│                                                                         │
│  [Events] [Access Rules] [Schedule] [Camera] [Settings]                │
│  ══════════════════════════════════════════════════════                 │
│                                                                         │
│  RECENT EVENTS                                            🔍 Filter   │
│  ─────────────────────────────────────────────────────────────────     │
│  TIME        PERSON           CREDENTIAL   RESULT     PHOTO           │
│  09:15:03   Nguyen Van A      Face         ✅ Granted  [📷]          │
│  09:14:22   Tran Thi B        Card #4401   ✅ Granted  [📷]          │
│  09:12:01   UNKNOWN           Card #9912   ❌ Denied   [📷]          │
│  09:10:45   Le Van C          Mobile BLE   ✅ Granted  [📷]          │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Breadcrumb navigation back to list
- Top: 2-column — status card (left) + quick actions card (right)
- Tabs: Events, Access Rules, Schedule, Camera, Settings
- Default tab: Events

**Status Card:**
- Door state icon (locked/unlocked indicator)
- Key-value pairs: state, mode, last event, device model, firmware, **sync status** (last sync time, user DB version, rules version)
- Status badge: large, prominent

**Quick Actions:**
- Buttons: `md` size, full-width within card
- Remote Open: primary button (requires confirmation dialog for high-security doors)
- Lock Down: danger button with confirmation
- Maintenance: secondary, puts door in maintenance mode
- View Camera: ghost, opens linked camera

**Events Tab:**
- Table: time (mono), user (avatar+name), credential type, result (colored), photo thumbnail
- Photo: click to expand in modal with video clip if available
- Filter: date range, result type, user search

**Access Rules Tab:**
- List of rules that apply to this door
- Each rule: name, schedule, groups assigned, enabled toggle
- Add rule button → opens rule builder modal

**Schedule Tab:**
- Weekly visual schedule (7-day × 24-hour grid)
- Color-coded: normal mode, locked mode, free access mode
- Drag to create/edit schedule blocks

**Camera Tab:**
- Linked camera live view (embedded player)
- Quick playback: jump to event time

**Settings Tab:**
- Door configuration: name, location, type
- Device settings: held-open timeout, re-lock delay, reader mode
- Emergency behavior: fire mode, lockdown mode

#### 3.1.3 Access Rules (`/secure/access-control/rules`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Access Rules                                        [+ Create Rule]   │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  RULE NAME             DOORS    GROUPS    SCHEDULE        ENABLED       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Office Hours          12       All Staff  Mon-Fri 7-19   ✅           │
│  Night Security        52       Guards     24/7            ✅           │
│  IT Server Room        2        IT Team    Mon-Fri 8-20   ✅           │
│  Visitor Lobby Only    3        Visitors   Mon-Fri 8-17   ✅           │
│  Executive Floor       4        Executives 24/7            ✅           │
│  Maintenance Windows   8        Vendors    Sat 6-14       ❌ (paused) │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rule Detail/Create Modal (lg, 800px):**
- Step 1: Rule name + description
- Step 2: Select doors (multi-select with search, grouped by building/floor)
- Step 3: Select groups/people (multi-select)
- Step 4: Schedule (weekly grid picker + date range for temporary rules)
- Step 5: Advanced (anti-passback, escort required, multi-auth)
- Footer: Cancel | Save Draft | Activate
- **On Activate:** Rules are synced to all affected devices via `cfg.access_rules`. Dashboard shows sync progress and per-device confirmation status.

#### 3.1.4 Real-time Events (`/secure/access-control/events`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Access Events                    🔴 Live       [⏸ Pause] [📥 Export] │
│  ─────────────────────────────────────────────────────────────────────  │
│  📅 Today ▾    🏢 All Buildings ▾    🚪 All Doors ▾    ✅❌ All ▾     │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  TIME       PERSON          DOOR            RESULT    CREDENTIAL       │
│  ─────────────────────────────────────────────────────────────────────  │
│ →09:15:03  Nguyen Van A    Main Entrance    ✅ Grant  Face             │
│  09:14:22  Tran Thi B      Gate 1           ✅ Grant  Card             │
│  09:12:01  UNKNOWN         Gate 2           ❌ Deny   Card #9912      │
│  09:11:45  Le Van C        Door 3           ✅ Grant  Mobile           │
│  09:10:30  Pham Thi D      Door 1           ✅ Grant  Face             │
│  09:09:12  Visitor #42     Gate 1           ✅ Grant  QR Code          │
│  ...                                                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│  Live: 847 events today   |   Granted: 812 (95.9%)   Denied: 35       │
└─────────────────────────────────────────────────────────────────────────┘
```

- Live mode: new events slide in at top with highlight animation (`--accent-900` bg fade)
- Pause button: stops auto-scroll, shows "X new events" badge to resume
- Denied events: `--error-muted` bg
- Click event row → slide-out detail panel (photo, video clip, user info)
- Bottom status bar: summary stats
- Export: CSV/PDF for filtered results

---

### 3.2 CCTV / Video

#### 3.2.1 Camera Grid (`/secure/cctv`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CCTV                [1×1] [2×2] [3×3] [4×4] [1+5]     🏢 All ▾     │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐ │
│  │                     │ │                     │ │                  │ │
│  │   Main Entrance     │ │   Gate 1            │ │   Lobby          │ │
│  │   ● REC  HD         │ │   ● REC  HD         │ │   ● REC  HD     │ │
│  │                     │ │                     │ │                  │ │
│  │                     │ │                     │ │                  │ │
│  └─────────────────────┘ └─────────────────────┘ └──────────────────┘ │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐ │
│  │                     │ │                     │ │                  │ │
│  │   Parking Entry     │ │   Floor 3 Corridor  │ │   Server Room    │ │
│  │   ● REC  HD         │ │   ● REC  HD         │ │   ⚫ OFFLINE     │ │
│  │                     │ │                     │ │                  │ │
│  │                     │ │                     │ │                  │ │
│  └─────────────────────┘ └─────────────────────┘ └──────────────────┘ │
│                                                                         │
│  ◀ Page 1 of 6 ▶                                        32 cameras    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Grid layout selector: 1×1, 2×2, 3×3, 4×4, 1+5 (asymmetric)
- Building/floor filter dropdown
- Camera tiles fill grid, maintain 16:9 aspect ratio

**Camera Tile:**
- Live video stream (RTSP via WebRTC/HLS)
- Overlay (bottom): camera name, recording indicator (red dot), resolution
- Offline cameras: dark overlay with "OFFLINE" badge, `--error`
- Hover: show PTZ controls (if supported), fullscreen button, snapshot button
- Double-click: open single camera view

**Interactions:**
- Drag cameras between grid positions
- Grid layout persists per-user
- Page through cameras (if more than grid fits)
- Right-click: Snapshot, Playback, View Events, Properties

#### 3.2.2 Single Camera (`/secure/cctv/:id`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← CCTV  /  Main Entrance Camera                                      │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │                                                                 │   │
│  │                     LIVE VIDEO FEED                             │   │
│  │                        16:9                                     │   │
│  │                                                                 │   │
│  │                                                                 │   │
│  │  ● LIVE   HD   🔇   ┌───┐                                     │   │
│  │                      │PTZ│ ← ↑ ↓ → + -                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [📷 Snapshot] [⏺ Record Clip] [🔍 Digital Zoom] [⛶ Fullscreen]     │
│                                                                         │
│  ┌────────────────────────────────┐ ┌──────────────────────────────┐   │
│  │  Camera Info                   │ │  Linked Events               │   │
│  │  Model: Hikvision DS-2CD2xx   │ │  09:15 Access granted Door 1 │   │
│  │  IP: 192.168.1.101            │ │  09:12 Motion detected        │   │
│  │  NVR: NVR-01, Ch 3            │ │  09:08 AI: User detected    │   │
│  │  Status: Recording ● 30fps    │ │  [View All →]                │   │
│  └────────────────────────────────┘ └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Video Player:**
- Large 16:9 player area (fluid width)
- Overlay controls: live indicator, resolution, audio toggle
- PTZ panel: directional pad + zoom in/out (only for PTZ cameras)
- Toolbar: snapshot, record clip, digital zoom, fullscreen

**Below player:**
- 2-column: Camera info (technical details) + Linked events (from access control, AI detection)
- Events: clickable, jump to playback at that timestamp

#### 3.2.3 Playback (`/secure/cctv/:id/playback`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Playback  —  Main Entrance Camera            📅 2026-02-19           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │                     PLAYBACK VIDEO                              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ▶  09:15:03        ×1 ×2 ×4 ×8 ×16      🔇  📷  📥  ⛶             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 00  02  04  06  08  10  12  14  16  18  20  22  24             │   │
│  │ ░░░░░░░░░░░░████████████████████████████████░░░░░░░░           │   │
│  │                    ▲ cursor                                     │   │
│  │ ■ Recording  ▲ Event markers (red=alarm, blue=access)          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  EVENTS ON TIMELINE                                                    │
│  ● 09:15  Access Granted — Nguyen Van A                                │
│  ● 09:12  Motion Detected                                             │
│  ● 09:08  AI: User detected                                         │
│  ● 08:45  Access Denied — Unknown card                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Timeline:**
- 24-hour timeline bar, draggable cursor
- Color-coded: green=recording available, empty=no recording
- Event markers: colored ticks on timeline (red=alarm, blue=access, cyan=AI)
- Zoomable: scroll to zoom timeline (1hr → 30m → 15m → 5m → 1m views)

**Player Controls:**
- Play/pause, speed (×1, ×2, ×4, ×8, ×16), frame step (← →)
- Audio toggle, snapshot, download clip, fullscreen
- Date picker to jump to any date

**Events List:**
- Click event → timeline jumps to that moment
- Each event shows type icon + time + description

#### 3.2.4 NVR Management (`/secure/cctv/nvr`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NVR Management                                         [+ Add NVR]   │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌───────────────────────────┐ ┌───────────────────────────┐           │
│  │  NVR-01               🟢 │ │  NVR-02               🟡 │           │
│  │  Hikvision DS-7732       │ │  Dahua DHI-NVR5432        │           │
│  │  IP: 192.168.1.10        │ │  IP: 192.168.1.11         │           │
│  │  Cameras: 16/32 ch       │ │  Cameras: 15/32 ch        │           │
│  │  Storage: ████░░ 62%     │ │  Storage: ████████░ 90%   │           │
│  │  Recording: 30 days      │ │  Recording: 12 days ⚠     │           │
│  │  [Manage]                │ │  [Manage]                  │           │
│  └───────────────────────────┘ └───────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

- Card grid of NVRs with health indicators
- Storage bar: colored by threshold (green <70%, amber 70-90%, red >90%)
- Click "Manage" → NVR detail with channel list, storage config, recording schedule

---

### 3.3 Intrusion Detection

#### Zones & Alerts (`/secure/intrusion`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Intrusion Detection                          [🔴 0 Active Alarms]    │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Zones] [Alerts] [Alarm History]                                      │
│  ═════════════════════════════════                                      │
│                                                                         │
│  ZONE NAME          SENSORS   STATE      ARMED     LAST ALARM          │
│  ─────────────────────────────────────────────────────────────────────  │
│  Zone A - Perimeter  12       🟢 Normal   Armed     2026-02-18 23:12  │
│  Zone B - Lobby       8       🟢 Normal   Armed     Never              │
│  Zone C - Server Rm   4       🟢 Normal   Armed     2026-02-15 02:30  │
│  Zone D - Parking     6       🟡 Bypass   Partial   2026-02-19 01:15  │
│  Zone E - Rooftop     3       ⚫ Disarmed Disarmed  2026-02-10 14:22  │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  Quick Actions:  [Arm All]  [Disarm All]  [Emergency Arm]              │
└─────────────────────────────────────────────────────────────────────────┘
```

**Zone Detail (slide-out panel, 480px from right):**
- Zone map visual (floor plan with sensor positions)
- Sensor list: name, type (motion/door contact/glass break), status, battery
- Arm/disarm controls with schedule
- History of alarms for this zone

**Alerts Tab:**
- Real-time alert feed (same pattern as access events)
- Each alert: zone, sensor, time, status (active/acknowledged/cleared)
- Actions: Acknowledge, Clear, View Camera, Create Incident

**Alarm Management:**
- Active alarm: full-screen take-over banner (red bg) with alarm details
- Acknowledge: requires reason input
- Escalation timeline: auto-escalation steps shown

---

### 3.4 Intercom

#### Call Log (`/secure/intercom`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Intercom                                           [⚙ Stations]      │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Call Log] [Stations] [Settings]                                      │
│  ═════════════════════════════════                                      │
│                                                                         │
│  TIME       FROM             TO              DURATION  RESULT  ACTION  │
│  ─────────────────────────────────────────────────────────────────────  │
│  09:15     Door Station 1   Guard Station    0:42     Answered  📹    │
│  09:08     Door Station 3   Apt 1201         0:18     Answered  📹    │
│  08:55     Door Station 1   Apt 0503         —        Missed    📹    │
│  08:30     Door Station 2   Guard Station    0:12     Answered  📹    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Live Call Interface

When an incoming call arrives, a modal overlay appears:

```
┌──────────────────────────────────────────────┐
│            INCOMING CALL                      │
│                                               │
│  ┌─────────────────────────────────────┐     │
│  │                                     │     │
│  │       VIDEO FROM DOOR STATION       │     │
│  │                                     │     │
│  └─────────────────────────────────────┘     │
│                                               │
│  Door Station 1 — Main Entrance               │
│  Caller: Unknown Visitor                      │
│                                               │
│     [🔴 Decline]  [🟢 Answer]  [🔓 Open]    │
│                                               │
└──────────────────────────────────────────────┘
```

- Video preview from door station camera
- Three actions: Decline (red), Answer (green, starts 2-way audio), Open Door (blue, unlocks + answers)
- During call: show call timer, mute button, open door button, end call button
- Minimizable: shrink to floating pip in bottom-right corner

---

### 3.5 AI Detection

#### Event Feed (`/secure/ai-detection`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Detection                         🤖 Engine: Online    [⚙ Config] │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Events] [Analytics] [Configuration]                                   │
│  ═══════════════════════════════════                                    │
│  🔍 Filter  📅 Today ▾  🏷 All Types ▾  📹 All Cameras ▾             │
│                                                                         │
│  ┌──────────┐  09:15:03  LOITERING DETECTED                    🟡    │
│  │ snapshot │  Camera: Lobby Cam 2                                     │
│  │          │  Duration: 5m 12s  •  Confidence: 87%                    │
│  └──────────┘  [View Camera] [Dismiss] [Create Alert]                  │
│                                                                         │
│  ┌──────────┐  09:12:45  PERSON DETECTED — Restricted Area     🔴    │
│  │ snapshot │  Camera: Server Room Cam                                 │
│  │          │  Confidence: 94%  •  No matching identity                 │
│  └──────────┘  [View Camera] [View Clip] [Escalate]                    │
│                                                                         │
│  ┌──────────┐  09:08:12  CROWD DETECTED                        🔵    │
│  │ snapshot │  Camera: Lobby Cam 1                                     │
│  │          │  Count: 23 people  •  Threshold: 20                      │
│  └──────────┘  [View Camera] [Dismiss]                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Event Item:**
- Thumbnail (120×80px) from AI snapshot
- Event type (bold), camera name, metrics (confidence, duration, count)
- Priority indicator: 🔴 critical / 🟡 warning / 🔵 info
- Action buttons: contextual per event type

**Analytics Tab:**
- Charts: events by type (bar), events by camera (bar), events over time (line)
- Heatmap: detection frequency by hour/day
- Top triggered rules table

**Configuration Tab:**
- AI detection rules list with enable/disable toggles
- Rule editor: event type, cameras to monitor, sensitivity, schedule, actions
- Zone drawing tool: draw detection zones on camera view

---

### 3.6 Emergency Management

#### Lockdown Controls (`/secure/emergency`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠ Emergency Management                     Status: 🟢 NORMAL        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    EMERGENCY ACTIONS                              │  │
│  │                                                                  │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │  │
│  │  │  🔒           │ │  🔥           │ │  🏥           │            │  │
│  │  │  LOCKDOWN     │ │  FIRE EVAC   │ │  MEDICAL     │            │  │
│  │  │  Lock all     │ │  Unlock all  │ │  Unlock path │            │  │
│  │  │  perimeter    │ │  exits       │ │  to medical  │            │  │
│  │  │  [ACTIVATE]   │ │  [ACTIVATE]  │ │  [ACTIVATE]  │            │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘            │  │
│  │                                                                  │  │
│  │  ┌──────────────┐ ┌──────────────┐                              │  │
│  │  │  🚨           │ │  ⚙           │                              │  │
│  │  │  INTRUDER     │ │  CUSTOM      │                              │  │
│  │  │  Silent alarm │ │  Scenario    │                              │  │
│  │  │  + zone lock  │ │  Builder     │                              │  │
│  │  │  [ACTIVATE]   │ │  [MANAGE]    │                              │  │
│  │  └──────────────┘ └──────────────┘                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  RECENT EMERGENCY LOG                                                   │
│  ─────────────────────────────────────────────────────────────────────  │
│  2026-02-15 14:30  Fire Drill — Duration: 8m 23s — All Clear          │
│  2026-01-28 09:15  Lockdown Test — Duration: 2m 10s — All Clear       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Emergency Action Cards:**
- Large cards (min 200px wide) with clear icon, name, description
- ACTIVATE button: `--error` bg (danger variant), requires confirmation dialog
- Confirmation: type "CONFIRM" to activate (prevents accidental trigger)

**Active Emergency State:**
When emergency is active, the entire UI changes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔴🔴🔴  LOCKDOWN ACTIVE  —  Activated 09:15 by Cuong N.  🔴🔴🔴   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Duration: 00:05:23                                                     │
│  Doors Locked: 48/52  (4 in fire-release mode)                         │
│  Notifications Sent: 1,247 push + 52 SMS                               │
│  Security Team: 5/6 acknowledged                                       │
│                                                                         │
│  ┌────────────────────────────────────────────────┐                    │
│  │  CAMERA VIEW — Priority cameras auto-displayed │                    │
│  └────────────────────────────────────────────────┘                    │
│                                                                         │
│  [🟢 ALL CLEAR — Deactivate Emergency]                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- Red banner persists across all pages during emergency
- Emergency page shows real-time status: doors, notifications, team response
- All Clear button: requires confirmation + reason

---

## 4. MANAGE Modules

### 4.1 Identity Management

#### People Directory (`/manage/identities`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  People                                    [+ Add User]  [📥 Import] │
│  ─────────────────────────────────────────────────────────────────────  │
│  [All 1,247] [Employees 1,180] [Visitors 42] [Contractors 25]         │
│  🔍 Search people...    🏢 Dept ▾    🏷 Role ▾    📊 Status ▾        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│       NAME              DEPT         ROLE          CREDENTIALS  STATUS  │
│  ─────────────────────────────────────────────────────────────────────  │
│  ☺  Nguyen Van A       IT           Developer     🪪📱🖐      Active  │
│  ☺  Tran Thi B         HR           Manager       🪪📱        Active  │
│  ☺  Le Van C           Security     Guard         🪪🖐        Active  │
│  ☺  Pham Thi D         Marketing    Staff         🪪           Active  │
│  ☺  Hoang Van E        IT           Admin         🪪📱🖐      On Leave│
│  ...                                                                    │
│  ─────────────────────────────────────────────────────────────────────  │
│  Showing 1-25 of 1,247                           < 1 2 ... 50 >       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Credential Icons:** 🪪 Card, 📱 Mobile, 🖐 Biometric, 🔑 PIN

#### User Detail (`/manage/identities/:id`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← People  /  Nguyen Van A                          [Edit] [⋮ More]  │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────┐  Nguyen Van A                                                │
│  │      │  IT Department  •  Developer                                 │
│  │  ☺   │  cuong@company.vn  •  +84 xxx xxx                           │
│  │      │  Status: 🟢 Active    Since: 2024-03-15                     │
│  └──────┘                                                              │
│                                                                         │
│  [Credentials] [Access] [Events] [Attendance] [Documents]              │
│  ════════════════════════════════════════════════════════               │
│                                                                         │
│  CREDENTIALS                                          [+ Add]          │
│  ─────────────────────────────────────────────────────────────────     │
│  🪪  Card #4401         Active    Issued 2024-03-15    [Revoke]       │
│  📱  Mobile BLE         Active    Enrolled 2024-04-01  [Revoke]       │
│  🖐  Face               Active    Enrolled 2024-03-16  [Re-enroll]    │
│  🖐  Fingerprint (R)    Active    Enrolled 2024-03-16  [Re-enroll]    │
│                                                                         │
│  ACCESS GROUPS                                        [+ Assign]       │
│  ─────────────────────────────────────────────────────────────────     │
│  Office Hours (12 doors)  •  IT Server Room (2 doors)                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tabs:**
- **Credentials:** list + add/revoke actions
- **Access:** access groups assigned, effective door list
- **Events:** recent access events for this user (reuses event table)
- **Attendance:** recent attendance records
- **Documents:** uploaded compliance docs (photo ID, contracts)

---

### 4.2 Visitor Management

#### Pre-registration (`/manage/visitors/pre-register`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Visitor Pre-registration                              [+ Invite]      │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Expected Today 5] [Upcoming 12] [All Pre-registrations]              │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  VISITOR           HOST           DATE        TIME      STATUS         │
│  ─────────────────────────────────────────────────────────────────────  │
│  John Smith        Le Van C       Today       10:00     ⏳ Expected    │
│  Sarah Lee         Tran Thi B     Today       14:00     ⏳ Expected    │
│  Mike Chen         Nguyen VA      Today       09:30     ✅ Checked In  │
│  Lisa Wang         Pham TD        Tomorrow    11:00     📩 Invited    │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Invite Modal (md, 640px):**
- Visitor info: name, email, phone, company, purpose
- Visit details: date, time, host (searchable employee dropdown), duration
- Access: areas to grant (checkboxes), parking needed
- Notification: send email/SMS with QR code
- Preview of invitation email/SMS

#### Check-in Queue (`/manage/visitors/check-in`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Visitor Check-in                                   [📋 Walk-in]      │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  WAITING (3)                                                            │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  ☺ John Smith          → Host: Le Van C        Waiting 5m       │ │
│  │  Purpose: Business meeting    Company: ABC Corp                  │ │
│  │  [✅ Check In]  [📞 Notify Host]  [❌ Decline]                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  ☺ Sarah Lee           → Host: Tran Thi B      Waiting 2m       │ │
│  │  Purpose: Interview           Company: —                         │ │
│  │  [✅ Check In]  [📞 Notify Host]  [❌ Decline]                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  CHECKED IN TODAY (8)                                                   │
│  ─────────────────────────────────────────────────────────────────     │
│  ☺ Mike Chen       Host: Nguyen VA    In: 09:30   [🚪 Check Out]    │
│  ☺ Anna Park       Host: Le VC        In: 09:15   [🚪 Check Out]    │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Waiting visitors: card-style for prominence with action buttons
- Checked-in: compact table with checkout action
- Walk-in button: opens registration form for unregistered visitors
- Badge printing trigger on check-in

#### Visitor Log (`/manage/visitors/log`)

Standard table: visitor name, host, purpose, company, check-in time, check-out time, duration, badge #. Filterable by date range, host, purpose. Exportable.

---

### 4.3 Contractor Management

#### Companies & Workers (`/manage/contractors`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Contractors                                    [+ Add Company]        │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Companies 8] [Workers 34] [Expiring Soon 3]                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  COMPANY           WORKERS  VALID UNTIL    COMPLIANCE    STATUS        │
│  ─────────────────────────────────────────────────────────────────────  │
│  ABC Construction    12     2026-06-30     ████░  80%    🟢 Active    │
│  XYZ Cleaning         8     2026-03-15     ██████ 100%   🟡 Expiring  │
│  DEF Electrical       6     2026-12-31     ████░  75%    🟢 Active    │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Compliance bar:** visual progress showing % of workers with valid certifications
- Click company → list of workers with individual compliance status
- Worker detail: name, role, certifications (with expiry), safety training records, access credentials
- Expiring tab: workers/companies requiring attention

---

### 4.4 Time & Attendance

#### Clock-in Log (`/manage/attendance`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Time & Attendance                📅 2026-02-19    [📊 Reports]       │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Clock-in Log] [Shifts] [Reports]                                     │
│  ═══════════════════════════════                                       │
│  Summary: ✅ 892 On Time  ⚠ 158 Late  ❌ 97 Absent  🏖 100 Leave    │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  NAME             DEPT      SHIFT     CLOCK IN   CLOCK OUT  HOURS     │
│  ─────────────────────────────────────────────────────────────────────  │
│  Nguyen Van A     IT        Day       08:02      —          —         │
│  Tran Thi B       HR        Day       07:58      —          —         │
│  Le Van C         Security  Night     22:01      06:03      8.03      │
│  Pham Thi D       Marketing Day       08:15 ⚠   —          —         │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Late arrivals: ⚠ amber indicator next to clock-in time
- Summary bar: color-coded counters at top
- Filter by department, shift, status

**Shift Management Tab:**
- Calendar-style grid: rows=employees, columns=dates, cells=shift assignment
- Drag to assign shifts, color-coded by shift type
- Rotation templates: apply repeating patterns

**Reports Tab:**
- Pre-built: Monthly attendance, overtime, absenteeism, department summary
- Date range picker, department filter
- Export: CSV, PDF
- Charts: attendance trend (line), department comparison (bar), late distribution (histogram)

---

### 4.5 Delivery Management

#### Delivery Log (`/manage/deliveries`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Deliveries                                      [+ Log Delivery]      │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Pending 3] [Collected 42] [All]                📅 Today ▾           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  TIME     RECIPIENT      UNIT      COURIER    STATUS      PHOTO       │
│  ─────────────────────────────────────────────────────────────────────  │
│  09:30   Nguyen Van A    IT-F3     GrabExp    ⏳ Pending   [📷]       │
│  09:15   Tran Thi B      HR-F2     Shopee     ⏳ Pending   [📷]       │
│  09:00   Le Van C        Sec-F1    VNPost     ✅ Collected [📷]       │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Log delivery: photo capture + recipient search + courier info
- Notification: auto-push to recipient on logging
- Uncollected alert: highlight packages pending >4 hours
- Collection: recipient confirms pickup (or receptionist marks collected)

---

### 4.6 Access Provisioning

#### Access Groups (`/manage/provisioning`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Access Provisioning                           [+ Create Group]        │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Groups] [Pending Requests 4] [Bulk Operations]                       │
│  ═══════════════════════════════════════════                           │
│                                                                         │
│  GROUP NAME         MEMBERS   DOORS   SCHEDULE         MODIFIED        │
│  ─────────────────────────────────────────────────────────────────────  │
│  All Staff           1,180     12     Mon-Fri 7-19     2026-02-01     │
│  IT Team               45      14     Mon-Fri 7-22     2026-02-10     │
│  Security Guards        24      52     24/7             2026-01-15     │
│  Executives             12      18     24/7             2026-02-05     │
│  Visitors (default)      —       3     Mon-Fri 8-17     2026-01-20     │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pending Requests Tab:**
- Request cards: who requested, what access, why, requested date
- Actions: Approve / Deny with reason input
- Approval chain: show who needs to approve (manager → security admin)

**Bulk Operations Tab:**
- Import CSV: bulk add people to groups
- Department → Group mapping wizard
- Revoke all: by group, department, or date range
- Audit: show all changes with undo capability

---

## 5. OPERATE Modules

### 5.1 Room Booking

#### Calendar View (`/operate/rooms`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Room Booking              [◀ Today ▶]  [Day] [Week] [Month]  [+ Book]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  WED FEB 19         08    09    10    11    12    13    14    15    16  │
│  ─────────────────────────────────────────────────────────────────────  │
│  Meeting A (8p)     ░░░░ ████████████ ░░░░░░░░ ████████ ░░░░░░░░░░   │
│                          Team Standup        Design Review             │
│  Meeting B (12p)    ░░░░░░░░ ██████████████████ ░░░░░░░░ ████████     │
│                             All Hands Meeting         1:1 Cuong        │
│  Training Rm (30p)  ░░░░░░░░░░░░░░░░░░░░░░ ████████████████████████   │
│                                              Safety Training           │
│  Board Room (20p)   ████████████████████████████████████ ░░░░░░░░░░   │
│                     Board Meeting (Full Day)                           │
│  Phone Booth 1 (1p) ░░░░ ████ ░░░░ ████ ░░░░ ████ ░░░░░░░░░░░░░░   │
│  Phone Booth 2 (1p) ░░░░░░░░ ████ ░░░░░░░░░░░░ ████ ░░░░░░░░░░░░   │
│                                                                         │
│  ░ Available  █ Booked  (capacity in parentheses)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout:**
- Timeline: horizontal, scrollable, 1-hour columns
- Rows: one per room, sorted by capacity or floor
- Bookings: colored blocks with title, domain-colored by organizer's department
- Click empty slot → quick book modal
- Click booking → view/edit detail

**Room Detail (slide-out panel):**
- Room photo, capacity, amenities (projector, whiteboard, video conf), floor plan location
- Today's schedule
- Book button

**Book Modal:**
- Room selector (if not pre-selected)
- Date/time picker (start + end)
- Title, attendees (multi-select people), description
- Recurring: daily, weekly, custom
- Calendar integration: sync to Outlook/Google

---

### 5.2 Parking

#### Occupancy Map (`/operate/parking`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Parking                   Occupancy: ████████░░ 78% (312/400)  🔴 3  │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Map] [Vehicle Log] [Passes]                                          │
│  ═══════════════════════════                                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  BASEMENT 1                                        Legend:      │   │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐       🟢 Free     │   │
│  │  │🟢│ │🔴│ │🔴│ │🟢│ │🔴│ │🔴│ │🟢│ │🔴│       🔴 Occupied  │   │
│  │  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘       🔵 Reserved  │   │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐       ⚡ EV       │   │
│  │  │🔴│ │🔴│ │🔵│ │🔵│ │🔴│ │🟢│ │⚡│ │⚡│                    │   │
│  │  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                    │   │
│  │                                                                │   │
│  │  B1: 45/60 occupied  •  B2: 180/220 occupied  •  Surface: 87/120│  │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────────────┐  ┌────────────────────────────────────┐    │
│  │  Recent Entry/Exit    │  │  Quick Stats                      │    │
│  │  09:15 ↑ 51A-12345   │  │  Avg stay: 8.2h  •  Peak: 09:00  │    │
│  │  09:12 ↑ 30H-67890   │  │  Monthly: 8,420 entries           │    │
│  │  09:08 ↓ 29B-11223   │  │  Revenue: 12.5M VND              │    │
│  └───────────────────────┘  └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Vehicle Log Tab:** Table of entry/exit events with plate number (from LPR), time, duration, photo thumbnail, pass type.

**Passes Tab:** Monthly/annual passes management, create/edit/revoke, vehicle details, payment status.

---

### 5.3 Maintenance

#### Work Orders List (`/operate/maintenance`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Maintenance                                     [+ Create Order]      │
│  ─────────────────────────────────────────────────────────────────────  │
│  [All 45] [Open 7] [In Progress 5] [Overdue 2] [Completed 31]         │
│  🔍 Search...   🏷 Category ▾   🏢 Location ▾   👤 Assigned ▾        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  #     TITLE                 LOCATION    ASSIGNED    PRIORITY  STATUS  │
│  ─────────────────────────────────────────────────────────────────────  │
│  1042  HVAC not cooling F5   Bldg A F5   Tran VB    🔴 High   Overdue│
│  1041  Flickering lights F2  Bldg A F2   Le HC      🟡 Medium InProg │
│  1040  Door lock stuck D12   Bldg A F3   Nguyen KL  🟡 Medium InProg │
│  1039  Leaking tap restroom  Bldg A F1   —          🔵 Low    Open   │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Create/Edit Modal (lg, 800px):**
- Title, description (rich text)
- Category: HVAC, Electrical, Plumbing, Security devices, General
- Location: building → floor → zone picker
- Priority: Low / Medium / High / Critical
- Assign to: technician dropdown
- Due date, estimated hours
- Attachments: photos, documents
- Related asset: link to asset registry item

**Work Order Detail:** Full-page view with status timeline, comments/updates thread, photos, time logging, completion signature.

**Asset Registry Tab:** Searchable list of all managed assets (HVAC units, generators, elevators, etc.) with model, serial, location, maintenance history, next scheduled maintenance.

---

### 5.4 Guard Tour

#### Route Planner (`/operate/guard-tour/routes`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Guard Tour                                      [+ Create Route]      │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Routes] [Live Tracking] [Reports]                                    │
│  ═════════════════════════════════                                      │
│                                                                         │
│  ROUTE NAME       CHECKPOINTS  SCHEDULE        EST. TIME  STATUS       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Perimeter Patrol    12         Every 2h        45 min    🟢 Active   │
│  Floor 1-3 Check      8         Every 4h        30 min    🟢 Active   │
│  Night Security       15         22:00-06:00     60 min    🟢 Active   │
│  Parking Rounds        6         Every 3h        20 min    ⚫ Disabled │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Route Editor (full page):**
- Left: floor plan / map with draggable checkpoint markers
- Right: ordered checkpoint list with expected time at each
- Set checkpoint type: NFC tag, QR code, GPS zone
- Set required actions at checkpoint: scan, take photo, answer checklist

#### Live Tracking

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Live Tracking                                   🟢 2 Guards on Patrol │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────────────────────────────────────┐ ┌────────────────────┐   │
│  │                                          │ │  ACTIVE PATROLS    │   │
│  │         FLOOR PLAN / MAP                 │ │                    │   │
│  │                                          │ │  Le Van C          │   │
│  │    ☺──●──●──●──○──○──○                  │ │  Perimeter Patrol  │   │
│  │         route path shown                 │ │  ✅ 5/12 points   │   │
│  │         ● = visited, ○ = remaining       │ │  ⏱ On schedule     │   │
│  │                                          │ │                    │   │
│  │                                          │ │  Nguyen KL         │   │
│  │                                          │ │  Floor 1-3 Check   │   │
│  │                                          │ │  ✅ 3/8 points    │   │
│  │                                          │ │  ⚠ 3m behind      │   │
│  └──────────────────────────────────────────┘ └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Compliance Reports:** Table of completed tours with completion rate, missed checkpoints, incidents reported. Charts: compliance trend over time, guard performance comparison.

---

### 5.5 Key Management

#### Key Cabinet (`/operate/keys`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Key Management                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Cabinet] [Checkout Log]                                              │
│  ═══════════════════════                                               │
│                                                                         │
│  🔍 Search keys...     Status: [All] [Available] [Checked Out] [Overdue]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  KEY           LOCATION        STATUS          HOLDER      DUE BACK   │
│  ─────────────────────────────────────────────────────────────────────  │
│  Master-F1    Floor 1         🟢 Available     —            —          │
│  Master-F2    Floor 2         🔴 Checked Out   Le Van C     17:00     │
│  Master-F3    Floor 3         🟢 Available     —            —          │
│  Server-Rm    Server Room     🔴 Checked Out   Nguyen VA    18:00     │
│  Electrical   Basement        🟡 Overdue       Tran TB      14:00 ⚠  │
│  Roof Access  Rooftop         🟢 Available     —            —          │
│                                                                         │
│  Quick Actions: [Checkout Key] [Return Key]                            │
└─────────────────────────────────────────────────────────────────────────┘
```

- Checkout: select key → scan badge or select user → set due time → confirm
- Return: scan key tag or select from checked-out list → confirm
- Overdue: `--warning` highlight, automatic notification to holder + security
- Log: full audit trail of all key movements

---

### 5.6 IoT & Energy

#### Sensor Dashboard (`/operate/iot`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  IoT & Energy                                     🏢 Landmark 81 ▾    │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Sensors] [Alerts] [Energy]                                           │
│  ═══════════════════════════                                           │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │🌡 Temp   │ │💧Humidity│ │🌬 AQI    │ │💡 Lights │ │⚡ Power  │   │
│  │  24.5°C  │ │  62%     │ │  45 Good │ │  78% On  │ │  142 kWh │   │
│  │  ▁▂▃▃▂▁  │ │  ▂▃▃▃▂▂  │ │  ▁▁▂▂▁▁  │ │  ▁▂▅▇▇▅  │ │  ▁▂▃▅▇▅  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  SENSOR MAP — Floor 3                              🏢 Floor ▾  │  │
│  │  ┌───────────────────────────────────────────────────────┐      │  │
│  │  │                                                       │      │  │
│  │  │    🌡24°  💧60%         🌡25°  💧65%                 │      │  │
│  │  │                                                       │      │  │
│  │  │              🌬42        💡ON    ⚡2.1kW              │      │  │
│  │  │                                                       │      │  │
│  │  │    🌡23°  💧58%         🌡26° ⚠ 💧70% ⚠            │      │  │
│  │  │                                                       │      │  │
│  │  └───────────────────────────────────────────────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Stat Cards:** Real-time values with sparkline trends, domain color (`--domain-operate`).

**Sensor Map:** Floor plan overlay with sensor positions, showing live values. Warning indicators when thresholds exceeded. Click sensor → detail panel with history chart.

**Alerts Tab:** Active sensor alerts (threshold breaches), acknowledge/resolve actions.

**Energy Tab:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Energy Management                    📅 This Month ▾   [📥 Export]   │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │ Total    │ │ Cost     │ │ vs Last  │ │ Green    │                  │
│  │ 4,280kWh │ │ 8.5M VND │ │ -5.2% ↓ │ │ Score 72 │                  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                 │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  CONSUMPTION BY ZONE (Area Chart)                                │  │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          │  │
│  │  ████████████████████████████████████████████████████            │  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             │  │
│  │  — HVAC  — Lighting  — Equipment                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  COST ALLOCATION BY TENANT/DEPT                                        │
│  ─────────────────────────────────────────────────────────────────     │
│  IT Dept       ████████████░░  1,200 kWh  •  2.4M VND                │
│  Marketing     ████████░░░░░░    890 kWh  •  1.8M VND                │
│  Operations    ██████░░░░░░░░    720 kWh  •  1.4M VND                │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. SMART Layer

### 6.1 AI Assistant Panel

**Purpose:** Natural language interface for querying and commanding the entire system.

The AI Assistant is accessible as a **slide-out panel** from the right side, always available via the sidebar shortcut or `⌘J`.

```
┌──────────────────────────────────┬───────────────────────────────────┐
│                                  │  🧠 AI Assistant            ─ ×  │
│                                  │  ─────────────────────────────── │
│       CURRENT PAGE               │                                   │
│       (whatever user             │  Welcome, Cuong! How can I help? │
│        is viewing)               │                                   │
│                                  │  ┌─────────────────────────────┐ │
│                                  │  │ 💬 Who entered Building A   │ │
│                                  │  │    today?                   │ │
│                                  │  └─────────────────────────────┘ │
│                                  │                                   │
│                                  │  🤖 Today, 892 people have       │
│                                  │  entered Building A. Here's      │
│                                  │  the breakdown:                   │
│                                  │                                   │
│                                  │  • Employees: 845                │
│                                  │  • Visitors: 32                  │
│                                  │  • Contractors: 15               │
│                                  │                                   │
│                                  │  Peak entry was at 08:30-09:00   │
│                                  │  with 156 entries.               │
│                                  │                                   │
│                                  │  [View Access Report →]          │
│                                  │                                   │
│                                  │  ┌─────────────────────────────┐ │
│                                  │  │ 💬 Open Gate 2              │ │
│                                  │  └─────────────────────────────┘ │
│                                  │                                   │
│                                  │  🤖 ⚠ Are you sure you want to  │
│                                  │  open Gate 2 (Main Parking       │
│                                  │  Entry)? This is a secured       │
│                                  │  barrier.                        │
│                                  │                                   │
│                                  │  [✅ Confirm Open] [Cancel]      │
│                                  │                                   │
│                                  │  ─────────────────────────────── │
│                                  │  💬 Ask Duall anything...    🎤  │
└──────────────────────────────────┴───────────────────────────────────┘
```

**Layout:**
- Right panel: 400px wide, full-height, slides in from right (`--duration-slow`)
- Header: brain icon + "AI Assistant" + minimize (`─`) + close (`×`) buttons
- Chat area: scrollable message thread
- Input area: text input with send button + microphone (voice) button
- Minimized state: small floating button bottom-right

**Message Types:**
- **User query:** right-aligned bubble, `--surface-2` bg
- **AI response:** left-aligned, no bubble bg (clean), `--text-primary`
- **Data response:** embedded mini-tables, charts, or card summaries
- **Action confirmation:** inline confirm/cancel buttons for commands
- **Links:** clickable links to navigate to relevant pages
- **Error:** "I don't have permission to do that" / "I couldn't find..."

**Context-Aware:**
- AI knows what page user is viewing
- Suggests relevant queries based on context (e.g., on CCTV page: "Show offline cameras")
- Quick suggestion chips at bottom of empty chat

**Command Execution:**
- Queries (read): instant response
- Commands (write): requires confirmation dialog
- Destructive commands (lock/unlock/emergency): double confirmation
- Permission-aware: respects user's role, shows friendly error if unauthorized

---

### 6.2 Analytics Hub

#### Pre-built Reports (`/smart/analytics`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Analytics                                     [+ Custom Report]       │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Pre-built] [Custom] [Scheduled]                                      │
│  ═══════════════════════════════                                       │
│                                                                         │
│  🔒 SECURITY REPORTS                                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │ Access      │ │ Alarm       │ │ CCTV        │ │ Incident    │     │
│  │ Summary     │ │ Analysis    │ │ Health      │ │ Trends      │     │
│  │ Daily/Weekly│ │ By zone     │ │ Uptime rpt  │ │ Monthly     │     │
│  │ [View]      │ │ [View]      │ │ [View]      │ │ [View]      │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                         │
│  👤 PEOPLE REPORTS                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │ Attendance  │ │ Visitor     │ │ Contractor  │ │ Access      │     │
│  │ Monthly     │ │ Analytics   │ │ Compliance  │ │ Audit       │     │
│  │ [View]      │ │ [View]      │ │ [View]      │ │ [View]      │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                         │
│  🏢 FACILITY REPORTS                                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │ Room        │ │ Parking     │ │ Energy      │ │ Maintenance │     │
│  │ Utilization │ │ Statistics  │ │ Consumption │ │ Summary     │     │
│  │ [View]      │ │ [View]      │ │ [View]      │ │ [View]      │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Report View (any report):**
- Header: report title + date range picker + filters
- Charts area: relevant visualizations (line, bar, donut per report type)
- Data table below charts (sortable, filterable)
- Export: PDF, CSV, Excel
- Schedule: set recurring email delivery (daily/weekly/monthly)

#### Custom Report Builder

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Custom Report Builder                       [💾 Save] [▶ Run]        │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Data Source: [Access Events ▾]    Date: [Last 30 days ▾]      │   │
│  │                                                                 │   │
│  │  Dimensions:  [+ Add]  📊 Door  📊 User Type  📊 Hour       │   │
│  │  Measures:    [+ Add]  #️⃣ Count  #️⃣ Unique People              │   │
│  │  Filters:     [+ Add]  Result = Granted                        │   │
│  │                                                                 │   │
│  │  Group by:    [Door ▾]     Sort: [Count DESC ▾]                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PREVIEW                                           [📊][📋]   │   │
│  │                                                                 │   │
│  │  Door            Granted Count    Unique People                 │   │
│  │  Main Entrance       2,450           845                        │   │
│  │  Gate 1              1,890           612                        │   │
│  │  Door 3              1,230           423                        │   │
│  │  ...                                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

- Drag-drop dimension/measure builder
- Chart type selector: table, bar, line, pie, heatmap
- Save as: name the report, add to "Custom" tab
- Schedule: set up auto-email delivery

---

### 6.3 Automation Rules

#### Rule Builder (`/smart/automation`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Automation Rules                              [+ Create Rule]         │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Active Rules 12] [Drafts 3] [Execution Log]                         │
│  ═════════════════════════════════════════════                         │
│                                                                         │
│  RULE NAME              TRIGGER          ACTION            STATUS     │
│  ─────────────────────────────────────────────────────────────────────  │
│  Fire Evacuation        Fire alarm       Unlock + Alert    🟢 Active  │
│  VIP Fast Lane          VIP face detect  Open gate + Notify 🟢 Active │
│  After-hours Alert      Access 22-06     Photo + Alert     🟢 Active  │
│  Temp Warning           Temp > 30°C      Alert FM          🟢 Active  │
│  Parking Full           Occupancy > 90%  Update signage    🟢 Active  │
│  Loitering Alert        AI loiter > 5m   Alert guard       🟢 Active  │
│  Energy Spike           Power > 200kWh   Alert + Adjust    ⚫ Draft  │
│  ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Create Rule (full page)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Create Automation Rule                    [Save Draft] [💾 Activate] │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Rule Name: [After-hours Security Alert            ]                   │
│  Description: [Alert security when access occurs outside hours    ]    │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  WHEN (Trigger)                                          [+ OR] │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │  Event: [Access Event ▾]                                 │   │  │
│  │  │  Time:  [Between ▾] [22:00] and [06:00]                 │   │  │
│  │  │  Door:  [Any door ▾]                                     │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  THEN (Actions)                                        [+ AND] │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │  Action 1: [Capture snapshot from linked camera ▾]       │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │  Action 2: [Send alert to ▾] [Security Guards group ▾]  │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │  Action 3: [Create event log entry ▾]                    │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  UNLESS (Exceptions)                                    [+ Add] │  │
│  │  User is in group: [Security Guards ▾]                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rule Builder Structure:**
- **WHEN** block: trigger conditions with AND/OR logic
  - Trigger types: access event, alarm, AI detection, sensor reading, schedule, device status
  - Conditions: filters on trigger (time, location, user type, etc.)
- **THEN** block: ordered list of actions
  - Action types: send alert, capture photo, open/lock door, create work order, update signage, play announcement, send email/SMS
- **UNLESS** block: exception conditions that skip the rule

**Execution Log Tab:**
- Table: timestamp, rule name, trigger event, actions executed, result (success/failure)
- Filter by rule, date, result
- Click row → detail view with full execution trace

---

## Appendix: Interaction Patterns

### Common Patterns Used Throughout

| Pattern | Description | Token Reference |
|---------|-------------|-----------------|
| **Page Header** | Title (`--text-2xl`) + description + right-aligned actions | `--space-6` below |
| **Filter Bar** | Horizontal row: search + dropdowns + status tabs | `--space-2` gaps |
| **Data Table** | Sortable, paginated, row-click navigation | See §6.3 of Design System |
| **Detail Panel** | Slide-in from right, 400-480px, for quick view | `--duration-slow` animation |
| **Action Confirmation** | Modal with description + type-to-confirm for destructive | See §6.6 of Design System |
| **Empty State** | Icon (`--icon-2xl`) + title + description + CTA button | Centered in content area |
| **Loading** | Skeleton screens matching actual layout | See §8.3 of Design System |
| **Real-time Feed** | Auto-scrolling list, new items highlight, pause control | `--accent-900` bg flash |
| **Status Badges** | Colored dot + text, consistent across all modules | See §6.8 of Design System |

### Keyboard Shortcuts (Global)

| Shortcut | Action |
|----------|--------|
| `⌘K` | Open command palette / search |
| `⌘J` | Toggle AI Assistant panel |
| `[` | Toggle sidebar collapse |
| `⌘.` | Toggle theme (dark/light) |
| `?` | Show keyboard shortcuts help |
| `G D` | Go to Dashboard |
| `G A` | Go to Access Control |
| `G V` | Go to CCTV |
| `G P` | Go to People |
| `ESC` | Close modal / panel / search |

---

*Duall Master 3.0 Web Console — UI/UX Specification v1.0*  
*February 2026*
