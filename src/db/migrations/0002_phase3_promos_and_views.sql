-- Phase 3 Migration: compare_at_gap_pct tracking, sale-window comparison view, brand_promos, per-brand crawl_frequency, and composite search/filter indexes

-- 1. Track compare_at_gap_pct on every snapshot so before/during/after sale-window gaps can be audited directly
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS compare_at_gap_pct DOUBLE PRECISION;

UPDATE price_snapshots
SET compare_at_gap_pct = CASE
  WHEN original_price_cents > 0 AND original_price_cents >= price_cents
    THEN ROUND((((original_price_cents - price_cents)::numeric / original_price_cents::numeric) * 100.0), 2)::double precision
  ELSE NULL
END
WHERE compare_at_gap_pct IS NULL;

-- 2. Per-brand configurable crawl frequency ('daily' | 'high_freq' | 'paused')
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS crawl_frequency TEXT NOT NULL DEFAULT 'daily';

-- 3. Manually managed checkout promo codes (strictly display layer — NEVER mixed into price_snapshots or Deal Engine history)
CREATE TABLE IF NOT EXISTS brand_promos (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_slug TEXT NOT NULL,
  description TEXT NOT NULL,
  code TEXT,
  percent_off DOUBLE PRECISION,
  amount_off_cents INTEGER,
  min_spend_cents INTEGER,
  applies_to TEXT NOT NULL DEFAULT 'Sitewide',
  has_exclusions BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  source_url TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_promos_brand_active_idx
  ON brand_promos (brand_slug, active, starts_at, ends_at);

-- 4. Derived view comparing each snapshot's compare-at gap before, during, and after sale_events windows
CREATE OR REPLACE VIEW product_sale_window_gaps AS
SELECT
  s.id AS snapshot_id,
  s.product_id,
  p.brand_slug,
  p.name AS product_name,
  s.price_cents,
  s.original_price_cents,
  s.compare_at_gap_pct,
  s.in_stock,
  s.captured_at,
  e.slug AS sale_event_slug,
  e.name AS sale_event_name,
  CASE
    WHEN s.captured_at < e.starts_at THEN 'before'
    WHEN s.captured_at BETWEEN e.starts_at AND e.ends_at THEN 'during'
    ELSE 'after'
  END AS window_phase
FROM price_snapshots s
INNER JOIN products p ON p.id = s.product_id
INNER JOIN sale_events e
  ON (e.brand_slug IS NULL OR e.brand_slug = p.brand_slug);

-- 5. Composite & GIN indexes for fast SQL filtering, sorting, and pagination over 3,400+ public products
CREATE INDEX IF NOT EXISTS products_public_score_idx
  ON products (deal_score DESC, pct_below_median DESC)
  WHERE classification_status IN ('classified', 'manual');

CREATE INDEX IF NOT EXISTS products_public_brand_idx
  ON products (brand_slug, deal_score DESC)
  WHERE classification_status IN ('classified', 'manual');

CREATE INDEX IF NOT EXISTS products_public_category_idx
  ON products (category, deal_score DESC)
  WHERE classification_status IN ('classified', 'manual');

CREATE INDEX IF NOT EXISTS products_public_price_idx
  ON products (current_price_cents)
  WHERE classification_status IN ('classified', 'manual');

CREATE INDEX IF NOT EXISTS products_occasions_gin_idx
  ON products USING GIN (occasions);

CREATE INDEX IF NOT EXISTS products_sizes_gin_idx
  ON products USING GIN (sizes);

-- 6. Seed key 2026 retail sale_events (editable & extensible in /admin)
INSERT INTO sale_events (slug, name, brand_slug, starts_at, ends_at, typical_discount_note, triggers_high_frequency)
VALUES
  (
    'black-friday-2026',
    'Black Friday Week 2026',
    NULL,
    '2026-11-24T00:00:00Z',
    '2026-11-29T05:59:59Z',
    'Broad sitewide and tiered markdowns; verify against post-event baseline once 21d history matures.',
    TRUE
  ),
  (
    'cyber-monday-2026',
    'Cyber Monday 2026',
    NULL,
    '2026-11-29T06:00:00Z',
    '2026-12-02T05:59:59Z',
    'Extended promotional codes and online-only markdowns across menswear retailers.',
    TRUE
  ),
  (
    'winter-end-of-season-2026',
    'Winter End-of-Season Clearance',
    NULL,
    '2026-12-26T00:00:00Z',
    '2027-01-15T23:59:59Z',
    'Post-holiday clearance on fall/winter knitwear, outerwear, and seasonal tailoring.',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;
