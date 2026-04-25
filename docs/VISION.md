# Duall Master — Product Vision

**Document Type:** Product Vision  
**Version:** 3.1  
**Date:** April 2026  
**Status:** Working narrative for product, marketing, and UX alignment

---

## Naming note

- **Duall Master** is the product name used in customer, partner, sales, and marketing materials.
- **DM3** is the internal project codename / program codename.
- In this document, product-facing narrative uses **Duall Master**. Use **DM3** only where internal implementation context matters.

---

## 1. Vision in one line

> **Duall Master is a building operations and security command platform for modern sites.**

By *modern sites* we mean offices, campuses, residential and mixed-use complexes, industrial facilities, and security-sensitive environments — see §5 for the full set of deployment contexts.

Duall Master brings access, identity, devices, spaces, and daily operations into one realtime system teams can actually use.

It is not a bundle of disconnected features. It is a shared platform foundation with modular products on top, so customers can start with the jobs they need today and expand without changing systems.

---

## 2. What Duall Master is becoming

Duall Master is moving from a traditional access-control story to a clearer product truth:

- **platform-based** at the core
- **module-based** in how customers buy and adopt
- **security-grade** in architecture and trust model
- **realtime** in operator experience
- **flexible by deployment and vertical context** without fragmenting the backend

This matters because physical security and site operations do not happen in silos. A door event, a visitor arrival, a parking session, a camera alert, and an operator action are often part of the same operating picture.

Duall Master should feel like the command layer for that picture.

Two to three years out, a product team should be able to picture Duall Master as the live operating system for a site or portfolio: one command surface where doors, cameras, intercom, parking, attendance, visitors, alerts, and investigations all resolve into the same timeline. An operator can move from signal to context to action without switching systems. A site admin can turn on new modules without replatforming. A vertical team can shape the experience for its market without forking the backend truth. The result should feel calm, fast, and trustworthy under real operating pressure.

---

## 3. Positioning

### Category

Duall Master is a **building operations and security command platform**.

“Command platform” remains the distinctive idea, but it should stay anchored to recognizable buyer language: building operations, physical security, access control, visitor management, parking, Video Management (VMS), and related site workflows.

### Practical definition

A unified software platform that connects:

- access control
- identity and visitor flows
- Video Management (VMS) and Video Intercom operations
- parking and movement
- attendance and workforce events
- alerts, audit, and command actions
- AI-assisted investigation, search, and operator workflows
- future operational modules as needed

### Why this framing fits

- It matches the architecture: one backend, shared data model, shared realtime/event infrastructure.
- It matches the product direction: modules can be enabled and expanded over time.
- It matches buyer behavior: adoption is usually incremental, not all at once.
- It is more searchable and recognizable than “command platform” alone while keeping Duall Master’s own point of view.

---

## 4. Product truth

Duall Master should always be explained through four layers:

### 4.1 Platform foundation

The common foundation every module depends on.

**Core capabilities**
- identity, auth, RBAC, and tenant isolation
- device connectivity and provisioning
- realtime events and live status
- audit trail and operational history
- shared APIs and integrations
- shared console and shared UI system
- deployment flexibility: on-premise, cloud, hybrid
- security controls and policy enforcement

This foundation is what makes Duall Master coherent. It is why adding a new module strengthens the product instead of creating another silo.

### 4.2 Modules

Modules are the customer-facing products.

Customers do not adopt “the whole vision” on day one. They adopt Duall Master through modules that solve immediate operational jobs.

**Current and committed module portfolio**
- **Access Control**
- **Visitor Management**
- **Attendance**
- **Parking**
- **Video Management (VMS)**
- **Video Intercom**
- additional modules over time for intrusion, maintenance, room/space operations, and more

§12 reflects current product truth, rollout depth, and the near-term roadmap around these modules.

Modules are the customer entry point into Duall Master. Section 8 covers how that adoption motion works in practice.

### 4.3 Intelligence and operator assistance layer

AI belongs in Duall Master as a cross-cutting capability layered across the platform and modules, not as a replacement for the core product model.

It should strengthen how operators understand events, investigate incidents, and coordinate response while keeping humans in control.

