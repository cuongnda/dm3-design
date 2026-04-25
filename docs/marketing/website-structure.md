# Duall Master — Website Structure

**Version:** 1.0
**Date:** April 2026
**Status:** Working structure spec for AI-assisted website build
**Related:** `docs/VISION.md` v3.1, `docs/marketing/website-copy.md` v3.0, `docs/marketing/seo-content-strategy.md` v2.0, `docs/marketing/messaging-framework.md` v3.0

## 0. Goals and constraints

### Goals
1. **Introduce the product clearly** — visitor understands category, modules, value, and trust within 30 seconds of landing.
2. **Generate qualified leads via SEO** — rank for module-level buyer keywords (access control system, visitor management, video management, etc.) in Vietnam and English markets first, route demand into structured demo requests.

### Constraints
- **Code-as-content, no CMS** — content lives in markdown files in git
- **AI-assisted build and maintenance** — structure must be AI-friendly (clear templates, consistent schemas, reusable components)
- **Editorial workflow via PRs** — marketing writers edit markdown, open PRs, auto-deploy on merge
- **Multilingual** — EN baseline, VI as priority localization, KR later
- **Performance-grade** — meet CWV targets without runtime tradeoffs (no heavy SPAs)
- **Single source of truth** — content references positioning from `messaging-framework.md` and copy from `website-copy.md`; do not duplicate strategy here

## 1. Tech stack

### Recommended

| Layer | Choice | Why |
|---|---|---|
| **Framework** | **Astro** | Server-rendered by default, ships zero client JS unless needed. Native MDX for content + components. CWV targets easy to hit without engineering effort. AI generates Astro components reliably. Multilingual via `@astrojs/i18n`. |
| **Content format** | **MDX** | Markdown for prose + JSX components for embeds (Hero, ModuleCard, etc.). Marketing writers can edit prose without touching components. |
| **Styling** | **Tailwind CSS** | Matches console design token system (CLAUDE.md: console uses Tailwind 4). AI generates Tailwind classes faster than custom CSS. |
| **Component library** | **shadcn/ui (selected components only)** | Matches console UI vocabulary; copy components into website repo, customize for marketing context. Do not import the entire shadcn registry — pick only what the homepage and module pages need. |
| **Hosting** | **Vercel** or **Cloudflare Pages** | Native Astro support, automatic preview deploys per PR, edge functions for lead capture endpoint, generous free tiers. Vercel is more polished; Cloudflare is cheaper at scale. Pick one and document. |
| **Forms backend** | **Vercel/Cloudflare serverless function** → CRM | No third-party form widget. Function validates, forwards to CRM and notification email. |
| **Analytics** | **GA4 + Search Console + Plausible (optional)** | GA4 mandatory for SEO. Plausible privacy-friendly supplement if cookie banner avoidance matters. |
| **CRM** | **TBD** (HubSpot, Pipedrive, or custom) | Decision blocks lead capture wiring; defer if not yet chosen, log to email + database in the meantime. |

### Rejected alternatives

- **Next.js** — overkill for a marketing site; SSR/RSC complexity not justified when most pages are static.
- **WordPress / Webflow / any CMS** — explicit constraint: no CMS.
- **Plain HTML + static assets** — gives up component reuse and content templating; AI maintenance harder.
- **Eleventy** — viable but smaller ecosystem for shadcn/Tailwind patterns.

## 2. Repository structure

The current repo already has `website/` at root. Keep that location.

