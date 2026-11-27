export type BudgetTierId = "student" | "intern" | "full_time";
export type FormalityLevel = "low" | "medium" | "high";

export const FORMALITY_RANK: Record<FormalityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

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

export type KitSlotId = "tailoring" | "shirt" | "trousers" | "layer" | "shoes" | "belt";
export type KitSizeGroup = "jacket" | "top" | "bottom" | "shoes" | "belt";

export interface KitSlotConfig {
  id: KitSlotId;
  label: string;
  description: string;
  required: boolean;
  categories: readonly string[];
  /** When provided, candidate subcategory MUST be in this allowlist */
  allowedSubcategories?: readonly string[];
  excludeSubcategories?: readonly string[];
  sizeGroup: KitSizeGroup;
  /** Minimum eligible compliant candidates required before populating this slot */
  minCandidates: number;
}

export const INTERVIEW_KIT_SLOTS: readonly KitSlotConfig[] = [
  {
    id: "tailoring",
    label: "Suit or Blazer",
    description: "Structured navy, charcoal, gray, or black suit or blazer",
    required: true,
    categories: ["suits", "blazers-sport-coats"],
    sizeGroup: "jacket",
    minCandidates: 1,
  },
  {
    id: "shirt",
    label: "Dress Shirt / OCBD",
    description: "White or light blue non-iron dress shirt or oxford button-down",
    required: true,
    categories: ["dress-shirts-ocbds"],
    sizeGroup: "top",
    minCandidates: 1,
  },
  {
    id: "trousers",
    label: "Trousers / Chinos",
    description: "Neutral tailored dress trousers or office chinos",
    required: true,
    categories: ["chinos-dress-pants", "performance-trousers"],
    sizeGroup: "bottom",
    minCandidates: 1,
  },
  {
    id: "layer",
    label: "Office Layer",
    description: "Quarter-zip, merino crewneck, or knit pullover",
    required: true,
    categories: ["quarter-zips-pullovers"],
    sizeGroup: "top",
    minCandidates: 1,
  },
  {
    id: "shoes",
    label: "Dress Shoes",
    description: "Leather oxford, derby, monk strap, or penny loafer",
    required: true,
    categories: ["shoes-belts"],
    allowedSubcategories: ["Oxford Dress Shoe", "Derby / Monk Strap", "Penny Loafer"],
    sizeGroup: "shoes",
    minCandidates: 1,
  },
  {
    id: "belt",
    label: "Dress Belt",
    description: "Optional leather dress belt color-matched to your shoes",
    required: false,
    categories: ["shoes-belts"],
    allowedSubcategories: ["Dress Belt"],
    sizeGroup: "belt",
    minCandidates: 1,
  },
] as const;

/**
 * Configurable neutral color palette allowed per slot (canonicalized names from COLOR_NORMALIZATION_MAP).
 * Items with no color in this palette are rejected without relaxing rules.
 */
export const KIT_NEUTRAL_PALETTE_BY_SLOT: Record<KitSlotId, readonly string[]> = {
  tailoring: ["Navy", "Charcoal", "Gray", "Black"],
  shirt: ["White", "Light Blue"],
  trousers: ["Navy", "Charcoal", "Gray", "Light Gray", "Black", "Tan", "Khaki", "Stone", "Olive"],
  layer: [
    "Navy",
    "Charcoal",
    "Gray",
    "Light Gray",
    "Black",
    "White",
    "Light Blue",
    "Cream",
    "Oatmeal",
    "Stone",
    "Tan",
    "Olive",
    "Forest Green",
    "Burgundy",
  ],
  shoes: ["Black", "Brown", "Dark Brown", "Cognac", "Tan"],
  belt: ["Black", "Brown", "Dark Brown", "Cognac", "Tan"],
};

/**
 * Stricter per-tier palette overrides (e.g., Full-Time Analyst keeps trousers strictly tailored neutrals).
 */
