-- Migration 0004: Honest labeling for sale_events (confirmed flag) and student_promos (verified flag + nullable verified_at)

ALTER TABLE sale_events
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Keep all seeded 2027 calendar entries explicitly unconfirmed until an admin confirms them
UPDATE sale_events
SET confirmed = FALSE, confirmed_at = NULL
WHERE slug LIKE '%-2027';

ALTER TABLE student_promos
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE student_promos
  ALTER COLUMN verified_at DROP NOT NULL,
  ALTER COLUMN verified_at DROP DEFAULT;

-- Remove unverified fabricated brand-specific terms from seeded rows; keep only honest unverified pointers until manually verified by admin
UPDATE student_promos
SET
  verified = FALSE,
  verified_at = NULL,
  offer_text = 'Check brand site for current student offer',
  terms = 'Unverified — check the brand website directly for current eligibility and terms.'
WHERE verified = FALSE;