**Role of AI in Duall Master**
- natural-language search and query across events, devices, identities, sites, and operations
- incident summarization and shift handoff drafting grounded in system records
- anomaly spotting and unusual-pattern detection across access, attendance, parking, video, and device signals
- investigation assistance, including timeline reconstruction and linked-event review
- operator copilots that guide response steps, checklists, and next-best actions
- policy, workflow, and configuration suggestions with reviewable rationale

These describe the direction Duall Master is actively building toward. Specific capabilities ship per module roadmap; §12 reflects which are live today vs. emerging.

**How AI surfaces in the product**
- inline within modules (search box, "summarize this incident," anomaly badges, suggested next actions)
- as a dedicated investigation and operator-assistance workspace for cross-module work
- through APIs and audit hooks so operations teams can review and govern AI-assisted actions

**Principles**
- assistive, not autonomous
- explainable, reviewable, and audit-friendly
- grounded in tenant-scoped data and explicit permissions
- security-grade in handling, deployment, and trust model

This intelligence layer should make every module more useful without changing the platform-first, module-based structure.

### 4.4 Value pillars

The market still needs a simple mental model for the value Duall Master creates:

- **Secure** — protect people, sites, and assets
- **Operate** — run sites in realtime
- **Manage** — organize identities, permissions, and workflows

These pillars are for messaging, not primary product structure.

**Key rule:**
- **Navigation / IA should be module-based**
- **Value communication can still use Secure / Operate / Manage**

Customers should discover modules first, then understand the broader value story through the pillars.

---

## 5. Strategic fit: who Duall Master is for

Duall Master should speak clearly to the environments where physical security, operator clarity, and deployment trust matter.

### Target segments / deployment contexts

Duall Master is relevant for teams operating:

- commercial office and multi-site property portfolios
- residential, mixed-use, and community environments
- factories, warehouses, and industrial sites
- campuses, education, and institutional environments
- healthcare, government, and other security-sensitive sites

These are not separate product identities. They are deployment contexts built on the same platform foundation, with module combinations and terminology adjusted as needed.

### Geographic focus

Commercially, Duall Master should focus first on **Vietnam and South Korea**, where deployment flexibility, operational clarity, and security modernization are strong buying drivers. Broader expansion into **Southeast Asia** should follow once the product, channel, and reference-base are stronger in those first two markets.

This sequencing keeps go-to-market focus tight without narrowing the long-term platform ambition.

---

## 6. The product model

### 6.1 Standard description

Use this structure consistently:

> **Duall Master is a building operations and security command platform for modern sites.**  
> It combines a secure platform foundation with modular products such as Access Control, Visitor Management, Attendance, Parking, Video Management (VMS), and Video Intercom.  
> Across those modules, Duall Master adds an assistive intelligence layer for search, investigation, summarization, and guided response.  
> Together, the platform and modules help customers secure sites, operate in realtime, and manage people, movement, and response from one system.

### 6.2 Packaging principle

Duall Master should be packaged so the platform foundation provides the shared identity, device, event, audit, integration, and deployment layer, while modules are independently packaged and licensed based on customer needs.

That supports a simple strategic model:
- one shared platform underneath
- clear modular entry points on top
- expansion without replacement

The specific commercial unit (per-site, per-device, per-seat, or hybrid) is a packaging decision that varies by module and market, and is set outside this document.

### 6.3 What Duall Master should not be described as

Avoid these traps:

- not a loose “all-in-one” claim without explaining the platform foundation
- not a pillar-only product structure that hides actual modules
- not a purely hardware-led story
- not an AI replacement narrative that implies fully autonomous security operations
- not a futuristic AI-first narrative that outruns current product reality
- not a design-led story where visual language does the strategic work

---

## 7. Why the platform matters

The platform story is only credible if it creates practical advantages — these are the ones Duall Master should deliver in concrete ways.

### Shared identity and policy
A user, credential, role, company, and site structure should work across modules.

### Shared realtime operations
Events from devices and services should flow into one live operating picture.

### Shared command surface
Operators should not need separate tools for doors, visitors, cameras, intercom, parking, and alerts.

