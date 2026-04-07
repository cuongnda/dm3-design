# Duall Master 3.0 — Web App Task Breakdown

**Project:** ~/Documents/claw-workspace.nosync/dm3/webapp/  
**Stack:** Vite 6 + React 18 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui  
**Created:** 2026-02-19

---

## Phase 1: Foundation ✅ (Complete)

### ✅ P1-001: Project Setup
- **Description:** Initialize Vite + React + TS project with all dependencies
- **Status:** Done
- **Complexity:** M

### ✅ P1-002: Design System Implementation
- **Description:** CSS variables, Tailwind theme, dark/light themes, domain colors
- **Status:** Done
- **Complexity:** M

### ✅ P1-003: Main Layout (Sidebar + Topbar)
- **Description:** Collapsible sidebar with domain sections, topbar with breadcrumbs, search, notifications
- **Status:** Done
- **Complexity:** L

### ✅ P1-004: Router Configuration
- **Description:** All routes defined with lazy loading, nested routes
- **Status:** Done
- **Complexity:** M

### ✅ P1-005: Shared Components
- **Description:** StatCard, DataTable, StatusBadge, DomainIcon, EventFeed, SearchCommand, NotificationPanel
- **Status:** Done
- **Complexity:** L

### ✅ P1-006: Dashboard Page
- **Description:** Unified dashboard with stat cards, live events, alerts, domain health
- **Status:** Done
- **Complexity:** L

### ✅ P1-007: Auth / Login Page
- **Description:** Login form with dark theme, SSO button, MFA stub
- **Status:** Done
- **Complexity:** S

### ✅ P1-008: Access Control List Page
- **Description:** Doors table with tabs, filters, sorting, pagination, status badges
- **Status:** Done
- **Complexity:** L

---

## Phase 2: SECURE Domain

### P2-001: Access Control — Door Detail Page
- **Title:** [dm3] Build Door Detail page with status, quick actions, and event tabs
- **Description:** Individual door view at `/secure/access-control/:id` with status card, quick action buttons (Remote Open, Lock Down, Maintenance, View Camera), and tabbed content (Events, Access Rules, Schedule, Camera, Settings).
- **Acceptance Criteria:**
  - [ ] Door status card shows state, mode, last event, device info, firmware
  - [ ] Quick action buttons with confirmation dialogs for dangerous actions
  - [ ] Events tab: paginated table with time, user, credential, result, photo thumbnail
  - [ ] Access Rules tab: list of rules with enabled toggle
  - [ ] Schedule tab: weekly visual schedule grid
  - [ ] Camera tab: placeholder for linked camera view
  - [ ] Settings tab: door configuration form
- **Complexity:** L

### P2-002: Access Control — Access Rules Manager
- **Title:** [dm3] Build Access Rules CRUD page with rule builder
- **Description:** `/secure/access-control/rules` — list all rules with create/edit/delete. Rule builder modal with door selection, group assignment, schedule configuration.
- **Acceptance Criteria:**
  - [ ] Rules table: name, doors count, groups, schedule, enabled toggle
  - [ ] Create rule modal with multi-step form
  - [ ] Edit rule inline or modal
  - [ ] Delete with confirmation
  - [ ] Rule detail view showing affected doors and people
- **Complexity:** L

### P2-003: CCTV — Camera Grid Page
- **Title:** [dm3] Build CCTV camera grid with layout switching
- **Description:** `/secure/cctv` — multi-camera grid view with 1×1, 2×2, 3×3, 4×4 layout options. Camera thumbnails with status overlay, click to expand.
- **Acceptance Criteria:**
  - [ ] Grid layout switcher (1×1 to 4×4)
  - [ ] Camera card: placeholder stream, name, location, status badge
  - [ ] Click camera → full-screen single view
  - [ ] Camera list sidebar for quick navigation
  - [ ] NVR status summary cards
  - [ ] Offline camera indicators
- **Complexity:** L

### P2-004: CCTV — Single Camera View
- **Title:** [dm3] Build single camera detail with playback controls
- **Description:** `/secure/cctv/:id` — single camera live view with PTZ controls placeholder, timeline scrubber, event markers, snapshot button.
- **Acceptance Criteria:**
  - [ ] Video player placeholder (hls.js integration point)
  - [ ] PTZ control panel (up/down/left/right/zoom)
  - [ ] Timeline with event markers
  - [ ] Snapshot and record buttons
  - [ ] Related events panel
- **Complexity:** M