```
website/
├── astro.config.mjs           # Astro config: site URL, integrations, i18n
├── tailwind.config.ts         # Brand tokens + Tailwind setup
├── tsconfig.json
├── package.json
├── public/                    # static assets (favicon, og:image fallback, robots.txt)
│   ├── images/
│   ├── icons/
│   └── og/
├── src/
│   ├── components/            # reusable Astro/MDX components
│   │   ├── layout/            # Header, Footer, Nav, LangSwitcher, Container
│   │   ├── homepage/          # Hero, PlatformIntro, ValueFrame
│   │   ├── modules/           # ModuleCard, ModuleGrid, ModuleHero
│   │   ├── solutions/         # SolutionHero, DeploymentContextCard
│   │   ├── platform/          # FoundationBlock, IntegrationStance
│   │   ├── proof/             # ProofBlock, ProofGrid, StatBadge
│   │   ├── cta/               # CTASection, BookDemoButton, LeadCaptureForm
│   │   └── ui/                # Button, Card, Accordion, Badge (shadcn-derived)
│   ├── content/               # Astro content collections (markdown/MDX)
│   │   ├── modules/           # one MDX per module
│   │   ├── solutions/         # one MDX per solution
│   │   ├── pages/             # platform.mdx, integrations.mdx, security-deployment.mdx, intelligence.mdx, contact.mdx
│   │   ├── legal/             # privacy.mdx, terms.mdx, cookies.mdx
│   │   └── posts/             # blog (Phase 2)
│   ├── content/config.ts      # content collection schemas (Zod)
│   ├── layouts/               # PageLayout, ModuleLayout, SolutionLayout, LegalLayout
│   ├── pages/                 # Astro routes (mostly delegate to content collections)
│   │   ├── index.astro
│   │   ├── modules/[slug].astro
│   │   ├── solutions/[slug].astro
│   │   ├── platform.astro
│   │   ├── intelligence.astro
│   │   ├── integrations.astro
│   │   ├── security-deployment.astro
│   │   ├── contact.astro
│   │   ├── api/lead.ts        # lead capture endpoint
│   │   └── vi/                # Vietnamese mirror routes
│   ├── styles/
│   │   └── globals.css        # Tailwind base + brand tokens
│   ├── lib/                   # utilities (formatters, analytics, validation)
│   └── i18n/                  # locale strings, hreflang helpers
├── tests/                     # Playwright smoke tests, lighthouse-ci config
└── README.md                  # local dev, deploy, content editing workflow
```

## 3. Page-type templates

Each page type is a fixed section sequence. AI generates pages by filling the sequence from a markdown frontmatter + body. Marketing writers edit copy; structure stays stable.

### 3.1 Homepage (`/`)

Sections, in order:
1. **Hero** — H1, subhead, primary CTA, secondary CTA, hero image/illustration
2. **Platform intro** — "Built as a platform. Adopted as modules."
3. **Module grid** — 6 module cards
4. **Value frame** — Secure / Operate / Manage (3-column)
5. **Why teams choose** — 7 differentiator cards
6. **Modern sites / deployment contexts** — 5-context list with regional focus note
7. **Proof points** — 7 shared-foundation blocks
8. **Partner model** — platform-owner / partner-delivered framing
9. **CTA section** — final demo request

Source: `website-copy.md` §1 Home is the canonical copy for this template.

### 3.2 Module page (`/modules/{slug}`)

Sections, in order (per `seo-content-strategy.md` §5):
1. **Module hero** — module name, problem framing, primary CTA
2. **What Duall Master does for {module}** — 3-5 capability blocks
3. **Key workflows** — 3-5 workflow steps with screenshots when available
4. **Who it's for** — 2-4 buyer personas / deployment contexts
5. **How it connects to the platform** — 3-4 integration bullets back to platform foundation
6. **Related modules** — 2-3 adjacent module cards
7. **Solutions where this fits** — 2-3 solution links
8. **CTA section** — module-specific demo CTA

### 3.3 Solution page (`/solutions/{slug}`)

Sections:
1. **Solution hero** — deployment context framing (e.g., "Office buildings", "Residential complexes")
2. **Common operational challenges** — 3-5 pain bullets
3. **Most relevant modules** — 3-4 module cards prioritized for this context
4. **Deployment and trust considerations** — security, integration, on-prem/cloud notes
5. **How customers typically adopt** — 3-step land-and-expand for this context
6. **CTA section** — solution-specific demo CTA

### 3.4 Platform overview (`/platform`)

Sections:
1. **Platform hero** — "The shared foundation under every module"
2. **Foundation capabilities** — identity, devices, events, audit, integrations, deployment (6 blocks)
3. **Why the platform matters** — 6 shared-X blocks from Vision §7
4. **Architecture and deployment** — cloud / on-prem / hybrid framing, security-grade trust
5. **Integration stance** — APIs, events, connectors, ecosystem-ready
6. **CTA section** — "See the platform in action"