### Shared intelligence layer
Search, summarization, anomaly review, and guided investigation should work across modules on the same permissioned event and data foundation.

### Shared deployment model
The same product should support cloud, on-premise, and security-sensitive environments.

### Shared extensibility
New modules and vertical-specific frontends should build on the same backend and shared packages.

Here, **vertical-specific frontends** means separate customer-facing apps or UX layers for markets such as residential, education, or industrial operations — each tuned in terminology, workflows, and screens for that context while still using the same backend, data model, permissions, and shared core packages.

This is especially important for Duall Master’s frontend strategy:

- **one backend**
- **shared core packages**
- **vertical-specific frontends when needed**

That strategy only works if the product is clearly understood as platform-based at the core.

### 7.1 Integration and ecosystem stance

Duall Master should be presented as an **open, integration-ready platform**, not as a closed ecosystem that requires customers to replace every surrounding system.

That means the product stance should be:

- **integrate with the existing estate first** where that helps customers adopt faster and reduce switching risk
- **own the operational command layer** where unified workflows, permissions, realtime events, and auditability matter most
- **connect cleanly to adjacent systems** such as cameras, intercoms, identity sources, HR systems, tenant apps, building systems, and reporting environments
- **avoid over-claiming native coverage** for every subsystem when a connector, API, or partner integration is the right answer

In practical terms, the platform claim is credible when Duall Master offers:

- APIs and event streams that let external systems read, write, and react safely
- device and service integrations that bring operational signals into a shared timeline
- role-aware workflows so external events can still land inside governed operator actions
- enough openness that customers can modernize in phases rather than through a single high-risk cutover

The message is not “replace everything.” The message is “unify what matters operationally, integrate where sensible, and expand from a trusted core.”

### 7.2 Partner and delivery model stance

Duall Master should also be presented with a clear **platform-owner plus partner-delivered** model where that reflects how deployments actually happen.

The stance should be:

- **Duall Master remains the product and platform owner**
- **local system integrators, deployment partners, and integration partners are a core delivery motion** for implementation, rollout, site integration, and in-market execution
- **customers should get one accountable platform foundation** with local delivery capability around it
- **partner language should stay practical and evidence-based** — describe qualified, experienced, or in-market partners unless a formal certification program is real and documented

This matters especially in Vietnam, South Korea, and broader Southeast Asia, where local execution, site-specific integration, and phased modernization often shape buying decisions as much as software capability does.

The message is not that Duall Master is only software handed off to others. The message is that Duall Master owns the platform, standards, and product direction while working through local delivery partners to implement, integrate, and scale in-market.

---

## 8. Module strategy

### 8.1 Modules are the adoption path

Customers usually enter through a narrow operational need:

- “We need better access control.”
- “We need visitor management.”
- “We need parking and gate operations.”
- “We need attendance tied to real access events.”
- “We need video tied to live events and incident response.”
- “We need intercom workflows tied to identity, doors, and operator response.”

That means Duall Master should sell, onboard, and present itself in a way that makes modules legible and easy to adopt.

### 8.2 Land-and-expand on one platform

The expected growth path is:

1. customer adopts one or two modules
2. sees operational value quickly
3. expands to adjacent modules
4. eventually standardizes on Duall Master as the command layer for the site or portfolio

This is the business and product logic behind the platform.

---

## 9. Value pillars: Secure / Operate / Manage

These three words remain useful because they map to how buyers think.

### Secure

Duall Master helps customers protect sites, assets, and critical areas through controlled access, live visibility, auditability, and security-grade operations.

**Common proof points**
- access control
- Video Management (VMS), Video Intercom, and event-linked review
- alerts and audit trail
- high-trust deployment options
- role-based control and policy enforcement

### Operate

Duall Master helps teams run sites in realtime, not after the fact.

**Common proof points**
- live status and event feeds
- parking and flow operations
- device health and operational monitoring
- fast response tooling
- cross-module visibility in one console

### Manage

Duall Master helps organizations manage people, permissions, and recurring workflows with less manual work.

**Common proof points**
- identity lifecycle
- visitor flows
- attendance
- tenant/company structure
- provisioning and approval workflows
- AI-assisted summaries, search, and workflow suggestions with human review

