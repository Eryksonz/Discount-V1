import { describe, expect, it } from "vitest";
import { checkKitColorPairing } from "@config/kit-rules";
import { deriveProductFormality } from "@/lib/classify";
import { buildInterviewKit, type KitCandidateProduct } from "../index";

function makeProduct(overrides: Partial<KitCandidateProduct> & { id: string }): KitCandidateProduct {
  return {
    slug: overrides.id,
    brandSlug: "bonobos",
    brandName: "Bonobos",
    brandCode: "BNBS",
    name: `Sample ${overrides.id}`,
    category: "dress-shirts-ocbds",
    subcategory: "Non-Iron Dress Shirt",
    currentPriceCents: 10000,
    originalPriceCents: 14000,
    median90dCents: 13000,
    pctBelowMedian: 23,
    dealScore: 78,
    dealLabel: "Real deal",
    inStock: true,
    colors: ["White"],
    sizes: ["M", "L", "32x32", "40R", "10", "34"],
    imageUrl: null,
    productUrl: "https://bonobos.com/products/sample",
    ...overrides,
  };
}

describe("Interview Kit deterministic bundle optimizer (shoes/belt split, color pairing, formality)", () => {
  it("computes deterministic formality scores from category, subcategory, and title", () => {
    expect(
      deriveProductFormality({ category: "suits", subcategory: "Worsted Wool Suit", title: "Navy Suit" }).formality
    ).toBe("high");
    expect(
      deriveProductFormality({ category: "dress-shirts-ocbds", subcategory: "OCBD", title: "Non-Iron Oxford" }).formality
    ).toBe("high");
    expect(
      deriveProductFormality({ category: "blazers-sport-coats", subcategory: "Knit Blazer", title: "Knit Blazer" }).formality
    ).toBe("medium");
    expect(
      deriveProductFormality({ category: "chinos-dress-pants", subcategory: "Chino", title: "Stretch Chino" }).formality
    ).toBe("medium");
    expect(
      deriveProductFormality({ category: "chinos-dress-pants", subcategory: "Wool Dress Pant", title: "Italian Wool Dress Pant" }).formality
    ).toBe("high");
    expect(
      deriveProductFormality({ category: "shoes-belts", subcategory: "Dress Belt", title: "Heritage Bungee Belt" }).formality
    ).toBe("medium");
    expect(
      deriveProductFormality({ category: "shoes-belts", subcategory: "Dress Belt", title: "Silver Buckle Leather Dress Belt" }).formality
    ).toBe("high");
  });

  it("enforces color-pairing rules: leather harmony & charcoal tailoring in full_time tier", () => {
    expect(checkKitColorPairing({ shoes: "Black", belt: "Brown" }, "intern").ok).toBe(false);
    expect(checkKitColorPairing({ shoes: "Brown", belt: "Black" }, "intern").ok).toBe(false);
    expect(checkKitColorPairing({ shoes: "Black", belt: "Black" }, "intern").ok).toBe(true);
    expect(checkKitColorPairing({ tailoring: "Charcoal", shoes: "Brown" }, "full_time").ok).toBe(false);
    expect(checkKitColorPairing({ tailoring: "Charcoal", shoes: "Black" }, "full_time").ok).toBe(true);
    expect(checkKitColorPairing({ tailoring: "Navy", shoes: "Dark Brown", belt: "Dark Brown" }, "full_time").ok).toBe(true);
  });

  it("splits required Dress Shoes and optional Dress Belt, matches leather colors, and respects max 2 per brand", () => {
    const catalog: KitCandidateProduct[] = [
      makeProduct({ id: "suit-navy", brandSlug: "brooks-brothers", category: "suits", subcategory: "Worsted Wool Suit", name: "Navy Wool Suit", colors: ["Navy"], currentPriceCents: 35000, dealScore: 90 }),
      makeProduct({ id: "shirt-white", brandSlug: "brooks-brothers", category: "dress-shirts-ocbds", subcategory: "Non-Iron Dress Shirt", name: "White Dress Shirt", colors: ["White"], currentPriceCents: 8000, dealScore: 88 }),
      makeProduct({ id: "trouser-gray", brandSlug: "bonobos", category: "chinos-dress-pants", subcategory: "Wool Dress Pant", name: "Gray Wool Dress Pant", colors: ["Gray"], currentPriceCents: 14000, dealScore: 86 }),
      makeProduct({ id: "layer-navy", brandSlug: "vineyard-vines", category: "quarter-zips-pullovers", subcategory: "Quarter-Zip", name: "Merino Quarter-Zip", colors: ["Navy"], currentPriceCents: 11000, dealScore: 84 }),
      // Shoes: only Black Oxford available -> Belt must pick Black, NOT higher-scored Brown belt!
      makeProduct({ id: "shoe-black", brandSlug: "bonobos", category: "shoes-belts", subcategory: "Oxford Dress Shoe", name: "Black Cap-Toe Oxford", colors: ["Black"], currentPriceCents: 22000, dealScore: 85 }),
      makeProduct({ id: "belt-brown-hi", brandSlug: "faherty", category: "shoes-belts", subcategory: "Dress Belt", name: "Brown Leather Dress Belt", colors: ["Brown"], currentPriceCents: 6000, dealScore: 99 }),
      makeProduct({ id: "belt-black", brandSlug: "vineyard-vines", category: "shoes-belts", subcategory: "Dress Belt", name: "Black Leather Dress Belt", colors: ["Black"], currentPriceCents: 6500, dealScore: 72 }),
    ];

    const kit = buildInterviewKit(catalog, { tierId: "full_time" });

    expect(kit.requiredFilledCount).toBe(5);
    expect(kit.filledCount).toBe(6);
    expect(kit.degraded).toBe(false);
    expect(kit.totalPriceCents).toBeLessThanOrEqual(150_000);

    const shoesSlot = kit.slots.find((s) => s.slot.id === "shoes");
    const beltSlot = kit.slots.find((s) => s.slot.id === "belt");
    expect(shoesSlot?.slot.required).toBe(true);
    expect(beltSlot?.slot.required).toBe(false);
    expect(shoesSlot?.item?.id).toBe("shoe-black");
    // Must reject the higher-scoring brown belt and pick the matching black belt
    expect(beltSlot?.item?.id).toBe("belt-black");
    expect(beltSlot?.matchedColor).toBe("Black");

    for (const count of Object.values(kit.brandCounts)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("blocks casual items and non-neutral colors from formal slots without relaxing rules", () => {
    const catalog: KitCandidateProduct[] = [
      // Bright coral blazer -> fails neutral palette
      makeProduct({ id: "blazer-coral", brandSlug: "vineyard-vines", category: "blazers-sport-coats", subcategory: "Navy Blazer", name: "Coral Blazer", colors: ["Coral"], currentPriceCents: 20000, dealScore: 95 }),
      // Chino -> medium formality -> blocked in full_time (requires high), allowed in intern (medium)
      makeProduct({ id: "chino-khaki", brandSlug: "bonobos", category: "chinos-dress-pants", subcategory: "Chino", name: "Stretch Chino", colors: ["Khaki"], currentPriceCents: 8000, dealScore: 90 }),
      // Casual Button-Down -> medium formality -> blocked in all tiers (shirt requires high)
      makeProduct({ id: "shirt-casual", brandSlug: "faherty", category: "dress-shirts-ocbds", subcategory: "Casual Button-Down", name: "Flannel Casual Shirt", colors: ["White"], currentPriceCents: 7000, dealScore: 92 }),
      // Charcoal suit + ONLY Brown shoes -> blocked in full_time tier!
      makeProduct({ id: "suit-charcoal", brandSlug: "brooks-brothers", category: "suits", subcategory: "Worsted Wool Suit", name: "Charcoal Suit", colors: ["Charcoal"], currentPriceCents: 40000, dealScore: 88 }),
      makeProduct({ id: "shoe-brown", brandSlug: "bonobos", category: "shoes-belts", subcategory: "Oxford Dress Shoe", name: "Brown Oxford", colors: ["Brown"], currentPriceCents: 20000, dealScore: 86 }),
    ];

    const fullTimeKit = buildInterviewKit(catalog, { tierId: "full_time" });
    expect(fullTimeKit.degraded).toBe(true);
    expect(fullTimeKit.slots.find((s) => s.slot.id === "shirt")?.status).toBe("insufficient_inventory");
    expect(fullTimeKit.slots.find((s) => s.slot.id === "trousers")?.status).toBe("insufficient_inventory");
    // Charcoal suit + Brown shoes cannot coexist in full_time; solver will pick at most one of them, never relaxing pairing rule
    const ftTailoring = fullTimeKit.slots.find((s) => s.slot.id === "tailoring")?.item;
    const ftShoes = fullTimeKit.slots.find((s) => s.slot.id === "shoes")?.item;
    expect(Boolean(ftTailoring && ftShoes)).toBe(false);
    expect(fullTimeKit.slots.find((s) => s.slot.id === "shirt")?.selectionReason).toContain(
      "Not enough in-scope inventory yet"
    );

    // In intern tier, Chino (medium) IS allowed for trousers
    const internKit = buildInterviewKit(catalog, { tierId: "intern" });
    expect(internKit.slots.find((s) => s.slot.id === "trousers")?.item?.id).toBe("chino-khaki");
  });
});
