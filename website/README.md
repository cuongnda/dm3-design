# Duall Master — Marketing Website

**Location:** `dm3/website/`  
**Local URL:** http://localhost:8095  
**Service:** `com.claw.dm3-website` (launchd, auto-start)  
**Tunnel:** ngrok (`com.claw.dm3-ngrok`, free tier — URL changes on restart)

## Overview

Static marketing website for Duall Master 3.0 — the Unified Building Security & Facility Management Platform. Multi-language, SEO-optimized, responsive.

## Site Structure

```
website/
├── index.html              # Language selector (root)
├── favicon.svg
├── robots.txt
├── sitemap.xml
├── analytics.html          # Analytics dashboard
├── css/
│   ├── style.css           # Main stylesheet
│   └── enhancements.css    # Additional styles
├── js/
│   ├── main.js             # Site interactions
│   ├── analytics.js        # Tracking
│   └── cookie-consent.js   # GDPR consent
├── images/                 # Hero images, case study photos (16 files)
├── logo-concepts/          # Logo design explorations
├── en/                     # English (22 pages)
├── ko/                     # Korean (22 pages)
└── vi/                     # Vietnamese (22 pages)
```

## Pages (per language — 22 each)

| Page | Path | Description |
|------|------|-------------|
| **Home** | `/[lang]/` | Hero, value props, domain overview, CTA |
| **Platform** | `/[lang]/platform/` | Architecture overview, five domains |
| **SECURE** | `/[lang]/platform/secure/` | Access control, face recognition, visitor mgmt |
| **MANAGE** | `/[lang]/platform/manage/` | Dashboard, reports, user management |
| **OPERATE** | `/[lang]/platform/operate/` | Device monitoring, maintenance, automation |
| **SMART** | `/[lang]/platform/smart/` | AI analytics, anomaly detection, predictions |
| **Pricing** | `/[lang]/pricing/` | Starter/Professional/Enterprise tiers |
| **About** | `/[lang]/about/` | Company story, team, mission |
| **Contact** | `/[lang]/contact/` | Contact form, office locations |
| **Solutions** | `/[lang]/solutions/[vertical]/` | 6 verticals (see below) |
| **Case Studies** | `/[lang]/case-studies/` | Index + 6 individual case studies |

### Solution Verticals
- Office Buildings
- Residential / Apartments
- Industrial / Factories
- Government & Military
- Education
- Healthcare

### Case Studies
- AhaSlides
- Banking Forum 2024
- Children's Hospital 1
- D'Home Sapa Hotel
- STI Softorb Indonesia
- Vietnam Military Medical University

## Languages

| Code | Language | Pages |
|------|----------|-------|
| `en` | English | 22 |
| `ko` | Korean | 22 |
| `vi` | Vietnamese | 22 |

Root `index.html` is a language selector page.

## Development

**Run locally:**
```bash
cd dm3/website
python3 -m http.server 8095
```

**The launchd service handles this automatically** — runs on boot at port 8095.

## Related Docs

- **Website Copy:** `dm3/docs/marketing/website-copy.md` — full page-by-page copywriting
- **SEO Strategy:** `dm3/docs/marketing/seo-content-strategy.md` — keyword targeting, content plan
- **Tracking Plan:** `dm3/website/MARKETING_TRACKING_PLAN.md` — analytics events & goals

## Deployment

Currently served locally via Python HTTP server + ngrok tunnel. For production, deploy as static files to any CDN (Vercel, Netlify, Cloudflare Pages, etc.).

Target domain: **duallmaster.com** (TBD)
