-- Migration 0006: Complete crawl_runs coverage & batch parameter columns

ALTER TABLE crawl_runs
  ADD COLUMN IF NOT EXISTS urls_selected INTEGER,
  ADD COLUMN IF NOT EXISTS urls_quarantined INTEGER,
  ADD COLUMN IF NOT EXISTS batch_offset INTEGER,
  ADD COLUMN IF NOT EXISTS batch_max_products INTEGER;