### P2-005: Intrusion Detection Page
- **Title:** [dm3] Build Intrusion Detection zone management
- **Description:** `/secure/intrusion` — alarm zone list with arm/disarm controls, sensor status, alarm history.
- **Acceptance Criteria:**
  - [ ] Zone list with status (Armed/Disarmed/Alarm)
  - [ ] Arm/Disarm toggle per zone
  - [ ] Sensor list per zone with status
  - [ ] Alarm history table
  - [ ] Zone map placeholder (floor plan)
- **Complexity:** M

### P2-006: Intercom Page
- **Title:** [dm3] Build Intercom management with call history
- **Description:** `/secure/intercom` — intercom device list, call history, door station configuration.
- **Acceptance Criteria:**
  - [ ] Device list: door stations, indoor monitors
  - [ ] Call history with duration, caller, result
  - [ ] Device status monitoring
  - [ ] Configuration panel per device
- **Complexity:** M

### P2-007: AI Detection Page
- **Title:** [dm3] Build AI Detection event feed and configuration
- **Description:** `/secure/ai-detection` — AI detection events with thumbnails, event type filters, detection zone config.
- **Acceptance Criteria:**
  - [ ] Event feed with thumbnail images
  - [ ] Filter by event type (intrusion, loitering, tailgate, etc.)
  - [ ] Detection statistics dashboard
  - [ ] Zone configuration placeholder
  - [ ] False positive marking
- **Complexity:** M

### P2-008: Emergency Management Page
- **Title:** [dm3] Build Emergency mode controls and response plans
- **Description:** `/secure/emergency` — emergency mode activation (fire, lockdown, medical), response plan configuration, emergency event log.
- **Acceptance Criteria:**
  - [ ] Big emergency buttons: Fire, Lockdown, Medical, Intruder
  - [ ] Confirmation dialog with countdown
  - [ ] Active emergency status display
  - [ ] Response plan editor
  - [ ] Emergency event log
  - [ ] All-clear button to deactivate
- **Complexity:** L

---

## Phase 3: MANAGE Domain

### P3-001: Identity Management
- **Title:** [dm3] Build Identity Management with user directory
- **Description:** `/manage/identities` — user directory with search, filters, detail view with credentials, access history.
- **Acceptance Criteria:**
  - [ ] User table: name, department, role, status, credentials count
  - [ ] User detail: profile info, credentials list, access groups, recent events
  - [ ] Add/edit user form
  - [ ] Credential assignment (card, face, mobile)
  - [ ] Bulk import placeholder
  - [ ] Vietnamese name data in mock
- **Complexity:** L

### P3-002: Visitor Management
- **Title:** [dm3] Build Visitor Management with check-in flow
- **Description:** `/manage/visitors` — visitor list, pre-registration, check-in/out, visitor pass generation.
- **Acceptance Criteria:**
  - [ ] Visitor queue (waiting/checked-in/checked-out tabs)
  - [ ] Pre-registration form with QR code generation
  - [ ] Check-in flow: verify → photo → badge print
  - [ ] Host notification trigger
  - [ ] Visitor history and reports
  - [ ] Expected visitors today summary
- **Complexity:** L

### P3-003: Contractor Management
- **Title:** [dm3] Build Contractor management with compliance tracking
- **Description:** `/manage/contractors` — contractor company list, worker registration, compliance tracking, temporary access.
- **Acceptance Criteria:**
  - [ ] Company list with active worker counts
  - [ ] Worker registration with validity dates
  - [ ] Compliance checklist (safety training, insurance, etc.)
  - [ ] Expiring credentials alerts
  - [ ] Daily check-in/out log
- **Complexity:** M

### P3-004: Time & Attendance
- **Title:** [dm3] Build Attendance dashboard with reports
- **Description:** `/manage/attendance` — daily attendance overview, individual records, shift management, reports.
- **Acceptance Criteria:**
  - [ ] Daily summary: on-time, late, absent, on-leave percentages
  - [ ] Donut chart for attendance breakdown
  - [ ] Employee attendance table with clock-in/out times
  - [ ] Shift schedule calendar view
  - [ ] Monthly report generation
  - [ ] Department filter
- **Complexity:** L

### P3-005: Delivery Management
- **Title:** [dm3] Build Delivery tracking with notifications
- **Description:** `/manage/deliveries` — delivery log, pending pickups, notification triggers.
- **Acceptance Criteria:**
  - [ ] Delivery list: package info, recipient, status, photo
  - [ ] Pending pickup queue with alerts
  - [ ] Delivery logging form
  - [ ] Collection confirmation
  - [ ] Uncollected item alerts
- **Complexity:** S

### P3-006: Access Provisioning
- **Title:** [dm3] Build Access Provisioning with role templates
- **Description:** `/manage/provisioning` — role-based access templates, request/approval workflow, auto-provisioning rules.
- **Acceptance Criteria:**
  - [ ] Role template list with door/zone assignments
  - [ ] Template editor: select doors, schedules, groups
  - [ ] Access request workflow (request → approve → provision)
  - [ ] Pending requests queue
  - [ ] Provisioning history/audit log
