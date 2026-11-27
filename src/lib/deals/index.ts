import {
  DEAL_SCORE_WEIGHTS,
  DEAL_THRESHOLDS,
  SANITY_CHECK_LIMITS,
  type DealLabel,
} from "@config/deal-thresholds";

export interface PriceSnapshotPoint {
  priceCents: number;
  originalPriceCents: number;
  inStock: boolean;
  capturedAt: Date;
}

export interface DealEvaluationInput {
  currentPriceCents: number;
  originalPriceCents: number;
  inStock: boolean;
  availableSizesCount: number;
  snapshots: PriceSnapshotPoint[];
  asOf?: Date;
}

export interface DealScoreBreakdown {
  belowMedian: number;
  belowOriginal: number;
  recency: number;
  stock: number;
  total: number;
}

export interface DealEvaluationResult {
  currentPriceCents: number;
  originalPriceCents: number;
  median30dCents: number;
  median90dCents: number;
  low90dCents: number;
  allTimeLowCents: number;
  timesAtOrBelowCurrent: number;
  lastPriceChangeCents: number;
  lastPriceChangeAt: Date | null;
  pctBelowMedian: number;
  pctBelowOriginal: number;
  historyDays: number;
  dealLabel: DealLabel;
  dealScore: number;
  dealScoreBreakdown: DealScoreBreakdown;
  dealBlurb: string;
  /** 100% deterministic, template-derived factual note built strictly from stored data */
  dataNote: string;
}

const MS_PER_DAY = 86_400_000;

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Computes a time-weighted median over [windowStart, asOf] from change-only price snapshots.
 * Because snapshots are written only when price/original/stock changes, weighting each
 * snapshot by the duration it remained active ensures volatile sale days do not skew the median.
 */
export function computeTimeWeightedMedian(
  sortedSnapshots: PriceSnapshotPoint[],
  windowDays: number,
  asOf: Date
): number {
  if (sortedSnapshots.length === 0) return 0;
  if (sortedSnapshots.length === 1) return sortedSnapshots[0].priceCents;

  const endMs = asOf.getTime();
  const windowStartMs = endMs - windowDays * MS_PER_DAY;

  const intervals: Array<{ priceCents: number; durationMs: number }> = [];

  for (let i = 0; i < sortedSnapshots.length; i++) {
    const snapStart = sortedSnapshots[i].capturedAt.getTime();
    const snapEnd =
      i + 1 < sortedSnapshots.length
        ? Math.min(sortedSnapshots[i + 1].capturedAt.getTime(), endMs)
        : endMs;

    const clippedStart = Math.max(snapStart, windowStartMs);
    const clippedEnd = Math.min(snapEnd, endMs);

    if (clippedEnd > clippedStart) {
      intervals.push({
        priceCents: sortedSnapshots[i].priceCents,
        durationMs: clippedEnd - clippedStart,
      });
    }
  }

  if (intervals.length === 0) {
    return sortedSnapshots[sortedSnapshots.length - 1].priceCents;
  }

  intervals.sort((a, b) => a.priceCents - b.priceCents);
  const totalDuration = intervals.reduce((acc, item) => acc + item.durationMs, 0);
  const halfDuration = totalDuration / 2;

  let cumulative = 0;
  for (const item of intervals) {
    cumulative += item.durationMs;
    if (cumulative >= halfDuration) {
      return item.priceCents;
    }
  }

  return intervals[intervals.length - 1].priceCents;
}

/**
 * Computes the minimum price active at any moment inside the trailing `windowDays` window.
 */
function computeWindowMin(
  sortedSnapshots: PriceSnapshotPoint[],
  windowDays: number,
  asOf: Date,
  fallbackPriceCents: number
): number {
  if (sortedSnapshots.length === 0) return fallbackPriceCents;
  const endMs = asOf.getTime();
  const windowStartMs = endMs - windowDays * MS_PER_DAY;

  let minPrice = Infinity;
  for (let i = 0; i < sortedSnapshots.length; i++) {
    const snapStart = sortedSnapshots[i].capturedAt.getTime();
    const snapEnd =
      i + 1 < sortedSnapshots.length
        ? sortedSnapshots[i + 1].capturedAt.getTime()
        : endMs;

    if (snapEnd >= windowStartMs && snapStart <= endMs) {
      if (sortedSnapshots[i].priceCents < minPrice) {
        minPrice = sortedSnapshots[i].priceCents;
      }
    }
  }

  return Number.isFinite(minPrice) ? minPrice : fallbackPriceCents;
}

