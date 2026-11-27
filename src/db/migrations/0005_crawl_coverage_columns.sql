-- Migration 0005: Persist per-run crawl coverage counters on crawl_runs

ALTER TABLE crawl_runs
  ADD COLUMN IF NOT EXISTS urls_discovered INTEGER,
  ADD COLUMN IF NOT EXISTS urls_fetched INTEGER,
  ADD COLUMN IF NOT EXISTS urls_parsed INTEGER,
  ADD COLUMN IF NOT EXISTS urls_skipped_fresh INTEGER,
  ADD COLUMN IF NOT EXISTS urls_skipped_oos INTEGER,
  ADD COLUMN IF NOT EXISTS forced_refresh BOOLEAN NOT NULL DEFAULT FALSE;
