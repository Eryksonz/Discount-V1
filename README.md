# Tape & Tailor

A free, non-commercial, deterministic menswear price tracker for college students and young professionals. Pulls public prices directly from brand websites, tracks 90-day time-weighted medians, exposes perpetual "always-on-sale" markups, and links directly to each brand's official product page.

**Non-commercial & independent:** This site has no affiliate links and earns no revenue. Tape & Tailor is not affiliated with, sponsored by, or endorsed by any of the brands listed. Four-character brand codes (`PMLR`, `BRKS`, `FHRT`, `BNBS`, etc.) are internal catalog identifiers, not stock quotes.

**Fully deterministic backend:** Zero LLM/AI calls or AI API keys anywhere at runtime. Every classification, formality level, deal label, 0–100 deal score, Interview Kit pick, and product history note is derived strictly from stored data, explicit thresholds, and unit-tested rules.

---

## Architecture Overview

- **Deal Engine & Rules Classifier (`src/lib/deals/`, `src/lib/classify/`, `config/`):**
  - 90-day time-weighted medians with a 21-day minimum history gate (`Building price history` below 21 days).
  - Declarative rules-based category, subcategory, formality (`high` | `medium` | `low`), color, and size normalization with `out_of_scope` isolation.
  - Direct-to-brand `/go/[id]` redirect with strict HTTPS + brand `allowedHosts` open-redirect protection, zero affiliate wrapping, and optional anonymous click counting (`OUTBOUND_CLICK_LOGGING=true` by default; zero personal data stored).
- **Standalone TypeScript Crawler (`crawler/`):**
  - **Faherty** & **Bonobos:** Full-catalog Shopify JSON pagination (`250 -> 100 -> 50` step-down + 25-item mid-catalog bisection).
  - **Brooks Brothers** & **Vineyard Vines:** Sitemap discovery (`crawler/sitemap.ts`) + `schema.org/ProductGroup` / `Product` / `BreadcrumbList` JSON-LD parser (`crawler/parsers/json-ld.ts`) respecting `robots.txt` and per-domain rate limits (no headless browser, no bot-challenge bypass). Supports hybrid incremental scheduled runs (default) and manual-only sale-week `--force-refresh` with deterministic `--offset` / `--max` batching.
  - **Per-Run Coverage Reporting:** Every run records `urls_discovered`, `urls_fetched`, `urls_parsed`, `urls_skipped_fresh`, `urls_skipped_oos`, and `forced_refresh` in `crawl_runs`, surfaced in `/status` and `/admin`.
  - **Concurrency Safety:** Both crawler workflows declare `concurrency: { group: "crawl-${{ inputs.brand || 'all' }}", cancel-in-progress: false }` so duplicate runs for the same brand queue safely while runs for different brands proceed independently.
  - **Brands Not Tracked Yet (e.g., Peter Millar):** Excluded from the feed and crawler; listed on Home and `/about` with a plain direct link to the brand's site and no prices.
- **Product Detail, Local Watchlist & Alerts (`/p/[slug]`, `/watchlist`):**
  - Interactive 90-day Recharts step price chart with 90-day median and low overlays.
  - `ALERTS_MODE` (`"local"` default | `"email"`): In `"local"` mode, watchlist items and target prices live in browser `localStorage`, displaying `"Price Dropped"` badges and a banner on `/watchlist` with zero Resend or paid-domain dependency. The `"email"` path remains intact for later.
- **Interview Kits, Sale Calendar, Student Discounts & Admin Ops (`/kits`, `/calendar`, `/students`, `/admin`, `/status`):**
  - `/kits`: Deterministic optimizer across 3 budget tiers (`$450`, `$850`, `$1,500`), 5 required slots (including dedicated Dress Shoes) + optional Dress Belt, configurable neutral palettes & color-pairing rules (`config/kit-rules.ts`), minimum slot formality per tier, max 2 items/brand, and strict non-relaxation.
  - `/calendar`: Labels unconfirmed/seeded events as `"Typical timing, not confirmed"` until explicitly confirmed by an admin.
  - `/students`: Displays only DB-verified offers with `"Last verified"` dates; unverified brands appear under `"Check the Brand's Site"`.
  - `/admin` & `/status`: Constant-time SHA-256 auth, login rate limiting, `httpOnly` + `secure` + `sameSite: "strict"` cookies, production startup enforcement requiring strong `ADMIN_PASSWORD` (`>= 16` chars), and admin-only `/status` coverage & crawl telemetry.

