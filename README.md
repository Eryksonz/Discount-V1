# Tape & Tailor

A free, non-commercial, deterministic menswear price tracker for college students and young professionals. Pulls public prices directly from brand websites, tracks 90-day time-weighted medians, exposes perpetual "always-on-sale" markups, and links directly to each brand's official product page.

**Non-commercial & independent:** This site has no affiliate links and earns no revenue. Tape & Tailor is not affiliated with, sponsored by, or endorsed by any of the brands listed. Four-character brand codes (`PMLR`, `BRKS`, `FHRT`, `BNBS`, etc.) are internal catalog identifiers, not stock quotes.

**Fully deterministic backend:** Zero LLM/AI calls or AI API keys anywhere at runtime. Every classification, formality level, deal label, 0–100 deal score, Interview Kit pick, and product history note is derived strictly from stored data, explicit thresholds, and unit-tested rules.

---

## Architecture Overview

- **Deal Engine & Rules Classifier (`src/lib/deals/`, `src/lib/classify/`, `config/`):**
  - 90-day time-weighted medians with a 21-day minimum history gate (`Building price history` below 21 days).
  - Declarative rules-based category, subcategory, formality (`high` | `medium` | `low`), color, and size normalization with `out_of_scope` isolation.
  - Direct-to-brand `/go/[id]` redirect with strict HTTPS + brand `allowedHosts` open-redirect protection, zero affiliate wrapping, and optional anonymous click counting (`OUTBOUND_CLICK_LOGGING=true` by default; no personal data stored).
- **Standalone TypeScript Crawler (`crawler/`):**
  - **Faherty** & **Bonobos:** Full-catalog Shopify JSON pagination (`250 -> 100 -> 50` step-down + 25-item mid-catalog bisection).
  - **Brooks Brothers** & **Vineyard Vines:** Sitemap discovery (`crawler/sitemap.ts`) + `schema.org/ProductGroup` / `Product` / `BreadcrumbList` JSON-LD parser (`crawler/parsers/json-ld.ts`) respecting `robots.txt` and per-domain rate limits (no headless browser, no bot-challenge bypass). Supports hybrid incremental runs (default) and sale-week `--force-refresh` with deterministic `--offset` / `--max` batching.
  - **Brands Not Tracked Yet (e.g., Peter Millar):** Excluded from the price feed and crawler; listed on Home and `/about` with a plain direct link to the brand's site and no prices.
- **Product Detail, Local Watchlist & Alerts (`/p/[slug]`, `/watchlist`):**
  - Interactive 90-day Recharts step price chart with 90-day median and low overlays.
  - `ALERTS_MODE` (`"local"` default | `"email"`): In `"local"` mode, watchlist items and target prices are stored in the visitor's browser (`localStorage`), displaying `"Price Dropped"` badges and a summary banner on `/watchlist` with zero Resend or paid-domain dependency. The `"email"` code path remains intact if enabled later.
- **Interview Kits, Sale Calendar, Student Discounts & Admin Ops (`/kits`, `/calendar`, `/students`, `/admin`, `/status`):**
  - `/kits`: Pure branch-and-bound optimizer across 3 budget tiers (`$450`, `$850`, `$1,500`), 5 required slots (including dedicated Dress Shoes) + optional Dress Belt, configurable neutral palettes & color-pairing rules (`config/kit-rules.ts`), minimum slot formality per tier, max 2 items/brand, and strict non-relaxation (`"Not enough in-scope inventory yet"`).
  - `/calendar`: Labels unconfirmed/seeded events as `"Typical timing, not confirmed"` until explicitly confirmed by an admin.
  - `/students`: Displays only DB-verified offers with a `"Last verified"` date, and lists unverified platforms honestly under `"Check the Brand's Site"`.
  - `/admin` & `/status`: Constant-time SHA-256 auth, login rate limiting, `httpOnly` + `secure` + `sameSite: "strict"` cookies, production startup enforcement requiring a strong `ADMIN_PASSWORD` (`>= 16` chars), and an admin-only `/status` dashboard showing last successful crawl time, product counts, demo-row audit (`0`), and snapshots per brand.

---

## Free-Tier Non-Commercial Deployment ($0/month)

This project is designed to run completely free with no paid domain and no email service required:

| Service | Tier | Region / Domain | Notes |
| --- | --- | --- | --- |
| **Vercel** | **Hobby (Free)** | `cle1` (pinned in `vercel.json`) · default `*.vercel.app` domain | **Non-commercial use only:** Vercel's Hobby plan is strictly for personal, non-commercial projects. Do not enable affiliate links or monetization on Hobby. |
| **Neon** | **Free Tier** | AWS `us-east-2` (Ohio) — co-located with Vercel `cle1` | Pooled `DATABASE_URL` for runtime queries, direct `DATABASE_URL_UNPOOLED` for migrations, optional Object Storage (`uploads`) & Realtime. |
| **GitHub Actions** | **Free Tier** | `ubuntu-latest` | 2,000 free min/month (private repo) or unlimited (public repo) running `.github/workflows/crawl-baseline.yml`. |
| **Alerts (`ALERTS_MODE=local`)** | **Browser `localStorage`** | No domain or Resend needed | Default mode; zero external cost or email deliverability setup. |