### 3.5 Intelligence page (`/intelligence`)

Sections:
1. **Hero** — "Assistive intelligence for security and site operations"
2. **What it helps with** — 6 AI capability blocks (Vision §4.3 Role of AI list)
3. **How it surfaces** — inline / dedicated workspace / APIs (Vision §4.3 How AI surfaces)
4. **Principles** — assistive, explainable, permissioned, security-grade
5. **What it is not** — anti-trap framing (not autonomous, not replacement)
6. **CTA section** — "See assistive intelligence in context"

### 3.6 Integrations page (`/integrations`)

Sections:
1. **Hero** — integration-ready stance
2. **What integrates** — cameras, intercoms, identity sources, HR, tenant apps, building systems
3. **How it integrates** — APIs, event flows, webhooks, connectors
4. **Modernize in phases** — phased adoption messaging
5. **Partner / SI delivery** — bridges to partner model
6. **CTA section** — "Discuss integration requirements"

### 3.7 Security & deployment (`/security-deployment`)

Sections:
1. **Hero** — security-grade trust framing
2. **Security model** — tenant isolation, RBAC, auth, audit
3. **Deployment options** — cloud / on-premise / hybrid
4. **Compliance and operational trust** — auditability, retention, controlled integrations
5. **Who needs this** — security-sensitive deployment contexts
6. **CTA section** — "Talk to our deployment team"

### 3.8 Contact (`/contact`)

Sections:
1. **Hero** — short intent framing
2. **Lead capture form** — primary action
3. **Other contact options** — sales email, partner enquiries, support
4. **Office presence** — Vietnam HQ, Korea presence
5. **Regional sales sequencing** — VN + KR first, SEA later

### 3.9 Legal pages (`/privacy`, `/terms`, `/cookies`)

Single template:
1. **Page title + last updated date**
2. **Long-form legal content** (markdown body)
3. **Footer with contact for privacy questions**

## 4. Component inventory

Components organized by reuse scope.

### Layout
- `Header` — logo, primary nav, lang switcher, CTA button
- `Footer` — secondary nav, legal links, social, contact, language switcher, region disclosure
- `Nav` — desktop + mobile, current-page indicator
- `LangSwitcher` — EN / VI / (KR placeholder), preserves current path on switch
- `Container` — max-width wrapper with consistent horizontal padding
- `SectionWrapper` — vertical rhythm + optional background variants

### Hero variants
- `HomepageHero` — H1 + subhead + 2 CTAs + visual
- `ModuleHero` — module name + problem framing + primary CTA + visual
- `SolutionHero` — context name + framing + visual
- `PlatformHero` — foundation framing + visual
- `LegalPageHero` — title + last-updated date

### Content blocks
- `ModuleCard` — module name + 1-line description + icon + link
- `ModuleGrid` — responsive grid of ModuleCards (6 default)
- `ValuePillarBlock` — Secure / Operate / Manage (3-column)
- `ProofBlock` — title + 1-2 line statement
- `ProofGrid` — responsive grid of ProofBlocks
- `StatBadge` — large number + caption (e.g., "9 services", "audit retained for years")
- `WorkflowStep` — numbered step with optional screenshot
- `IntegrationLogoStrip` — partner / integration logos
- `FAQ` — accordion (collapsible)
- `RegionalFocusBlock` — VN + KR first, SEA later messaging
- `DeploymentContextCard` — context name + 2-line description + relevant modules

### CTA + capture
- `CTASection` — full-width section with H2 + body + primary/secondary CTAs
- `BookDemoButton` — opens form modal or links to /contact
- `LeadCaptureForm` — name, email, company, country, modules of interest, message
- `LeadConfirmation` — post-submit thank-you state

### Trust + proof (future-proofed)
- `Testimonial` — quote + attribution + company
- `LogoWall` — customer/partner logo grid
- `CaseStudyCard` — image + title + outcome + link