These pillars should appear in messaging, sales framing, and homepage storytelling — but the product should still present modules first.

---

## 10. Experience principles

### 10.1 Command, not clutter

Duall Master should feel like an operator’s command surface:

- calm under pressure
- dense but readable
- live, not static
- modern, not flashy
- premium, not decorative

### 10.2 Realtime as a product trait

Duall Master should feel live:

- device and service state
- event feeds
- linked actions
- quick drill-down from signal to response

“Realtime” should be visible in both product behavior and copy.

### 10.3 Security-grade trust

Security is not one module. It is a product property.

Duall Master should communicate trust through:

- tenant isolation
- RBAC and auth rigor
- auditability
- deployment flexibility
- controlled integrations
- operational reliability

### 10.4 Design language with restraint

Duall Master can retain a dark-first, control-room-oriented visual posture, but that should support the product story rather than dominate it.

The tone should feel modern and ambitious without sounding inflated:

- specific over grandiose
- believable over visionary fog
- strong claims backed by system behavior
- premium language without hype

---

## 11. Information architecture guidance

### Primary navigation principle

Organize the product primarily by **modules**, not by value pillars.

Recommended shape:

- Platform overview
- Modules
  - Access Control
  - Visitor Management
  - Attendance
  - Parking
  - Video Management (VMS)
  - Video Intercom
  - future modules
- Intelligence / operator assistance
- Solutions / verticals
- Security / deployment / integrations

### Why

Module-based IA is better for:

- product discovery
- feature comprehension
- packaging and pricing
- onboarding
- future extensibility

Pillar-based IA is still useful as a secondary storytelling layer for:

- homepage narrative
- sales decks
- category framing
- summary sections

---

## 12. Current-state truth vs future ambition

The narrative should stay grounded in what is real now.

### Real now
- multi-service backend deployed across core services on a shared data and event spine
- shared console with module-aware navigation and a shared UI system
- plugin-gated modules per tenant (Visitor Management, Parking, Video Management, Video Intercom, Attendance) wired through RBAC and route registration
- realtime device and event flow over MQTT and NATS JetStream
- multi-tenant by design, with explicit tenant scoping in every data path
- offline-first device behaviour with a seven-day grace period for connectivity loss
- audit trail retained for years on a time-series store, with compression for long-horizon storage
- supported on cloud, on-premise, and security-sensitive deployment environments
- shared frontend packages and a vertical-ready frontend strategy

### Directionally true / emerging (near-term roadmap)
- the **assistive intelligence layer** described in §4.3 (search, summarization, anomaly review, investigation assistance, operator copilots)
- deeper **Video Intercom** rollout, richer intercom workflows, and broader adoption across sites
- more vertical-specific frontends
- richer operational layers across sites and portfolios
- broader module portfolio over time (intrusion, maintenance, room/space operations)

### Not the lead story right now
- design system as a strategic narrative
- speculative AI-first positioning
- claiming a complete future-state stack as if already shipped

The right tone is: **credible now, expandable later**.

---

## 13. Strategic differentiation

Duall Master should be framed against the real market problem: too many teams still operate through fragmented tools, siloed workflows, and disconnected operator experiences.

Duall Master’s differentiation is that it brings those operational layers together on one foundation:

- **platform coherence** instead of fragmented point solutions
- **modular adoption** instead of forcing an all-or-nothing suite decision
- **security-grade assistive intelligence** — explainable, permissioned, and auditable — that helps operators understand and respond faster without moving toward autonomous-agent positioning
- **security-grade trust** for environments where deployment and control matter
- **realtime operations** instead of static admin-only workflows
- **flexible deployment** across cloud, on-premise, and hybrid environments

This should not read like a competitor battlecard. It should read like a practical explanation of why the product model matters.

> **One secure command platform, adopted module by module, for modern site operations and security.**

---

## 14. Message hierarchy

When writing product, sales, or website copy, use this hierarchy:

### Level 1 — category
Duall Master is a building operations and security command platform.

### Level 2 — product truth
Platform foundation + modular products.

### Level 3 — value model
Secure / Operate / Manage.