### Deployment Steps (Vercel Hobby + Neon Free + GitHub Actions)
1. **Provision Neon Postgres** in AWS `us-east-2` (`neon deploy` or Neon Console) and apply migrations:
   ```bash
   npm run db:migrate
   ```
2. **Import the GitHub repo into Vercel (Hobby)**:
   - `vercel.json` automatically pins Functions to `cle1` (co-located with Neon `us-east-2`).
   - Use the default `*.vercel.app` domain (HTTPS included automatically).
   - Set **only 2 required** Production env vars in Vercel: `DATABASE_URL` and a strong `ADMIN_PASSWORD` (`>= 16` random characters). Leave `DEMO_MODE` unset and `ALERTS_MODE` unset (defaults to `"local"`).
3. **Configure GitHub Actions Secrets** (`Settings -> Secrets and variables -> Actions`):
   - Required: `DATABASE_URL`, `CRAWLER_CONTACT_EMAIL`
   - Optional: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` (for Neon Object Storage crawl reports).
4. **Verify after deploy**:
   - Check `https://<your-app>.vercel.app/api/health` returns `{"ok": true}` (with service URLs redacted).
   - Sign in at `/admin` and open `/status` to confirm `0` demo rows and live crawl timestamps.

---

## Environment Variables

| Variable | Vercel | GitHub Actions | Default | Purpose |
| --- | :---: | :---: | --- | --- |
| `DATABASE_URL` | **Required** | **Required** | — | Neon pooled Postgres connection string |
| `DATABASE_URL_UNPOOLED` | Optional | Optional | — | Neon direct Postgres URL for `npm run db:migrate` |
| `ADMIN_PASSWORD` | **Required** | No | — | Strong random secret (`>= 16` chars); production server refuses startup if missing or weak |
| `ALERTS_MODE` | Optional | Optional | `"local"` | `"local"` (browser `localStorage`, no Resend) or `"email"` (Resend + Postgres alerts) |
| `OUTBOUND_CLICK_LOGGING` | Optional | No | `"true"` | Anonymous aggregate click counter on `/go/[id]` (no personal data); set `"false"` to disable |
| `DEMO_MODE` | **Unset** | **Unset** | `"false"` | Local-only preview fallback without Postgres; never enable in production |
| `CRAWLER_CONTACT_EMAIL` | No | **Required** | — | Contact email placed in `TapeAndTailorBot` `User-Agent` |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ADMIN_ALERT_EMAIL`, `NEXT_PUBLIC_SITE_URL` | Only if `ALERTS_MODE=email` | Only if email alerts desired | — | Not required in default `"local"` mode |
| `GITHUB_TOKEN`, `GITHUB_REPO` | Optional | Auto | — | Enables one-click **Crawl Now** button inside `/admin` |

---

## GitHub Actions Minutes Budget

| Workflow | Scope & Strategy | Est. Runtime / Run | Runs / Month | Est. Monthly Minutes |
| --- | --- | --- | ---: | ---: |
| `crawl-baseline.yml` | Faherty (~0.5m) + Bonobos (~8m) + BB/VV incremental (~5–10m) | ~14–19 min | 30 | **~420–570 min** |
| `crawl-high-freq.yml` | Opt-in only (exits in ~0.5m when 0 brands opted in) | ~0.5 min idle | ~156 | **~78 min** |
| Sale-week forced pass (`force_refresh=true`) | Manual `workflow_dispatch` with `offset` / `max_products` batching (VV ~47m; BB ~101m split across 2×1200 or 4×600 runs) | On-demand | As needed | Fits easily inside 2,000 free min/mo |

---

## Local Setup & Commands
```bash
npm install
npm run hooks:install       # Enable .githooks/pre-commit secret guard
npm run db:migrate          # Apply 0001..0004 SQL migrations to Neon
npm run dev                 # Requires DATABASE_URL in .env.local (or DEMO_MODE=true locally)

npm test                    # Vitest unit, parser, kit optimizer & security test suite
npm run typecheck           # TypeScript strict check
npm run build               # Production Next.js build
npm run crawl -- --brand=faherty,bonobos --mode=manual
npm run crawl -- --brand=brooks-brothers --mode=manual --force-refresh --offset=0 --max=600
```

---

## Optional Future Monetization (Currently Disabled)
This site is currently free and non-commercial (`no affiliate links, no revenue`). If you ever transition to a paid commercial hosting tier (e.g., Vercel Pro) with a custom domain:
- Upgrade off Vercel Hobby before adding any monetization.
- Add a custom HTTPS domain and update `/about`, `/privacy`, `/terms`, and `SiteFooter` with affiliate disclosures.
- Re-enable affiliate URL wrapping in `config/brands.ts` and configure `crawler/adapters/rakuten-feed.ts` for feed-based brands.
