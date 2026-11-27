export interface ActiveBrandPromo {
  id: number;
  brandSlug: string;
  description: string;
  code: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  minSpendCents: number | null;
  appliesTo: string;
  hasExclusions: boolean;
  startsAt: string;
  endsAt: string;
  sourceUrl: string | null;
}

export interface ActiveSaleEvent {
  id: number;
  slug: string;
  name: string;
  brandSlug: string | null;
  startsAt: string;
  endsAt: string;
  typicalDiscountNote: string;
}

/**
 * Formats a concise human-readable promo display line (e.g. "Extra 20% off with code BF20, ends Mon").
 * Promos are strictly a display layer and are NEVER baked into price_snapshots or Deal Engine history.
 */
export function formatPromoLine(promo: ActiveBrandPromo): string {
  const endDate = new Date(promo.endsAt);
  const endLabel = endDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const codePart = promo.code ? ` with code ${promo.code}` : "";
  const minPart =
    promo.minSpendCents && promo.minSpendCents > 0
      ? ` (min $${Math.round(promo.minSpendCents / 100)})`
      : "";

  return `${promo.description}${codePart}${minPart} · ends ${endLabel}`;
}

/**
 * Computes an estimated price after checkout promo ONLY when the promo is a simple,
 * unconditional percent-off or dollar-amount-off offer with NO exclusions and NO min-spend requirement.
 * Otherwise returns `null` so the UI displays the promo text honestly without guessing a price.
 */
export function computeEstimatedPriceAfterPromo(
  currentPriceCents: number,
  promo: ActiveBrandPromo
): number | null {
  if (promo.hasExclusions) return null;
  if (promo.minSpendCents && promo.minSpendCents > 0) return null;

  if (promo.percentOff && promo.percentOff > 0 && promo.percentOff < 100) {
    return Math.max(0, Math.round(currentPriceCents * (1 - promo.percentOff / 100)));
  }

  if (promo.amountOffCents && promo.amountOffCents > 0) {
    return Math.max(0, currentPriceCents - promo.amountOffCents);
  }

  return null;
}
