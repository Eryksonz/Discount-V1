import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export interface DealScoreBreakdownJson {
  belowMedian: number;
  belowOriginal: number;
  recency: number;
  stock: number;
  total: number;
}

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandCode: text("brand_code").notNull().unique(),
  domain: text("domain").notNull(),
  baseUrl: text("base_url").notNull(),
  priceTier: text("price_tier").notNull().default("mid-premium"),
  swatchHex: text("swatch_hex").notNull().default("#1B365D"),
  affiliateNetwork: text("affiliate_network").notNull().default("direct"),
  affiliateUrlTemplate: text("affiliate_url_template"),
  affiliateActive: boolean("affiliate_active").notNull().default(false),
  rateLimitMs: integer("rate_limit_ms").notNull().default(2000),
  circuitState: text("circuit_state").notNull().default("active"), // active | degraded | disabled
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  highFrequencyMode: boolean("high_frequency_mode").notNull().default(false),
  crawlFrequency: text("crawl_frequency").notNull().default("daily"), // daily | high_freq | paused
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    brandSlug: text("brand_slug").notNull(),
    externalId: text("external_id").notNull(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    rawBreadcrumb: text("raw_breadcrumb").notNull().default(""),
    /** Distinguishes simulated seed items ('demo') from live crawled items ('crawler') */
    dataSource: text("data_source").notNull().default("crawler"),

    // Classification (deterministic rule output)
    category: text("category"),
    subcategory: text("subcategory"),
    occasions: jsonb("occasions").$type<string[]>().notNull().default([]),
    colors: jsonb("colors").$type<string[]>().notNull().default([]),
    sizes: jsonb("sizes").$type<string[]>().notNull().default([]),
    matchedRuleId: text("matched_rule_id"),
    classificationStatus: text("classification_status").notNull().default("classified"), // classified | unclassified | manual

    // Current pricing (integer cents)
    currentPriceCents: integer("current_price_cents").notNull(),
    originalPriceCents: integer("original_price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    productUrl: text("product_url").notNull(),
    affiliateUrl: text("affiliate_url"),
    imageUrl: text("image_url"),
    inStock: boolean("in_stock").notNull().default(true),
    /** 100% template-generated factual data note derived strictly from stored metrics */
    dataNote: text("data_note"),

    // Lifecycle timestamps
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull(),

    // Materialized deterministic deal engine metrics
    median30dCents: integer("median_30d_cents").notNull(),
    median90dCents: integer("median_90d_cents").notNull(),
    low90dCents: integer("low_90d_cents").notNull(),
    allTimeLowCents: integer("all_time_low_cents").notNull(),
    timesAtOrBelowCurrent: integer("times_at_or_below_current").notNull().default(1),
    lastPriceChangeCents: integer("last_price_change_cents").notNull().default(0),
    lastPriceChangeAt: timestamp("last_price_change_at", { withTimezone: true }),
    pctBelowMedian: doublePrecision("pct_below_median").notNull().default(0),
    pctBelowOriginal: doublePrecision("pct_below_original").notNull().default(0),
    historyDays: integer("history_days").notNull().default(0),
    dealLabel: text("deal_label").notNull().default("Brand-claimed discount only"),
    dealScore: integer("deal_score").notNull().default(0),
    dealScoreBreakdown: jsonb("deal_score_breakdown")
      .$type<DealScoreBreakdownJson>()
      .notNull(),
    dealBlurb: text("deal_blurb").notNull().default(""),
  },
  (table) => [
    uniqueIndex("products_brand_external_idx").on(table.brandId, table.externalId),
    index("products_brand_slug_idx").on(table.brandSlug),
    index("products_category_idx").on(table.category),
    index("products_deal_score_idx").on(table.dealScore),
    index("products_deal_label_idx").on(table.dealLabel),
    index("products_price_idx").on(table.currentPriceCents),
    index("products_classification_status_idx").on(table.classificationStatus),
  ]
);

