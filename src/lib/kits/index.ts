import { formatCurrency } from "@/lib/utils";

export type BudgetTierId = "student" | "intern" | "full_time";

export interface BudgetTierConfig {
  id: BudgetTierId;
  label: string;
  subtitle: string;
  budgetCapCents: number;
}

export const KIT_BUDGET_TIERS: readonly BudgetTierConfig[] = [
  {
    id: "student",
    label: "Student Starter",
    subtitle: "Campus recruiting & coffee chats under $450",
    budgetCapCents: 45_000,
  },
  {
    id: "intern",
    label: "Summer Intern",
    subtitle: "Superday + desk rotation under $850",
    budgetCapCents: 85_000,
  },
  {
    id: "full_time",
    label: "Full-Time Analyst",
    subtitle: "Complete tailored rotation under $1,500",
    budgetCapCents: 150_000,
  },
] as const;

export type KitSlotId = "tailoring" | "shirt" | "trousers" | "layer" | "footwear_belt";
export type KitSizeGroup = "jacket" | "top" | "bottom" | "footwear";

export interface KitSlotConfig {
  id: KitSlotId;
  label: string;
  description: string;
  categories: readonly string[];
  excludeSubcategories?: readonly string[];
  sizeGroup: KitSizeGroup;
  /** Minimum eligible in-stock candidates required before populating this slot */
  minCandidates: number;
}

export const INTERVIEW_KIT_SLOTS: readonly KitSlotConfig[] = [
  {
    id: "tailoring",
    label: "Suit or Blazer",
    description: "Structured blazer, sport coat, or tailored suit jacket",
    categories: ["suits", "blazers-sport-coats"],
    sizeGroup: "jacket",
    minCandidates: 3,
  },
  {
    id: "shirt",
    label: "Dress Shirt / OCBD",
    description: "Crisp non-iron dress shirt or button-down collar shirt",
    categories: ["dress-shirts-ocbds"],
    sizeGroup: "top",
    minCandidates: 3,
  },
  {
    id: "trousers",
    label: "Trousers / Chinos",
    description: "Tailored chinos, wool dress pants, or commuter trousers",
    categories: ["chinos-dress-pants", "performance-trousers"],
    sizeGroup: "bottom",
    minCandidates: 3,
  },
  {
    id: "layer",
    label: "Office Layer",
    description: "Quarter-zip, merino crewneck, or knit pullover",
    categories: ["quarter-zips-pullovers"],
    sizeGroup: "top",
    minCandidates: 3,
  },
  {
    id: "footwear_belt",
    label: "Dress Shoes or Belt",
    description: "Leather dress shoes, loafers, or dress belt",
    categories: ["shoes-belts"],
    excludeSubcategories: ["Dress Socks"],
    sizeGroup: "footwear",
    minCandidates: 3,
  },
] as const;

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
  sizes: string[];
  imageUrl: string | null;
  productUrl: string;
}

export interface KitSizePreferences {
  topSize?: string;
  bottomSize?: string;
  jacketSize?: string;
  footwearSize?: string;
}

export interface KitSlotResult {
  slot: KitSlotConfig;
  status: "filled" | "insufficient_inventory" | "over_budget";
  eligibleCount: number;
  item: KitCandidateProduct | null;
  selectionReason: string;
}

export interface BuiltInterviewKit {
  tier: BudgetTierConfig;
  maxItemsPerBrand: number;
  slots: KitSlotResult[];
  filledCount: number;
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
    case "footwear":
      return prefs.footwearSize;
  }
}

