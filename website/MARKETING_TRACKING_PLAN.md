# Duall Master 3.0 — Marketing Website Tracking & Performance Plan

**Date:** February 2026  
**Owner:** Cuong Nguyen / Duali Vietnam  
**Status:** Draft

---

## 1. What We Need to Know

| Question | Why It Matters |
|----------|---------------|
| How many people visit our site? | Are we reaching enough potential customers? |
| Where do visitors come from? | Which marketing channels work? |
| Which pages do they read? | What content resonates? |
| Do they request demos? | Is the site converting? |
| Which country/language? | Are we reaching KR/VN/global markets? |
| How long do they stay? | Is content engaging enough? |
| Where do they drop off? | What's broken or boring? |
| Which case studies get read? | Which verticals have demand? |
| Mobile vs Desktop? | Is our responsive design working? |

---

## 2. Tracking Stack (Recommended)

### Tier 1 — Core Analytics (FREE, implement immediately)

| Tool | Purpose | Cost |
|------|---------|------|
| **Google Analytics 4 (GA4)** | Traffic, behavior, conversions, demographics | Free |
| **Google Search Console** | SEO performance, search queries, indexing | Free |
| **Google Tag Manager** | Manage all tracking tags without code changes | Free |

### Tier 2 — Enhanced Insights (add after launch)

| Tool | Purpose | Cost |
|------|---------|------|
| **Microsoft Clarity** | Heatmaps, session recordings, rage clicks | Free |
| **Plausible Analytics** | Privacy-friendly, lightweight dashboard (GDPR-safe) | $9/mo or self-host free |
| **Google Looker Studio** | Custom dashboards combining all data | Free |

### Tier 3 — Growth (add when traffic grows)

| Tool | Purpose | Cost |
|------|---------|------|
| **Hotjar** | User feedback polls, surveys on site | Free tier |
| **Ahrefs/SEMrush** | SEO competitive analysis, keyword tracking | $99+/mo |
| **HubSpot CRM** | Lead tracking from demo requests to deals | Free tier |

---

## 3. Key Metrics (KPIs) — Monthly Dashboard

### 🚀 Traffic Metrics
| Metric | Target (Month 1) | Target (Month 6) | How to Measure |
|--------|-------------------|-------------------|----------------|
| Total visitors | 500 | 5,000 | GA4 |
| Unique visitors | 400 | 3,500 | GA4 |
| Page views | 1,500 | 15,000 | GA4 |
| Avg. session duration | >1 min | >2 min | GA4 |
| Bounce rate | <70% | <50% | GA4 |
| Pages per session | >2 | >3 | GA4 |

### 🌍 Audience Metrics
| Metric | Why | How |
|--------|-----|-----|
| Country breakdown | VN/KR/other market reach | GA4 Geography |
| Language preference | EN/KO/VI usage ratio | GA4 + language URL tracking |
| Device type | Mobile vs Desktop | GA4 Tech |
| New vs Returning | Are people coming back? | GA4 |

### 🎯 Conversion Metrics (MOST IMPORTANT)
| Metric | Target | How |
|--------|--------|-----|
| Demo requests | 5/month → 20/month | GA4 Event tracking on form submit |
| Contact form fills | 3/month → 15/month | GA4 Event |
| Pricing page visits | Track % of visitors | GA4 Page |
| Case study reads | Track which verticals | GA4 Page |
| CTA click rate | >2% | GTM click tracking |

### 📈 SEO Metrics
| Metric | Target | How |
|--------|--------|-----|
| Organic search traffic | 30% of total by month 6 | GA4 + Search Console |
| Keyword rankings | Top 10 for 5 key terms | Search Console |
| Indexed pages | All pages indexed | Search Console |
| Backlinks | Growing month-over-month | Ahrefs/Search Console |
| Core Web Vitals | All "Good" | PageSpeed Insights |

---

## 4. Conversion Tracking Setup

### Events to Track (via Google Tag Manager)

```
📋 CRITICAL EVENTS (Goals)
├── demo_request_submit    → Form submitted on any "Request Demo" form
├── contact_form_submit    → Contact page form submitted
├── pricing_page_view      → Visited pricing page (high intent)
└── case_study_read        → Read a case study (scrolled >50%)

📋 ENGAGEMENT EVENTS
├── cta_click              → Any "Request Demo" / "See Pricing" button click
├── nav_click              → Navigation menu clicks (which sections interest people)
├── language_switch        → Changed language (market interest signal)
├── scroll_depth           → 25%, 50%, 75%, 100% scroll tracking
├── video_play             → If we add demo videos later
└── outbound_link_click    → Clicked external links

📋 PAGE-LEVEL EVENTS  
├── solution_page_view     → Which solution (Office/Residential/etc.) gets views
├── domain_page_view       → SECURE/MANAGE/OPERATE/SMART interest
├── case_study_filter      → Which category filter used
└── time_on_page           → Enhanced measurement
```

### UTM Tracking Convention

For all marketing campaigns, use consistent UTM parameters:

```
https://duallmaster.com/en/?utm_source={source}&utm_medium={medium}&utm_campaign={campaign}

Sources:     google, linkedin, facebook, email, direct, referral
Mediums:     organic, cpc, social, email, banner
Campaigns:   launch-2026, korea-market, vietnam-govt, etc.
```

