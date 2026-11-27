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
  - **Per-Run Coverage Reporting:** Every run records `urls_discovered`, `urls_selected`, `urls_fetched`, `urls_parsed`, `urls_quarantined`, `urls_skipped_fresh`, `urls_skipped_oos`, `batch_offset`, `batch_max_products`, and `forced_refresh` in `crawl_runs`. `/status` computes per-brand 24h coverage (`products fetched in last 24h / URLs discovered`) and flags a warning if coverage is `< 95%` after a forced pass.
  - **Concurrency Safety:** Both crawler workflows share a single repository-wide concurrency group (`tape-and-tailor-crawl`, `cancel-in-progress: false`) so an `"all brands"` scheduled run and a single-brand manual run can never overlap on the same retailer domain. **Important:** GitHub Actions keeps at most **1 pending (queued) run** per concurrency group (a 3rd run cancels the waiting 2nd run), so if you ever run manual batches, start them one at a time.
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

Scheduled cron runs (`crawl-baseline.yml` & `crawl-high-freq.yml`) **always** run in normal incremental mode; `--force-refresh` is strictly restricted to manual `workflow_dispatch`. Note that GitHub Actions bills each job rounded **up to the next whole minute** (so an idle 40-second run still bills **1 full minute**).

### Scheduled Runs (Automatic Monthly Baseline)
| Workflow | Schedule | Mode | Est. Billed / Run | Runs / Month | Est. Monthly Minutes |
| --- | --- | --- | ---: | ---: | ---: |
| `crawl-baseline.yml` | Daily (`0 6 * * *`) | Incremental (`--mode=baseline`, timeout 35m) | ~15–19 min | 30 | **~450–570 min** |
| `crawl-high-freq.yml` (idle — 0 brands opted in) | Every 4h (`0 */4 * * *`) | Exits after DB check (`checkout` + `npm ci` ≈ 45s -> **1 billed min**) | **1 min** | 180 | **~180 min** |
| `crawl-high-freq.yml` (active sale windows, e.g. 4 days/mo) | Every 4h during active `sale_events` | Opt-in incremental (replaces 24 of the 180 idle runs) | ~12 min | 24 | **+264 min net** |
| **Scheduled Monthly Total (no active sale events)** | | | | | **~630–750 min / mo (~32–38% of Free 2,000m)** |
| **Scheduled Monthly Total (4 active sale days/mo)** | | | | | **~894–1,014 min / mo (~45–51% of Free 2,000m)** |

**Options to cut scheduled Actions minutes:**
1. **Disable `crawl-high-freq.yml` in GitHub → Actions** until at least one brand is explicitly opted in (saves **~180–444 min/mo** immediately).
2. **Make the repository public:** GitHub Actions minutes are unlimited ($0) for public repos (2,000 min/mo applies only to private repos).
3. **Run baseline every 48h** during quiet off-season months (cuts baseline minutes in half to ~225–285 min/mo).

### Manual Forced Passes (`workflow_dispatch` with `force_refresh=true`, 150m timeout)
Manual `workflow_dispatch` jobs get a **150-minute timeout**, so even a full forced **Brooks Brothers** pass (~101m) completes in **one single job** without batching. If a job is ever cancelled or interrupted, re-run with `skip_fetched_within_hours=24` to resume cleanly without refetching already-checked URLs.

| Brand | Full Forced Pass Scope | Rate Limit | Est. Runtime | Recommended Workflow Inputs |
| --- | --- | ---: | ---: | --- |
| **Faherty** | 2,689 SKUs (Shopify JSON) | 2.0s/req | **~0.5 min** | `brand=faherty`, `force_refresh=true` |
| **Bonobos** | 3,900 SKUs (Shopify JSON) | 2.0s/req | **~8.0 min** | `brand=bonobos`, `force_refresh=true` |
| **Vineyard Vines** | 1,398 men's URLs (Sitemap JSON-LD) | 2.0s/req | **~47 min** | `brand=vineyard-vines`, `force_refresh=true` |
| **Brooks Brothers** | 2,316 men's URLs (Sitemap JSON-LD) | 2.5s/req | **~101 min** | `brand=brooks-brothers`, `force_refresh=true` (single 150m job; resume with `skip_fetched_within_hours=24` if needed) |

> **Queueing note:** Both workflows share the single `tape-and-tailor-crawl` concurrency group (`cancel-in-progress: false`). GitHub keeps at most **1 pending run** per concurrency group, so start manual runs/batches one at a time.

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
