import { describe, expect, it } from "vitest";
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
    sizes: ["M", "L", "32x32", "40R", "10"],
    imageUrl: null,
    productUrl: "https://bonobos.com/products/sample",
    ...overrides,
  };
}

describe("Interview Kit deterministic bundle optimizer", () => {
  it("maximizes deal score under budget cap while enforcing max 2 items per brand and in-stock/size filters", () => {
    const catalog: KitCandidateProduct[] = [
      // Tailoring (3+ candidates)
      makeProduct({ id: "suit-1", brandSlug: "bonobos", category: "blazers-sport-coats", currentPriceCents: 25000, dealScore: 90, sizes: ["40R"] }),
      makeProduct({ id: "suit-2", brandSlug: "brooks-brothers", category: "blazers-sport-coats", currentPriceCents: 26000, dealScore: 86, sizes: ["40R"] }),
      makeProduct({ id: "suit-3", brandSlug: "faherty", category: "blazers-sport-coats", currentPriceCents: 24000, dealScore: 72, sizes: ["40R"] }),

      // Shirts (3+ candidates)
      makeProduct({ id: "shirt-1", brandSlug: "bonobos", category: "dress-shirts-ocbds", currentPriceCents: 8000, dealScore: 92, sizes: ["M"] }),
      makeProduct({ id: "shirt-2", brandSlug: "brooks-brothers", category: "dress-shirts-ocbds", currentPriceCents: 7500, dealScore: 85, sizes: ["M"] }),
      makeProduct({ id: "shirt-3", brandSlug: "faherty", category: "dress-shirts-ocbds", currentPriceCents: 9000, dealScore: 70, sizes: ["M"] }),

      // Trousers (3+ candidates)
      makeProduct({ id: "pant-1", brandSlug: "bonobos", category: "chinos-dress-pants", currentPriceCents: 9000, dealScore: 95, sizes: ["32X32"] }),
      makeProduct({ id: "pant-2", brandSlug: "vineyard-vines", category: "chinos-dress-pants", currentPriceCents: 9500, dealScore: 88, sizes: ["32X32"] }),
      makeProduct({ id: "pant-3", brandSlug: "faherty", category: "chinos-dress-pants", currentPriceCents: 11000, dealScore: 65, sizes: ["32X32"] }),

      // Layer (3+ candidates)
      makeProduct({ id: "layer-1", brandSlug: "vineyard-vines", category: "quarter-zips-pullovers", currentPriceCents: 11000, dealScore: 84, sizes: ["M"] }),
      makeProduct({ id: "layer-2", brandSlug: "faherty", category: "quarter-zips-pullovers", currentPriceCents: 12000, dealScore: 80, sizes: ["M"] }),
      makeProduct({ id: "layer-3", brandSlug: "brooks-brothers", category: "quarter-zips-pullovers", currentPriceCents: 13000, dealScore: 76, sizes: ["M"] }),

      // Shoes/Belt (3+ candidates; dress socks must be excluded)
      makeProduct({ id: "sock-1", brandSlug: "brooks-brothers", category: "shoes-belts", subcategory: "Dress Socks", currentPriceCents: 2000, dealScore: 99, sizes: ["10"] }),
      makeProduct({ id: "shoe-1", brandSlug: "brooks-brothers", category: "shoes-belts", subcategory: "Penny Loafer", currentPriceCents: 18000, dealScore: 82, sizes: ["10"] }),
      makeProduct({ id: "shoe-2", brandSlug: "bonobos", category: "shoes-belts", subcategory: "Dress Belt", currentPriceCents: 6000, dealScore: 75, sizes: ["10"] }),
      makeProduct({ id: "shoe-3", brandSlug: "vineyard-vines", category: "shoes-belts", subcategory: "Dress Belt", currentPriceCents: 6500, dealScore: 74, sizes: ["10"] }),
    ];

    const kit = buildInterviewKit(catalog, {
      tierId: "intern", // $850 cap
      sizes: { jacketSize: "40R", topSize: "M", bottomSize: "32x32", footwearSize: "10" },
    });

    expect(kit.filledCount).toBe(5);
    expect(kit.degraded).toBe(false);
    expect(kit.totalPriceCents).toBeLessThanOrEqual(85000);

    // Enforce max 2 items per brand
    for (const count of Object.values(kit.brandCounts)) {
      expect(count).toBeLessThanOrEqual(2);
    }

    // Confirm dress socks were excluded from footwear_belt slot
    const footSlot = kit.slots.find((s) => s.slot.id === "footwear_belt");
    expect(footSlot?.item?.id).not.toBe("sock-1");
    expect(footSlot?.selectionReason).toContain("Deal Score");
  });

  it("gracefully degrades slots with insufficient in-scope inventory instead of forcing poor matches", () => {
    const sparseCatalog: KitCandidateProduct[] = [
      makeProduct({ id: "shirt-a", category: "dress-shirts-ocbds", currentPriceCents: 7000, dealScore: 80 }),
      makeProduct({ id: "shirt-b", brandSlug: "faherty", category: "dress-shirts-ocbds", currentPriceCents: 8000, dealScore: 75 }),
      makeProduct({ id: "shirt-c", brandSlug: "brooks-brothers", category: "dress-shirts-ocbds", currentPriceCents: 8500, dealScore: 72 }),
      // Only 1 blazer -> below minCandidates=3
      makeProduct({ id: "blazer-only", category: "blazers-sport-coats", currentPriceCents: 20000, dealScore: 88 }),
      // Out-of-stock trousers must be ignored
      makeProduct({ id: "pant-oos", category: "chinos-dress-pants", inStock: false, currentPriceCents: 6000, dealScore: 95 }),
    ];

    const kit = buildInterviewKit(sparseCatalog, { tierId: "student" });

    expect(kit.degraded).toBe(true);
    expect(kit.filledCount).toBe(1);
    const shirtSlot = kit.slots.find((s) => s.slot.id === "shirt");
    const tailoringSlot = kit.slots.find((s) => s.slot.id === "tailoring");
    const trousersSlot = kit.slots.find((s) => s.slot.id === "trousers");

    expect(shirtSlot?.status).toBe("filled");
    expect(tailoringSlot?.status).toBe("insufficient_inventory");
    expect(tailoringSlot?.selectionReason).toContain("Not enough in-scope inventory yet");
    expect(trousersSlot?.status).toBe("insufficient_inventory");
    expect(trousersSlot?.eligibleCount).toBe(0);
  });
});
