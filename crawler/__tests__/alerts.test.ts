import { describe, expect, it } from "vitest";
import { shouldTriggerAlert, type AlertCandidate, type AlertProductSnapshot } from "../check-alerts";

const baseProduct: AlertProductSnapshot = {
  id: "faherty-123",
  slug: "faherty-movement-shirt",
  name: "Movement Shirt",
  brandSlug: "faherty",
  currentPriceCents: 10000,
  originalPriceCents: 16800,
  median90dCents: 14000,
  pctBelowMedian: 28.6,
  historyDays: 45,
  inStock: true,
};

const baseAlert: AlertCandidate = {
  id: 1,
  email: "student@example.edu",
  productId: "faherty-123",
  targetPriceCents: 10500,
  targetDiscountPct: null,
  unsubscribeToken: "abc",
  lastNotifiedPriceCents: null,
};

describe("Price-drop alert evaluator & deduplication", () => {
  it("triggers when current price hits or drops below targetPriceCents", () => {
    expect(shouldTriggerAlert(baseAlert, baseProduct).trigger).toBe(true);
    expect(
      shouldTriggerAlert({ ...baseAlert, targetPriceCents: 9500 }, baseProduct).trigger
    ).toBe(false);
  });

  it("deduplicates so user is NOT notified twice at the same price level, but IS notified on a deeper drop", () => {
    // Already notified at $100 -> skip at $100 or $102
    expect(
      shouldTriggerAlert({ ...baseAlert, lastNotifiedPriceCents: 10000 }, baseProduct).trigger
    ).toBe(false);
    expect(
      shouldTriggerAlert(
        { ...baseAlert, lastNotifiedPriceCents: 10000 },
        { ...baseProduct, currentPriceCents: 10200 }
      ).trigger
    ).toBe(false);

    // Further drop to $89 -> notify again!
    expect(
      shouldTriggerAlert(
        { ...baseAlert, lastNotifiedPriceCents: 10000 },
        { ...baseProduct, currentPriceCents: 8900 }
      ).trigger
    ).toBe(true);
  });

  it("enforces 21-day maturity gate on % below median alerts and skips out-of-stock items", () => {
    const pctAlert: AlertCandidate = {
      ...baseAlert,
      targetPriceCents: null,
      targetDiscountPct: 25,
    };
    expect(shouldTriggerAlert(pctAlert, baseProduct).trigger).toBe(true);
    expect(
      shouldTriggerAlert(pctAlert, { ...baseProduct, historyDays: 12 }).trigger
    ).toBe(false);
    expect(
      shouldTriggerAlert(baseAlert, { ...baseProduct, inStock: false }).trigger
    ).toBe(false);
  });
});
