import { describe, expect, it } from "vitest";
import {
  computeEstimatedPriceAfterPromo,
  formatPromoLine,
  type ActiveBrandPromo,
} from "../index";

const basePromo: ActiveBrandPromo = {
  id: 1,
  brandSlug: "faherty",
  description: "Extra 20% off",
  code: "BF20",
  percentOff: 20,
  amountOffCents: null,
  minSpendCents: null,
  appliesTo: "Sitewide",
  hasExclusions: false,
  startsAt: "2026-11-26T00:00:00Z",
  endsAt: "2026-12-01T05:00:00Z",
  sourceUrl: "https://fahertybrand.com",
};

describe("Checkout promo display & estimation layer (/lib/promos)", () => {
  it("computes estimated price ONLY for simple exclusion-free, no-min-spend promos", () => {
    expect(computeEstimatedPriceAfterPromo(10000, basePromo)).toBe(8000);
    expect(
      computeEstimatedPriceAfterPromo(10000, {
        ...basePromo,
        percentOff: null,
        amountOffCents: 2500,
      })
    ).toBe(7500);
  });

  it("returns null (does NOT compute an estimated price) when promo has exclusions or min spend", () => {
    expect(
      computeEstimatedPriceAfterPromo(10000, { ...basePromo, hasExclusions: true })
    ).toBeNull();
    expect(
      computeEstimatedPriceAfterPromo(10000, { ...basePromo, minSpendCents: 15000 })
    ).toBeNull();
  });

  it("formats promo display line cleanly with code and end date", () => {
    const line = formatPromoLine(basePromo);
    expect(line).toContain("Extra 20% off");
    expect(line).toContain("with code BF20");
    expect(line).toContain("ends ");
  });
});