---

## Free-Tier Non-Commercial Deployment ($0/month)

| Service | Tier | Region / Domain | Compatibility & Notes |
| --- | --- | --- | --- |
| **Vercel** | **Hobby (Free)** | `cle1` (single region in `vercel.json`) · default `*.vercel.app` domain | **Non-commercial use only.** Vercel Hobby permits **1 region** (`["cle1"]` is valid and co-locates with Neon `us-east-2`; multiple regions would fail deploy; default fallback if unset is `iad1`). Max function duration is 300s (all routes respond in `< 2s`). |
| **Neon** | **Free Tier** | AWS `us-east-2` (Ohio) | Pooled `DATABASE_URL` for runtime queries; direct `DATABASE_URL_UNPOOLED` for migrations. Object Storage & Realtime are completely optional. |
| **GitHub Actions** | **Free Tier** | `ubuntu-latest` | 2,000 free min/month (private repo) or unlimited (public repo). |
| **Alerts (`ALERTS_MODE=local`)** | **Browser `localStorage`** | No domain or Resend needed | Default mode; zero email or domain cost. |

### Minimal Production Environment Variables

#### Vercel (Next.js App)
- **Required (4 variables only — verified clean build & boot with nothing else set):**
  1. `DATABASE_URL` — Neon **pooled** Postgres URL
  2. `ADMIN_PASSWORD` — Strong random secret (`>= 16` chars; server refuses production startup if missing or weak)
  3. `ALERTS_MODE` — Set to `local` (also the default)
  4. `NEXT_PUBLIC_SITE_URL` — Deployment origin (e.g. `https://your-app.vercel.app`)
- **Optional (gracefully degrade when unset):**
  - `SITE_INDEXING` — `"off"` (default) or `"on"` (see Indexing Control below)
  - `OUTBOUND_CLICK_LOGGING` — `"true"` (default) or `"false"` (anonymous click counter only, no personal data)
  - `GITHUB_TOKEN`, `GITHUB_REPO` — Enables in-app **Crawl Now** button in `/admin` (shows `"Not configured"` calmly when unset)
  - `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` — Optional Neon Realtime sealed queries (`/api/health` and `/api/realtime/crawl-runs` report `"not_configured"` and stay healthy when unset)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` — Optional Neon Object Storage
  - `RESEND_API_KEY`, `ALERT_FROM_EMAIL` — Only needed if switching `ALERTS_MODE=email`
  - **Do NOT set `DEMO_MODE=true` in production.**

#### GitHub Actions (Standalone Crawler)
- **Required Secrets (2):**
  1. `DATABASE_URL` — Neon pooled Postgres URL
  2. `CRAWLER_CONTACT_EMAIL` — Contact email for `TapeAndTailorBot` `User-Agent`
- **Optional Secrets / Variables:**
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` — Archive JSON crawl summaries to Neon Object Storage
  - `RESEND_API_KEY`, `ADMIN_ALERT_EMAIL`, `ALERT_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL` — Only if enabling email drop alerts or `ALERTS_MODE=email`
  - `ALERTS_MODE` (Repository Variable) — Defaults to `local`

---

## Indexing Control (`SITE_INDEXING`)

By default, **`SITE_INDEXING` is `"off"`** so staging or pre-launch `*.vercel.app` deployments are never indexed by search engines:
- `GET /robots.txt` returns `User-agent: *` + `Disallow: /`
- Every page emits `<meta name="robots" content="noindex, nofollow">`
- Every response includes `X-Robots-Tag: noindex, nofollow`
- `GET /sitemap.xml` returns an empty sitemap

