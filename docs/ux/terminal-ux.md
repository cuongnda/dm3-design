# Duall Master 3.0 — Android Terminal UI/UX Design

**Version:** 1.0  
**Date:** February 2026  
**Platform:** Android Kiosk (7–10" touch screens)  
**Kanban:** task-1771437375

---

## Table of Contents

1. [Terminal Design Principles](#1-terminal-design-principles)
2. [Design System Adaptations](#2-design-system-adaptations)
3. [Screen Map & Flow Diagram](#3-screen-map--flow-diagram)
4. [Home / Idle Screen](#4-home--idle-screen)
5. [Visitor Check-in Flow](#5-visitor-check-in-flow)
6. [Attendance Clock-in Flow](#6-attendance-clock-in-flow)
7. [Directory Lookup](#7-directory-lookup)
8. [Visitor Check-out](#8-visitor-check-out)
9. [Admin / Settings](#9-admin--settings)
10. [Shared Components](#10-shared-components)
11. [Interaction Patterns](#11-interaction-patterns)
12. [Error & Edge Cases](#12-error--edge-cases)

---

## 1. Terminal Design Principles

| Principle | Rule |
|-----------|------|
| **3-Tap Max** | Any task completes in ≤3 taps from home screen |
| **Touch-First** | All targets ≥64×64px; preferred 72×72px for primary actions |
| **High Contrast** | Use dark theme only; high-contrast text for sunlit lobbies |
| **Auto-Timeout** | Return to idle after 60s inactivity; 30s warning toast |
| **Minimal Text** | Large icons, short labels (max 2 lines); bilingual VI/EN |
| **Single Column** | Centered content, max-width 600px on 10" screen |
| **No Scrolling** | Each screen fits viewport; paginate if needed |
| **Forgiving** | Back button always visible; cancel never destructive |

---

## 2. Design System Adaptations

### 2.1 Typography (Terminal Scale)

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--t-hero` | 48px | 700 | Welcome headline, clock display |
| `--t-title` | 28px | 600 | Screen titles |
| `--t-subtitle` | 20px | 500 | Section labels, prompts |
| `--t-body` | 16px | 400 | Body text, descriptions |
| `--t-label` | 14px | 500 | Button labels, input labels |
| `--t-caption` | 12px | 400 | Timestamps, hints (minimum text size) |

**Font:** Inter. Vietnamese diacritics fully supported.

### 2.2 Colors (Terminal High-Contrast)

Dark theme only. Reduced gray palette for clarity under varied lighting.

| Element | Color | Notes |
|---------|-------|-------|
| Background | `#0A0E1A` (brand-900) | Deep dark |
| Card surface | `#1E293B` (brand-700) | Single surface level only |
| Primary text | `#F8FAFC` (brand-50) | 17.8:1 contrast |
| Secondary text | `#CBD5E1` (brand-200) | 11.4:1 contrast |
| Primary button | `#2563EB` (accent-600) | Large, high-contrast |
| Success | `#22C55E` | Clock-in confirmed, badge printed |
| Error | `#EF4444` | Denied, failed |
| Warning | `#EAB308` | Late status, timeout |

### 2.3 Touch Targets

| Element | Min Size | Preferred | Spacing Between |
|---------|----------|-----------|-----------------|
| Primary action button | 64px tall | 72px tall, full-width | 16px |
| Secondary button | 56px tall | 64px tall | 12px |
| Keypad button | 64×64px | 72×72px | 8px |
| Back / nav icon | 48×48px | 56×56px | — |
| Language toggle | 48×48px | — | — |

### 2.4 Layout Grid

| Property | Value |
|----------|-------|
| Screen padding | 32px horizontal, 24px vertical |
| Content max-width | 600px (centered) |
| Card padding | 24px |
| Card radius | 12px |
| Component spacing | 16px vertical |

---

## 3. Screen Map & Flow Diagram

```
                        ┌──────────────┐
                        │  IDLE SCREEN │ ◄── Auto-timeout (60s)
                        │  (Home)      │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │  CHECK IN  │   │  CLOCK IN  │   │ DIRECTORY  │
     │  (Visitor) │   │ (Attend.)  │   │  (Lookup)  │
     └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
           │                │                │
           ▼                ▼                ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ QR Scan  │    │Face/Card │    │ Search   │
     │ or Code  │    │ Recog.   │    │ by Name/ │
     └────┬─────┘    └────┬─────┘    │ Dept     │
          │               │          └────┬─────┘
          ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Purpose/ │    │ Confirm  │    │ Person   │
     │ Host     │    │ Name+Time│    │ Card     │
     └────┬─────┘    └────┬─────┘    └────┬─────┘
          │               │               │
          ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Photo    │    │ Status   │    │ Call/    │
     │ Capture  │    │ (done)   │    │ Notify   │
     └────┬─────┘    └──────────┘    └──────────┘
          │
          ▼ (optional)
     ┌──────────┐
     │ NDA/     │
     │ Agreement│
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Badge    │
     │ Printing │
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Welcome  │
     │ Message  │
     └──────────┘


     ┌──────────────┐         ┌──────────────┐
     │  CHECK OUT   │         │    ADMIN      │
     │  (bottom)    │         │  (PIN gate)   │
     └──────┬───────┘         └──────┬────────┘
            │                        │
            ▼                        ▼
     ┌──────────┐            ┌──────────────┐
     │ Scan/    │            │   Settings   │
     │ Search   │            │   Panel      │
     └────┬─────┘            └──────────────┘
          │
          ▼
     ┌──────────┐
     │ Confirm  │
     │ Checkout │
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Thank You│
     └──────────┘
```

---

## 4. Home / Idle Screen

### 4.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  [VI/EN]                              14:32  24°C   │ ← Status bar: 48px
│                                        Thu 19 Feb   │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   ◆ DUALL MASTER                    │ ← Logo: 64px
│                   Building Name                     │ ← 20px, brand-200
│                                                     │
│              ┌─────────────────────┐                │
│              │                     │                │
│              │    ╔═══════════╗    │                │ ← QR frame: 200×200px
│              │    ║  QR SCAN  ║    │                │   Animated corner brackets
│              │    ║   AREA    ║    │                │
│              │    ╚═══════════╝    │                │
│              │                     │                │
│              │  Quét mã QR để      │                │ ← 16px, brand-200
│              │  đăng ký / Scan QR  │                │
│              └─────────────────────┘                │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  👤  ĐĂNG KÝ KHÁCH / CHECK IN               │  │ ← Primary button: 72px tall
│  └───────────────────────────────────────────────┘  │   accent-600 bg, white text
│                                                     │   28px icon + 18px label
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │  🕐 CHẤM CÔNG   │  │  📖 DANH BẠ     │        │ ← Secondary: 72px tall
│  │  Clock In        │  │  Directory       │        │   surface-1 bg, border
│  └──────────────────┘  └──────────────────┘        │   2-column, 12px gap
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🚪 TRẢ THẺ / CHECK OUT                     │  │ ← Tertiary: 56px tall
│  └───────────────────────────────────────────────┘  │   ghost style, border only
│                                                     │
│                    Powered by Duali                  │ ← 12px, brand-400
└─────────────────────────────────────────────────────┘
```

### 4.2 Specifications

| Element | Spec |
|---------|------|
| **Status bar** | Height: 48px. Language toggle (left, 48×48px pill: `VI │ EN`). Time (28px, tabular-nums, right). Weather icon + temp (20px, right). Date (14px, brand-300, below time). |
| **Logo** | Duall Master diamond mark: 64×64px. Wordmark: 24px, 700 weight. Building name: 20px, 400, brand-200. |
| **QR scan area** | 200×200px centered frame. Animated corner brackets (accent-400, 3px stroke, pulsing). Camera preview inside frame. Instruction text: 16px, brand-200, centered below. |
| **Check In button** | Full-width (max 600px), 72px tall, accent-600 bg, white text 18px/600. Icon 28px left. Border-radius: 12px. |
| **Clock In / Directory** | 2-column, equal width, 72px tall each. Surface-1 bg, border-strong border. Icon 24px, label 16px/500. |
| **Check Out** | Full-width, 56px tall. Transparent bg, border-strong border. Text: brand-300. |
| **Footer** | "Powered by Duali" — 12px, brand-400, centered, 16px from bottom. |

### 4.3 Idle Animation

- QR scan frame corner brackets pulse slowly (opacity 0.6→1.0, 2s cycle)
- Clock updates every second
- After 5 min idle: dim screen to 30% brightness
- On touch: restore brightness, no other effect (stays on home)

### 4.4 Transitions

| Action | Transition |
|--------|-----------|
| Tap "Check In" | Slide left, 300ms ease-out |
| Tap "Clock In" | Slide left, 300ms ease-out |
| Tap "Directory" | Slide left, 300ms ease-out |
| Tap "Check Out" | Slide left, 300ms ease-out |
| QR detected | Flash green border on scan frame → auto-navigate to appropriate flow |
| Language toggle | Instant text swap, no animation |

---

## 5. Visitor Check-in Flow

### 5.1 Screen 1 — Welcome / Scan QR or Manual Entry

```
┌─────────────────────────────────────────────────────┐
│  [←]                        ĐĂNG KÝ KHÁCH  [VI/EN] │ ← Header: 56px
├─────────────────────────────────────────────────────┤
│                                                     │
│              Chào mừng! / Welcome!                  │ ← 28px, 600
│                                                     │
│              ┌─────────────────────┐                │
│              │                     │                │
│              │    ╔═══════════╗    │                │ ← QR scan frame: 240×240px
│              │    ║           ║    │                │
│              │    ║  CAMERA   ║    │                │
│              │    ║  PREVIEW  ║    │                │
│              │    ║           ║    │                │
│              │    ╚═══════════╝    │                │
│              │                     │                │
│              └─────────────────────┘                │
│                                                     │
│         Quét mã QR từ email mời                     │ ← 16px, brand-200
│         Scan QR from invitation email               │
│                                                     │
│          ─────── hoặc / or ───────                  │ ← Divider with text
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  ⌨  NHẬP MÃ / ENTER CODE                    │  │ ← 64px button, secondary
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  ✏️  ĐĂNG KÝ MỚI / NEW REGISTRATION         │  │ ← 64px button, ghost
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Specifications:**

| Element | Spec |
|---------|------|
| **Header** | 56px tall. Back arrow (48×48px touch target, 24px icon). Title centered 20px/600. Language toggle right. |
| **QR frame** | 240×240px. Live camera preview. Green flash + haptic on successful scan. |
| **Enter Code button** | Opens numeric keypad overlay (see §10.3). Visitor enters 6-digit invite code. |
| **New Registration** | Manual walkup visitor — skips to purpose/host selection. |

### 5.2 Screen 2 — Select Purpose / Host Lookup

```
┌─────────────────────────────────────────────────────┐
│  [←]                        MỤC ĐÍCH / PURPOSE     │
├─────────────────────────────────────────────────────┤
│                                                     │
│         Bạn đến vì mục đích gì?                     │ ← 20px, 500
│         What is your visit purpose?                  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🤝  HỌP / MEETING                           │  │ ← 72px, surface-1
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  📦  GIAO HÀNG / DELIVERY                    │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🔧  BẢO TRÌ / MAINTENANCE                   │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🎤  PHỎNG VẤN / INTERVIEW                   │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  📋  KHÁC / OTHER                            │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

On purpose selection → **Host Lookup Sub-screen:**

```
┌─────────────────────────────────────────────────────┐
│  [←]                    NGƯỜI TIẾP / HOST           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🔍  Tìm người tiếp / Search host...         │  │ ← Input: 56px tall
│  └───────────────────────────────────────────────┘  │   Tapping opens alpha keyboard
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  ┌────┐                                     │    │
│  │  │ AV │  Nguyễn Văn A                       │    │ ← 72px row, avatar 48px
│  │  │    │  Phòng Kỹ thuật / Engineering       │    │   Name: 18px/500
│  │  └────┘                                     │    │   Dept: 14px, brand-300
│  ├─────────────────────────────────────────────┤    │
│  │  ┌────┐                                     │    │
│  │  │ TH │  Trần Hoàng B                       │    │
│  │  │    │  Phòng Kinh doanh / Sales           │    │
│  │  └────┘                                     │    │
│  ├─────────────────────────────────────────────┤    │
│  │  ┌────┐                                     │    │
│  │  │ LM │  Lê Minh C                          │    │
│  │  │    │  Phòng Nhân sự / HR                 │    │
│  │  └────┘                                     │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Chọn người bạn muốn gặp                           │ ← 14px hint
│  Select the person you're visiting                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Specifications:**

| Element | Spec |
|---------|------|
| **Purpose buttons** | Full-width, 72px tall each, surface-1 bg, 12px gap. Icon 28px + label 18px/500. Max 5 visible (no scroll). |
| **Search input** | 56px tall, surface-2 bg, 18px text. On tap → full alpha keyboard (§10.4). |
| **Host results** | 72px row height. Avatar 48px (initials, manage-domain color bg). Name 18px/500, dept 14px/brand-300. Max 4 results visible. |
| **Selection** | Tap host → accent-600 border highlight → auto-advance after 500ms. |

### 5.3 Screen 3 — Photo Capture

```
┌─────────────────────────────────────────────────────┐
│  [←]                         CHỤP ẢNH / PHOTO      │
├─────────────────────────────────────────────────────┤
│                                                     │
│         Vui lòng nhìn vào camera                    │ ← 20px, 500
│         Please look at the camera                    │
│                                                     │
│              ┌─────────────────────┐                │
│              │                     │                │
│              │                     │                │
│              │    CAMERA PREVIEW   │                │ ← 280×280px, radius 12px
│              │    (front-facing)   │                │   Face guide overlay (oval)
│              │                     │                │
│              │                     │                │
│              └─────────────────────┘                │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  📸  CHỤP ẢNH / TAKE PHOTO                  │  │ ← 72px, accent-600
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  ⏭  BỎ QUA / SKIP                           │  │ ← 56px, ghost (if optional)
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**After capture → preview with retake option:**

```
              ┌─────────────────────┐
              │                     │
              │   CAPTURED PHOTO    │  ← Same 280×280px
              │                     │
              └─────────────────────┘

  ┌──────────────────┐  ┌──────────────────┐
  │  🔄 CHỤP LẠI    │  │  ✓ XÁC NHẬN     │  ← 64px, 2-column
  │  Retake          │  │  Confirm         │     Left: secondary, Right: success
  └──────────────────┘  └──────────────────┘
```

### 5.4 Screen 4 — NDA / Agreement (if required)

```
┌─────────────────────────────────────────────────────┐
│  [←]                     THỎA THUẬN / AGREEMENT    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  │  THỎA THUẬN BẢO MẬT / NDA                    │  │ ← Card: surface-1
│  │                                               │  │   Title: 20px/600
│  │  Bằng việc ký dưới đây, bạn đồng ý:          │  │
│  │                                               │  │   Body: 16px, scrollable
│  │  • Không chụp ảnh trong khu vực hạn chế       │  │   Max height: 300px
│  │  • Không chia sẻ thông tin mật                 │  │
│  │  • Tuân thủ quy định an ninh                   │  │
│  │                                               │  │
│  │  By signing below, you agree to:               │  │
│  │  • No photography in restricted areas          │  │
│  │  • No sharing of confidential info             │  │
│  │  • Comply with security regulations            │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │          ✍ SIGNATURE AREA                     │  │ ← 120px tall, border-strong
│  │          (draw with finger)                    │  │   border, radius 12px
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │  🗑 XÓA / CLEAR │  │  ✓ ĐỒNG Ý       │        │ ← 64px, 2-column
│  └──────────────────┘  │  I AGREE         │        │   Clear: secondary
│                        └──────────────────┘        │   Agree: success (green)
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.5 Screen 5 — Badge Printing Confirmation

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    ⏳                               │ ← Animated spinner: 64px
│                                                     │   accent-500, 2px stroke
│              Đang in thẻ khách...                    │ ← 20px, 500
│              Printing visitor badge...               │
│                                                     │
│              ┌─────────────────────┐                │
│              │  ┌────┐             │                │ ← Badge preview card
│              │  │FOTO│ Nguyễn A    │                │   surface-1, 200px wide
│              │  └────┘ Khách / Vis │                │
│              │  19/02/2026         │                │
│              │  Host: Trần B       │                │
│              └─────────────────────┘                │
│                                                     │
│              ████████████████████                    │ ← Progress bar: 4px tall
│              ██████████░░░░░░░░░░                    │   accent-500 fill
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

After printing completes → auto-advance to welcome (2s delay).

### 5.6 Screen 6 — Welcome Message + Directions

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    ✅                               │ ← Success icon: 80px
│                                                     │   success color, animated
│              Chào mừng, Nguyễn A!                   │ ← 28px, 600
│              Welcome, Nguyen A!                      │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  │  🏢  Tầng 5, Phòng họp Lotus                 │  │ ← Directions card
│  │      Floor 5, Meeting Room Lotus              │  │   surface-1, 20px text
│  │                                               │  │
│  │  👤  Người tiếp: Trần Hoàng B                │  │
│  │      Host: Tran Hoang B                       │  │
│  │                                               │  │
│  │  🛗  Thang máy bên trái                       │  │
│  │      Elevator on the left                      │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│         Vui lòng nhận thẻ và đợi người tiếp         │ ← 16px, brand-200
│         Please take your badge and wait for host     │
│                                                     │
│              Tự động về trang chủ: 10s              │ ← 14px, brand-400
│              Auto-return to home: 10s                │   Countdown
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Specifications:**

| Element | Spec |
|---------|------|
| **Success icon** | 80px checkmark circle. Scale 0→1 + opacity animation, 500ms, ease-spring. |
| **Name** | 28px, 600, white. |
| **Directions card** | Surface-1, 24px padding, 12px radius. Icon 24px + text 18px per line. |
| **Auto-return** | 10s countdown. Progress ring around timer text. Returns to idle. |
| **Host notification** | Device sends access.log event → server processes → push notification to host's mobile app. |

---

## 6. Attendance Clock-in Flow

### 6.1 Screen 1 — Recognition

```
┌─────────────────────────────────────────────────────┐
│  [←]                        CHẤM CÔNG / CLOCK IN   │
├─────────────────────────────────────────────────────┤
│                                                     │
│              Vui lòng xác thực                       │ ← 20px, 500
│              Please authenticate                     │
│                                                     │
│              ┌─────────────────────┐                │
│              │                     │                │
│              │   CAMERA PREVIEW    │                │ ← 280×280px
│              │   (face detection   │                │   Face detection overlay:
│              │    oval overlay)    │                │   Green when face detected
│              │                     │                │
│              └─────────────────────┘                │
│                                                     │
│         ─────── hoặc / or ───────                   │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │  💳 THẺ / CARD  │  │  👆 VÂN TAY     │        │ ← 72px, 2-column
│  │  Tap card        │  │  Fingerprint     │        │   surface-1
│  └──────────────────┘  └──────────────────┘        │
│                                                     │
│         Quẹt thẻ hoặc đặt vân tay                   │ ← 14px, brand-300
│         Tap card or place fingerprint                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behavior (Offline-First Local Matching):**
- Face recognition is **passive** — camera continuously scans against the **local person DB** (synced from server). When face matches locally → auto-advance. No server round-trip needed.
- Face detection oval turns green (#22C55E border) when face is detected, blue (#3B82F6) when matched against local DB.
- Card/fingerprint options are tap-to-activate (reader matches against local credential store).
- **All matching happens on-device in < 50ms.** The device never sends credentials to the server for decision-making. Server only receives event logs after the fact.

### 6.2 Screen 2 — Confirmation

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    ✅                               │ ← 80px success icon
│                                                     │
│              ┌────────────────────┐                 │
│              │     ┌────────┐    │                 │
│              │     │  PHOTO │    │                 │ ← Avatar: 96px circle
│              │     └────────┘    │                 │
│              │                    │                 │
│              │  Nguyễn Văn A      │                 │ ← 24px, 600, white
│              │  Phòng Kỹ thuật    │                 │ ← 16px, brand-200
│              │  Engineering       │                 │
│              └────────────────────┘                 │
│                                                     │
│                   08:32:15                           │ ← 48px, 700, tabular-nums
│                                                     │   accent-500 (on time)
│              ┌────────────────────┐                 │
│              │  ✓  ĐÚNG GIỜ      │                 │ ← Status badge: 48px tall
│              │     ON TIME        │                 │   success bg, white text
│              └────────────────────┘                 │   20px, 600
│                                                     │
│              Tự động về: 5s                          │ ← Auto-return countdown
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.3 Status Variants

| Status | Color | Icon | Label VI | Label EN |
|--------|-------|------|----------|----------|
| On time | `--success` #22C55E | ✓ | ĐÚNG GIỜ | ON TIME |
| Late | `--warning` #EAB308 | ⚠ | TRỄ (+ minutes) | LATE (+Xm) |
| Early | `--info` #3B82F6 | ℹ | SỚM (+ minutes) | EARLY (+Xm) |
| Overtime | `--domain-operate` #F59E0B | 🕐 | TĂNG CA | OVERTIME |

**Timing:** Screen displays for 5 seconds, then auto-returns to home.

---

## 7. Directory Lookup

### 7.1 Screen 1 — Search

```
┌─────────────────────────────────────────────────────┐
│  [←]                         DANH BẠ / DIRECTORY    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🔍  Tìm theo tên hoặc phòng ban...          │  │ ← 56px input
│  │      Search by name or department...          │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ── PHÒNG BAN / DEPARTMENTS ──                      │ ← Quick filter: 16px label
│                                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │  KT  │ │  KD  │ │  NS  │ │  IT  │              │ ← 64×64px pills
│  │ Eng. │ │Sales │ │  HR  │ │  IT  │              │   surface-1, 14px
│  └──────┘ └──────┘ └──────┘ └──────┘              │   Scrollable horizontal
│                                                     │
│  ── KẾT QUẢ / RESULTS ──                           │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  ┌────┐  Nguyễn Văn A                      │    │ ← 80px row
│  │  │ AV │  Phòng Kỹ thuật · Tầng 5           │    │   Avatar 56px
│  │  └────┘  Engineering · Floor 5              │    │   Name: 18px/500
│  ├─────────────────────────────────────────────┤    │   Dept+floor: 14px
│  │  ┌────┐  Trần Hoàng B                      │    │
│  │  │ TH │  Phòng Kinh doanh · Tầng 3         │    │
│  │  └────┘  Sales · Floor 3                    │    │
│  ├─────────────────────────────────────────────┤    │
│  │  ┌────┐  Lê Minh C                          │    │
│  │  │ LM │  Phòng Nhân sự · Tầng 4            │    │
│  │  └────┘  HR · Floor 4                       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 7.2 Screen 2 — Person Card

```
┌─────────────────────────────────────────────────────┐
│  [←]                                        [VI/EN] │
├─────────────────────────────────────────────────────┤
│                                                     │
│              ┌────────────┐                         │
│              │            │                         │ ← Photo: 120×120px circle
│              │   PHOTO    │                         │
│              │            │                         │
│              └────────────┘                         │
│                                                     │
│              Nguyễn Văn A                            │ ← 24px, 600, white
│              Trưởng phòng / Manager                  │ ← 16px, brand-300
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🏢  Phòng Kỹ thuật / Engineering            │  │ ← Info card: surface-1
│  │  📍  Tầng 5, Khu A / Floor 5, Zone A         │  │   Each row: 48px
│  │  📧  nguyen.a@company.com                     │  │   Icon 24px + text 16px
│  │  📞  Ext. 5012                                │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │  📞 GỌI / CALL  │  │  🔔 THÔNG BÁO   │        │ ← 72px, 2-column
│  │                  │  │  NOTIFY          │        │   Call: accent-600
│  └──────────────────┘  └──────────────────┘        │   Notify: success
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 7.3 Screen 3 — Call / Notify Confirmation

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    📞                               │ ← 80px icon, animated pulse
│                                                     │
│              Đang gọi Nguyễn Văn A...               │ ← 20px, 500
│              Calling Nguyen Van A...                  │
│                                                     │
│              ┌────────────────────┐                 │
│              │  🔴 HỦY / CANCEL │                 │ ← 64px, error bg
│              └────────────────────┘                 │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Notify variant:** Shows bell icon + "Đã gửi thông báo / Notification sent" confirmation with checkmark, auto-returns after 5s.

---

## 8. Visitor Check-out

### 8.1 Screen 1 — Scan Badge or Search

```
┌─────────────────────────────────────────────────────┐
│  [←]                         TRẢ THẺ / CHECK OUT   │
├─────────────────────────────────────────────────────┤
│                                                     │
│              ┌─────────────────────┐                │
│              │    ╔═══════════╗    │                │ ← QR/barcode scan frame
│              │    ║  SCAN     ║    │                │   200×200px
│              │    ║  BADGE    ║    │                │
│              │    ╚═══════════╝    │                │
│              └─────────────────────┘                │
│                                                     │
│         Quét thẻ khách để trả                        │ ← 16px
│         Scan visitor badge to check out              │
│                                                     │
│          ─────── hoặc / or ───────                  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  🔍  TÌM TÊN / SEARCH BY NAME               │  │ ← 64px, secondary
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.2 Screen 2 — Confirm Check-out

```
┌─────────────────────────────────────────────────────┐
│  [←]                         XÁC NHẬN / CONFIRM    │
├─────────────────────────────────────────────────────┤
│                                                     │
│              ┌────────────────────┐                 │
│              │  ┌────┐           │                 │
│              │  │FOTO│           │                 │ ← Visitor card: surface-1
│              │  └────┘           │                 │   Photo 64px
│              │  Nguyễn A         │                 │
│              │  Khách / Visitor  │                 │
│              │                    │                 │
│              │  Vào:  08:30      │                 │ ← Check-in time
│              │  Ra:   11:45      │                 │ ← Current time
│              │  Thời gian: 3h15  │                 │ ← Duration
│              └────────────────────┘                 │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  ✓  XÁC NHẬN TRẢ THẺ / CONFIRM CHECK OUT    │  │ ← 72px, accent-600
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.3 Screen 3 — Thank You

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    👋                               │ ← 80px emoji/icon
│                                                     │
│              Cảm ơn bạn đã ghé thăm!               │ ← 28px, 600
│              Thank you for visiting!                 │
│                                                     │
│              Hẹn gặp lại!                           │ ← 20px, brand-200
│              See you again!                          │
│                                                     │
│              Tự động về: 5s                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 9. Admin / Settings

### 9.1 PIN Gate

```
┌─────────────────────────────────────────────────────┐
│  [←]                                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│                    🔒                               │ ← 64px icon
│                                                     │
│              Nhập mã PIN quản trị                    │ ← 20px
│              Enter admin PIN                         │
│                                                     │
│              ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐        │ ← 6 dots, 16px each
│              │● │ │● │ │○ │ │○ │ │○ │ │○ │        │   Filled = entered
│              └──┘ └──┘ └──┘ └──┘ └──┘ └──┘        │
│                                                     │
│         ┌──────┐ ┌──────┐ ┌──────┐                 │
│         │  1   │ │  2   │ │  3   │                 │ ← Numeric keypad
│         │      │ │ ABC  │ │ DEF  │                 │   72×72px buttons
│         └──────┘ └──────┘ └──────┘                 │   8px gap
│         ┌──────┐ ┌──────┐ ┌──────┐                 │   surface-1 bg
│         │  4   │ │  5   │ │  6   │                 │   28px number
│         │ GHI  │ │ JKL  │ │ MNO  │                 │
│         └──────┘ └──────┘ └──────┘                 │
│         ┌──────┐ ┌──────┐ ┌──────┐                 │
│         │  7   │ │  8   │ │  9   │                 │
│         │ PQRS │ │ TUV  │ │ WXYZ │                 │
│         └──────┘ └──────┘ └──────┘                 │
│         ┌──────┐ ┌──────┐ ┌──────┐                 │
│         │      │ │  0   │ │  ⌫  │                 │
│         │      │ │      │ │      │                 │
│         └──────┘ └──────┘ └──────┘                 │
│                                                     │
│  3 lần sai sẽ khóa 5 phút                          │ ← 14px, warning color
│  3 wrong attempts locks for 5 min                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Security:** 3 wrong attempts → 5 min lockout. Shake animation on wrong PIN. Haptic feedback.

### 9.2 Settings Panel

```
┌─────────────────────────────────────────────────────┐
│  [←]                    CÀI ĐẶT / SETTINGS         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  📱  ĐĂNG KÝ THIẾT BỊ / DEVICE REGISTRATION │  │ ← 72px rows
│  │      Device ID: DM-T001  ✅ Connected         │  │   surface-1
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🌐  MẠNG / NETWORK                          │  │
│  │      WiFi: DualiOffice  Signal: ████░ 85%    │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🖥  MÀN HÌNH / DISPLAY                      │  │
│  │      Brightness: ████████░░ 80%               │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🌍  NGÔN NGỮ / LANGUAGE                     │  │
│  │      Mặc định: Tiếng Việt                     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  🔄  CẬP NHẬT / SOFTWARE UPDATE              │  │
│  │      Version: 3.0.1  ✅ Up to date           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  📋  NHẬT KÝ / DEVICE LOG                    │  │
│  │      View diagnostic logs                      │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Each row taps into a detail screen. Admin sessions timeout after 120s inactivity.

---

## 10. Shared Components

### 10.1 Header Bar

```
┌─────────────────────────────────────────────────────┐
│  [←]                    SCREEN TITLE        [VI/EN] │
└─────────────────────────────────────────────────────┘
```

| Element | Spec |
|---------|------|
| Height | 56px |
| Background | brand-800 (#111827) |
| Back button | 48×48px touch target, 24px chevron-left icon, brand-200 |
| Title | 20px, 600, white, centered |
| Language toggle | 48×48px, pill shape, brand-600 bg, 14px text |
| Bottom border | 1px solid brand-700 |

### 10.2 Timeout Warning Toast

```
┌───────────────────────────────────────────────────┐
│  ⏱  Phiên sẽ hết hạn trong 30 giây               │ ← Warning toast
│     Session expires in 30 seconds                  │   warning left-border 3px
│                    [TIẾP TỤC / CONTINUE]          │   48px button inside
└───────────────────────────────────────────────────┘
```

- Appears at 30s remaining of 60s timeout
- Full-width, fixed bottom, 80px tall
- Warning bg (warning-muted), warning left border
- "Continue" button resets timer

### 10.3 Numeric Keypad Overlay

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  NHẬP MÃ / ENTER CODE                        │  │
│  │                                               │  │
│  │           ┌──────────────────┐                │  │ ← Input display: 48px tall
│  │           │  3 8 _ _ _ _    │                │  │   28px, tabular-nums
│  │           └──────────────────┘                │  │
│  │                                               │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                  │  │
│  │  │  1   │ │  2   │ │  3   │                  │  │ ← Same keypad as PIN
│  │  └──────┘ └──────┘ └──────┘                  │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                  │  │
│  │  │  4   │ │  5   │ │  6   │                  │  │
│  │  └──────┘ └──────┘ └──────┘                  │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                  │  │
│  │  │  7   │ │  8   │ │  9   │                  │  │
│  │  └──────┘ └──────┘ └──────┘                  │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                  │  │
│  │  │ HỦY  │ │  0   │ │  ⌫  │                  │  │ ← Cancel / 0 / Backspace
│  │  │Cancel│ │      │ │      │                  │  │
│  │  └──────┘ └──────┘ └──────┘                  │  │
│  │                                               │  │
│  │  ┌───────────────────────────────────────┐    │  │
│  │  │  ✓  XÁC NHẬN / CONFIRM              │    │  │ ← 64px, accent-600
│  │  └───────────────────────────────────────┘    │  │   Enabled when 6 digits
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 10.4 Alpha Keyboard

Full-screen overlay. Use Android system keyboard in kiosk mode with these customizations:

| Property | Value |
|----------|-------|
| Theme | Dark, matching brand-800 bg |
| Key height | 56px minimum |
| Layout | Vietnamese QWERTY with diacritics |
| Suggestions | Show name/department suggestions from directory |
| Dismiss | Tap outside input or "Done" key |

### 10.5 Loading Spinner

| Context | Size | Style |
|---------|------|-------|
| Page transition | 48px | Centered, accent-500, 2px stroke |
| Button loading | 24px | Inside button, replaces icon |
| Badge printing | 48px + progress bar | Spinner above, bar below |

### 10.6 Error Dialog

```
┌───────────────────────────────────────────────┐
│                                               │
│                  ❌                           │ ← 64px, error color
│                                               │
│     Không tìm thấy mã QR                      │ ← 20px, 600
│     QR code not found                          │
│                                               │
│     Vui lòng thử lại hoặc nhập mã thủ công    │ ← 16px, brand-200
│     Please try again or enter code manually    │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │  🔄  THỬ LẠI / TRY AGAIN              │  │ ← 64px, accent-600
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │  🏠  VỀ TRANG CHỦ / GO HOME           │  │ ← 56px, ghost
│  └─────────────────────────────────────────┘  │
│                                               │
└───────────────────────────────────────────────┘
```

---

## 11. Interaction Patterns

### 11.1 Screen Transitions

| Transition | Animation | Duration |
|-----------|-----------|----------|
| Forward navigation | Slide left | 300ms, ease-out |
| Back navigation | Slide right | 300ms, ease-out |
| Modal/overlay open | Slide up + fade | 300ms, ease-out |
| Modal/overlay close | Slide down + fade | 200ms, ease-in |
| Success screen appear | Fade in + scale(0.9→1) | 400ms, ease-spring |
| Auto-return to home | Fade out | 500ms, ease-in |

### 11.2 Feedback

| Action | Feedback |
|--------|----------|
| Button tap | Scale 0.97 + haptic (light) |
| QR recognized | Green flash on frame + haptic (medium) + chime |
| Face recognized | Blue flash on oval + haptic (medium) |
| Error | Red flash + shake animation + haptic (heavy) |
| PIN digit entered | Dot fills + haptic (light) |
| Wrong PIN | Dots shake + clear + haptic (heavy) |

### 11.3 Auto-Timeout Rules

| Screen | Timeout | Warning At | Returns To |
|--------|---------|-----------|------------|
| Any flow screen | 60s | 30s | Home |
| Success/Thank you | 10s | None | Home |
| Clock-in confirmation | 5s | None | Home |
| Admin settings | 120s | 60s | Home |
| Home/Idle | Never | — | — |

### 11.4 Language Toggle Behavior

- Toggle persists for current session only
- Returns to default language (set in admin) on timeout/home return
- All screens bilingual: Vietnamese primary, English secondary (smaller, brand-300)
- Toggle is always visible in header (48×48px, top-right)
- Tap instantly swaps all text — no page reload

---

## 12. Error & Edge Cases

### 12.1 Network Offline

```
┌───────────────────────────────────────────────┐
│                                               │
│                  📡                           │ ← 64px, warning color
│                                               │
│     Mất kết nối mạng                          │
│     Network connection lost                    │
│                                               │
│     Đang thử kết nối lại...                   │
│     Reconnecting...                            │
│                                               │
│              ████░░░░░░ (spinner)             │
│                                               │
│     Chấm công offline sẽ được đồng bộ sau    │ ← 14px, brand-300
│     Offline clock-ins will sync later          │
│                                               │
└───────────────────────────────────────────────┘
```

- **All access decisions work offline** — device matches credentials against local person DB. This is the normal mode, not a fallback.
- Clock-in works offline (stores locally, syncs when reconnected)
- Visitor check-in with pre-registered QR works offline (visitor data synced to device in advance)
- Walk-up visitor registration may require network for host lookup (shows retry option)

### 12.2 Camera Unavailable

- Show static placeholder with message: "Camera không khả dụng / Camera unavailable"
- Skip photo capture step automatically
- Offer manual code entry for check-in

### 12.3 Printer Error

- Badge printing screen shows error with retry button
- "Skip printing" option available
- Badge can be printed later from reception web console

### 12.4 Unrecognized Face / Card

```
┌───────────────────────────────────────────────┐
│                                               │
│                  ❓                           │
│                                               │
│     Không nhận diện được                       │
│     Not recognized                             │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │  🔄  THỬ LẠI / TRY AGAIN              │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │  ⌨  NHẬP MÃ NV / ENTER EMPLOYEE ID    │  │
│  └─────────────────────────────────────────┘  │
│                                               │
└───────────────────────────────────────────────┘
```

### 12.5 Screen Burn-in Prevention

- Idle screen shifts content by ±4px every 5 minutes
- QR scan frame animation provides constant pixel variation
- Clock display position subtly drifts

---

*Terminal UI/UX Design v1.0 — Duall Master 3.0*  
*Created February 2026*
