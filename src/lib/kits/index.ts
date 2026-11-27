import {
  checkKitColorPairing,
  FORMALITY_RANK,
  getAllowedColorsForSlot,
  INTERVIEW_KIT_SLOTS,
  KIT_BUDGET_TIERS,
  KIT_MIN_FORMALITY_BY_TIER,
  type BudgetTierConfig,
  type BudgetTierId,
  type FormalityLevel,
  type KitSizeGroup,
  type KitSlotConfig,
  type KitSlotId,
} from "@config/kit-rules";
import { deriveProductFormality, normalizeColor } from "@/lib/classify";
import { formatCurrency } from "@/lib/utils";

export {
  INTERVIEW_KIT_SLOTS,
  KIT_BUDGET_TIERS,
  type BudgetTierConfig,
  type BudgetTierId,
  type FormalityLevel,
  type KitSizeGroup,
  type KitSlotConfig,
  type KitSlotId,
};

export interface KitCandidateProduct {
  id: string;
  slug: string;
  brandSlug: string;
  brandName: string;
  brandCode: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  currentPriceCents: number;
  originalPriceCents: number;
  median90dCents: number;
  pctBelowMedian: number;
  dealScore: number;
  dealLabel: string;
  inStock: boolean;
  colors: string[];
  sizes: string[];
  imageUrl: string | null;
  productUrl: string;
}

export interface KitSizePreferences {
  topSize?: string;
  bottomSize?: string;
  jacketSize?: string;
  shoeSize?: string;
  beltSize?: string;
  /** @deprecated Alias for shoeSize */
  footwearSize?: string;
}

export interface KitSlotResult {
  slot: KitSlotConfig;
  status: "filled" | "insufficient_inventory" | "over_budget";
  eligibleCount: number;
  minFormality: FormalityLevel;
  allowedPalette: readonly string[];
  item: KitCandidateProduct | null;
  matchedColor: string | null;
  itemFormality: FormalityLevel | null;
  selectionReason: string;
}

export interface BuiltInterviewKit {
  tier: BudgetTierConfig;
  maxItemsPerBrand: number;
  slots: KitSlotResult[];
  filledCount: number;
  requiredFilledCount: number;
  requiredTotalCount: number;
  totalSlots: number;
  totalPriceCents: number;
  remainingBudgetCents: number;
  totalDealScore: number;
  averageDealScore: number;
  brandCounts: Record<string, number>;
  degraded: boolean;
}

function matchesSizePreference(sizes: string[], requested?: string): boolean {
  const target = requested?.trim().toUpperCase();
  if (!target) return true;
  if (sizes.length === 0) return false;
  return sizes.some((s) => s.trim().toUpperCase() === target);
}

function getRequestedSize(group: KitSizeGroup, prefs: KitSizePreferences): string | undefined {
  switch (group) {
    case "jacket":
      return prefs.jacketSize;
    case "top":
      return prefs.topSize;
    case "bottom":
      return prefs.bottomSize;
    case "shoes":
      return prefs.shoeSize ?? prefs.footwearSize;
    case "belt":
      return prefs.beltSize;
  }
}

/**
 * Extracts canonical neutral colors available on a product (from normalized `colors[]` or title fallback)
 * that belong to the slot's allowed neutral palette.
 */