function classifyDealLabel(params: {
  currentPriceCents: number;
  median90dCents: number;
  low90dCents: number;
  historyDays: number;
}): DealLabel {
  const { currentPriceCents, median90dCents, low90dCents, historyDays } = params;

  if (historyDays < DEAL_THRESHOLDS.minHistoryDays || median90dCents <= 0) {
    return "Brand-claimed discount only";
  }

  const ratioToMedian = currentPriceCents / median90dCents;

  if (
    currentPriceCents <= low90dCents &&
    ratioToMedian <= DEAL_THRESHOLDS.lowest90dMaxMedianRatio
  ) {
    return "Lowest in 90 days";
  }

  if (ratioToMedian <= DEAL_THRESHOLDS.realDealMaxMedianRatio) {
    return "Real deal";
  }

  if (ratioToMedian <= DEAL_THRESHOLDS.brandClaimedOnlyAboveMedianRatio) {
    return "Below 90-day median";
  }

  return "Brand-claimed discount only";
}

function computeDealScore(params: {
  pctBelowMedian: number;
  pctBelowOriginal: number;
  historyDays: number;
  lastPriceChangeCents: number;
  lastPriceChangeAt: Date | null;
  inStock: boolean;
  availableSizesCount: number;
  asOf: Date;
}): DealScoreBreakdown {
  const {
    pctBelowMedian,
    pctBelowOriginal,
    historyDays,
    lastPriceChangeCents,
    lastPriceChangeAt,
    inStock,
    availableSizesCount,
    asOf,
  } = params;

  // 1. % below 90-day median (0-45 pts; locked to 0 if history < 21 days)
  const belowMedian =
    historyDays >= DEAL_THRESHOLDS.minHistoryDays && pctBelowMedian > 0
      ? Math.round(
          clamp(pctBelowMedian / DEAL_SCORE_WEIGHTS.belowMedian.fullCreditPct, 0, 1) *
            DEAL_SCORE_WEIGHTS.belowMedian.maxPoints
        )
      : 0;

  // 2. % below brand listed original price (0-20 pts)
  const belowOriginal =
    pctBelowOriginal > 0
      ? Math.round(
          clamp(pctBelowOriginal / DEAL_SCORE_WEIGHTS.belowOriginal.fullCreditPct, 0, 1) *
            DEAL_SCORE_WEIGHTS.belowOriginal.maxPoints
        )
      : 0;

  // 3. Recency of the latest downward price change (0-20 pts)
  let recency = 0;
  if (lastPriceChangeCents < 0 && lastPriceChangeAt) {
    const daysSinceDrop = Math.max(0, (asOf.getTime() - lastPriceChangeAt.getTime()) / MS_PER_DAY);
    for (const tier of DEAL_SCORE_WEIGHTS.recency.tiers) {
      if (daysSinceDrop <= tier.maxDays) {
        recency = tier.points;
        break;
      }
    }
  }

  // 4. Stock & size depth (0-15 pts)
  let stock = 0;
  if (inStock) {
    if (availableSizesCount >= DEAL_SCORE_WEIGHTS.stock.fullDepthSizes) {
      stock = DEAL_SCORE_WEIGHTS.stock.maxPoints;
    } else if (availableSizesCount >= DEAL_SCORE_WEIGHTS.stock.mediumDepthSizes) {
      stock = DEAL_SCORE_WEIGHTS.stock.mediumPoints;
    } else {
      stock = DEAL_SCORE_WEIGHTS.stock.singleSizePoints;
    }
  }

  const total = clamp(belowMedian + belowOriginal + recency + stock, 0, 100);
  return { belowMedian, belowOriginal, recency, stock, total };
}

/**
 * Generates deterministic, data-filled blurb text from templates.
 * Zero free-form or LLM generation.
 */
