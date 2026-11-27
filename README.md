# Tape & Tailor

A deterministic menswear price tracker covering 16 curated brands for finance students and young professionals. Pulls prices directly from each brand's public website, tracks 90-day time-weighted medians, exposes perpetual "always-on-sale" markups, and routes checkout directly to the brand via strictly allowlisted outbound links.

**Independent publication:** Tape & Tailor is not affiliated with, sponsored by, or endorsed by any of the brands listed. Four-character brand codes (`PMLR`, `BRKS`, `FHRT`, `BNBS`, etc.) are internal catalog identifiers, not stock quotes.

**Fully deterministic backend:** Zero LLM/AI calls or AI API keys anywhere at runtime. Every classification, deal label, 0–100 deal score, Interview Kit pick, and product history note is derived strictly from stored data, explicit thresholds, and unit-tested rules.

---

## Architecture & Completed Phases

### Phase 1 — Core Deal Engine, Classifier & Security Hardening
- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 editorial interface.
- Curated 16-brand registry (`config/brands.ts`) with strict `allowedHosts`, `ingestionStatus` (`active` | `feed_pending` | `blocked` | `planned`), and configurable rate limits.
- Explicit deal thresholds & score weights (`config/deal-thresholds.ts`), pure-function Deal Engine (`src/lib/deals/`), and declarative rules-based classifier (`src/lib/classify/`) with `out_of_scope` isolation.
- Local demo fallback gated strictly behind `DEMO_MODE=true` (throws loudly in production without `DATABASE_URL`).
- Hardened `/go/[id]` outbound redirect: rejects arbitrary query redirect params, reads URLs exclusively from Postgres, enforces HTTPS + brand `allowedHosts`, and logs clicks to `outbound_clicks`.
- 100% data-derived history notes (zero unverifiable fabric/fit claims).

### Phase 2 — Standalone Crawler, Neon Services, Admin & GitHub Actions
- **16-Brand Probe CLI (`scripts/probe-brand.ts`)**: Checks `robots.txt` and probes Shopify JSON, sitemaps, and JSON-LD across all 16 brands (`npm run probe -- --all`).
- **Active Brand Adapters (`crawler/`):**
  - **Faherty** & **Bonobos:** Full-catalog Shopify JSON pagination (`250 -> 100 -> 50` step-down + 25-item mid-catalog bisection for variant-heavy pages).
  - **Brooks Brothers** & **Vineyard Vines:** Sitemap discovery (`crawler/sitemap.ts`) + `schema.org/ProductGroup` / `Product` / `BreadcrumbList` JSON-LD parser (`crawler/parsers/json-ld.ts`), strictly respecting `robots.txt` and per-domain rate limits (no headless browser, no bot-challenge bypass). Vineyard Vines is strictly scoped to `/product/mens-*` URLs. Hybrid incremental logic re-fetches new URLs, `<lastmod>` updates, rolling 7-day in-stock re-checks, and daily watchlisted/high-score re-checks.
  - **Peter Millar:** Marked `ingestionStatus: "feed_pending"` (hidden from public deal feeds; crawler disabled) with a documented **Rakuten Advertising** catalog feed adapter stub (`crawler/adapters/rakuten-feed.ts`).
- **Quality & Observability:** Saved brand fixtures (`crawler/fixtures/*.json`, `*.jsonld.html`) tested by Vitest, price sanity-check quarantine (`flagged_updates`), change-only `price_snapshots`, `crawl_runs` logging, and `>30%` catalog-drop / parse-yield drop alerts (log + Resend email).
- **Neon Services (`neon.ts`):** Neon Postgres (`DATABASE_URL` pooled for runtime queries, `DATABASE_URL_UNPOOLED` direct for migrations), Neon Object Storage (`uploads` bucket for crawl reports), and Neon Realtime (`src/lib/neon/realtime.ts`).
- **Password-Protected `/admin`:** Constant-time SHA-256 auth, login rate limiting, `httpOnly` + `secure` + `sameSite: "strict"` cookies, Unclassified Queue (+ custom rule creation), Out-of-Scope Audit, Checkout Promos & Sale Events CRUD, Quarantined Updates, and Crawl Runs / one-click `Crawl Now`.