### Utility
- `Image` — wrapper around Astro `<Image>` with default lazy/eager presets
- `LocalizedLink` — auto-prepends locale path
- `MetaTags` — per-page title, description, OG, Twitter, canonical, hreflang
- `StructuredData` — JSON-LD per page type (Organization, Product, BreadcrumbList, FAQ)
- `AnalyticsEvent` — wrapper that fires GA4 events on interaction

## 5. Content schema (frontmatter)

Defined in `src/content/config.ts` using Astro content collections + Zod. AI and writers both honor these schemas.

### 5.1 Module page

```yaml
---
slug: access-control                          # required, kebab-case
name: "Access Control"                        # required, display name
order: 1                                      # required, sort order in module grid
status: published                             # published | draft | archived
i18n_status:                                  # per-locale publish status
  en: published
  vi: draft
  ko: missing
meta:
  title: "Access Control System — Duall Master"
  description: "Control doors, gates, turnstiles, lifts, and critical access points from one realtime system."
  og_image: "/og/modules/access-control.png"  # optional
hero:
  h1: "Control doors, gates, turnstiles, and lifts from one realtime system"
  subhead: "Single platform for access decisions, audit, and operator response — across sites and module combinations."
  primary_cta: { label: "Book a demo", href: "/contact" }
  secondary_cta: { label: "Explore the platform", href: "/platform" }
related_modules: [visitor-management, attendance, video-intercom]
solutions: [offices, residential, industrial, security-sensitive]
keywords: [access control system, building access control, cloud access control]
---

(MDX body — workflows, capabilities, screenshots embedded as components)
```

### 5.2 Solution page

```yaml
---
slug: offices
name: "Office buildings"
order: 1
status: published
i18n_status: { en: published, vi: draft, ko: missing }
meta:
  title: "Duall Master for Office Buildings"
  description: "Access, visitor, parking, attendance, video, and intercom for commercial offices on one platform."
hero:
  h1: "One platform for office building security and operations"
  subhead: "From a single building to a multi-site portfolio."
  primary_cta: { label: "Book a demo", href: "/contact" }
priority_modules: [access-control, visitor-management, parking, video-management]
keywords: [office access control system, office building security platform]
---
```

### 5.3 Static page (platform, intelligence, integrations, security-deployment, contact)

Lighter schema — most content is in MDX body, frontmatter handles meta only.

```yaml
---
slug: platform
status: published
i18n_status: { en: published, vi: draft, ko: missing }
meta:
  title: "The Platform Foundation — Duall Master"
  description: "..."
hero:
  h1: "The shared foundation under every module"
  subhead: "..."
---
```

### 5.4 Legal page

```yaml
---
slug: privacy
title: "Privacy Policy"
last_updated: "2026-04-25"
applicable_regions: [vn, kr, global]
status: published
---
```

## 6. Routing and i18n

### URL structure

- `/` — English homepage (default locale)
- `/modules/access-control/` — English module page
- `/vi/` — Vietnamese homepage
- `/vi/modules/access-control/` — Vietnamese module page
- `/ko/` — reserved for future, do not publish until native review available

Default locale is EN at root (no `/en/` prefix). VI under `/vi/` per `seo-content-strategy.md` §6.

### hreflang

Auto-generated per page from content collection `i18n_status`. Only emit hreflang pairs for locales actually published (status `published`, not `draft` or `missing`).

### Locale switching

`LangSwitcher` component takes the current path and rewrites the locale segment:
- on `/modules/access-control/` → `/vi/modules/access-control/` (if VI published)
- on `/modules/access-control/` → grayed out for KR (not yet published)

### Routing implementation

- Astro file-based routing for static pages
- `[slug].astro` dynamic routes for module and solution collections
- Locale paths via Astro i18n integration

## 7. Build and deploy pipeline

### Branches and deploys

| Branch / event | Action |
|---|---|
| Push to `main` | Production deploy to live domain |
| Open PR | Preview deploy to unique URL, link auto-posted to PR |
| Push to feature branch | Branch deploy to feature URL |
| Tag `v*` | Optional: snapshot deploy for marketing milestones |

### CI checks (run on every PR)

