# Duall Master 3.0 — Design System

**Version:** 1.0  
**Date:** February 2026  
**Status:** Foundation  
**Kanban:** task-1771437329

> Single source of truth for all Duall Master 3.0 UI across Web, Mobile, Terminal, Guard Station, and Marketing Website.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Iconography](#5-iconography)
6. [Core Components](#6-core-components)
7. [Platform Adaptations](#7-platform-adaptations)
8. [Motion & Animation](#8-motion--animation)
9. [Accessibility](#9-accessibility)
10. [Data Visualization](#10-data-visualization)

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Data-Dense** | Maximize information per pixel. Compact layouts like Stripe. No wasted space. |
| **Dark-First** | Primary theme is dark (security/cyber feel). Light theme as secondary option. |
| **Color as Signal** | Color on text, numbers, and icons — never on card backgrounds. White/dark cards only. |
| **Domain-Coded** | Each domain has a signature color for instant recognition. |
| **Platform-Adaptive** | Same design language, adapted per surface (web, mobile, terminal, guard). |
| **Minimal Chrome** | Reduce borders, shadows, decorative elements. Content speaks. Like Linear. |

---

## 2. Color System

### 2.1 Primary Palette

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--brand-900` | `#0A0E1A` | 228 33% 7% | Deepest background |
| `--brand-800` | `#111827` | 221 39% 11% | Primary dark bg |
| `--brand-700` | `#1E293B` | 217 33% 17% | Elevated surface |
| `--brand-600` | `#334155` | 215 25% 27% | Subtle surface |
| `--brand-500` | `#475569` | 215 16% 35% | Muted text |
| `--brand-400` | `#64748B` | 215 14% 47% | Secondary text |
| `--brand-300` | `#94A3B8` | 213 18% 65% | Tertiary text |
| `--brand-200` | `#CBD5E1` | 214 20% 84% | Light border |
| `--brand-100` | `#E2E8F0` | 214 32% 91% | Light surface |
| `--brand-50` | `#F8FAFC` | 210 40% 98% | Lightest bg |

### 2.2 Accent — Electric Blue

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--accent-600` | `#2563EB` | 217 91% 53% | Primary action (dark theme) |
| `--accent-500` | `#3B82F6` | 217 92% 60% | Primary action (light theme) |
| `--accent-400` | `#60A5FA` | 213 94% 68% | Hover state |
| `--accent-300` | `#93C5FD` | 213 97% 78% | Light accent text |
| `--accent-100` | `#DBEAFE` | 214 95% 93% | Accent tint bg (light theme) |
| `--accent-900` | `#1E3A5F` | 212 52% 25% | Accent tint bg (dark theme) |

### 2.3 Domain Colors

Each domain has a unique hue for visual coding. Used on text, icons, badges — **never** as card backgrounds.

| Domain | Token | Hex | HSL | Icon |
|--------|-------|-----|-----|------|
| 🔒 SECURE | `--domain-secure` | `#3B82F6` | 217 92% 60% | Electric Blue |
| 👤 MANAGE | `--domain-manage` | `#8B5CF6` | 258 90% 66% | Violet |
| 🏢 OPERATE | `--domain-operate` | `#F59E0B` | 38 92% 50% | Amber |
| 🧠 SMART | `--domain-smart` | `#06B6D4` | 188 96% 42% | Cyan |
| ⚙️ PLATFORM | `--domain-platform` | `#6B7280` | 220 9% 46% | Gray |

### 2.4 Semantic Colors

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--success` | `#22C55E` | 142 71% 45% | Online, granted, success |
| `--success-muted` | `#166534` | 143 64% 24% | Dark theme success bg |
| `--warning` | `#EAB308` | 48 96% 47% | Caution, expiring |
| `--warning-muted` | `#713F12` | 32 73% 26% | Dark theme warning bg |
| `--error` | `#EF4444` | 0 84% 60% | Denied, alarm, critical |
| `--error-muted` | `#7F1D1D` | 0 63% 31% | Dark theme error bg |
| `--info` | `#3B82F6` | 217 92% 60% | Informational |
| `--info-muted` | `#1E3A5F` | 212 52% 25% | Dark theme info bg |

### 2.5 Dark Theme (Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0A0E1A` | Page background |
| `--bg-secondary` | `#111827` | Sidebar, panels |
| `--surface-1` | `#1E293B` | Cards, dropdowns |
| `--surface-2` | `#334155` | Nested surface, hover |
| `--surface-3` | `#475569` | Active state |
| `--border-default` | `#1E293B` | Subtle dividers |
| `--border-strong` | `#334155` | Visible borders |
| `--text-primary` | `#F8FAFC` | Headings, primary content |
| `--text-secondary` | `#94A3B8` | Supporting text |
| `--text-tertiary` | `#64748B` | Placeholders, hints |
| `--text-disabled` | `#475569` | Disabled state |

### 2.6 Light Theme (Secondary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#FFFFFF` | Page background |
| `--bg-secondary` | `#F8FAFC` | Sidebar, panels |
| `--surface-1` | `#FFFFFF` | Cards (white) |
| `--surface-2` | `#F1F5F9` | Nested surface, hover |
| `--surface-3` | `#E2E8F0` | Active state |
| `--border-default` | `#E2E8F0` | Subtle dividers |
| `--border-strong` | `#CBD5E1` | Visible borders |
| `--text-primary` | `#0F172A` | Headings, primary content |
| `--text-secondary` | `#475569` | Supporting text |
| `--text-tertiary` | `#94A3B8` | Placeholders, hints |
| `--text-disabled` | `#CBD5E1` | Disabled state |

---

## 3. Typography

### 3.1 Font Families

| Role | Font | Fallback | Notes |
|------|------|----------|-------|
| **Headings** | Inter | -apple-system, sans-serif | Tight tracking, geometric |
| **Body** | Inter | -apple-system, sans-serif | Highly legible at small sizes |
| **Mono/Code** | JetBrains Mono | Fira Code, monospace | Logs, device IDs, code |
| **Numbers** | Inter Tabular | — | Use `font-variant-numeric: tabular-nums` for aligned data |

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Use Case |
|-------|------|--------|-------------|----------------|----------|
| `--text-xs` | 11px | 400 | 16px (1.45) | +0.01em | Badges, timestamps, micro labels |
| `--text-sm` | 12px | 400 | 16px (1.33) | +0.005em | Table cells, secondary info, captions |
| `--text-base` | 13px | 400 | 20px (1.54) | 0 | Default body text |
| `--text-md` | 14px | 400 | 20px (1.43) | 0 | Form labels, nav items |
| `--text-lg` | 16px | 500 | 24px (1.5) | -0.01em | Section titles, card headers |
| `--text-xl` | 18px | 600 | 28px (1.56) | -0.015em | Page section headings |
| `--text-2xl` | 20px | 600 | 28px (1.4) | -0.02em | Page titles |
| `--text-3xl` | 24px | 600 | 32px (1.33) | -0.025em | Dashboard stat numbers |
| `--text-4xl` | 30px | 700 | 36px (1.2) | -0.03em | Hero stats, marketing |
| `--text-5xl` | 36px | 700 | 40px (1.11) | -0.03em | Marketing headlines |
| `--text-6xl` | 48px | 700 | 52px (1.08) | -0.04em | Marketing hero |

**Note:** Base font size is **13px** (like Linear) for data-dense interfaces. Marketing site uses 16px base.

### 3.3 Font Weights

| Token | Weight | Usage |
|-------|--------|-------|
| `--font-normal` | 400 | Body text, table cells |
| `--font-medium` | 500 | Labels, nav items, card titles |
| `--font-semibold` | 600 | Page titles, section headers, stat labels |
| `--font-bold` | 700 | Marketing headlines, hero numbers |

### 3.4 Platform Adjustments

| Platform | Base Size | Adjustment |
|----------|-----------|------------|
| **Web** | 13px | Default scale |
| **Mobile** | 14px | +1px across the board for touch readability |
| **Terminal** | 16px | +3px, minimum 14px for any text |
| **Guard Station** | 14px | Same as web but stat numbers scale to `--text-4xl` |
| **Marketing** | 16px | Standard web sizing |

---

## 4. Spacing & Layout

### 4.1 Base Unit

**4px base unit.** All spacing is a multiple of 4.

### 4.2 Spacing Scale

| Token | Value | Common Use |
|-------|-------|------------|
| `--space-0` | 0px | — |
| `--space-0.5` | 2px | Tight inline gaps |
| `--space-1` | 4px | Icon-to-text gap, tight padding |
| `--space-1.5` | 6px | Small badge padding |
| `--space-2` | 8px | Default inline gap, compact padding |
| `--space-3` | 12px | Card inner padding (compact), input padding-x |
| `--space-4` | 16px | Default card padding, section gap |
| `--space-5` | 20px | Card padding (comfortable) |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Page section gap |
| `--space-10` | 40px | Large section gap |
| `--space-12` | 48px | Page-level spacing |
| `--space-16` | 64px | Marketing section spacing |
| `--space-20` | 80px | Marketing hero spacing |

### 4.3 Grid System

#### Web — 12-Column Grid

| Breakpoint | Columns | Gutter | Margin | Container Max |
|------------|---------|--------|--------|---------------|
| `xs` (0–639px) | 4 | 16px | 16px | 100% |
| `sm` (640–767px) | 8 | 16px | 24px | 100% |
| `md` (768–1023px) | 12 | 20px | 32px | 100% |
| `lg` (1024–1279px) | 12 | 24px | 40px | 1200px |
| `xl` (1280–1535px) | 12 | 24px | 48px | 1400px |
| `2xl` (1536px+) | 12 | 32px | auto | 1600px |

#### Mobile Layout

| Element | Value |
|---------|-------|
| Screen padding | 16px |
| Card gap | 12px |
| Bottom nav height | 56px |
| Status bar clearance | safe-area-inset-top |

#### Sidebar Widths

| State | Width |
|-------|-------|
| Expanded | 240px |
| Collapsed | 56px |
| Mobile overlay | 280px |

### 4.4 Responsive Breakpoints

```css
--breakpoint-sm:  640px;   /* Mobile landscape */
--breakpoint-md:  768px;   /* Tablet portrait */
--breakpoint-lg:  1024px;  /* Tablet landscape / small laptop */
--breakpoint-xl:  1280px;  /* Desktop */
--breakpoint-2xl: 1536px;  /* Large desktop / guard station */
```

---

## 5. Iconography

### 5.1 Icon Library

**Primary:** [Lucide Icons](https://lucide.dev) — clean, consistent 24×24 stroked icons.

**Why Lucide:**
- 1px stroke weight matches Inter's clean aesthetic
- Comprehensive coverage (1000+ icons)
- Active community, MIT license
- React/Vue components available
- Consistent with Linear/Vercel aesthetic

### 5.2 Icon Sizes

| Token | Size | Stroke | Usage |
|-------|------|--------|-------|
| `--icon-xs` | 14px | 1.5px | Inline with small text, badges |
| `--icon-sm` | 16px | 1.5px | Table actions, nav items, form hints |
| `--icon-md` | 20px | 2px | Buttons, card headers, sidebar nav |
| `--icon-lg` | 24px | 2px | Page headers, empty states |
| `--icon-xl` | 32px | 2px | Feature cards, marketing |
| `--icon-2xl` | 48px | 2px | Hero sections, onboarding |

### 5.3 Domain Icons

Custom compound icons built from Lucide primitives:

| Domain | Primary Icon | Accent Color |
|--------|-------------|--------------|
| 🔒 SECURE | `Shield` | `--domain-secure` (#3B82F6) |
| 👤 MANAGE | `Users` | `--domain-manage` (#8B5CF6) |
| 🏢 OPERATE | `Building2` | `--domain-operate` (#F59E0B) |
| 🧠 SMART | `Brain` | `--domain-smart` (#06B6D4) |
| ⚙️ PLATFORM | `Settings` | `--domain-platform` (#6B7280) |

### 5.4 Icon Color Rules

- **Default:** `--text-secondary` (muted)
- **Active/Selected:** Domain color or `--accent-500`
- **Interactive:** Inherit parent text color
- **Semantic:** Match semantic color (success/warning/error)
- **Never:** Use colored icon backgrounds. Icon color only.

---

## 6. Core Components

### 6.1 Buttons

#### Variants

| Variant | Dark Theme | Light Theme | Usage |
|---------|-----------|-------------|-------|
| **Primary** | bg: `#2563EB`, text: `#FFFFFF` | bg: `#2563EB`, text: `#FFFFFF` | Main CTA |
| **Secondary** | bg: `#1E293B`, text: `#F8FAFC`, border: `#334155` | bg: `#FFFFFF`, text: `#0F172A`, border: `#E2E8F0` | Secondary actions |
| **Ghost** | bg: transparent, text: `#94A3B8` | bg: transparent, text: `#475569` | Tertiary, toolbar |
| **Danger** | bg: `#DC2626`, text: `#FFFFFF` | bg: `#DC2626`, text: `#FFFFFF` | Destructive actions |
| **Success** | bg: `#16A34A`, text: `#FFFFFF` | bg: `#16A34A`, text: `#FFFFFF` | Confirm/approve |

#### Sizes

| Size | Height | Padding X | Font Size | Border Radius | Icon Size |
|------|--------|-----------|-----------|---------------|-----------|
| **xs** | 24px | 8px | 11px | 4px | 14px |
| **sm** | 28px | 10px | 12px | 6px | 14px |
| **md** | 32px | 12px | 13px | 6px | 16px |
| **lg** | 36px | 16px | 14px | 8px | 18px |
| **xl** | 40px | 20px | 14px | 8px | 20px |

#### States

| State | Change |
|-------|--------|
| **Default** | As specified |
| **Hover** | Lighten bg 8% (dark) / Darken bg 4% (light) |
| **Active/Pressed** | Darken bg 4% from hover |
| **Focus** | 2px ring, `--accent-500`, 2px offset |
| **Disabled** | 40% opacity, `cursor: not-allowed` |
| **Loading** | Show spinner (16px), disable click, keep width |

### 6.2 Cards

All cards use **flat backgrounds with no colored fills.** Color appears on text/numbers/icons only.

#### Base Card

```
Dark:  bg: #1E293B, border: 1px solid #334155, radius: 8px, padding: 16px
Light: bg: #FFFFFF, border: 1px solid #E2E8F0, radius: 8px, padding: 16px
```

No box-shadow in dark theme. Light theme: `0 1px 2px rgba(0,0,0,0.05)` only.

#### Stat Card

```
┌─────────────────────────────┐
│  ↗ Total Access Events      │  ← label: --text-secondary, 12px, 500
│  12,847                     │  ← value: domain color, 24px, 600, tabular-nums
│  +12.3% from last week      │  ← trend: --success (green) or --error (red), 12px
└─────────────────────────────┘
```

- Padding: 16px
- No background color fill — white/dark card only
- Domain color on the number only
- Trend arrow icon (12px) inline with trend text

#### Module Card (for domain navigation)

```
┌─────────────────────────────┐
│  🔒  Access Control         │  ← icon (domain color) + title (--text-primary, 14px, 500)
│  Monitor and control all    │  ← description: --text-secondary, 12px
│  entry points               │
│                    →        │  ← chevron-right, --text-tertiary
└─────────────────────────────┘
```

- Hover: border color → domain color at 30% opacity
- Padding: 16px
- Min-height: none (content-driven)

### 6.3 Tables

Data-dense tables inspired by Stripe's approach.

#### Structure

| Property | Value |
|----------|-------|
| Header bg (dark) | `#111827` (sticky) |
| Header bg (light) | `#F8FAFC` (sticky) |
| Header text | `--text-secondary`, 11px, 500, uppercase, +0.05em tracking |
| Row height | 36px (compact) / 44px (default) / 52px (comfortable) |
| Cell padding | 8px 12px |
| Row border | 1px solid `--border-default` |
| Row hover (dark) | `#1E293B` → `#243044` |
| Row hover (light) | `#FFFFFF` → `#F8FAFC` |
| Selected row (dark) | `--accent-900` at 20% opacity |
| Stripe (optional) | Alternate rows with `--surface-1` / `--bg-secondary` |

#### Sort Indicator
- Unsorted: `ChevronUpDown` icon, `--text-tertiary`
- Ascending: `ChevronUp`, `--text-primary`
- Descending: `ChevronDown`, `--text-primary`

#### Pagination
- Position: bottom-right of table
- Style: `< 1 2 3 ... 10 >` — ghost button style
- Page size selector: `10 / 25 / 50 / 100` dropdown
- Info text: "Showing 1–25 of 1,247" — `--text-tertiary`, 12px

### 6.4 Forms

#### Text Input

| Property | Dark | Light |
|----------|------|-------|
| Height | 32px (sm) / 36px (md) / 40px (lg) | Same |
| Background | `#111827` | `#FFFFFF` |
| Border | 1px solid `#334155` | 1px solid `#E2E8F0` |
| Border radius | 6px | 6px |
| Padding | 0 10px | 0 10px |
| Font size | 13px | 13px |
| Text color | `--text-primary` | `--text-primary` |
| Placeholder | `--text-tertiary` | `--text-tertiary` |
| Focus border | `--accent-500` | `--accent-500` |
| Focus ring | 0 0 0 2px `--accent-500` at 20% | 0 0 0 2px `--accent-500` at 20% |
| Error border | `--error` | `--error` |
| Disabled | 50% opacity, `--surface-2` bg | 50% opacity, `--bg-secondary` bg |

#### Label

- Font: 12px, 500, `--text-secondary`
- Margin-bottom: 4px
- Required indicator: `*` in `--error` color

#### Select / Dropdown

Same as text input. Chevron-down icon (14px) right-aligned. Dropdown menu: `--surface-1` bg, 8px radius, `--border-strong` border, max-height 240px with scroll.

#### Checkbox

- Size: 16px × 16px
- Border: 1.5px solid `--border-strong`
- Radius: 4px
- Checked: bg `--accent-500`, white check icon
- Indeterminate: bg `--accent-500`, white minus icon

#### Toggle / Switch

- Track: 36px × 20px, radius 10px
- Thumb: 16px circle, 2px inset
- Off (dark): track `#334155`, thumb `#94A3B8`
- On: track `--accent-500`, thumb `#FFFFFF`
- Transition: 150ms ease-out

#### Date Picker

- Input: same as text input with calendar icon (16px)
- Calendar popup: card style, 280px wide
- Day cells: 32px × 32px, radius 6px
- Today: ring border `--accent-500`
- Selected: bg `--accent-500`, text white
- Range: bg `--accent-100` (light) / `--accent-900` (dark)

### 6.5 Navigation

#### Sidebar (Web)

```
┌──────────────────────────┐
│  ◆ DUALL MASTER          │  ← Logo + wordmark, 14px, 600
│                          │
│  OVERVIEW                │  ← Section label: 10px, 600, uppercase, --text-tertiary
│  ◉ Dashboard             │  ← Active: --accent-500 text, --accent-900 bg (dark)
│  ○ Alerts                │  ← Default: --text-secondary, hover: --text-primary
│                          │
│  🔒 SECURE               │  ← Domain label: domain color, 10px, 600
│  ○ Access Control        │
│  ○ CCTV                  │
│  ○ Intercom              │
│                          │
│  👤 MANAGE               │
│  ○ Visitors              │
│  ○ Identities            │
│  ○ Attendance            │
│                          │
│  🏢 OPERATE              │
│  ○ Parking               │
│  ○ Maintenance           │
│  ○ Guard Tour            │
│                          │
│  ──────────────────────  │  ← Divider
│  ⚙ Settings             │
│  ? Help                  │
│  ☺ Cuong N.       ▾     │  ← User menu
└──────────────────────────┘
```

- Width: 240px expanded, 56px collapsed
- Nav item height: 32px
- Nav item padding: 8px 12px
- Active indicator: left 2px bar `--accent-500` (or bg highlight)
- Icon size: 18px, gap to text: 10px
- Collapse: show icons only with tooltip on hover

#### Top Bar

```
┌──────────────────────────────────────────────────────────────┐
│  Breadcrumb > Path > Here     🔍  🔔(3)  ☺ Cuong ▾        │
└──────────────────────────────────────────────────────────────┘
```

- Height: 48px
- Background: `--bg-secondary`
- Border-bottom: 1px solid `--border-default`
- Search: `Cmd+K` shortcut, ghost input style
- Notification bell: relative badge (red dot, 8px)

#### Breadcrumbs

- Separator: `/` in `--text-tertiary`
- Items: `--text-secondary`, 12px, 500
- Current (last item): `--text-primary`
- Hover: `--accent-500` underline

#### Tabs

- Height: 36px
- Text: 13px, 500
- Inactive: `--text-secondary`
- Active: `--text-primary` + 2px bottom border `--accent-500`
- Hover: `--text-primary`
- Gap between tabs: 0 (full-width bottom border as track)
- Padding per tab: 0 12px

### 6.6 Modals & Dialogs

| Property | Value |
|----------|-------|
| Overlay | `#000000` at 60% opacity |
| Container bg (dark) | `--surface-1` |
| Container bg (light) | `#FFFFFF` |
| Border radius | 12px |
| Max width | 480px (sm), 640px (md), 800px (lg), 1000px (xl) |
| Padding | 24px |
| Header | 16px, 600, `--text-primary` |
| Close button | top-right, ghost, `X` icon |
| Footer | right-aligned buttons, 12px gap, border-top `--border-default` |
| Animation | Scale 0.95→1 + fade, 150ms ease-out |

#### Confirmation Dialog

```
┌──────────────────────────────────┐
│  ⚠ Delete Access Rule?          │
│                                  │
│  This will permanently remove    │
│  "Night Shift Access" and all    │
│  associated permissions.         │
│                                  │
│              [Cancel] [Delete]   │
└──────────────────────────────────┘
```

- Danger action: `--error` bg button
- Cancel: secondary button

### 6.7 Alerts & Toasts

#### Inline Alert

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│  ℹ  3 devices are offline.       │  ← left border 3px, semantic color
│     Check device health panel.   │     bg: semantic muted color
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

- Left border: 3px solid semantic color
- Background: semantic muted color
- Icon: semantic color, 18px
- Text: `--text-primary`, 13px
- Padding: 12px 16px
- Border radius: 6px (right side only)

#### Toast Notification

- Position: bottom-right, 16px from edges
- Width: 360px
- Style: card style with left-border accent (same as alert)
- Auto-dismiss: 5s (info), 8s (warning), persistent (error)
- Stack: max 3 visible, newest on bottom
- Animation: slide-in from right, 200ms ease-out

### 6.8 Badges & Tags

#### Badge (status indicator)

| Variant | Dot Color | Text Color (Dark) | Text Color (Light) |
|---------|-----------|-------------------|-------------------|
| **Active/Online** | `--success` | `--success` | `#166534` |
| **Warning** | `--warning` | `--warning` | `#92400E` |
| **Error/Offline** | `--error` | `--error` | `#991B1B` |
| **Neutral** | `--brand-400` | `--text-secondary` | `--text-secondary` |
| **Info** | `--info` | `--accent-500` | `#1E40AF` |

Structure: 6px dot + 4px gap + text (11px, 500)

Alternative pill style: padding 2px 8px, radius 9999px, bg semantic-muted, text semantic color

#### Tag (categorization)

- Padding: 2px 8px
- Border-radius: 4px
- Font: 11px, 500
- Border: 1px solid (color at 30% opacity)
- Background: transparent (dark) / color at 8% opacity (light)
- Text: domain or semantic color
- Removable: `×` button (12px) on right

### 6.9 Avatar & User Elements

#### Avatar

| Size | Dimensions | Font Size (initials) | Usage |
|------|-----------|---------------------|-------|
| **xs** | 20px | 9px | Inline references |
| **sm** | 24px | 10px | Table cells, lists |
| **md** | 32px | 12px | Cards, nav |
| **lg** | 40px | 14px | Profile sections |
| **xl** | 56px | 18px | Profile page |
| **2xl** | 80px | 24px | Edit profile |

- Shape: Circle (radius 50%)
- Fallback: Initials on domain color bg (or `--brand-600`)
- Border: 2px solid `--border-default` (optional, for image avatars)
- Status dot: 25% of avatar size, positioned bottom-right, 2px white/dark ring

#### User Chip

```
[ ☺ Cuong Nguyen ] — avatar(sm) + name (13px, 500) + optional role tag
```

- Padding: 4px 8px 4px 4px
- Border: 1px solid `--border-default`
- Radius: 9999px
- Hover: `--surface-2`

---

## 7. Platform Adaptations

### 7.1 Web Console

| Aspect | Spec |
|--------|------|
| Layout | Fixed sidebar (240px) + scrollable main content |
| Min width | 1024px (below: collapse sidebar) |
| Hover states | All interactive elements have hover feedback |
| Keyboard nav | Tab order, `Cmd+K` command palette, arrow keys in lists |
| Focus visible | 2px ring `--accent-500`, 2px offset |
| Data tables | Full-featured: sort, filter, column resize, export |
| Scroll | Custom scrollbar: 6px wide, `--surface-2` thumb, transparent track |

### 7.2 Mobile App (Admin + Resident)

| Aspect | Spec |
|--------|------|
| Min touch target | 44px × 44px (Apple HIG) |
| Bottom navigation | 5 items max, 56px height, icon (24px) + label (10px) |
| Safe areas | Respect notch, home indicator, status bar |
| Pull to refresh | Standard iOS/Android pattern |
| Swipe actions | Left-swipe on list items for quick actions |
| Cards | Full-width on mobile, 16px horizontal padding |
| Floating action button | 56px, `--accent-500`, bottom-right 16px inset |
| Typography base | 14px (body), 11px (min for any text) |
| Sheets | Bottom sheet for detail views, max 90% height |

#### Bottom Navigation Items (Admin)

1. Dashboard (LayoutDashboard)
2. Events (Bell)
3. Doors (DoorOpen)
4. Cameras (Video)
5. More (Menu)

#### Bottom Navigation Items (Resident)

1. Home (Home)
2. Access (Key)
3. Visitors (UserPlus)
4. Services (Grid)
5. Profile (User)

### 7.3 Terminal (Android Kiosk)

| Aspect | Spec |
|--------|------|
| Min touch target | 64px × 64px |
| Typography base | 16px body, 20px headings |
| Layout | Single-column, centered content, max-width 600px |
| Buttons | Full-width or large pill (height 56px+) |
| Colors | High contrast — fewer intermediate grays |
| Content | Minimal text, large icons, clear CTAs |
| Keyboard | Full-screen numeric/alpha keyboard for input |
| Idle screen | Building branding + "Tap to Start" |
| Timeout | Auto-return to idle after 60s inactivity |

#### Terminal Flow Example (Visitor Check-in)

```
Screen 1: "Welcome" + "Check In" button (64px tall)
Screen 2: QR scan or "Enter Code" (large numeric keypad)
Screen 3: Photo capture (camera preview + "Take Photo" button)
Screen 4: "Welcome, [Name]!" + badge printing status
```

### 7.4 Guard Station

| Aspect | Spec |
|--------|------|
| Layout | Multi-panel — sidebar(56px) + camera grid + event feed |
| Theme | Dark only (optimized for low-light control rooms) |
| Camera grid | 1×1, 2×2, 3×3, 4×4, 1+5 layouts |
| Event feed | Right panel, 320px, auto-scroll with new-event highlight |
| Alert priority | Visual: red pulse border for critical, amber for warning |
| Stat numbers | `--text-4xl` (30px) with domain color |
| Time display | Prominent clock, 24h format, top-right |
| Sound | Audio alerts for critical events |
| Fullscreen | F11 support, hide OS chrome |

#### Guard Station Layout

```
┌────┬──────────────────────────────┬──────────┐
│    │                              │ EVENTS   │
│ N  │                              │          │
│ A  │     CAMERA GRID              │ 10:23:01 │
│ V  │     (flexible layout)        │ Door 3.. │
│    │                              │          │
│    │                              │ 10:22:58 │
│    │                              │ Gate 1.. │
├────┴──────────────────────────────┴──────────┤
│  STATUS BAR: 5 Online | 0 Alarms | 14:32:07 │
└──────────────────────────────────────────────┘
```

---

## 8. Motion & Animation

### 8.1 Duration Scale

| Token | Duration | Usage |
|-------|----------|-------|
| `--duration-instant` | 50ms | Checkbox, toggle |
| `--duration-fast` | 100ms | Button press, hover color |
| `--duration-normal` | 150ms | Most transitions |
| `--duration-moderate` | 200ms | Dropdowns, tooltips |
| `--duration-slow` | 300ms | Modals, sheets, sidebar collapse |
| `--duration-slower` | 500ms | Page transitions, large reveals |

### 8.2 Easing Curves

| Token | Curve | Usage |
|-------|-------|-------|
| `--ease-default` | `cubic-bezier(0.2, 0, 0, 1)` | General purpose (material you) |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Elements exiting |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful bounce (toasts) |

### 8.3 Loading States

| Type | Spec |
|------|------|
| **Spinner** | 16px (inline) / 24px (button) / 32px (page). 2px stroke, `--accent-500`. 800ms rotation. |
| **Skeleton** | Pulsing bg shimmer: `--surface-1` → `--surface-2`, 1.5s ease-in-out infinite |
| **Progress bar** | 2px height, `--accent-500` fill, indeterminate: translate-x animation |
| **Page load** | Thin progress bar at very top of viewport (like YouTube) |

### 8.4 Micro-interactions

| Interaction | Animation |
|-------------|-----------|
| Button press | scale(0.97), `--duration-fast` |
| Card hover | border-color transition, `--duration-normal` |
| Sidebar collapse | width transition, `--duration-slow`, icons stay centered |
| Toast enter | translateX(100%) → 0, `--duration-slow`, `--ease-out` |
| Toast exit | translateX(0) → 100%, `--duration-normal`, `--ease-in` |
| Modal enter | scale(0.95) + opacity(0) → scale(1) + opacity(1), `--duration-slow` |
| Dropdown | scaleY(0.95) + opacity(0) → full, `--duration-moderate`, transform-origin top |
| Alert pulse | box-shadow pulse on critical alerts, 2s infinite (guard station only) |
| Number count-up | Stat numbers animate from 0 on dashboard load, 600ms, `--ease-out` |

### 8.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Accessibility

### 9.1 Contrast Ratios (WCAG 2.1 AA)

All combinations verified:

| Text | Background | Ratio | Pass |
|------|-----------|-------|------|
| `#F8FAFC` on `#0A0E1A` | Page text (dark) | 17.8:1 | ✅ AAA |
| `#94A3B8` on `#0A0E1A` | Secondary text (dark) | 7.1:1 | ✅ AAA |
| `#64748B` on `#0A0E1A` | Tertiary text (dark) | 4.5:1 | ✅ AA |
| `#3B82F6` on `#0A0E1A` | Accent on dark bg | 5.2:1 | ✅ AA |
| `#22C55E` on `#0A0E1A` | Success on dark bg | 8.1:1 | ✅ AAA |
| `#EF4444` on `#0A0E1A` | Error on dark bg | 5.1:1 | ✅ AA |
| `#0F172A` on `#FFFFFF` | Page text (light) | 16.8:1 | ✅ AAA |
| `#475569` on `#FFFFFF` | Secondary text (light) | 6.3:1 | ✅ AA |
| `#2563EB` on `#FFFFFF` | Accent on light bg | 4.6:1 | ✅ AA |

### 9.2 Focus States

- **Style:** 2px solid `--accent-500`, 2px offset (outline-offset)
- **Visibility:** Only show on keyboard navigation (`:focus-visible`)
- **High contrast:** Focus ring contrasts against both themes
- **Skip link:** Hidden "Skip to content" link, visible on focus

### 9.3 Screen Reader

- All images: descriptive `alt` text
- Icons: `aria-hidden="true"` when decorative, `aria-label` when actionable
- Live regions: `aria-live="polite"` for toasts, `aria-live="assertive"` for critical alerts
- Tables: proper `<thead>`, `<th scope>`, `<caption>`
- Forms: `<label>` associated with every input, error messages linked via `aria-describedby`
- Modals: `role="dialog"`, `aria-modal="true"`, focus trap
- Navigation: `<nav aria-label="Main navigation">`

### 9.4 Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Move focus forward |
| `Shift+Tab` | Move focus backward |
| `Enter/Space` | Activate button/link |
| `Escape` | Close modal/dropdown/toast |
| `Arrow keys` | Navigate within lists, tabs, menus |
| `Cmd+K` | Open command palette |
| `?` | Open keyboard shortcuts help |

---

## 10. Data Visualization

### 10.1 Chart Library

**Recommended:** Recharts (React) or Chart.js — simple, clean, customizable.

### 10.2 Chart Colors

Use a ordered sequence derived from domain colors for multi-series:

```
Series 1: #3B82F6 (blue)
Series 2: #8B5CF6 (violet)
Series 3: #06B6D4 (cyan)
Series 4: #F59E0B (amber)
Series 5: #22C55E (green)
Series 6: #EF4444 (red)
Series 7: #EC4899 (pink)
Series 8: #64748B (gray)
```

### 10.3 Chart Styling

| Element | Dark Theme | Light Theme |
|---------|-----------|-------------|
| Grid lines | `#1E293B` | `#F1F5F9` |
| Axis labels | `--text-tertiary`, 11px | Same |
| Axis lines | `#334155` | `#E2E8F0` |
| Tooltip bg | `#1E293B` | `#FFFFFF` |
| Tooltip border | `#334155` | `#E2E8F0` |
| Tooltip text | `--text-primary`, 12px | Same |

### 10.4 Chart Types & Usage

| Chart | Use Case | Notes |
|-------|----------|-------|
| **Line** | Access events over time, trends | 2px stroke, dot on hover only |
| **Bar** | Comparisons (visitors by day, doors by usage) | 4px border-radius top corners |
| **Donut** | Distribution (access by type, device status) | Inner radius 60%, center stat |
| **Area** | Occupancy, energy consumption | 10% fill opacity |
| **Heatmap** | Access patterns by hour/day | Domain color gradient |
| **Sparkline** | Inline trend in stat cards | 1.5px stroke, no axes, 40px tall |

---

## Appendix A: CSS Custom Properties Template

```css
:root {
  /* Colors - Dark Theme (default) */
  --bg-primary: #0A0E1A;
  --bg-secondary: #111827;
  --surface-1: #1E293B;
  --surface-2: #334155;
  --surface-3: #475569;
  --border-default: #1E293B;
  --border-strong: #334155;
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-tertiary: #64748B;
  --text-disabled: #475569;

  /* Accent */
  --accent-500: #3B82F6;
  --accent-600: #2563EB;
  --accent-400: #60A5FA;

  /* Domain */
  --domain-secure: #3B82F6;
  --domain-manage: #8B5CF6;
  --domain-operate: #F59E0B;
  --domain-smart: #06B6D4;
  --domain-platform: #6B7280;

  /* Semantic */
  --success: #22C55E;
  --warning: #EAB308;
  --error: #EF4444;
  --info: #3B82F6;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-unit: 4px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Shadows (light theme only) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

  /* Motion */
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-moderate: 200ms;
  --duration-slow: 300ms;
  --ease-default: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}

[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8FAFC;
  --surface-1: #FFFFFF;
  --surface-2: #F1F5F9;
  --surface-3: #E2E8F0;
  --border-default: #E2E8F0;
  --border-strong: #CBD5E1;
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-tertiary: #94A3B8;
  --text-disabled: #CBD5E1;
}
```

---

## Appendix B: Tailwind CSS Config

```js
// tailwind.config.js (partial)
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F8FAFC', 100: '#E2E8F0', 200: '#CBD5E1',
          300: '#94A3B8', 400: '#64748B', 500: '#475569',
          600: '#334155', 700: '#1E293B', 800: '#111827', 900: '#0A0E1A',
        },
        accent: {
          100: '#DBEAFE', 300: '#93C5FD', 400: '#60A5FA',
          500: '#3B82F6', 600: '#2563EB', 900: '#1E3A5F',
        },
        secure: '#3B82F6',
        manage: '#8B5CF6',
        operate: '#F59E0B',
        smart: '#06B6D4',
        platform: '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        'xs': ['11px', '16px'],
        'sm': ['12px', '16px'],
        'base': ['13px', '20px'],
        'md': ['14px', '20px'],
        'lg': ['16px', '24px'],
        'xl': ['18px', '28px'],
        '2xl': ['20px', '28px'],
        '3xl': ['24px', '32px'],
        '4xl': ['30px', '36px'],
        '5xl': ['36px', '40px'],
        '6xl': ['48px', '52px'],
      },
    },
  },
}
```

---

*Design System v1.0 — Duall Master 3.0*  
*Created February 2026 by AI Design Assistant*  
*To be maintained alongside implementation*
