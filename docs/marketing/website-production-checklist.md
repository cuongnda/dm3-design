# Duall Master — Website Production Checklist

**Purpose:** Practical handoff checklist for marketing, design, and development to ship the Duall Master marketing website without drifting from the approved product story.

**Use with:** `docs/VISION.md`, `docs/marketing/messaging-framework.md`, `docs/marketing/website-copy.md`, `docs/marketing/seo-content-strategy.md`, `docs/marketing/website-structure.md`

---

## 1. Non-negotiables before production starts

- Product name in external copy is **Duall Master**
- Core category line stays: **building operations and security command platform for modern sites**
- Story stays **platform foundation + modules**
- **Secure / Operate / Manage** is a value frame, **not** primary navigation
- Current module set stays consistent:
  - Access Control
  - Visitor Management
  - Attendance
  - Parking
  - Video Management (VMS)
  - Video Intercom
- AI is framed as **assistive intelligence**, not autonomous operations
- Partner stance stays **platform-owned, partner-delivered where needed**
- Claims must stay **credible now, expandable later**

---

## 2. Production owners

| Workstream | Primary owner | Output |
|---|---|---|
| Messaging and copy approval | Marketing | Final page copy, CTAs, metadata, proof statements |
| Visual system and assets | Design | Brand tokens, layouts, imagery, icons, OG templates |
| Site build and QA | Development | Implemented pages, forms, SEO, analytics, performance |
| Product truth validation | Product / founder | Final check on claims, modules, roadmap wording |

If a page has no clear owner, it is not ready to build.

---

## 3. Must-launch page set

### Phase 1 launch pages
- `/`
- `/platform/`
- `/modules/access-control/`
- `/modules/visitor-management/`
- `/modules/parking/`
- `/modules/attendance/`
- `/security-deployment/`
- `/integrations/`
- `/contact/`
- `/privacy/`
- `/terms/`
- `/cookies/`

### Phase 2 pages to queue next
- `/modules/video-management/`
- `/modules/video-intercom/`
- `/solutions/offices/`
- `/solutions/residential/`
- `/solutions/industrial/`
- `/intelligence/`

Rule: launch the highest-intent commercial pages first; do not wait for the full sitemap.

---

## 4. Marketing handoff checklist

### Messaging and copy
- [ ] Homepage copy approved against `website-copy.md`
- [ ] Platform page copy approved
- [ ] Phase 1 module page copy approved
- [ ] Security / deployment page copy approved
- [ ] Integrations page copy approved
- [ ] Contact page copy and form labels approved
- [ ] Each page has title tag and meta description
- [ ] CTA language is consistent across pages
- [ ] Proof points are tied to current product truth
- [ ] No page leads with DM3, pillar-first IA, or AI-first claims

### SEO and content ops
- [ ] Primary keyword assigned per page
- [ ] Secondary keywords assigned per page
- [ ] Internal links mapped from homepage to platform, modules, trust pages, and contact
- [ ] Each module page links to platform + related modules + relevant solutions
- [ ] Redirect plan documented if any old URLs exist
- [ ] Vietnamese localization scope for Phase 1 confirmed
- [ ] Korean localization explicitly deferred until native review is available

### Conversion and sales readiness
- [ ] Demo CTA destination confirmed
- [ ] Sales notification email confirmed
- [ ] Lead form fields approved by sales + marketing
- [ ] Form success message approved
- [ ] Follow-up workflow agreed: who responds, how fast, and with what template

---

## 5. Design handoff checklist

### Brand and UI assets
- [ ] Logo variants delivered
- [ ] Color palette delivered
- [ ] Typography choices delivered
- [ ] Icon style delivered
- [ ] Favicon and app icons delivered
- [ ] OG image template delivered

### Page design assets
- [ ] Homepage layout finalized
- [ ] Module page template finalized
- [ ] Platform page template finalized
- [ ] Contact page + lead form layout finalized
- [ ] Mobile layouts reviewed for key pages
- [ ] Empty / missing-image fallback treatment defined

### Product proof assets
- [ ] Screenshot list defined by page
- [ ] At least 1 strong hero-quality product visual available for homepage
- [ ] At least 1 supporting screenshot or diagram available per Phase 1 module page
- [ ] Visuals do not imply unshipped workflows or fake product depth

Rule: if visuals overstate the product, cut them or relabel them.

---

## 6. Development handoff checklist

### Foundation
- [ ] Framework, content structure, and page templates match `website-structure.md`
- [ ] Locale routing works for EN and planned VI paths
- [ ] Navigation matches module-first IA
- [ ] Reusable components are in place for hero, module grid, proof blocks, CTA, and form

### SEO and metadata
- [ ] Unique title and meta description on every launched page
- [ ] Single H1 per page
- [ ] Canonical tags implemented
- [ ] Open Graph metadata implemented
- [ ] Structured data added where planned
- [ ] Sitemap generated
- [ ] robots.txt configured
- [ ] hreflang only emitted for real published locales

### Forms and analytics
- [ ] Lead form validation works on client and server
- [ ] Spam protection enabled
- [ ] Form submits to agreed destination
- [ ] GA4 or agreed analytics installed
- [ ] CTA click events tracked
- [ ] Lead submit event tracked

### Performance and accessibility
- [ ] CWV targets checked on homepage + one module page
- [ ] Images compressed and sized correctly
- [ ] Keyboard navigation works on header, menus, form, and footer
- [ ] Color contrast reviewed
- [ ] Basic accessibility audit completed
- [ ] Lighthouse / equivalent checks pass agreed threshold

---

## 7. Pre-launch review checklist

### Message review
- [ ] Founder / product signs off on claims
- [ ] Marketing signs off on narrative consistency
- [ ] No unsupported claims about AI, integrations, partner program, or module breadth

### QA review
- [ ] All main nav links work
- [ ] All CTAs work
- [ ] Contact form tested end to end
- [ ] Mobile review completed
- [ ] Browser sanity check completed
- [ ] No placeholder copy, broken images, or draft labels remain

### Legal and compliance
- [ ] Privacy policy approved
- [ ] Terms approved
- [ ] Cookie policy approved
- [ ] Footer entity details added

---

## 8. Launch readiness decision

Ship when all are true:
- [ ] Homepage, platform, 4 priority module pages, trust pages, and contact are live-quality
- [ ] Lead capture works reliably
- [ ] Core copy is approved and aligned to source docs
- [ ] SEO basics are implemented
- [ ] Site is fast enough and readable on mobile

Do **not** block launch on:
- full KR localization
- all solution pages
- case studies not ready yet
- VMS / Video Intercom deep pages if Phase 1 pages are stronger and ready first

---

## 9. First two weeks after launch

- [ ] Check Search Console indexation
- [ ] Check CTA click and form submit rates
- [ ] Fix top UX or copy confusion from sales feedback
- [ ] Add missing internal links discovered in real usage
- [ ] Prioritize next pages from `page-content-backlog.md`

The goal is not a perfect brochure site. The goal is a credible, searchable, conversion-ready first website package that marketing can operate and improve.