### Phase 3 — Product Detail, Watchlist, Alerts, Promos & SQL Pagination
- **Product Detail Page (`/p/[slug]`):** Interactive Recharts 90-day step price chart with 90-day median and low overlays, snapshot table (including `compare_at_gap_pct`), 4-component Deal Score breakdown, data-derived summary, and `/go/[id]` CTA with affiliate disclosure.
- **Watchlist (`/watchlist` & `/api/watchlist`):** Browser-saved watchlist hydrated with live Neon Postgres prices.
- **Deduplicated Resend Alerts (`POST /api/alerts`, `GET /api/alerts/unsubscribe`, `crawler/check-alerts.ts`):** Notifies users at most once per price level (`last_notified_price_cents`), enforces the 21-day maturity gate on `% below median` alerts, and includes CAN-SPAM `List-Unsubscribe` headers + one-click unsubscribe.
- **Checkout Promos & Sale Events (`brand_promos`, `sale_events`, `product_sale_window_gaps`):** Managed in `/admin` and strictly separated as a display layer (never mutating `price_snapshots`).
- **Indexed SQL Filtering, Search & Pagination:** `/api/products` runs indexed `WHERE`, Postgres `tsvector` + `pg_trgm` search, `ORDER BY`, and `LIMIT`/`OFFSET` in SQL, fetching `price_snapshots` only for the active page.

### Phase 4 — Sale Calendar, Student Discounts & Interview Kit Bundle Engine
- **Sale Calendar (`/calendar`):** Live, upcoming, and completed seasonal sale windows (`sale_events`) plus active checkout promos (`brand_promos`) and high-frequency crawl indicators.
- **Student Discounts (`/students`):** Filterable directory of verified student discount programs (`student_promos` via SheerID, Student Beans, UNiDAYS) with active brand promo context and stacking disclaimers.
- **Interview Kit Bundle Engine (`/kits`, `/api/kits`, `src/lib/kits/index.ts`):** Pure, unit-tested deterministic optimizer across 3 budget tiers (**Student Starter** ≤ $450, **Summer Intern** ≤ $850, **Full-Time Analyst** ≤ $1,500) and 5 slots (Suit/Blazer, Dress Shirt/OCBD, Trousers/Chinos, Office Layer, Dress Shoes/Belt). Enforces in-stock & optional size matching, max 2 items per brand, maximizes Deal Score under the budget cap, explains why each item was chosen, and gracefully degrades any slot lacking sufficient inventory (`"Not enough in-scope inventory yet"`).

---

## Deployment & Vercel Region Configuration

### Co-Located Vercel Region (`vercel.json`)
The Neon Postgres database is provisioned in **AWS `us-east-2` (Ohio)**. To minimize serverless query latency, `vercel.json` pins Vercel Functions to **`cle1`** (Cleveland, OH / AWS `us-east-2`):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["cle1"]
}
```
Verify in Vercel Project Settings → Functions that the function region matches `cle1` (override is honored automatically from `vercel.json`).

---

## Production Environment Variables

Configure these variables in **Vercel (Production & Preview)** and **GitHub Actions Repository Secrets** (never commit `.env` or `.env.local` — `.githooks/pre-commit` enforces this):

| Variable | Vercel | GitHub Actions | Required | Purpose |
| --- | :---: | :---: | :---: | --- |
| `DATABASE_URL` | Yes | Yes | **Yes** | Neon **pooled** Postgres URL for app runtime & crawler writes |
| `DATABASE_URL_UNPOOLED` | Optional | Optional | Migrations | Neon **direct** Postgres URL used by `npm run db:migrate` |
| `DEMO_MODE` | **Unset / `false`** | **Unset** | Prod guard | Must NOT be `"true"` in production; prevents silent demo fallback |
| `ADMIN_PASSWORD` | Yes | No | **Yes** | Strong random secret (≥ 24 chars) protecting `/admin` |
| `NEXT_PUBLIC_SITE_URL` | Yes | Yes | **Yes** | Canonical HTTPS production origin (e.g., `https://tapeandtailor.com`) used in alert emails & unsubscribe links |
| `CRAWLER_CONTACT_EMAIL` | No | Yes | **Yes** | Real contact email placed in `TapeAndTailorBot` `User-Agent` |
| `RESEND_API_KEY` | Yes | Yes | **Yes** | Resend API key for price-drop alerts and >30% crawler drop alerts |
| `ALERT_FROM_EMAIL` | Yes | Yes | **Yes** | Verified Resend sender (e.g., `alerts@tapeandtailor.com`) |
| `ADMIN_ALERT_EMAIL` | No | Yes | **Yes** | Operator email receiving >30% catalog/parse-yield drop alerts |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Optional | Optional | Recommended | Neon Object Storage (`uploads` bucket) for archived crawl reports |
| `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` | Optional | No | Recommended | Neon Realtime token sealing for `/api/realtime/crawl-runs` |
| `GITHUB_TOKEN`, `GITHUB_REPOSITORY` | Optional | Auto | Optional | Enables one-click **Crawl Now** button inside `/admin` (`actions:write` scope) |
| `RAKUTEN_FEED_URL_PETER_MILLAR` | No | Future | Feed pending | Activated once Peter Millar approves Rakuten product feed access |

---

## Pre-Launch Checklist