---

## 5. SEO Performance Tracking

### Target Keywords (by market)

**English (Global):**
- "building access control system"
- "unified building security platform"  
- "smart building management software"
- "visitor management system"
- "building operating system"

**Korean (한국어):**
- "출입통제 시스템" (access control system)
- "빌딩 보안 관리" (building security management)
- "스마트 빌딩 플랫폼" (smart building platform)
- "방문자 관리 시스템" (visitor management system)

**Vietnamese (Tiếng Việt):**
- "hệ thống kiểm soát ra vào" (access control system)
- "quản lý tòa nhà thông minh" (smart building management)
- "phần mềm bảo vệ tòa nhà" (building security software)
- "quản lý khách thăm" (visitor management)

### Monthly SEO Checklist
- [ ] Check Search Console for indexing issues
- [ ] Review top performing pages
- [ ] Check keyword rankings for target terms
- [ ] Review and fix any 404 errors
- [ ] Check Core Web Vitals scores
- [ ] Update content if any page has high bounce rate
- [ ] Build 2-3 backlinks (guest posts, directories, partnerships)

---

## 6. Reporting Cadence

### Weekly (Quick Check — 5 min)
- Total visitors this week vs last week
- Any demo requests received?
- Any technical issues (404s, slow pages)?

### Monthly (Full Report — 30 min)
- All KPI dashboard review
- Top pages by traffic
- Conversion funnel analysis
- SEO ranking changes
- Content performance (which case studies/solutions popular)
- Recommendations for next month

### Quarterly (Strategy Review — 1 hour)
- Market-level analysis (VN vs KR vs Global)
- Competitive landscape check
- Content gap analysis
- SEO strategy adjustment
- Budget allocation review

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1) ✅ DO FIRST
- [ ] Add Google Analytics 4 tracking code to all pages
- [ ] Set up Google Tag Manager container
- [ ] Register site in Google Search Console (all 3 languages)
- [ ] Submit sitemap.xml
- [ ] Set up conversion events in GA4
- [ ] Add Microsoft Clarity for heatmaps
- [ ] Create Looker Studio dashboard template

### Phase 2: Optimization (Week 2-4)
- [ ] Set up GTM click tracking for CTAs
- [ ] Configure scroll depth tracking
- [ ] Set up language switch tracking
- [ ] Create UTM links for initial marketing campaigns
- [ ] Run PageSpeed Insights and fix any issues
- [ ] Set up weekly email report from GA4

### Phase 3: Growth (Month 2+)
- [ ] A/B test hero copy / CTA buttons
- [ ] Add demo video and track engagement
- [ ] Set up retargeting pixels (Google Ads, LinkedIn, Facebook)
- [ ] Content marketing: blog/news section for SEO
- [ ] Build landing pages for specific campaigns (Korea, Vietnam govt, etc.)
- [ ] Set up lead scoring in CRM

---

## 8. Dashboard Template

Build a single-page dashboard (Looker Studio or custom) showing:

```
┌─────────────────────────────────────────────────────────┐
│  DUALL MASTER — Marketing Dashboard                     │
├──────────┬──────────┬──────────┬───────────────────────│
│ Visitors │ Demo Req │ Bounce % │ Avg. Session          │
│  1,234   │    8     │   45%    │    2:34               │
├──────────┴──────────┴──────────┴───────────────────────│
│                                                         │
│  📈 Traffic Trend (30 days)         🌍 By Country      │
│  [line chart]                       VN: 45%             │
│                                     KR: 30%             │
│                                     Other: 25%          │
├─────────────────────────────────────────────────────────│
│  🔝 Top Pages              🎯 Conversion Funnel        │
│  1. /en/ (320)              Visit → Pricing → Demo     │
│  2. /en/platform/ (180)     1000  →  150   →  8       │
│  3. /en/case-studies/ (95)                              │
├─────────────────────────────────────────────────────────│
│  📊 By Language    │  📱 By Device    │  🔍 Top Search │
│  EN: 50%           │  Mobile: 60%     │  "access ctrl" │
│  KO: 30%           │  Desktop: 35%    │  "building sec" │
│  VI: 20%           │  Tablet: 5%      │  "smart bldg"  │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Competitive Benchmarks

Track these competitors to know where we stand:

| Competitor | Website | Market |
|-----------|---------|--------|
| Suprema | supremainc.com | Korea (biometrics + access) |
| Genetec | genetec.com | Global (unified security) |
| Openpath (Motorola) | openpath.com | US (cloud access) |
| Hikvision | hikvision.com | Global (CCTV + access) |
| S2 Global | s2sys.com | Korea (access control) |

### What to Track on Competitors
- Their keyword rankings vs ours
- Their content strategy (blog frequency, case studies)
- Their SEO domain authority
- Their social presence

---

## 10. Quick Wins to Start

1. **Google Analytics 4** — Add tracking snippet to all pages TODAY
2. **Search Console** — Register and submit sitemap
3. **Microsoft Clarity** — Add free heatmap tracking
4. **UTM links** — Create for LinkedIn, Facebook sharing
5. **Internal linking** — Ensure case studies link to solutions and vice versa
6. **Blog section** — Plan first 5 SEO-focused articles targeting keywords above

---

*This plan will evolve. Review monthly and adjust based on data.*
