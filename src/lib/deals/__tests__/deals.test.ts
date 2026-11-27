import { describe, expect, it } from "vitest";
import {
  computeTimeWeightedMedian,
  evaluateProductDeal,
  validatePriceUpdate,
  type PriceSnapshotPoint,
} from "../index";

const NOW = new Date("2026-11-26T18:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("Pure-function Deal Engine (/lib/deals)", () => {
  it("computes time-weighted median accurately from sparse state-change snapshots", () => {
    // Held $150 for 80 days, dropped to $100 for the last 10 days -> time-weighted 90d median MUST be $150
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 15000, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(90) },
      { priceCents: 10000, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(10) },
    ];
    expect(computeTimeWeightedMedian(snapshots, 90, NOW)).toBe(15000);
    // Over trailing 15 days (5d @ $150, 10d @ $100), median is $100
    expect(computeTimeWeightedMedian(snapshots, 15, NOW)).toBe(10000);
  });

  it("assigns 'Lowest in 90 days' when at/below 90d min with >= 21d history and genuine drop", () => {
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 14500, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(85) },
      { priceCents: 12000, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(40) },
      { priceCents: 14500, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(30) },
      { priceCents: 9800, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(1) },
    ];

    const result = evaluateProductDeal({
      currentPriceCents: 9800,
      originalPriceCents: 16500,
      inStock: true,
      availableSizesCount: 5,
      snapshots,
      asOf: NOW,
    });

    expect(result.historyDays).toBe(85);
    expect(result.median90dCents).toBe(14500);
    expect(result.low90dCents).toBe(9800);
    expect(result.allTimeLowCents).toBe(9800);
    expect(result.timesAtOrBelowCurrent).toBe(1);
    expect(result.lastPriceChangeCents).toBe(-4700);
    expect(result.pctBelowMedian).toBeCloseTo(32.4, 1);
    expect(result.dealLabel).toBe("Lowest in 90 days");
    expect(result.dealScore).toBeGreaterThanOrEqual(80);
    expect(result.dealScoreBreakdown.total).toBe(result.dealScore);
    expect(result.dealBlurb).toContain("$98");
    expect(result.dealBlurb).toContain("$145");
  });

  it("assigns 'Real deal' when <= 85% of 90d median (but above 90d low) with >= 21d history", () => {
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 10000, originalPriceCents: 13000, inStock: true, capturedAt: daysAgo(70) },
      { priceCents: 7500, originalPriceCents: 13000, inStock: true, capturedAt: daysAgo(45) },
      { priceCents: 10000, originalPriceCents: 13000, inStock: true, capturedAt: daysAgo(38) },
      { priceCents: 8400, originalPriceCents: 13000, inStock: true, capturedAt: daysAgo(2) },
    ];

    const result = evaluateProductDeal({
      currentPriceCents: 8400,
      originalPriceCents: 13000,
      inStock: true,
      availableSizesCount: 4,
      snapshots,
      asOf: NOW,
    });

    expect(result.low90dCents).toBe(7500);
    expect(result.median90dCents).toBe(10000);
    expect(result.dealLabel).toBe("Real deal");
  });

  it("enforces the 21-day maturity gate: returns 'Brand-claimed discount only' when history < 21d", () => {
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 15000, originalPriceCents: 18000, inStock: true, capturedAt: daysAgo(14) },
      { priceCents: 9000, originalPriceCents: 18000, inStock: true, capturedAt: daysAgo(1) },
    ];

    const result = evaluateProductDeal({
      currentPriceCents: 9000,
      originalPriceCents: 18000,
      inStock: true,
      availableSizesCount: 5,
      snapshots,
      asOf: NOW,
    });

    expect(result.historyDays).toBe(14);
    expect(result.dealLabel).toBe("Brand-claimed discount only");
    expect(result.dealScoreBreakdown.belowMedian).toBe(0);
    expect(result.dealBlurb).toContain("14/21d");
  });

  it("flags perpetual 'always-on-sale' fake discounts as 'Brand-claimed discount only'", () => {
    // Brand claims MSRP $119, but item sat at $69 for 85 straight days and is now $67
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 6900, originalPriceCents: 11900, inStock: true, capturedAt: daysAgo(85) },
      { priceCents: 6700, originalPriceCents: 11900, inStock: true, capturedAt: daysAgo(2) },
    ];

    const result = evaluateProductDeal({
      currentPriceCents: 6700,
      originalPriceCents: 11900,
      inStock: true,
      availableSizesCount: 6,
      snapshots,
      asOf: NOW,
    });

    expect(result.pctBelowOriginal).toBeCloseTo(43.7, 1);
    expect(result.pctBelowMedian).toBeCloseTo(2.9, 1);
    expect(result.dealLabel).toBe("Brand-claimed discount only");
    expect(result.dealBlurb).toContain("Brand advertises");
  });

  it("does NOT label an item sitting at the same price for 60 days as 'Real deal' even when far below brand MSRP", () => {
    // Brand claims MSRP $130, but the product sat at $79 for 60 consecutive days (39% brand-claimed discount)
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 7900, originalPriceCents: 13000, inStock: true, capturedAt: daysAgo(60) },
    ];

    const result = evaluateProductDeal({
      currentPriceCents: 7900,
      originalPriceCents: 13000,
      inStock: true,
      availableSizesCount: 5,
      snapshots,
      asOf: NOW,
    });

    expect(result.historyDays).toBe(60);
    expect(result.median90dCents).toBe(7900);
    expect(result.pctBelowOriginal).toBeCloseTo(39.2, 1);
    expect(result.pctBelowMedian).toBe(0);
    expect(result.dealLabel).toBe("Brand-claimed discount only");
    expect(result.dealLabel).not.toBe("Real deal");
    expect(result.dealLabel).not.toBe("Lowest in 90 days");
    expect(result.dealScoreBreakdown.belowMedian).toBe(0);
  });

  it("generates strictly data-derived notes without subjective fabric/fit claims", () => {
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 15000, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(50) },
      { priceCents: 11000, originalPriceCents: 16500, inStock: true, capturedAt: daysAgo(2) },
    ];
    const result = evaluateProductDeal({
      currentPriceCents: 11000,
      originalPriceCents: 16500,
      inStock: true,
      availableSizesCount: 4,
      snapshots,
      asOf: NOW,
    });
    expect(result.dataNote).toContain("Tracked for 50d");
    expect(result.dataNote).toContain("90d median: $150");
    expect(result.dataNote).toContain("4 sizes currently listed in stock");
  });

  it("penalizes out-of-stock items in the deal score breakdown", () => {
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: 20000, originalPriceCents: 22000, inStock: true, capturedAt: daysAgo(60) },
      { priceCents: 14000, originalPriceCents: 22000, inStock: false, capturedAt: daysAgo(1) },
    ];
    const oos = evaluateProductDeal({
      currentPriceCents: 14000,
      originalPriceCents: 22000,
      inStock: false,
      availableSizesCount: 0,
      snapshots,
      asOf: NOW,
    });
    expect(oos.dealScoreBreakdown.stock).toBe(0);
  });

  it("rejects absurd crawled updates in sanity checks", () => {
    expect(validatePriceUpdate({ newPriceCents: 0, originalPriceCents: 10000 }).valid).toBe(false);
    expect(validatePriceUpdate({ newPriceCents: -500, originalPriceCents: 10000 }).valid).toBe(false);
    expect(validatePriceUpdate({ newPriceCents: 25000, originalPriceCents: 10000 }).valid).toBe(false);
    expect(
      validatePriceUpdate({
        newPriceCents: 800,
        originalPriceCents: 12000,
        previousPriceCents: 10000,
      }).valid
    ).toBe(false);
    expect(
      validatePriceUpdate({
        newPriceCents: 7500,
        originalPriceCents: 12000,
        previousPriceCents: 10000,
      }).valid
    ).toBe(true);
  });
});
