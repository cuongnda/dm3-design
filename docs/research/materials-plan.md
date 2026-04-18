# Duall Master 3.0 — Material Production Plan

## Overview
Three major deliverables, all consistent with Vision v2 (Three Domains architecture):

### Stream A: System Architecture Design
Research-heavy, technical document defining HOW to build the platform.

### Stream B: Marketing Website  
Product introduction website, SEO-optimized, for prospects/partners.

### Stream C: UI/UX Design System
Complete design system + screens for Web App, Mobile App, Terminal App.

---

## Task Breakdown

### Stream A: System Architecture Design
**Dependency:** Vision v2 doc (done)

| # | Task | Description | Depends On |
|---|------|-------------|------------|
| A1 | Tech Stack Research | Research & compare tech stacks for each component: backend, frontend, mobile, IoT/MQTT, AI/ML, video, database. Benchmark against competitors. | - |
| A2 | System Architecture Document | Complete architecture: microservices vs monolith, API design, data flow, deployment (on-prem/cloud/hybrid), device integration layer, MQTT/protocol layer, AI pipeline. Include diagrams. | A1 |
| A3 | Tech Stack Recommendation | Final recommendation with justification: languages, frameworks, databases, message brokers, AI stack, DevOps. Include cost analysis. | A1 |

### Stream B: Marketing Website
**Dependency:** Vision v2 doc (done), Design System (C1)

| # | Task | Description | Depends On |
|---|------|-------------|------------|
| B1 | SEO & Content Strategy | Keyword research for building security/facility management. Content plan: pages, meta, URL structure. Competitor website analysis. | - |
| B2 | Website Copywriting | All page content: Home, Product (3 domains + Smart + Platform), Solutions (by segment), Pricing, About, Contact. SEO-optimized. | B1 |
| B3 | Website Design & Build | Design + code the marketing site. Responsive, fast, SEO-optimized. Modern design consistent with design system. | B1, B2, C1 |

### Stream C: UI/UX Design System
**Dependency:** Vision v2 doc (done)

| # | Task | Description | Depends On |
|---|------|-------------|------------|
| C1 | Design System Foundation | Color palette, typography, spacing, icons, component library spec. Dark theme (cyber security vibe). Consistent across web/mobile/terminal. | - |
| C2 | Web App UI/UX Design | Complete screen designs for Web Console: Dashboard, each module in SECURE/MANAGE/OPERATE, AI Assistant panel, settings. Responsive. | C1 |
| C3 | Mobile App UI/UX Design | Screen designs for both Admin app and Resident/Tenant app. iOS/Android patterns. | C1 |
| C4 | Terminal App UI/UX Design | Android terminal kiosk interface: visitor check-in, attendance, directory. Touch-optimized, large UI. | C1 |
| C5 | Guard Station UI/UX Design | Dedicated guard interface: multi-camera, intercom, events, AI voice assistant. Desktop/large screen optimized. | C1 |

---

## Execution Order
1. **Phase 1 (parallel):** A1 + B1 + C1 (all independent research/foundation)
2. **Phase 2 (parallel):** A2 + A3 + B2 + C2 + C3 + C4 + C5
3. **Phase 3:** B3 (needs B2 + C1)

## Notes
- All materials must reference Vision v2 consistently
- Three Domains branding: SECURE 🔒 / MANAGE 👤 / OPERATE 🏢 / SMART 🧠 / PLATFORM ⚙️
- Design language: clean, modern, dark-first cyber security theme
