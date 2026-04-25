# Duall Master — Marketing Docs

**Purpose:** Keep market-facing narrative, website planning, and sales messaging aligned with `docs/VISION.md`.

## Source-of-truth order

1. `docs/VISION.md` — product truth, positioning, naming, module model
2. `docs/marketing/messaging-framework.md` — approved external positioning, claims, and guardrails
3. `docs/marketing/README.md` — marketing doc map, status, and maintenance rules
4. `docs/marketing/website-copy.md` — current website narrative and reusable copy
5. `docs/marketing/sales-one-pager.md` — short external sales summary
6. `docs/marketing/seo-content-strategy.md` — search/content plan aligned to current module-first IA and product truth

## Naming rules

- **Duall Master** = external product name
- **DM3** = internal codename only
- Marketing docs should follow **VISION v3.0** language: **platform foundation + modules**, with **Secure / Operate / Manage** used as a value story, not the primary product IA.

## Current file audit

| File | Purpose | Current status |
|---|---|---|
| `messaging-framework.md` | Approved positioning, message hierarchy, claims, guardrails, and reusable talk tracks | **Current**. Primary bridge from VISION to market-facing messaging. Use before editing website, sales, or SEO copy. |
| `website-copy.md` | Primary homepage and reusable website messaging | **Current**. Best-aligned doc in this folder. Uses Duall Master naming, module-first framing, and VISION v3.0 language. |
| `sales-one-pager.md` | Short external sales/partner leave-behind | **Current**. Good concise summary for customer conversations. |
| `seo-content-strategy.md` | Keyword strategy, site IA, page roadmap, editorial priorities, technical SEO checklist | **Current**. Rewritten around module-first IA, current module truth, and Vietnam / South Korea go-to-market focus. |
| `website-structure.md` | Page templates, component inventory, tech stack, content schemas, build pipeline, lead capture spec — execution structure for AI-built site | **Current**. Use this when handing off to dev/AI build team. |
| `website-production-checklist.md` | Practical launch and handoff checklist across marketing, design, product, and development | **Current**. Use this when turning the strategy docs into a real build and launch plan. |
| `page-content-backlog.md` | Writing backlog and page briefs for deep pages still needed beyond the homepage narrative | **Current**. Use this to assign page-writing work and keep deep-page content aligned with strategy. |

## Main issues to watch

1. **Execution drift is still the main risk.** New copy can easily slide back into pillar-first IA, future-heavy claims, or inconsistent naming if teams skip the messaging framework.
2. **Proof discipline matters.** AI, integrations, and module breadth should stay tied to product truth and implementation reality.
3. **Sales enablement is still thin.** The one-pager is good, but there is no focused proof-points / objections / qualification doc yet.

## Recommended practical marketing doc set

Keep the set small:

### Should exist

- `README.md` — index, status, source-of-truth order, maintenance rules
- `messaging-framework.md` — approved positioning, message hierarchy, value pillars, proof points, claim guardrails, naming rules
- `website-copy.md` — current website copy and reusable page-level copy blocks
- `sales-one-pager.md` — concise external summary for demos, prospects, and partners
- `seo-content-strategy.md` — keyword strategy, target page set, content calendar, technical SEO checklist, aligned to module-first IA
- `website-structure.md` — execution-layer spec for AI-built site (tech stack, page templates, components, schemas, lead capture, build pipeline)
- `website-production-checklist.md` — practical handoff and launch checklist for marketing, design, dev, and product
- `page-content-backlog.md` — execution backlog and page briefs for module, platform, solution, and trust pages still to be written
- `sales-enablement.md` — objections, discovery prompts, best-fit segments, competitive framing, and talk tracks

### Nice to add later only if needed

- case-study template
- launch campaign brief
- partner pitch variant

Do not create extra docs unless they serve a distinct operating purpose.

## Suggested creation / rewrite order

1. **`website-production-checklist.md`** — convert strategy into an actionable cross-functional launch checklist
2. **`page-content-backlog.md`** — define the next page-writing queue and content briefs for deep pages
3. **`sales-enablement.md`** — convert the vision and messaging framework into practical field guidance
4. Keep `website-copy.md` and `sales-one-pager.md` aligned to `messaging-framework.md` when they evolve
5. Expand SEO execution only after the first module and trust pages are live

## Maintenance rules

- If `docs/VISION.md` changes, review this folder for naming and positioning drift.
- The Vision §6.1 canonical product sentence is duplicated verbatim in 5 places: `messaging-framework.md` §5 and §13, `sales-one-pager.md` opening and talk track, and `website-copy.md` "Standard product description." If Vision §6.1 changes, update all 5 mirrors in the same pass.
- Keep market-facing copy on **Duall Master**; reserve **DM3** for internal context only.
- Avoid claiming modules or AI capabilities as broadly shipped unless `VISION.md` and `IMPLEMENTATION_STATUS.md` support it.
- Prefer one strong doc per purpose over many overlapping docs.
