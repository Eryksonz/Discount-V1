-- Tape & Tailor: Initial Postgres schema + Full-Text Search (tsvector) + pg_trgm typo tolerance
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand_code TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  base_url TEXT NOT NULL,
  price_tier TEXT NOT NULL DEFAULT 'mid-premium',
  swatch_hex TEXT NOT NULL DEFAULT '#1B365D',
  affiliate_network TEXT NOT NULL DEFAULT 'direct',
  affiliate_url_template TEXT,
  affiliate_active BOOLEAN NOT NULL DEFAULT FALSE,
  rate_limit_ms INTEGER NOT NULL DEFAULT 2000,
  circuit_state TEXT NOT NULL DEFAULT 'active',
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  high_frequency_mode BOOLEAN NOT NULL DEFAULT FALSE,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  raw_breadcrumb TEXT NOT NULL DEFAULT '',
  data_source TEXT NOT NULL DEFAULT 'crawler',
  category TEXT,
  subcategory TEXT,
  occasions JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_rule_id TEXT,
  classification_status TEXT NOT NULL DEFAULT 'classified',
  current_price_cents INTEGER NOT NULL,
  original_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  product_url TEXT NOT NULL,
  affiliate_url TEXT,
  image_url TEXT,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  data_note TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL,
  median_30d_cents INTEGER NOT NULL,
  median_90d_cents INTEGER NOT NULL,
  low_90d_cents INTEGER NOT NULL,
  all_time_low_cents INTEGER NOT NULL,
  times_at_or_below_current INTEGER NOT NULL DEFAULT 1,
  last_price_change_cents INTEGER NOT NULL DEFAULT 0,
  last_price_change_at TIMESTAMPTZ,
  pct_below_median DOUBLE PRECISION NOT NULL DEFAULT 0,
  pct_below_original DOUBLE PRECISION NOT NULL DEFAULT 0,
  history_days INTEGER NOT NULL DEFAULT 0,
  deal_label TEXT NOT NULL DEFAULT 'Brand-claimed discount only',
  deal_score INTEGER NOT NULL DEFAULT 0,
  deal_score_breakdown JSONB NOT NULL,
  deal_blurb TEXT NOT NULL DEFAULT '',
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand_slug, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(raw_breadcrumb, '')), 'C')
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS products_brand_external_idx ON products (brand_id, external_id);
CREATE INDEX IF NOT EXISTS products_brand_slug_idx ON products (brand_slug);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_deal_score_idx ON products (deal_score DESC);
CREATE INDEX IF NOT EXISTS products_deal_label_idx ON products (deal_label);
CREATE INDEX IF NOT EXISTS products_price_idx ON products (current_price_cents);
CREATE INDEX IF NOT EXISTS products_classification_status_idx ON products (classification_status);
CREATE INDEX IF NOT EXISTS products_search_vector_gin_idx ON products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  original_price_cents INTEGER NOT NULL,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS price_snapshots_product_captured_idx
  ON price_snapshots (product_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS outbound_clicks (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  brand_slug TEXT NOT NULL,
  target_host TEXT NOT NULL,
  is_affiliate BOOLEAN NOT NULL DEFAULT FALSE,
  referer TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_clicks_brand_time_idx
  ON outbound_clicks (brand_slug, clicked_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price_cents INTEGER,
  target_discount_pct INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  last_notified_price_cents INTEGER,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_product_active_idx ON alerts (product_id, active);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'baseline',
  status TEXT NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  products_seen INTEGER NOT NULL DEFAULT 0,
  price_changes INTEGER NOT NULL DEFAULT 0,
  new_products INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS crawl_runs_brand_started_idx ON crawl_runs (brand_id, started_at DESC);

CREATE TABLE IF NOT EXISTS flagged_updates (
  id SERIAL PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  product_id TEXT,
  external_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flagged_updates_status_idx ON flagged_updates (status);

CREATE TABLE IF NOT EXISTS custom_classification_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  regex_pattern TEXT,
  brand_slug TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_events (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand_slug TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  typical_discount_note TEXT NOT NULL,
  triggers_high_frequency BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS student_promos (
  id SERIAL PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  provider TEXT NOT NULL,
  offer_text TEXT NOT NULL,
  promo_code TEXT,
  terms TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);