export function resolveAllowedNeutralColors(
  product: Pick<KitCandidateProduct, "colors" | "name">,
  allowedPalette: readonly string[]
): string[] {
  const allowedSet = new Set(allowedPalette);
  const matched = new Set<string>();

  for (const raw of product.colors ?? []) {
    const canon = normalizeColor(raw);
    if (canon && allowedSet.has(canon)) {
      matched.add(canon);
    }
  }

  // Fallback: check product title for explicit neutral color keywords if colors[] lacked a match
  if (matched.size === 0 && product.name) {
    const lowerName = product.name.toLowerCase();
    for (const color of allowedPalette) {
      const re = new RegExp(`\\b${color.toLowerCase().replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(lowerName)) {
        matched.add(color);
      }
    }
  }

  return Array.from(matched);
}

interface PoolCandidate {
  product: KitCandidateProduct;
  allowedColors: string[];
  formality: FormalityLevel;
  formalityScore: number;
}

/**
 * Pure deterministic Interview Kit optimizer:
 *  - 5 required slots (Suit/Blazer, Dress Shirt/OCBD, Trousers/Chinos, Office Layer, Dress Shoes) + 1 optional Belt slot
 *  - Strictly enforces in-stock, optional size filter, minimum formality per slot/tier,
 *    neutral palette per slot/tier, color-pairing compatibility rules (leather harmony, charcoal/black tailoring),
 *    max `maxItemsPerBrand` (default 2) per brand, and total cost <= budget cap.
 *  - NEVER relaxes rules: when no compliant item/combination exists for a slot, marks it unfilled
 *    with "Not enough in-scope inventory yet".
 *  - Maximizes: (1) required slots filled, (2) total slots filled (including optional belt),
 *    (3) sum of dealScore, (4) lower total cost.
 */
export function buildInterviewKit(
  products: KitCandidateProduct[],
  options: {
    tierId: BudgetTierId;
    sizes?: KitSizePreferences;
    maxItemsPerBrand?: number;
    minCandidatesOverride?: number;
  }
): BuiltInterviewKit {
  const tier =
    KIT_BUDGET_TIERS.find((t) => t.id === options.tierId) ?? KIT_BUDGET_TIERS[1];
  const maxItemsPerBrand = options.maxItemsPerBrand ?? 2;
  const sizePrefs = options.sizes ?? {};

  const slotPools = INTERVIEW_KIT_SLOTS.map((slot) => {
    const reqSize = getRequestedSize(slot.sizeGroup, sizePrefs);
    const minFormality = KIT_MIN_FORMALITY_BY_TIER[tier.id][slot.id];
    const minFormalityRank = FORMALITY_RANK[minFormality];
    const allowedPalette = getAllowedColorsForSlot(slot.id, tier.id);

    const compliant: PoolCandidate[] = [];
    for (const p of products) {
      if (!p.inStock || p.currentPriceCents <= 0) continue;
      if (!p.category || !slot.categories.includes(p.category)) continue;
      if (
        slot.allowedSubcategories &&
        (!p.subcategory || !slot.allowedSubcategories.includes(p.subcategory))
      ) {
        continue;
      }
      if (
        slot.excludeSubcategories &&
        p.subcategory &&
        slot.excludeSubcategories.includes(p.subcategory)
      ) {
        continue;
      }
      if (!matchesSizePreference(p.sizes, reqSize)) continue;

      const { formality, formalityScore } = deriveProductFormality({
        category: p.category,
        subcategory: p.subcategory,
        title: p.name,
      });
      if (formalityScore < minFormalityRank) continue;

      const allowedColors = resolveAllowedNeutralColors(p, allowedPalette);
      if (allowedColors.length === 0) continue;

      compliant.push({ product: p, allowedColors, formality, formalityScore });
    }

    const minRequired = options.minCandidatesOverride ?? slot.minCandidates;
    const hasEnoughInventory = compliant.length >= minRequired;

    const byScore = [...compliant]
      .sort(
        (a, b) =>
          b.product.dealScore - a.product.dealScore ||
          b.formalityScore - a.formalityScore ||
          a.product.currentPriceCents - b.product.currentPriceCents ||
          a.product.id.localeCompare(b.product.id)
      )
      .slice(0, 8);
    const byPrice = [...compliant]
      .sort(
        (a, b) =>
          a.product.currentPriceCents - b.product.currentPriceCents ||
          b.product.dealScore - a.product.dealScore ||
          a.product.id.localeCompare(b.product.id)
      )
      .slice(0, 6);

    // Also ensure distinct color families (e.g. Black vs Brown shoes/belts, Navy vs Charcoal suits) are represented in the pruned pool
    const byColorDiversity: PoolCandidate[] = [];
    const seenPrimaryColor = new Set<string>();
    for (const c of compliant.sort(
      (a, b) => b.product.dealScore - a.product.dealScore || a.product.currentPriceCents - b.product.currentPriceCents
    )) {
      for (const col of c.allowedColors) {
        if (!seenPrimaryColor.has(col)) {
          seenPrimaryColor.add(col);
          byColorDiversity.push(c);
        }
      }
    }

    const mergedMap = new Map<string, PoolCandidate>();
    for (const c of [...byScore, ...byPrice, ...byColorDiversity]) {
      mergedMap.set(c.product.id, c);
    }

    const candidates = hasEnoughInventory
      ? Array.from(mergedMap.values()).sort(
          (a, b) =>
            b.product.dealScore - a.product.dealScore ||
            a.product.currentPriceCents - b.product.currentPriceCents
        )
      : [];

    return {
      slot,
      minFormality,
      allowedPalette,
      eligibleCount: compliant.length,
      hasEnoughInventory,
      candidates,
      maxScoreInSlot:
        candidates.length > 0 ? Math.max(...candidates.map((c) => c.product.dealScore)) : 0,
    };
  });

  // Precompute optimistic upper bounds for exact branch-and-bound
  const n = slotPools.length;
  const suffixMaxReq = new Array<number>(n + 1).fill(0);
  const suffixMaxTotal = new Array<number>(n + 1).fill(0);
  const suffixMaxScore = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const hasCand = slotPools[i].candidates.length > 0 ? 1 : 0;
    suffixMaxReq[i] = suffixMaxReq[i + 1] + (slotPools[i].slot.required ? hasCand : 0);
    suffixMaxTotal[i] = suffixMaxTotal[i + 1] + hasCand;
    suffixMaxScore[i] = suffixMaxScore[i + 1] + slotPools[i].maxScoreInSlot;
  }

  type ChoiceEntry = { candidate: PoolCandidate; color: string } | null;

  let bestReqFilled = -1;
  let bestTotalFilled = -1;
  let bestScore = -1;
  let bestCost = Number.MAX_SAFE_INTEGER;
  let bestChoice: ChoiceEntry[] = new Array(n).fill(null);

  const currentChoice: ChoiceEntry[] = new Array(n).fill(null);
  const chosenColors: Partial<Record<KitSlotId, string>> = {};
  const brandCountMap = new Map<string, number>();

  function dfs(idx: number, reqFilled: number, totalFilled: number, score: number, cost: number) {
    // Upper-bound pruning
    if (reqFilled + suffixMaxReq[idx] < bestReqFilled) return;
    if (
      reqFilled + suffixMaxReq[idx] === bestReqFilled &&
      totalFilled + suffixMaxTotal[idx] < bestTotalFilled
    ) {
      return;
    }
    if (
      reqFilled + suffixMaxReq[idx] === bestReqFilled &&
      totalFilled + suffixMaxTotal[idx] === bestTotalFilled &&
      score + suffixMaxScore[idx] < bestScore
    ) {
      return;
    }

    if (idx === n) {
      const better =
        reqFilled > bestReqFilled ||
        (reqFilled === bestReqFilled && totalFilled > bestTotalFilled) ||
        (reqFilled === bestReqFilled && totalFilled === bestTotalFilled && score > bestScore) ||
        (reqFilled === bestReqFilled &&
          totalFilled === bestTotalFilled &&
          score === bestScore &&
          cost < bestCost);
      if (better) {
        bestReqFilled = reqFilled;
        bestTotalFilled = totalFilled;
        bestScore = score;
        bestCost = cost;
        bestChoice = [...currentChoice];
      }
      return;
    }

    const pool = slotPools[idx];
    const reqInc = pool.slot.required ? 1 : 0;

    for (const cand of pool.candidates) {
      const nextCost = cost + cand.product.currentPriceCents;
      if (nextCost > tier.budgetCapCents) continue;

      const bCount = brandCountMap.get(cand.product.brandSlug) ?? 0;
      if (bCount >= maxItemsPerBrand) continue;

      // Try each allowed neutral color on this candidate (pick first compatible color or explore distinct leather/suit families)
      const colorsToTry =
        pool.slot.id === "tailoring" ||
        pool.slot.id === "trousers" ||
        pool.slot.id === "shoes" ||
        pool.slot.id === "belt"
          ? cand.allowedColors
          : [cand.allowedColors[0]];

      for (const color of colorsToTry) {
        chosenColors[pool.slot.id] = color;
        if (!checkKitColorPairing(chosenColors, tier.id).ok) {
          delete chosenColors[pool.slot.id];
          continue;
        }

        brandCountMap.set(cand.product.brandSlug, bCount + 1);
        currentChoice[idx] = { candidate: cand, color };

        dfs(idx + 1, reqFilled + reqInc, totalFilled + 1, score + cand.product.dealScore, nextCost);

        currentChoice[idx] = null;
        delete chosenColors[pool.slot.id];
        if (bCount === 0) brandCountMap.delete(cand.product.brandSlug);
        else brandCountMap.set(cand.product.brandSlug, bCount);
      }
    }

    // Allow leaving this slot unfilled (never relaxes constraints)
    currentChoice[idx] = null;
    dfs(idx + 1, reqFilled, totalFilled, score, cost);
  }

  dfs(0, 0, 0, 0, 0);

  const brandCounts: Record<string, number> = {};
  let totalPriceCents = 0;
  let totalDealScore = 0;
  let filledCount = 0;
  let requiredFilledCount = 0;
  const requiredTotalCount = INTERVIEW_KIT_SLOTS.filter((s) => s.required).length;

  const slots: KitSlotResult[] = slotPools.map((pool, i) => {
    const picked = bestChoice[i];
    if (picked) {
      const p = picked.candidate.product;
      filledCount += 1;
      if (pool.slot.required) requiredFilledCount += 1;
      totalPriceCents += p.currentPriceCents;
      totalDealScore += p.dealScore;
      brandCounts[p.brandSlug] = (brandCounts[p.brandSlug] ?? 0) + 1;

      const budgetSharePct = Math.round((p.currentPriceCents / tier.budgetCapCents) * 100);
      const medNote =
        p.pctBelowMedian > 0 ? `${Math.round(p.pctBelowMedian)}% below 90d median` : p.dealLabel;

      return {
        slot: pool.slot,
        status: "filled",
        eligibleCount: pool.eligibleCount,
        minFormality: pool.minFormality,
        allowedPalette: pool.allowedPalette,
        item: p,
        matchedColor: picked.color,
        itemFormality: picked.candidate.formality,
        selectionReason: `Deal Score ${p.dealScore}/100 · ${formatCurrency(p.currentPriceCents)} (${budgetSharePct}% of ${formatCurrency(tier.budgetCapCents)} cap) · ${picked.color} · ${picked.candidate.formality} formality · ${medNote}`,
      };
    }

    const reqSize = getRequestedSize(pool.slot.sizeGroup, sizePrefs);
    const sizeNote = reqSize ? ` in size ${reqSize.toUpperCase()}` : "";

    if (!pool.hasEnoughInventory) {
      return {
        slot: pool.slot,
        status: "insufficient_inventory",
        eligibleCount: pool.eligibleCount,
        minFormality: pool.minFormality,
        allowedPalette: pool.allowedPalette,
        item: null,
        matchedColor: null,
        itemFormality: null,
        selectionReason: `Not enough in-scope inventory yet (${pool.eligibleCount} compliant in-stock ${pool.slot.label.toLowerCase()} item${pool.eligibleCount === 1 ? "" : "s"}${sizeNote} meeting ${pool.minFormality}+ formality & neutral palette).`,
      };
    }

    return {
      slot: pool.slot,
      status: "over_budget",
      eligibleCount: pool.eligibleCount,
      minFormality: pool.minFormality,
      allowedPalette: pool.allowedPalette,
      item: null,
      matchedColor: null,
      itemFormality: null,
      selectionReason: `Not enough in-scope inventory yet matching the ${formatCurrency(tier.budgetCapCents)} budget cap, color-pairing rules, and max-${maxItemsPerBrand}-per-brand limit (${pool.eligibleCount} slot candidates checked).`,
    };
  });

  return {
    tier,
    maxItemsPerBrand,
    slots,
    filledCount,
    requiredFilledCount,
    requiredTotalCount,
    totalSlots: INTERVIEW_KIT_SLOTS.length,
    totalPriceCents,
    remainingBudgetCents: Math.max(0, tier.budgetCapCents - totalPriceCents),
    totalDealScore,
    averageDealScore: filledCount > 0 ? Math.round(totalDealScore / filledCount) : 0,
    brandCounts,
    degraded: requiredFilledCount < requiredTotalCount,
  };
}