/**
 * Pure deterministic Interview Kit optimizer:
 *  - Selects at most 1 in-stock, size-matching item per slot
 *  - Enforces total cost <= tier.budgetCapCents
 *  - Enforces max `maxItemsPerBrand` (default 2) items from any single brand
 *  - Maximizes (1) number of filled slots, then (2) sum of dealScore, then (3) lower total cost
 *  - Gracefully degrades any slot with fewer than `minCandidates` eligible items
 *    ("Not enough in-scope inventory yet") rather than forcing off-category/poor matches.
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

  // Filter eligible in-stock candidates per slot
  const slotPools = INTERVIEW_KIT_SLOTS.map((slot) => {
    const reqSize = getRequestedSize(slot.sizeGroup, sizePrefs);
    const eligible = products.filter((p) => {
      if (!p.inStock || p.currentPriceCents <= 0) return false;
      if (!p.category || !slot.categories.includes(p.category)) return false;
      if (
        slot.excludeSubcategories &&
        p.subcategory &&
        slot.excludeSubcategories.includes(p.subcategory)
      ) {
        return false;
      }
      if (!matchesSizePreference(p.sizes, reqSize)) return false;
      return true;
    });

    const minRequired = options.minCandidatesOverride ?? slot.minCandidates;
    const hasEnoughInventory = eligible.length >= minRequired;

    // Keep top candidates (union of highest dealScore and lowest price) for exact fast search
    const byScore = [...eligible]
      .sort(
        (a, b) =>
          b.dealScore - a.dealScore ||
          b.pctBelowMedian - a.pctBelowMedian ||
          a.currentPriceCents - b.currentPriceCents ||
          a.id.localeCompare(b.id)
      )
      .slice(0, 8);
    const byPrice = [...eligible]
      .sort(
        (a, b) =>
          a.currentPriceCents - b.currentPriceCents ||
          b.dealScore - a.dealScore ||
          a.id.localeCompare(b.id)
      )
      .slice(0, 8);

    const mergedMap = new Map<string, KitCandidateProduct>();
    for (const item of [...byScore, ...byPrice]) {
      mergedMap.set(item.id, item);
    }
    const candidates = hasEnoughInventory
      ? Array.from(mergedMap.values()).sort(
          (a, b) => b.dealScore - a.dealScore || a.currentPriceCents - b.currentPriceCents
        )
      : [];

    return {
      slot,
      eligibleCount: eligible.length,
      hasEnoughInventory,
      candidates,
      maxScoreInSlot: candidates.length > 0 ? Math.max(...candidates.map((c) => c.dealScore)) : 0,
    };
  });

  // Precompute optimistic upper bounds for branch-and-bound pruning
  const n = slotPools.length;
  const suffixMaxFilled = new Array<number>(n + 1).fill(0);
  const suffixMaxScore = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixMaxFilled[i] = suffixMaxFilled[i + 1] + (slotPools[i].candidates.length > 0 ? 1 : 0);
    suffixMaxScore[i] = suffixMaxScore[i + 1] + slotPools[i].maxScoreInSlot;
  }

  let bestFilled = -1;
  let bestScore = -1;
  let bestCost = Number.MAX_SAFE_INTEGER;
  let bestChoice: Array<KitCandidateProduct | null> = new Array(n).fill(null);

  const currentChoice: Array<KitCandidateProduct | null> = new Array(n).fill(null);
  const brandCountMap = new Map<string, number>();

  function dfs(idx: number, filled: number, score: number, cost: number) {
    // Upper-bound pruning
    if (filled + suffixMaxFilled[idx] < bestFilled) return;
    if (
      filled + suffixMaxFilled[idx] === bestFilled &&
      score + suffixMaxScore[idx] < bestScore
    ) {
      return;
    }

    if (idx === n) {
      const better =
        filled > bestFilled ||
        (filled === bestFilled && score > bestScore) ||
        (filled === bestFilled && score === bestScore && cost < bestCost);
      if (better) {
        bestFilled = filled;
        bestScore = score;
        bestCost = cost;
        bestChoice = [...currentChoice];
      }
      return;
    }

    const pool = slotPools[idx];
    for (const candidate of pool.candidates) {
      const nextCost = cost + candidate.currentPriceCents;
      if (nextCost > tier.budgetCapCents) continue;

      const bCount = brandCountMap.get(candidate.brandSlug) ?? 0;
      if (bCount >= maxItemsPerBrand) continue;

      brandCountMap.set(candidate.brandSlug, bCount + 1);
      currentChoice[idx] = candidate;
      dfs(idx + 1, filled + 1, score + candidate.dealScore, nextCost);
      currentChoice[idx] = null;
      if (bCount === 0) brandCountMap.delete(candidate.brandSlug);
      else brandCountMap.set(candidate.brandSlug, bCount);
    }

    // Also allow leaving this slot empty (needed if budget is tight or inventory is missing)
    currentChoice[idx] = null;
    dfs(idx + 1, filled, score, cost);
  }

  dfs(0, 0, 0, 0);

  const brandCounts: Record<string, number> = {};
  let totalPriceCents = 0;
  let totalDealScore = 0;
  let filledCount = 0;

  const slots: KitSlotResult[] = slotPools.map((pool, i) => {
    const picked = bestChoice[i];
    if (picked) {
      filledCount += 1;
      totalPriceCents += picked.currentPriceCents;
      totalDealScore += picked.dealScore;
      brandCounts[picked.brandSlug] = (brandCounts[picked.brandSlug] ?? 0) + 1;
      const budgetSharePct = Math.round((picked.currentPriceCents / tier.budgetCapCents) * 100);
      const medNote =
        picked.pctBelowMedian > 0
          ? `${Math.round(picked.pctBelowMedian)}% below 90d median`
          : picked.dealLabel;

      return {
        slot: pool.slot,
        status: "filled",
        eligibleCount: pool.eligibleCount,
        item: picked,
        selectionReason: `Deal Score ${picked.dealScore}/100 · ${formatCurrency(picked.currentPriceCents)} (${budgetSharePct}% of ${formatCurrency(tier.budgetCapCents)} cap) · ${medNote}`,
      };
    }

    if (!pool.hasEnoughInventory) {
      const reqSize = getRequestedSize(pool.slot.sizeGroup, sizePrefs);
      const sizeNote = reqSize ? ` in size ${reqSize.toUpperCase()}` : "";
      return {
        slot: pool.slot,
        status: "insufficient_inventory",
        eligibleCount: pool.eligibleCount,
        item: null,
        selectionReason: `Not enough in-scope inventory yet (${pool.eligibleCount} eligible in-stock ${pool.slot.label.toLowerCase()} item${pool.eligibleCount === 1 ? "" : "s"}${sizeNote}; minimum ${options.minCandidatesOverride ?? pool.slot.minCandidates} required).`,
      };
    }

    return {
      slot: pool.slot,
      status: "over_budget",
      eligibleCount: pool.eligibleCount,
      item: null,
      selectionReason: `Not enough in-scope inventory fits within the ${formatCurrency(tier.budgetCapCents)} budget cap and max-${maxItemsPerBrand}-per-brand diversity rule (${pool.eligibleCount} candidates checked).`,
    };
  });

  return {
    tier,
    maxItemsPerBrand,
    slots,
    filledCount,
    totalSlots: INTERVIEW_KIT_SLOTS.length,
    totalPriceCents,
    remainingBudgetCents: Math.max(0, tier.budgetCapCents - totalPriceCents),
    totalDealScore,
    averageDealScore: filledCount > 0 ? Math.round(totalDealScore / filledCount) : 0,
    brandCounts,
    degraded: filledCount < INTERVIEW_KIT_SLOTS.length,
  };
}