export const KIT_TIER_PALETTE_OVERRIDES: Partial<
  Record<BudgetTierId, Partial<Record<KitSlotId, readonly string[]>>>
> = {
  full_time: {
    trousers: ["Navy", "Charcoal", "Gray", "Light Gray", "Black"],
    shoes: ["Black", "Brown", "Dark Brown"],
    belt: ["Black", "Brown", "Dark Brown"],
  },
};

export function getAllowedColorsForSlot(slotId: KitSlotId, tierId: BudgetTierId): readonly string[] {
  return KIT_TIER_PALETTE_OVERRIDES[tierId]?.[slotId] ?? KIT_NEUTRAL_PALETTE_BY_SLOT[slotId];
}

/**
 * Minimum product formality required for each slot in each budget tier.
 * Casual items (e.g. Chinos, Casual Button-Downs, Knit Blazers) cannot fill `high` slots.
 */
export const KIT_MIN_FORMALITY_BY_TIER: Record<BudgetTierId, Record<KitSlotId, FormalityLevel>> = {
  student: {
    tailoring: "medium",
    shirt: "high",
    trousers: "medium",
    layer: "medium",
    shoes: "medium",
    belt: "medium",
  },
  intern: {
    tailoring: "high",
    shirt: "high",
    trousers: "medium",
    layer: "medium",
    shoes: "high",
    belt: "medium",
  },
  full_time: {
    tailoring: "high",
    shirt: "high",
    trousers: "high",
    layer: "medium",
    shoes: "high",
    belt: "high",
  },
};

export const BROWN_LEATHER_FAMILY: ReadonlySet<string> = new Set([
  "Brown",
  "Dark Brown",
  "Cognac",
  "Tan",
]);

export function isBrownLeather(color: string): boolean {
  return BROWN_LEATHER_FAMILY.has(color);
}

/**
 * Deterministic color-pairing compatibility checker across selected slots.
 * Enforces classic menswear tailoring & leather harmony rules:
 *  1. Shoes & Belt must match leather family (Black with Black; Brown/Dark Brown/Cognac/Tan with Brown family).
 *  2. Black tailoring never pairs with brown-family shoes or brown-family belt.
 *  3. In the strictest tier (`full_time`), Charcoal tailoring requires Black shoes (no brown-family shoes).
 *  4. Separate Black tailoring does not pair with Navy trousers, and Navy tailoring does not pair with Black trousers.
 */
export function checkKitColorPairing(
  colors: Partial<Record<KitSlotId, string>>,
  tierId: BudgetTierId
): { ok: boolean; reason?: string } {
  const { tailoring, trousers, shoes, belt } = colors;

  if (shoes && belt) {
    if (shoes === "Black" && isBrownLeather(belt)) {
      return { ok: false, reason: "Black shoes cannot pair with a brown-family belt." };
    }
    if (isBrownLeather(shoes) && belt === "Black") {
      return { ok: false, reason: "Brown-family shoes cannot pair with a black belt." };
    }
  }

  if (tailoring === "Black") {
    if (shoes && isBrownLeather(shoes)) {
      return { ok: false, reason: "Black tailoring requires black shoes." };
    }
    if (belt && isBrownLeather(belt)) {
      return { ok: false, reason: "Black tailoring requires a black belt." };
    }
    if (trousers === "Navy") {
      return { ok: false, reason: "Black tailoring does not pair with navy trousers." };
    }
  }

  if (tailoring === "Navy" && trousers === "Black") {
    return { ok: false, reason: "Navy tailoring does not pair with black trousers." };
  }

  if (tierId === "full_time" && tailoring === "Charcoal") {
    if (shoes && isBrownLeather(shoes)) {
      return {
        ok: false,
        reason: "Full-Time Analyst tier pairs charcoal tailoring with black shoes only.",
      };
    }
    if (belt && isBrownLeather(belt)) {
      return {
        ok: false,
        reason: "Full-Time Analyst tier pairs charcoal tailoring with black leather only.",
      };
    }
  }

  return { ok: true };
}