**How to switch indexing ON when ready to launch publicly:**
1. In Vercel → Project Settings → Environment Variables (Production), set:
   - `SITE_INDEXING=on`
   - `NEXT_PUBLIC_SITE_URL=https://<your-live-domain>`
2. Redeploy. Once active:
   - `/robots.txt` allows public pages, disallows `/admin`, `/status`, `/api/`, and `/go/`, and advertises `Sitemap: <SITE_URL>/sitemap.xml`
   - `/sitemap.xml` dynamically lists all public pages and live in-scope `/p/<slug>` product pages
   - `<meta name="robots">` switches to `index, follow` on public pages while `/admin`, `/status`, `/api/*`, and `/go/*` retain `X-Robots-Tag: noindex, nofollow`.

---

## GitHub Actions Minutes Budget (Scheduled vs Manual Forced Passes)

Scheduled cron runs (`crawl-baseline.yml` & `crawl-high-freq.yml`) **always** run in normal incremental mode; `--force-refresh` is strictly restricted to manual `workflow_dispatch`.

### Scheduled Runs (Automatic Monthly Baseline)
| Workflow | Schedule | Mode | Est. Runtime / Run | Runs / Month | Est. Monthly Minutes |
| --- | --- | --- | ---: | ---: | ---: |
| `crawl-baseline.yml` | Daily (`0 6 * * *`) | Incremental (`--mode=baseline`, no `--force-refresh`) | ~14–19 min | 30 | **~420–570 min** |
| `crawl-high-freq.yml` (idle) | Every 4h (`0 */4 * * *`) | Opt-in incremental (exits immediately when 0 opted in) | ~0.5 min | ~156 | **~78 min** |
| `crawl-high-freq.yml` (active sale windows) | Every 4h during active `sale_events` | Opt-in incremental | ~12 min | ~24 | **~288 min** |
| **Scheduled Monthly Total** | | | | | **~786–936 min / mo (~39–47% of Free 2,000m)** |

### Manual Forced Passes (`workflow_dispatch` with `force_refresh=true`)
| Brand | Full Forced Pass Scope | Rate Limit | Est. Runtime | Recommended Batching (`offset` / `max_products`) |
| --- | --- | ---: | ---: | --- |
| **Faherty** | 2,689 SKUs (Shopify JSON) | 2.0s/req | **~0.5 min** | Single run |
| **Bonobos** | 3,900 SKUs (Shopify JSON) | 2.0s/req | **~8.0 min** | Single run |
| **Vineyard Vines** | 1,398 men's URLs (Sitemap JSON-LD) | 2.0s/req | **~47 min** | Single run (fits 90m timeout) or 2× `700` |
| **Brooks Brothers** | 2,316 men's URLs (Sitemap JSON-LD) | 2.5s/req | **~101 min** | 2 runs (`offset=0, max=1200` + `offset=1200, max=1200`, ~50m each) or 4× `600` (~26m each) |

---

## Local Setup & Commands
```bash
npm install
npm run hooks:install       # Enable .githooks/pre-commit secret guard
npm run db:migrate          # Apply 0001..0005 SQL migrations to Neon
npm run dev                 # Requires DATABASE_URL in .env.local (or DEMO_MODE=true locally)

npm test                    # Vitest unit, parser, kit optimizer & security test suite
npm run typecheck           # TypeScript strict check
npm run build               # Production Next.js build
npm run crawl -- --brand=faherty,bonobos --mode=manual
npm run crawl -- --brand=brooks-brothers --mode=manual --force-refresh --offset=0 --max=600
```

---

## Optional Future Monetization (Currently Disabled)
This site is currently free and non-commercial (`no affiliate links, no revenue`). If you ever transition to a commercial hosting tier (e.g., Vercel Pro) with a custom domain:
- Upgrade off Vercel Hobby before adding any monetization.
- Add a custom HTTPS domain and update `/about`, `/privacy`, `/terms`, and `SiteFooter` with affiliate disclosures.
- Re-enable affiliate URL wrapping in `config/brands.ts` and configure `crawler/adapters/rakuten-feed.ts` for feed-based brands.