- Astro `build` (catches broken content references, missing components)
- Type check (`tsc --noEmit`)
- Linting (eslint + stylelint)
- Lighthouse CI on key pages (homepage + 1 module page); fail if CWV regresses
- Broken link checker (internal links)
- Image presence check (no `<img>` with missing files)
- Accessibility check (axe-core on built HTML)

### Pre-merge requirements

- All CI checks green
- At least one approver review
- Preview deploy verified by reviewer

### Production deploy

- Auto on merge to `main`
- Rollback via revert PR (no manual deploy controls)
- Cache purge automatic via hosting provider

## 8. Lead capture wiring

### Form fields

Required:
- Full name
- Work email (validated, blocks free providers? — to decide)
- Company name
- Country (dropdown, default Vietnam)

Optional:
- Phone
- Modules of interest (multi-select: Access Control, Visitor Management, Attendance, Parking, VMS, Video Intercom)
- Site context (dropdown: office, residential, industrial, campus, security-sensitive)
- Message

Hidden / auto-captured:
- Source page URL
- UTM parameters
- Locale
- Submission timestamp

### Endpoint

`POST /api/lead` — Vercel/Cloudflare serverless function:
1. Validate payload (Zod schema, server-side)
2. Rate-limit by IP (e.g., 5 submissions / 10 min)
3. Honeypot check
4. Forward to:
   - **CRM** (TBD — HubSpot/Pipedrive/custom). Until CRM chosen, write to a structured database table or send formatted email.
   - **Notification email** to sales (sales@duali.com or equivalent)
   - **Analytics** event `lead_submitted` with module interest as property
5. Return success / error JSON
6. Frontend shows `LeadConfirmation` state on success

### Spam protection

- Honeypot field (hidden, must be empty)
- Rate limiting per IP
- Optional: hCaptcha or Cloudflare Turnstile (low-friction, not Google reCAPTCHA)

### Post-submit

- Confirmation page with next-step messaging
- Auto-reply email to submitter (within 1 hour)
- Sales receives notification within seconds

## 9. Performance budgets

Targets (per global web rules + `seo-content-strategy.md` §10):

| Metric | Target |
|---|---|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| FCP | < 1.5s |
| Bundle JS (homepage) | < 80kb gzipped |
| Bundle CSS | < 30kb |

### Implementation rules

- Astro defaults: zero JS by default, hydrate components only when interactive
- Images: AVIF/WebP via Astro `<Image>`, dimensions explicit, lazy below fold
- Hero image: `loading="eager"` + `fetchpriority="high"`
- Fonts: max 2 families, `font-display: swap`, preload only critical weights
- No third-party scripts above the fold
- Defer analytics until interaction or after onload
- Lighthouse CI as merge gate

## 10. SEO implementation

Per `seo-content-strategy.md` §10 + per-page concerns.

### Per-page mandatory

- Unique `<title>` and `<meta name="description">`
- Single `<h1>`
- Clean heading hierarchy (no h3 before h2)
- Canonical link tag
- Open Graph + Twitter card meta
- hreflang per published locale

### Structured data

- `Organization` schema on homepage + footer
- `Product` schema on each module page
- `BreadcrumbList` on all sub-pages
- `FAQPage` on pages with FAQ component
- `Article` on blog posts (Phase 2)
- `LocalBusiness` on contact page

### Sitemaps

- `/sitemap.xml` auto-generated by Astro sitemap integration
- Submit to Google Search Console + Naver Webmaster Tools (KR phase)

### robots.txt

```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://duallmaster.com/sitemap.xml
```

## 11. Editorial workflow

### Marketing writer flow

1. Branch from `main`: `git checkout -b content/access-control-update`
2. Edit `.mdx` file in `src/content/modules/access-control.mdx`
3. Push branch — preview deploy auto-generated, URL posted to branch
4. Self-review on preview URL
5. Open PR — request review from approver (sales lead, product marketing lead)
6. Address feedback in additional commits
7. Merge — auto-deploy to production within minutes

### AI assistance points

- **Initial copy generation** — given module name + frontmatter + brief, AI drafts MDX body matching template
- **Translation drafts** — AI generates VI/KR drafts; native speaker reviews and refines
- **SEO optimization** — AI suggests meta description rewrites, internal links, schema additions
- **Component refactoring** — AI extracts repeated MDX patterns into reusable components