function buildDealBlurb(params: {
  dealLabel: DealLabel;
  currentPriceCents: number;
  originalPriceCents: number;
  median90dCents: number;
  low90dCents: number;
  pctBelowMedian: number;
  pctBelowOriginal: number;
  historyDays: number;
  lastPriceChangeCents: number;
  lastPriceChangeAt: Date | null;
  timesAtOrBelowCurrent: number;
  asOf: Date;
}): string {
  const {
    dealLabel,
    currentPriceCents,
    originalPriceCents,
    median90dCents,
    pctBelowMedian,
    pctBelowOriginal,
    historyDays,
    lastPriceChangeCents,
    lastPriceChangeAt,
    timesAtOrBelowCurrent,
    asOf,
  } = params;

  const cur = formatDollars(currentPriceCents);
  const med = formatDollars(median90dCents);
  const orig = formatDollars(originalPriceCents);

  let dropSuffix = "";
  if (lastPriceChangeCents < 0 && lastPriceChangeAt) {
    const dropDays = Math.max(0, Math.round((asOf.getTime() - lastPriceChangeAt.getTime()) / MS_PER_DAY));
    const when = dropDays === 0 ? "today" : dropDays === 1 ? "yesterday" : `${dropDays}d ago`;
    dropSuffix = ` Dropped ${formatDollars(Math.abs(lastPriceChangeCents))} ${when}.`;
  }

  if (historyDays < DEAL_THRESHOLDS.minHistoryDays) {
    return `Tracking baseline (${historyDays}/${DEAL_THRESHOLDS.minHistoryDays}d). Brand lists ${orig} (${Math.round(pctBelowOriginal)}% claimed off); verified deal signal unlocks at 21 days.`;
  }

  if (dealLabel === "Lowest in 90 days") {
    const rarity =
      timesAtOrBelowCurrent <= 1
        ? "first time at this floor"
        : `seen at or below this price ${timesAtOrBelowCurrent}x`;
    return `${cur} is ${Math.round(pctBelowMedian)}% below its 90d median (${med}) and matches its 90d low (${rarity}).${dropSuffix}`;
  }

  if (dealLabel === "Real deal") {
    return `${cur} trades ${Math.round(pctBelowMedian)}% below its 90d median (${med}), vs. ${orig} brand list price.${dropSuffix}`;
  }

  if (dealLabel === "Below 90-day median") {
    return `${cur} is ${Math.round(pctBelowMedian)}% below its 90d median (${med})—a modest markdown below the 15% real-deal threshold.${dropSuffix}`;
  }

  if (pctBelowOriginal >= 10) {
    return `Brand advertises ${Math.round(pctBelowOriginal)}% off ${orig}, but ${cur} sits near its 90d median (${med}).`;
  }

  return `Trading at ${cur} vs. its 90d median of ${med} across ${historyDays}d of tracked history.`;
}

/**
 * Pure, deterministic Deal Engine evaluation function.
 */
export function evaluateProductDeal(input: DealEvaluationInput): DealEvaluationResult {
  const asOf = input.asOf ?? new Date();
  const sortedSnapshots = [...input.snapshots]
    .filter((s) => s.capturedAt.getTime() <= asOf.getTime())
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const firstCapturedAt = sortedSnapshots[0]?.capturedAt ?? asOf;
  const historyDays = Math.max(
    0,
    Math.floor((asOf.getTime() - firstCapturedAt.getTime()) / MS_PER_DAY)
  );

  const median30dCents =
    sortedSnapshots.length > 0
      ? computeTimeWeightedMedian(sortedSnapshots, 30, asOf)
      : input.currentPriceCents;

  const median90dCents =
    sortedSnapshots.length > 0
      ? computeTimeWeightedMedian(sortedSnapshots, 90, asOf)
      : input.currentPriceCents;

  const low90dCents = computeWindowMin(sortedSnapshots, 90, asOf, input.currentPriceCents);

  const allTimeLowCents =
    sortedSnapshots.length > 0
      ? Math.min(
          input.currentPriceCents,
          ...sortedSnapshots.map((s) => s.priceCents)
        )
      : input.currentPriceCents;

  // Count distinct price regimes/snapshots at or below current price
  let timesAtOrBelowCurrent = 0;
  let inLowRegime = false;
  for (const snap of sortedSnapshots) {
    if (snap.priceCents <= input.currentPriceCents) {
      if (!inLowRegime) {
        timesAtOrBelowCurrent += 1;
        inLowRegime = true;
      }
    } else {
      inLowRegime = false;
    }
  }
  if (timesAtOrBelowCurrent === 0) {
    timesAtOrBelowCurrent = 1;
  }

  // Last actual price movement (ignoring stock-only snapshot transitions)
  let lastPriceChangeCents = 0;
  let lastPriceChangeAt: Date | null = null;
  for (let i = sortedSnapshots.length - 1; i >= 1; i--) {
    const diff = sortedSnapshots[i].priceCents - sortedSnapshots[i - 1].priceCents;
    if (diff !== 0) {
      lastPriceChangeCents = diff;
      lastPriceChangeAt = sortedSnapshots[i].capturedAt;
      break;
    }
  }

  const pctBelowMedian =
    median90dCents > 0
      ? round1(((median90dCents - input.currentPriceCents) / median90dCents) * 100)
      : 0;

  const pctBelowOriginal =
    input.originalPriceCents > 0
      ? round1(
          ((input.originalPriceCents - input.currentPriceCents) / input.originalPriceCents) *
            100
        )
      : 0;

  const dealLabel = classifyDealLabel({
    currentPriceCents: input.currentPriceCents,
    median90dCents,
    low90dCents,
    historyDays,
  });

  const dealScoreBreakdown = computeDealScore({
    pctBelowMedian,
    pctBelowOriginal,
    historyDays,
    lastPriceChangeCents,
    lastPriceChangeAt,
    inStock: input.inStock,
    availableSizesCount: input.availableSizesCount,
    asOf,
  });

  const dealBlurb = buildDealBlurb({
    dealLabel,
    currentPriceCents: input.currentPriceCents,
    originalPriceCents: input.originalPriceCents,
    median90dCents,
    low90dCents,
    pctBelowMedian,
    pctBelowOriginal,
    historyDays,
    lastPriceChangeCents,
    lastPriceChangeAt,
    timesAtOrBelowCurrent,
    asOf,
  });

  const dataNote = buildDataNote({
    historyDays,
    snapshotCount: sortedSnapshots.length,
    median30dCents,
    median90dCents,
    low90dCents,
    allTimeLowCents,
    timesAtOrBelowCurrent,
    inStock: input.inStock,
    availableSizesCount: input.availableSizesCount,
  });

  return {
    currentPriceCents: input.currentPriceCents,
    originalPriceCents: input.originalPriceCents,
    median30dCents,
    median90dCents,
    low90dCents,
    allTimeLowCents,
    timesAtOrBelowCurrent,
    lastPriceChangeCents,
    lastPriceChangeAt,
    pctBelowMedian,
    pctBelowOriginal,
    historyDays,
    dealLabel,
    dealScore: dealScoreBreakdown.total,
    dealScoreBreakdown,
    dealBlurb,
    dataNote,
  };
}

