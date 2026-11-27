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
