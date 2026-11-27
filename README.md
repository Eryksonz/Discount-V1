# Tape & Tailor

A deterministic menswear price tracker covering 16 curated brands for finance students and young professionals. Pulls prices directly from each brand's public website, tracks 90-day time-weighted medians, exposes perpetual "always-on-sale" markups, and routes checkout directly to the brand via strictly allowlisted outbound links.

**Independent publication:** Tape & Tailor is not affiliated with, sponsored by, or endorsed by any of the brands listed. Four-character brand codes (`PMLR`, `BRKS`, `FHRT`, `BNBS`, etc.) are internal catalog identifiers, not stock quotes.

**Fully deterministic backend:** Zero LLM/AI calls or AI API keys anywhere at runtime. Every classification, deal label, 0–100 deal score, and product history note is derived from stored data, explicit thresholds, and unit-tested rules.

---

## Completed Phases

### Phase 1 (+ Hardening)
- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 editorial interface.
- Curated 16-brand config (`config/brands.ts`) with strict `allowedHosts` per brand.
- Explicit deal thresholds & score weights (`config/deal-thresholds.ts`), pure-function Deal Engine (`src/lib/deals/`), and rules-based classifier (`src/lib/classify/`).
- Visible **Demo Data** banner whenever seeded demo items are displayed; local demo fallback gated strictly behind `DEMO_MODE=true` (throws loudly in production without `DATABASE_URL`).
- Hardened `/go/[id]` outbound redirect: rejects arbitrary query redirect params, reads URLs exclusively from DB, enforces HTTPS + brand `allowedHosts`, and logs clicks to `outbound_clicks`.
- 100% data-derived history notes (zero unverifiable fabric/fit claims).

### Phase 2 (Crawler, Neon Services, Admin & GitHub Actions)
- **16-Brand Probe CLI (`scripts/probe-brand.ts`)**: Checks `robots.txt` and probes JSON-LD, Shopify JSON, and internal APIs across all 16 brands (`npm run probe -- --all`). Live probe identified **Faherty** and **Bonobos** as the cleanest Shopify JSON pilot brands (`robots=200`).
- **Standalone Crawler (`crawler/`)**: Polite HTTP client (`robots.txt` cache, 1 req/2s per-domain rate limit, ETag/Last-Modified cache, descriptive `User-Agent`, exponential backoff, automatic circuit breaker after repeated 403/429s), `BrandAdapter` fallback chain, Shopify + JSON-LD parsers, sanity-check quarantine (`flagged_updates`), change-only `price_snapshots`, `crawl_runs` logging, and `>30%` product-count drop-off alerts (log + Resend email).
- **Saved Brand Fixtures & Parser Tests**: Real captured fixtures in `crawler/fixtures/` (`faherty.shopify.json`, `bonobos.shopify.json`, `sample-product.jsonld.html`) tested by Vitest (`crawler/__tests__/parsers.test.ts`).
- **Neon Services (`neon.ts`)**: Wired for Neon Postgres (pooled `DATABASE_URL` for queries, direct `DATABASE_URL_UNPOOLED` for migrations), Neon Object Storage (`src/lib/neon/storage.ts` archiving JSON crawl reports in `uploads`), and Neon Realtime (`src/lib/neon/realtime.ts` sealing live `crawl_runs` queries), verified via `GET /api/health/neon`.
- **Password-Protected `/admin`**: Unclassified product queue (assign category + create reusable rules in `custom_classification_rules`), quarantined price-update review, and `crawl_runs` / circuit-breaker dashboard.
- **GitHub Actions**: Daily baseline + manual trigger (`.github/workflows/crawl-baseline.yml`) and every-4-hours high-frequency crawl (`.github/workflows/crawl-high-freq.yml`).

---

## Setup & Commands

### Neon Provisioning
```bash
neon login
neon deploy
npm run db:migrate
npm run db:seed        # optional demo catalog
npm run crawl          # live crawl for verified pilot brands (faherty, bonobos)
```

### Local Development
```bash
npm install
npm run dev            # set DATABASE_URL in .env.local, or DEMO_MODE=true for demo preview
```

### Phase 3 (Product Detail Page, Watchlist, Resend Alerts, Promos & SQL Pagination)
- **Product Detail Page (`/p/[slug]`):** Interactive Recharts 90-day step price chart with 90-day median and 90-day low overlays, complete snapshot history table (including `compare_at_gap_pct`), 4-component Deal Score breakdown, data-derived history summary, and direct `/go/[id]` CTA with affiliate disclosure.
- **Watchlist (`/watchlist` & `/api/watchlist`):** Browser-saved watchlist hydrated with live Neon Postgres prices.
- **Deduplicated Resend Alerts (`POST /api/alerts`, `GET /api/alerts/unsubscribe`, `crawler/check-alerts.ts`):** Notifies users at most once per price level (`last_notified_price_cents`), enforces the 21-day maturity gate on `% below median` alerts, includes `List-Unsubscribe` headers + CAN-SPAM one-click unsubscribe, and runs automatically after GitHub Actions crawls.
- **Checkout Promos & Sale Events (`brand_promos`, `sale_events`, `product_sale_window_gaps`):** Managed in `/admin`; displayed separately on cards and `/p/[slug]` (never polluting `price_snapshots` or Deal Engine history); active sale events display a live banner and sitewide-sale comparison disclaimer.
- **SQL-Level Filtering, Search & Pagination:** `/api/products` runs indexed `WHERE`, `tsvector` + `pg_trgm` search, `ORDER BY`, and `LIMIT`/`OFFSET` in SQL (24–48 items/page), loading `price_snapshots` only for the active page's IDs.

---