- **Complexity:** L

---

## Phase 4: OPERATE Domain

### P4-001: Room Booking
- **Title:** [dm3] Build Room Booking with calendar view
- **Description:** `/operate/room-booking` — room list, calendar view, booking form, current availability.
- **Acceptance Criteria:**
  - [ ] Room list with availability status
  - [ ] Calendar view (day/week) with booking blocks
  - [ ] Booking creation form
  - [ ] Room detail: amenities, capacity, equipment
  - [ ] My bookings list
  - [ ] No-show detection placeholder
- **Complexity:** L

### P4-002: Parking Management
- **Title:** [dm3] Build Parking management with occupancy tracking
- **Description:** `/operate/parking` — parking zone overview, occupancy stats, vehicle log, monthly pass management.
- **Acceptance Criteria:**
  - [ ] Zone overview with occupancy percentage bars
  - [ ] Vehicle entry/exit log
  - [ ] Monthly pass management
  - [ ] Parking map placeholder
  - [ ] Statistics: peak hours, daily trends
- **Complexity:** M

### P4-003: Maintenance / Work Orders
- **Title:** [dm3] Build Maintenance work order management
- **Description:** `/operate/maintenance` — work order list, create/assign/track, asset registry, preventive maintenance schedule.
- **Acceptance Criteria:**
  - [ ] Work order table: ID, title, priority, status, assignee, due date
  - [ ] Create work order form
  - [ ] Status workflow: Open → In Progress → Completed
  - [ ] Asset registry list
  - [ ] Preventive maintenance schedule
  - [ ] Overdue work order alerts
- **Complexity:** L

### P4-004: Guard Tour
- **Title:** [dm3] Build Guard Tour patrol management
- **Description:** `/operate/guard-tour` — route definition, patrol schedule, tour execution tracking, compliance reports.
- **Acceptance Criteria:**
  - [ ] Route list with checkpoint counts
  - [ ] Active patrols overview
  - [ ] Tour detail: checkpoints scanned, missed, timestamp
  - [ ] Route editor with checkpoint ordering
  - [ ] Compliance report: % completed, missed checkpoints
- **Complexity:** M

### P4-005: Key Management
- **Title:** [dm3] Build Key Management checkout system
- **Description:** `/operate/keys` — key inventory, checkout/return tracking, overdue alerts.
- **Acceptance Criteria:**
  - [ ] Key inventory table: key name, cabinet, status (available/checked-out)
  - [ ] Checkout form: key, user, expected return
  - [ ] Return confirmation
  - [ ] Overdue alerts
  - [ ] Audit trail per key
- **Complexity:** S

### P4-006: IoT & Energy Management
- **Title:** [dm3] Build IoT sensor dashboard with energy monitoring
- **Description:** `/operate/iot-energy` — sensor overview, energy consumption charts, alert thresholds, zone-based monitoring.
- **Acceptance Criteria:**
  - [ ] Sensor grid: temperature, humidity, air quality readings
  - [ ] Energy consumption line chart (per zone/floor)
  - [ ] Alert threshold configuration
  - [ ] Energy cost breakdown
  - [ ] ESG sustainability metrics placeholder
- **Complexity:** L

---

## Phase 5: SMART Domain

### P5-001: AI Assistant
- **Title:** [dm3] Build AI Assistant chat panel
- **Description:** `/smart/ai-assistant` — chat interface for querying system, executing commands, generating reports.
- **Acceptance Criteria:**
  - [ ] Chat UI with message bubbles
  - [ ] Suggested prompts/quick actions
  - [ ] System command execution (e.g., "open gate 2")
  - [ ] Data query results display (tables, charts inline)
  - [ ] Chat history
  - [ ] Typing indicator and streaming responses
- **Complexity:** L

### P5-002: Analytics Hub
- **Title:** [dm3] Build Analytics dashboard with multi-domain reports
- **Description:** `/smart/analytics` — analytics dashboard with pre-built reports, custom chart builder, data export.
- **Acceptance Criteria:**
  - [ ] Pre-built report cards: access trends, visitor volume, attendance, occupancy
  - [ ] Date range selector
  - [ ] Chart types: line, bar, donut, heatmap
  - [ ] Report download (CSV, PDF placeholder)
  - [ ] Domain filter tabs
  - [ ] Drill-down capability
- **Complexity:** L