### Level 4 — proof
Specific modules, AI-assisted capabilities, deployment models, integration readiness, and operational workflows.

If copy skips from a big claim straight to a long feature list, the story weakens. This hierarchy keeps the narrative coherent.

---

## 15. Summary

Duall Master is not just an access-control product with extra features.

It is becoming a **building operations and security command platform** for modern sites:

- a **secure shared foundation**
- a growing set of **modules**, including Video Management and Video Intercom
- a cross-cutting **intelligence and operator assistance layer**
- a clear value story through **Secure / Operate / Manage**
- a **realtime, security-grade** operating model
- a **credible-now, expandable-later** product narrative

That is the story the product, website, and go-to-market material should align to.

---

## 16. Practical glossary

### Duall Master
The product name used externally in sales, marketing, partner, and customer-facing materials.

### DM3
The internal codename / program codename for the Duall Master initiative. Acceptable in engineering, planning, and internal delivery context; avoid as the lead product name in market-facing copy.

### Platform foundation
The shared identity, device, event, audit, integration, and deployment layer that all modules depend on.

### Module
A customer-facing product area packaged on top of the shared platform foundation, such as Access Control, Visitor Management, Parking, or Video Management.

### Command platform
The category framing for Duall Master: a system that unifies operational signals, context, and actions across security and site operations.

### Security-grade
A product quality bar covering tenant isolation, RBAC, auditability, deployment control, and operational trustworthiness.

### Realtime
A product behavior expectation that live status, events, and actions are visible quickly enough to support operational response, not just historical review.

### Vertical-specific frontend
A market-tuned UX layer for a context such as residential, education, or industrial operations, built on the same backend and shared core packages.

### Integration-ready
A practical ecosystem stance in which Duall Master can connect to surrounding systems and devices through APIs, events, and connectors without requiring every customer to replace their entire estate at once.

---

*Edited April 2026 for narrative refinement against current architecture and go-to-market direction. v2.3 adopts VMS as the canonical term for the video module, grounds §12 in concrete architectural truth, and resolves wording drift in the closing differentiation and summary. v2.4 softens VMS to dual phrasing ("Video Management (VMS)") in module-list contexts so readers from mixed backgrounds are not shut out by the acronym, defines "modern sites" inline at §1 rather than waiting for §5, and lightly tightens wording in a few places for clarity. v2.5 makes a final consistency pass so Video Management (VMS) is named more consistently where modules are being described explicitly. v2.6 adds Video Intercom as a first-class module and frames AI as a cross-cutting, security-grade intelligence and operator assistance layer rather than a separate product story. v2.7 reconciles the v2.6 expansion with the "credible now, expandable later" principle: §4.2 is reframed as "Current and near-term module shape" with an explicit §12 cross-reference, §4.3 adds a reality marker plus a "How AI surfaces" subsection so the cross-cutting framing matches the §11 IA dedicated workspace, §12 names Video Intercom and the AI layer explicitly as near-term roadmap, and the §13 differentiator is sharpened from generic "assistive intelligence" to "security-grade assistive intelligence" with the explainable/permissioned/auditable qualifiers that distinguish DM3 from autonomous-agent positioning. v2.8 makes a surgical truth-alignment update: Video Intercom remains part of DM3's committed current module portfolio, §12 now lists it under "Real now" with the plugin-gated modules, and the emerging note is narrowed to rollout depth, richer workflows, and broader adoption rather than the module's existence itself. v2.9 adds a concrete 2-3 year future-state picture in §2, clarifies the strategic meaning of vertical-specific frontends in §7, and states the initial geographic focus in §5 without changing the broader v2.8 structure. v3.0 updates market-facing naming to Duall Master while retaining DM3 as the internal codename, narrows the initial geographic focus to Vietnam and South Korea with Southeast Asia later, adds an explicit integration and ecosystem stance to support the platform claim, and adds a practical glossary for consistent cross-functional usage. v3.1 adds §7.2 Partner and delivery model stance — making the platform-owner / partner-delivered motion explicit in Vision so the marketing folder, sales materials, and website copy share one source of truth on partner positioning, with anti-traps against over-claiming a certified partner program.*