### Black Friday Week Crawl Schedule (Nov–Dec 2026 Baseline Capture)
Manual `workflow_dispatch` crawls (from GitHub → Actions → **Baseline Daily Crawl**, or one-click **Crawl Now** in `/admin` when `GITHUB_TOKEN` is set) should be triggered on:
1. **Thursday night (Nov 26, 2026)** — initial Black Friday week baseline (captured)
2. **Friday midday (Nov 27, 2026)** — peak Black Friday snapshot
3. **Saturday (Nov 28, 2026)** — Black Friday weekend hold/reversion check
4. **Monday (Nov 30, 2026)** — Cyber Monday pricing & checkout promo capture
5. **Mid-December (approx. Dec 14–16, 2026)** — post-sale baseline to separate true promotional drops from permanent compare-at pricing via `product_sale_window_gaps`.

### GitHub Actions Minutes Budget (Measured Nov 26, 2026)
GitHub Free provides **2,000 Actions minutes/month** for private repositories (`ubuntu-latest` 1x multiplier). Using real measured full-catalog crawl durations (**Faherty:** `27.7s` for 2,689 SKUs; **Bonobos:** `476.5s` / ~7.9 min for 3,899 SKUs with sub-page bisection; combined ~8.4 min + ~0.6 min runner setup ≈ **9.0 min/run**):

| Workflow | Schedule | Measured Runtime / Run | Runs / Month | Est. Monthly Minutes |
| --- | --- | --- | ---: | ---: |
| `crawl-baseline.yml` (Faherty + Bonobos full catalog + alert check) | Daily (`0 6 * * *`) | **~9.0 min** | 30 | **~270 min** |
| `crawl-high-freq.yml` (opt-in idle: 0 brands eligible) | Every 4h (`0 */4 * * *`) | ~0.5 min (fast DB check exit) | ~156 idle runs | **~78 min** |
| `crawl-high-freq.yml` (opt-in active: e.g. 4 sale-event days/mo) | Every 4h during active windows | **~9.0 min** | ~24 active runs | **~216 min** |
| **Estimated Total (Faherty + Bonobos)** | | | | **~564 min / mo (~28% of Free tier)** |

**Scaling Design for Detail-Page Brands (Brooks Brothers & Vineyard Vines):**
- Both Brooks Brothers (`sitemap_0-product.xml`: 2,414 URLs, 100% `<lastmod>`) and Vineyard Vines (`sitemap_0.xml`: 3,250 URLs, 100% `<lastmod>`) support direct JSON-LD without Playwright, but full page-by-page crawls take ~40–110 min at 1 req/2–2.5s.
- To stay well inside GitHub Actions budgets, detail-page brands use **sitemap `<lastmod>` incremental crawling** (only fetching URLs whose `<lastmod>` advanced since the previous `crawl_runs.started_at`, typically 5–10% of catalog = **3–10 min/day**) plus **tiered frequency** (checking active sale items and alerted products every 4–24h, and rotating full-catalog sweeps weekly in sharded batches).

### Affiliate Readiness Checklist
Before applying to affiliate networks (Rakuten Advertising, Impact, CJ Affiliate, Awin, ShareASale):
- [ ] Custom production domain configured on Vercel (HTTPS, clean DNS)
- [x] Dedicated About page (`/about`) explaining methodology, independence, and mission
- [x] Clear affiliate disclosure on every page with outbound links (`DealCard`, `/p/[slug]`, `SiteFooter`)
- [x] Privacy Policy (`/privacy`) including CAN-SPAM email alert & one-click unsubscribe policy
- [x] Terms of Use (`/terms`) including price-change disclaimer
- [x] Explicit "not affiliated with, sponsored by, or endorsed by any of the brands listed" notice in both footer and `/terms`
- [x] Outbound redirect `/go/[id]` locked down to allowlisted brand domains with click logging (`outbound_clicks`)
- [ ] Populate verified live domain + real contact email in `NEXT_PUBLIC_SITE_URL`, `CRAWLER_CONTACT_EMAIL`, and Resend sending domain

### Git Pre-Commit Guard (`.githooks/pre-commit`)
Enable the bundled pre-commit hook that blocks staging `.env*` files or secret patterns:
```bash
npm run hooks:install
```

### Testing, Probing & Crawling
```bash
npm test                                    # Vitest unit + parser regression suite
npm run typecheck                           # TypeScript strict check
npm run build                               # Production Next.js build
npm run probe -- --all                      # Probe all 16 brands
npm run crawl:dry -- --brand=faherty,bonobos --max=20
npm run crawl -- --brand=faherty,bonobos --mode=manual
```

---

## Environment Variables (`.env.example`)
| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled Postgres URL (runtime app queries) |
| `DATABASE_URL_UNPOOLED` | Neon direct Postgres URL (schema migrations via `npm run db:migrate`) |
| `DEMO_MODE` | Set `"true"` ONLY for local demo preview without Postgres; leave unset/`"false"` in production |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Neon Object Storage (`uploads` bucket, pulled by `neon deploy`) |
| `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` | Neon Realtime live SQL queries (pulled by `neon deploy`) |
| `ADMIN_PASSWORD` | Password for `/admin` session auth |
| `CRAWLER_CONTACT_EMAIL` | Contact email in crawler `User-Agent` |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ADMIN_ALERT_EMAIL` | Resend email delivery for >30% drop alerts and Phase 3 user price alerts |

---

## What's Next (Phase 3)
1. Dedicated product detail page (`/p/[slug]`) with full interactive Recharts 90-day price chart, median/low overlays, snapshot table, and score breakdown.
2. Saved watchlist + price-drop email alerts (target price or % off) with scheduled Resend evaluator deduplicated by price level and CAN-SPAM one-click unsubscribe (`/api/alerts/unsubscribe`).