/**
 * Generates a strictly factual, template-filled data note from stored metrics only.
 * Never makes subjective claims about fabric quality, fit, or sizing ("runs small").
 */
export function buildDataNote(params: {
  historyDays: number;
  snapshotCount: number;
  median30dCents: number;
  median90dCents: number;
  low90dCents: number;
  allTimeLowCents: number;
  timesAtOrBelowCurrent: number;
  inStock: boolean;
  availableSizesCount: number;
}): string {
  const {
    historyDays,
    snapshotCount,
    median30dCents,
    median90dCents,
    low90dCents,
    allTimeLowCents,
    timesAtOrBelowCurrent,
    inStock,
    availableSizesCount,
  } = params;

  const stockSummary = inStock
    ? `${availableSizesCount} size${availableSizesCount === 1 ? "" : "s"} currently listed in stock.`
    : "Currently listed out of stock.";

  return `Tracked for ${historyDays}d across ${snapshotCount} price-change snapshot${snapshotCount === 1 ? "" : "s"}. 30d median: ${formatDollars(median30dCents)}; 90d median: ${formatDollars(median90dCents)}; 90d low: ${formatDollars(low90dCents)} (all-time low: ${formatDollars(allTimeLowCents)}). At or below current price ${timesAtOrBelowCurrent}x. ${stockSummary}`;
}

export interface SanityCheckResult {
  valid: boolean;
  reason?: string;
}

/**
 * Deterministic sanity gate run before publishing any crawled price update.
 */
export function validatePriceUpdate(params: {
  newPriceCents: number;
  originalPriceCents: number;
  previousPriceCents?: number | null;
}): SanityCheckResult {
  const { newPriceCents, originalPriceCents, previousPriceCents } = params;

  if (!Number.isFinite(newPriceCents) || newPriceCents < SANITY_CHECK_LIMITS.minValidPriceCents) {
    return { valid: false, reason: `Price ${newPriceCents}c is <= $1.00 or invalid` };
  }

  if (
    originalPriceCents > 0 &&
    newPriceCents > originalPriceCents * SANITY_CHECK_LIMITS.maxPriceToOriginalRatio
  ) {
    return {
      valid: false,
      reason: `Price ${newPriceCents}c exceeds ${SANITY_CHECK_LIMITS.maxPriceToOriginalRatio}x original price (${originalPriceCents}c)`,
    };
  }

  if (previousPriceCents && previousPriceCents > 0) {
    const dropPct = ((previousPriceCents - newPriceCents) / previousPriceCents) * 100;
    if (dropPct >= SANITY_CHECK_LIMITS.maxSingleDropPct) {
      return {
        valid: false,
        reason: `Sudden ${dropPct.toFixed(1)}% single-step drop (${previousPriceCents}c -> ${newPriceCents}c) exceeds ${SANITY_CHECK_LIMITS.maxSingleDropPct}% threshold`,
      };
    }
  }

  return { valid: true };
}
