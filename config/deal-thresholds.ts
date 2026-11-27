/**
 * Explicit, deterministic thresholds and scoring weights for the Deal Engine.
 * Every deal label, blurb, and 0-100 score is computed directly from these constants
 * and stored price_snapshots — zero AI or hidden heuristics.
 */

export const DEAL_THRESHOLDS = {
  /** Minimum days between first snapshot and evaluation date before granting verified deal badges. */
  minHistoryDays: 21,

  /**
   * "Real deal": currentPrice <= 0.85 * median90d (i.e. >= 15% below 90-day median)
   * AND historyDays >= minHistoryDays.
   */
  realDealMaxMedianRatio: 0.85,

  /**
   * "Brand-claimed discount only": historyDays < minHistoryDays
   * OR currentPrice > 0.90 * median90d (less than 10% below 90-day median).
   * Prices between 85% and 90% of median with >= 21d history receive "Below 90-day median".
   */
  brandClaimedOnlyAboveMedianRatio: 0.9,

  /**
   * "Lowest in 90 days": currentPrice <= low90d AND historyDays >= minHistoryDays
   * AND price actually moved below its 90-day median (<= 0.90 * median90d) so a flat
   * never-discounted retail item is never mislabeled as a 90-day low deal.
   */
  lowest90dMaxMedianRatio: 0.9,
} as const;

export type DealLabel =
  | "Lowest in 90 days"
  | "Real deal"
  | "Below 90-day median"
  | "Brand-claimed discount only";

/**
 * Documented 0-100 Deal Score formula.
 * Components sum to exactly 100 points:
 *   1. belowMedian (0-45 pts): scales linearly from 0% to 40%+ below 90-day median.
 *      Locked to 0 pts when historyDays < 21 so unverified sales cannot game the rankings.
 *   2. belowOriginal (0-20 pts): scales linearly from 0% to 50%+ below brand's listed original_price.
 *   3. recency (0-20 pts): rewards fresh downward price moves (<= 1d: 20, <= 3d: 16, <= 7d: 12,
 *      <= 14d: 7, <= 30d: 3, older or price increase: 0).
 *   4. stock (0-15 pts): rewards buyable size depth (in-stock 4+ sizes: 15, 2-3 sizes: 10,
 *      1 size: 5, out of stock: 0).
 */
export const DEAL_SCORE_WEIGHTS = {
  belowMedian: {
    maxPoints: 45,
    fullCreditPct: 40, // 40% below 90d median achieves full 45 pts
  },
  belowOriginal: {
    maxPoints: 20,
    fullCreditPct: 50, // 50% below brand MSRP achieves full 20 pts
  },
  recency: {
    maxPoints: 20,
    tiers: [
      { maxDays: 1, points: 20 },
      { maxDays: 3, points: 16 },
      { maxDays: 7, points: 12 },
      { maxDays: 14, points: 7 },
      { maxDays: 30, points: 3 },
    ],
  },
  stock: {
    maxPoints: 15,
    fullDepthSizes: 4,
    mediumDepthSizes: 2,
    mediumPoints: 10,
    singleSizePoints: 5,
  },
} as const;

/**
 * Sanity checks applied before publishing crawled price updates (Phase 2+).
 * Any update violating these bounds is quarantined into `flagged_updates`.
 */
export const SANITY_CHECK_LIMITS = {
  minValidPriceCents: 100, // reject <= $1.00 (and <= 0)
  maxPriceToOriginalRatio: 1.5, // reject if price > 1.5x listed original price
  maxSingleDropPct: 90, // reject sudden >= 90% single-step drops for manual review
  maxBrandCatalogDropPct: 30, // alert admin if parsed product count drops > 30% vs prior run
} as const;