### Approval roles

| Change type | Approver |
|---|---|
| Copy edit (typo, rewording, no positioning shift) | Any marketing team member |
| New page or significant copy change | Product marketing lead |
| Positioning or claim change | Refer back to `messaging-framework.md` first; if framework change needed, update framework first |
| Brand visual change | Design lead |
| Form/CTA change | Sales + marketing joint |
| Legal page change | Legal review required |

## 12. Analytics and measurement

### Tools

- **GA4** — required, page views + events
- **Google Search Console** — required, indexation + query data
- **Naver Webmaster Tools** — Phase 2 (KR launch)
- **Plausible** (optional) — privacy-friendly supplement, useful if cookie banner avoidance matters

### Event taxonomy

| Event | Properties | Trigger |
|---|---|---|
| `page_view` | path, locale, referrer | every page load |
| `cta_click` | cta_label, page_path, position | any CTA button click |
| `module_card_click` | module_slug, source_page | module card in grid clicked |
| `lead_form_open` | source_page | LeadCaptureForm modal opened |
| `lead_form_submit` | modules_of_interest[], country, locale | form submitted successfully |
| `lead_form_error` | error_field | form validation error |
| `language_switch` | from_locale, to_locale, page_path | LangSwitcher used |
| `scroll_depth` | depth_percent (25/50/75/100) | once per session per page |

### Dashboards (Phase 1)

- Traffic by page cluster (homepage / modules / solutions / platform / contact)
- Conversion funnel (page view → CTA click → form open → form submit)
- Regional breakdown (country + locale)
- Top entry pages and bounce
- Module interest distribution (from form submissions)

## 13. Privacy and legal

### Required pages (Phase 1)

- `/privacy` — Privacy Policy covering VN PDPL + KR PIPA + GDPR-equivalent baseline
- `/terms` — Terms of Service
- `/cookies` — Cookie policy

### Cookie consent

- Banner on first visit, persistent acceptance via cookie
- Default: only essential + analytics consent required (no advertising cookies in Phase 1)
- Reject option must be as prominent as accept
- Settings reachable from footer link

### Legal entity disclosure

Footer must include:
- Legal entity name (e.g., "Duali Vietnam")
- Business registration number (where applicable)
- Registered address
- Contact for privacy / data subject requests

### Compliance scope

- **Vietnam PDPL** — primary compliance baseline
- **Korea PIPA** — required before KR launch
- **GDPR-equivalent** — adopted as baseline for international visitors

Legal review required before any Privacy/Terms publication.

## 14. Brand visual integration

The marketing team owns brand visual identity (logo, color palette, typography, iconography, photography direction). This document defines the **integration points** the website code exposes so brand assets can drop in cleanly when delivered.

### Integration points the code exposes

| Asset type | Where it plugs in |
|---|---|
| Brand colors | `tailwind.config.ts` → `colors.brand.{primary, accent, surface, text, muted, ...}` |
| Typography | `tailwind.config.ts` → `fontFamily.{sans, display}` + font preload in base layout |
| Logo SVG | `src/components/layout/{LogoMark, LogoFull, LogoWordmark}.astro` |
| Favicon + apple-touch | `public/favicon.svg`, `public/apple-touch-icon.png` |
| OG image template | `public/og/default.png` + per-page overrides via frontmatter |
| Iconography | `src/components/ui/Icon.astro` wrapping a single icon set |
| Photography / hero imagery | `public/images/heroes/*` referenced by frontmatter |
| Module icons | `src/components/modules/icons/{Module}Icon.astro`, one per module |

The website should not invent visual direction. Marketing team delivers, dev/AI integrates.

### Default stubs while brand guide is in flight

To unblock Phase 0 build before the brand guide lands:
- Color tokens: neutral palette (slate / zinc grayscale + one accent) — placeholder, not final
- Typography: Inter for sans, Inter for display — placeholder, not final
- Logo: text wordmark "Duall Master" — placeholder, not final
- Iconography: Lucide as default set unless marketing team specifies otherwise