/** Append-only state-change snapshots: inserted ONLY when price, original_price, or in_stock changes */
export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    originalPriceCents: integer("original_price_cents").notNull(),
    compareAtGapPct: doublePrecision("compare_at_gap_pct"),
    inStock: boolean("in_stock").notNull().default(true),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("price_snapshots_product_captured_idx").on(table.productId, table.capturedAt)]
);

/**
 * Manually managed checkout promo codes (strictly display layer — NEVER included in price_snapshots or Deal Engine history).
 */
export const brandPromos = pgTable(
  "brand_promos",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    brandSlug: text("brand_slug").notNull(),
    description: text("description").notNull(),
    code: text("code"),
    percentOff: doublePrecision("percent_off"),
    amountOffCents: integer("amount_off_cents"),
    minSpendCents: integer("min_spend_cents"),
    appliesTo: text("applies_to").notNull().default("Sitewide"),
    hasExclusions: boolean("has_exclusions").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    sourceUrl: text("source_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("brand_promos_brand_active_idx").on(
      table.brandSlug,
      table.active,
      table.startsAt,
      table.endsAt
    ),
  ]
);

/** Outbound redirect audit log for affiliate click reporting */
export const outboundClicks = pgTable(
  "outbound_clicks",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    brandSlug: text("brand_slug").notNull(),
    targetHost: text("target_host").notNull(),
    isAffiliate: boolean("is_affiliate").notNull().default(false),
    referer: text("referer"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("outbound_clicks_brand_time_idx").on(table.brandSlug, table.clickedAt)]
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    targetPriceCents: integer("target_price_cents"),
    targetDiscountPct: integer("target_discount_pct"),
    active: boolean("active").notNull().default(true),
    unsubscribeToken: text("unsubscribe_token").notNull().unique(),
    lastNotifiedPriceCents: integer("last_notified_price_cents"),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("alerts_product_active_idx").on(table.productId, table.active)]
);

export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("baseline"), // baseline | high-frequency | manual
    status: text("status").notNull().default("completed"), // completed | failed | circuit_open
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms").notNull().default(0),
    productsSeen: integer("products_seen").notNull().default(0),
    urlsDiscovered: integer("urls_discovered"),
    urlsSelected: integer("urls_selected"),
    urlsFetched: integer("urls_fetched"),
    urlsParsed: integer("urls_parsed"),
    urlsQuarantined: integer("urls_quarantined"),
    urlsSkippedFresh: integer("urls_skipped_fresh"),
    urlsSkippedOos: integer("urls_skipped_oos"),
    batchOffset: integer("batch_offset"),
    batchMaxProducts: integer("batch_max_products"),
    forcedRefresh: boolean("forced_refresh").notNull().default(false),
    priceChanges: integer("price_changes").notNull().default(0),
    newProducts: integer("new_products").notNull().default(0),
    quarantinedCount: integer("quarantined_count").notNull().default(0),
    errorsCount: integer("errors_count").notNull().default(0),
    errorSummary: text("error_summary"),
  },
  (table) => [index("crawl_runs_brand_started_idx").on(table.brandId, table.startedAt)]
);

export const flaggedUpdates = pgTable(
  "flagged_updates",
  {
    id: serial("id").primaryKey(),
    brandSlug: text("brand_slug").notNull(),
    productId: text("product_id"),
    externalId: text("external_id").notNull(),
    reason: text("reason").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("flagged_updates_status_idx").on(table.status)]
);

export const customClassificationRules = pgTable("custom_classification_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  regexPattern: text("regex_pattern"),
  brandSlug: text("brand_slug"),
  priority: integer("priority").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const saleEvents = pgTable("sale_events", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandSlug: text("brand_slug"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  typicalDiscountNote: text("typical_discount_note").notNull(),
  triggersHighFrequency: boolean("triggers_high_frequency").notNull().default(true),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const studentPromos = pgTable("student_promos", {
  id: serial("id").primaryKey(),
  brandSlug: text("brand_slug").notNull(),
  provider: text("provider").notNull(),
  offerText: text("offer_text").notNull(),
  promoCode: text("promo_code"),
  terms: text("terms").notNull(),
  sourceUrl: text("source_url"),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
});
