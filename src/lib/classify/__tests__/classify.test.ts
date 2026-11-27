import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.json";
import { classifyProduct, normalizeColor, normalizeSize } from "../index";

describe("Rules-based product classifier (/lib/classify)", () => {
  for (const item of fixtures) {
    it(`classifies "${item.title}" (${item.brandSlug}) deterministically`, () => {
      const result = classifyProduct({
        title: item.title,
        breadcrumb: item.breadcrumb,
        brandSlug: item.brandSlug,
        colors: item.colors,
        sizes: item.sizes,
      });

      expect(result.category).toBe(item.expectedCategory);
      expect(result.subcategory).toBe(item.expectedSubcategory);
      expect(result.matchedRuleId).toBe(item.expectedRuleId);
      expect(result.status).toBe(item.expectedCategory ? "classified" : "unclassified");

      for (const expectedOccasion of item.expectedOccasionsContain) {
        expect(result.occasions).toContain(expectedOccasion);
      }
    });
  }

  it("normalizes retailer color variants into canonical menswear colors", () => {
    expect(normalizeColor("French Navy")).toBe("Navy");
    expect(normalizeColor("Gale Blue")).toBe("Light Blue");
    expect(normalizeColor("British Khaki")).toBe("Khaki");
    expect(normalizeColor("Oxblood")).toBe("Burgundy");
    expect(normalizeColor("Hunter Green")).toBe("Forest Green");
    expect(normalizeColor("Espresso")).toBe("Dark Brown");
  });

  it("normalizes alpha, waist/inseam, neck/sleeve, suit, and shoe sizes", () => {
    expect(normalizeSize("small")).toBe("S");
    expect(normalizeSize("Large")).toBe("L");
    expect(normalizeSize("30W x 30L")).toBe("30x30");
    expect(normalizeSize("32 / 30")).toBe("32x30");
    expect(normalizeSize("15.5 / 33")).toBe("15.5/33");
    expect(normalizeSize("40 r")).toBe("40R");
    expect(normalizeSize("10 D")).toBe("10D");
    expect(normalizeSize("One Size")).toBe("OS");
  });

  it("supports custom admin-created rules taking priority over built-ins", () => {
    const result = classifyProduct(
      {
        title: "Cedar Shoe Tree Pair",
        breadcrumb: "Men > Care",
        brandSlug: "brooks-brothers",
      },
      [
        {
          ruleId: "custom-shoe-care",
          category: "shoes-belts",
          subcategory: "Oxford Dress Shoe",
          keywords: ["shoe tree"],
          priority: 1,
        },
      ]
    );
    expect(result.status).toBe("classified");
    expect(result.matchedRuleId).toBe("custom-shoe-care");
    expect(result.category).toBe("shoes-belts");
  });

  it("never misclassifies an Oxford cloth shirt as an Oxford dress shoe", () => {
    const result = classifyProduct({
      title: "Stretch Oxford Shirt",
      breadcrumb: "Men > Shirts",
      brandSlug: "j-crew",
    });
    expect(result.category).toBe("dress-shirts-ocbds");
    expect(result.subcategory).toBe("OCBD");
  });
});