### Infrastructure & Security
- [x] `vercel.json` pinned to `cle1` (co-located with Neon `aws-us-east-2`)
- [x] `.githooks/pre-commit` installed (`npm run hooks:install`) and verified zero secrets in git history
- [x] `/api/health` and `/api/health/neon` redact service URLs, bucket names, and raw errors in production
- [x] `/admin` protected by constant-time SHA-256 auth, login rate limiting (5 attempts / 15 min), and `httpOnly` + `secure` + `sameSite: "strict"` cookies
- [x] `/go/[id]` rejects arbitrary redirect params, enforces HTTPS + brand `allowedHosts`, and logs clicks to `outbound_clicks`
- [ ] Set all required Vercel Production env vars (`DATABASE_URL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `ALERT_FROM_EMAIL`) with `DEMO_MODE` unset
- [ ] Set all required GitHub Actions repository secrets (`DATABASE_URL`, `CRAWLER_CONTACT_EMAIL`, `RESEND_API_KEY`, `ADMIN_ALERT_EMAIL`, `ALERT_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`)
- [ ] Run `npm run db:migrate` against production Neon branch after deploying schema migrations (`0001`–`0003`)
- [ ] Configure custom HTTPS domain on Vercel and verify SPF/DKIM/DMARC records in Resend for `ALERT_FROM_EMAIL`

### Data Quality & Crawler Operations
- [x] Full-catalog Shopify pagination live for Faherty (`2,689` SKUs) and Bonobos (`3,900` SKUs)
- [x] Sitemap + `ProductGroup` JSON-LD adapters built & piloted for Brooks Brothers and Vineyard Vines with hybrid incremental re-checks
- [x] Peter Millar set to `feed_pending` (hidden from public feed, crawler disabled, Rakuten adapter stub ready)
- [ ] Trigger GitHub Actions `workflow_dispatch` full-catalog sweeps for Brooks Brothers & Vineyard Vines (resumable in incremental batches; see Actions budget below)
- [ ] Complete Black Friday → mid-December baseline snapshots to validate `product_sale_window_gaps`

### Compliance & Affiliate Readiness
- [x] Dedicated About page (`/about`) explaining deterministic methodology and independence
- [x] Affiliate disclosure on every page with outbound links (`DealCard`, `/p/[slug]`, `/kits`, `SiteFooter`)
- [x] Privacy Policy (`/privacy`) with CAN-SPAM email alert & one-click unsubscribe (`/api/alerts/unsubscribe`)
- [x] Terms of Use (`/terms`) with price-change disclaimer and non-affiliation notice
- [x] Explicit "not affiliated with, sponsored by, or endorsed by any of the brands listed" notice in footer and `/terms`
- [ ] Submit affiliate network applications (Rakuten Advertising, Impact, CJ Affiliate, Awin) once custom domain is live

---

## GitHub Actions Minutes Budget

GitHub Free provides **2,000 Actions minutes/month** for private repositories (`ubuntu-latest` 1x multiplier):

| Workflow | Scope & Strategy | Est. Runtime / Run | Runs / Month | Est. Monthly Minutes |
| --- | --- | --- | ---: | ---: |
| `crawl-baseline.yml` | Faherty + Bonobos full catalog (`~9.0 min`) + BB/VV incremental (`~5–10 min` after initial backfill) + alert check | **~15–19 min** | 30 | **~450–570 min** |
| `crawl-high-freq.yml` (idle) | Opt-in check exits cleanly when 0 brands are opted in | ~0.5 min | ~156 | **~78 min** |
| `crawl-high-freq.yml` (active events) | Opt-in 4h crawls during active `sale_events` (e.g. 4 days/mo) | ~12 min | ~24 | **~288 min** |
| **Estimated Total** | | | | **~816–936 min / mo (~41–47% of Free tier)** |

> **Initial Backfill Note for Brooks Brothers & Vineyard Vines:** Full first-time ingestion at strict polite rate limits takes ~46 min for Vineyard Vines (`1,398` men's URLs @ 2.0s/req) and ~98 min for Brooks Brothers (`2,316` men's/unprefixed URLs @ 2.5s/req). Because `selectIncrementalUrls()` automatically skips URLs fetched within the last 7 days, you can backfill in safe resumable batches (e.g., `max_products=500` via Actions `workflow_dispatch`) without ever exceeding the 90-minute job timeout.

---

## Local Setup & Commands
```bash
npm install
npm run hooks:install       # Enable .githooks/pre-commit secret guard
npm run db:migrate          # Apply 0001..0003 SQL migrations to Neon
npm run dev                 # Requires DATABASE_URL in .env.local (or DEMO_MODE=true locally)

npm test                    # Vitest unit + parser + kit optimizer suite
npm run typecheck           # TypeScript strict check
npm run build               # Production Next.js build
npm run probe -- --all      # Probe all 16 brands
npm run crawl -- --brand=brooks-brothers,vineyard-vines --mode=manual --max=50
```