These stubs let dev/AI build all components and pages. When marketing team delivers brand assets, swap tokens + components without changing component APIs.

## 15. Initial site map

Mirror `seo-content-strategy.md` §3.1 + Phase 1 priorities.

```
/
/platform
/modules/access-control
/modules/visitor-management
/modules/parking
/modules/attendance
/modules/video-management
/modules/video-intercom
/solutions/offices
/solutions/residential
/solutions/industrial
/solutions/campus-institutional
/solutions/security-sensitive-sites
/intelligence
/integrations
/security-deployment
/contact
/privacy
/terms
/cookies

/vi/
/vi/platform
/vi/modules/access-control
/vi/modules/visitor-management
/vi/modules/parking
/vi/modules/attendance
/vi/contact
(VI Phase 1 limited to highest-intent pages per SEO doc §12)
```

Phase 2 expansion:
- `/vi/modules/video-management`
- `/vi/modules/video-intercom`
- `/vi/solutions/*`
- `/resources/blog/`
- `/resources/case-studies/` (when proof is ready)

## 16. Open decisions blocking implementation

Marketing team owns brand visual identity and graphic material — that work runs in parallel and is **not** a blocker for code build (placeholder tokens cover Phase 0 per §14).

The following decisions block AI/dev from starting the technical build:

1. **CRM choice** — HubSpot / Pipedrive / Salesforce / custom. Determines lead capture endpoint integration. Until decided, lead capture writes to email + database table.
2. **Hosting provider** — Vercel vs Cloudflare Pages. Both work; pick one and set up account.
3. **Domain** — confirm production domain (duallmaster.com? duali.com/duallmaster?), DNS control, TLS provider.
4. **Sales notification email address** — where do form submissions notify? (e.g., sales@duali.com).
5. **Office presence content** — actual addresses for VN HQ, KR presence (or "in-market" without specific address).
6. **Legal entity registration details** — required for footer disclosure.
7. **Customer reference availability** — even one anonymized pilot reference dramatically improves credibility. Sales + product team to source. Not a blocker for Phase 0/1 build, but a blocker for credibility on the proof sections of homepage and module pages.
8. **Initial product screenshots** — at least 5-6 hero-quality screenshots (homepage console, module list, live event view, etc.). Product team to produce. Not a blocker for Phase 0 scaffolding; needed for Phase 1 polish.
9. **Existing `website/` folder reuse vs reset** — repo already has `website/` directory. Decide: rebuild from scratch following this spec, or migrate existing content into new structure.

Marketing team's parallel deliverables (independent of the above):
- Brand visual identity (logo SVGs, color palette, typography stack)
- Iconography choice
- Photography / hero imagery direction
- Approved module icons (one per 6 modules)
- OG image template

## 17. Recommended build phases

### Phase 0 — foundation (1 week)
- Tech stack scaffolding (Astro + Tailwind + content collections + i18n + analytics + CI/CD)
- Component library bootstrap (Header, Footer, Layout, Hero variants, ModuleCard, ProofBlock, CTASection, LeadCaptureForm)
- Brand tokens stubbed pending design team
- Lead capture endpoint with database fallback (CRM later)

### Phase 1 — core marketing site (2-3 weeks)
- Homepage (copy ready in `website-copy.md`)
- Platform overview page
- Module pages × 4 (Access Control, Visitor Management, Parking, Attendance)
- Security & deployment page
- Integrations page
- Contact page with working lead capture
- Legal pages (with legal review)
- VI localization for the above where text is ready

### Phase 2 — expansion (2 weeks)
- Module pages × 2 (VMS, Video Intercom)
- Solution pages × 5
- Intelligence page
- Blog/resources scaffolding (content comes later)
- KR English entry pages

### Phase 3 — proof and depth (ongoing)
- Case studies as references become available
- Customer logo wall
- Testimonials
- Korean localization
- Comparison and migration content (only with sales sign-off)

---

*This document is a working structure spec. Update when tech stack decisions change, new page types are introduced, or build phases are completed. Strategic positioning, copy, and SEO planning live in their respective docs and should not be duplicated here.*