### P5-003: Automation Rules
- **Title:** [dm3] Build Automation rule engine (IFTTT-style)
- **Description:** `/smart/automation` — if-this-then-that rule builder, active rules list, execution log.
- **Acceptance Criteria:**
  - [ ] Rule list: name, trigger, action, enabled toggle, last triggered
  - [ ] Rule builder: trigger selector → condition → action selector
  - [ ] Trigger types: access event, alarm, schedule, threshold
  - [ ] Action types: open door, send alert, create work order
  - [ ] Execution log with success/failure status
  - [ ] Rule templates for common scenarios
- **Complexity:** L

---

## Phase 6: Polish & Settings

### P6-001: Settings — Profile & Security
- **Title:** [dm3] Build Settings pages (Profile, Security, Notifications, Appearance)
- **Description:** `/settings` — tabbed settings with profile editor, security settings (MFA, sessions), notification preferences, appearance (theme, density).
- **Acceptance Criteria:**
  - [ ] Vertical tab navigation within settings
  - [ ] Profile form with avatar upload
  - [ ] Security: change password, MFA toggle, active sessions
  - [ ] Notifications: per-type toggles
  - [ ] Appearance: theme switcher, sidebar default, density
  - [ ] Language selector (EN/VI)
- **Complexity:** M

### P6-002: Settings — Admin (Users, Sites, Integrations)
- **Title:** [dm3] Build Admin settings pages
- **Description:** Admin-only settings: user management, role definitions, site hierarchy, integrations, audit logs.
- **Acceptance Criteria:**
  - [ ] Users & Roles: user directory, role permission matrix, invite form
  - [ ] Sites: site hierarchy management
  - [ ] Integrations: API keys, webhook config, HR sync
  - [ ] Audit Logs: filterable immutable log viewer
  - [ ] Licensing: current tier, module activation
- **Complexity:** L

### P6-003: Responsive / Mobile Optimization
- **Title:** [dm3] Optimize responsive layout for tablet and mobile
- **Description:** Sidebar overlay on mobile, single-column layouts, touch-friendly targets.
- **Acceptance Criteria:**
  - [ ] Sidebar: overlay on <768px, collapse on <1024px
  - [ ] Dashboard: stat cards wrap to 2-column then 1-column
  - [ ] Tables: horizontal scroll on small screens
  - [ ] Touch targets: min 44px
  - [ ] Bottom sheet for modals on mobile
- **Complexity:** M

### P6-004: Keyboard Shortcuts
- **Title:** [dm3] Implement keyboard shortcuts system
- **Description:** `⌘K` search, `[` toggle sidebar, `?` help overlay, arrow navigation in lists.
- **Acceptance Criteria:**
  - [ ] ⌘K: command palette (done)
  - [ ] `[`: toggle sidebar
  - [ ] `?`: keyboard shortcuts help modal
  - [ ] `Esc`: close modals/dropdowns
  - [ ] Arrow keys in tables/lists
  - [ ] Shortcuts help modal listing all shortcuts
- **Complexity:** S

### P6-005: Performance Optimization
- **Title:** [dm3] Optimize bundle size and rendering performance
- **Description:** Code splitting per feature module, virtualized tables for large datasets, memoization, lazy image loading.
- **Acceptance Criteria:**
  - [ ] Each feature module is a separate chunk
  - [ ] Tables with >100 rows use virtual scrolling
  - [ ] Dashboard initial load <2s on 3G
  - [ ] Lighthouse performance score >80
  - [ ] No unnecessary re-renders (React DevTools check)
- **Complexity:** M

### P6-006: E2E Tests
- **Title:** [dm3] Set up Playwright E2E test suite
- **Description:** Core user flows: login, dashboard view, navigate to access control, search, notifications.
- **Acceptance Criteria:**
  - [ ] Playwright configured with test project
  - [ ] Login flow test
  - [ ] Dashboard loads with all sections
  - [ ] Navigation through all domain pages
  - [ ] Search command palette opens and navigates
  - [ ] CI pipeline integration
- **Complexity:** M

---

## Summary

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1: Foundation | 8 | ✅ Complete |
| Phase 2: SECURE | 8 | 3L + 4M + 1L = ~50 story pts |
| Phase 3: MANAGE | 6 | 3L + 1M + 1S + 1L = ~35 story pts |
| Phase 4: OPERATE | 6 | 2L + 2M + 1S + 1L = ~35 story pts |
| Phase 5: SMART | 3 | 3L = ~21 story pts |
| Phase 6: Polish | 6 | 1L + 1M + 1M + 1S + 1M + 1M = ~25 story pts |
| **Total** | **37 tasks** | |

**Estimated total effort:** ~170 story points  
**At 2-3 tasks/week with 2 frontend devs:** ~8-10 weeks for remaining phases
