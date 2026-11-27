-- Migration 0003: Seed verified student discount programs and annual menswear sale calendar

CREATE UNIQUE INDEX IF NOT EXISTS student_promos_brand_provider_idx
  ON student_promos (brand_slug, provider);

INSERT INTO student_promos (brand_slug, provider, offer_text, promo_code, terms, active)
VALUES
  (
    'faherty',
    'SheerID',
    '20% off verified student orders',
    NULL,
    'Verify active college/university enrollment via SheerID at checkout. Typically applies to full-price items; exclusions may apply to third-party collaborations.',
    TRUE
  ),
  (
    'bonobos',
    'SheerID',
    '20% off verified student orders',
    NULL,
    'Verify student status via SheerID for a single-use code. Check brand terms for stacking with final-sale markdowns.',
    TRUE
  ),
  (
    'vineyard-vines',
    'SheerID',
    '15% off verified student orders',
    NULL,
    'Available online and in stores after SheerID verification. Exclusions apply to gift cards and select licensed collections.',
    TRUE
  ),
  (
    'brooks-brothers',
    'Student Beans',
    '15% off verified student orders',
    NULL,
    'Verify via Student Beans for an online checkout code. Check exclusions on select tailoring and clearance tiers.',
    TRUE
  ),
  (
    'j-crew',
    'SheerID',
    '15% off verified student orders',
    NULL,
    'Verify student status via SheerID. Limit per month applies; select third-party and suiting exclusions may apply.',
    TRUE
  ),
  (
    'charles-tyrwhitt',
    'UNiDAYS',
    '15% off verified student orders',
    NULL,
    'Verify via UNiDAYS for a student checkout code. Multi-buy shirt bundles may exclude additional promo stacking.',
    TRUE
  ),
  (
    'public-rec',
    'SheerID',
    '15% off verified student orders',
    NULL,
    'Verify student status through SheerID at checkout. Standard full-price eligibility rules apply.',
    TRUE
  )
ON CONFLICT (brand_slug, provider) DO NOTHING;

INSERT INTO sale_events (slug, name, brand_slug, starts_at, ends_at, typical_discount_note, triggers_high_frequency)
VALUES
  (
    'winter-end-of-season-2027',
    'Winter End-of-Season Clearance',
    NULL,
    '2027-01-08T05:00:00Z',
    '2027-01-25T05:00:00Z',
    'Extra 25-40% off fall/winter sweaters, outerwear, flannel shirts, and tailored wool',
    TRUE
  ),
  (
    'presidents-day-2027',
    'Presidents Day Tailoring & Office Event',
    NULL,
    '2027-02-12T05:00:00Z',
    '2027-02-16T05:00:00Z',
    '20-30% off dress shirts, trousers, and early spring layers',
    FALSE
  ),
  (
    'memorial-day-2027',
    'Memorial Day Summer Menswear Event',
    NULL,
    '2027-05-26T05:00:00Z',
    '2027-06-01T05:00:00Z',
    '20-30% off performance polos, chinos, and summer internship essentials',
    TRUE
  ),
  (
    'semi-annual-summer-2027',
    'Summer Semi-Annual Clearance',
    'brooks-brothers',
    '2027-06-18T05:00:00Z',
    '2027-07-06T05:00:00Z',
    'Up to 40% off dress shirts, suiting, blazers, and seasonal sportswear',
    TRUE
  ),
  (
    'labor-day-2027',
    'Labor Day Fall Transition Event',
    NULL,
    '2027-09-02T05:00:00Z',
    '2027-09-07T05:00:00Z',
    '20-30% off quarter-zips, OCBDs, and fall recruiting staples',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;
