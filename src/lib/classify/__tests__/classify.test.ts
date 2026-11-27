import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.json";
import unclassifiedExport from "./unclassified-export.json";
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

      if (item.expectedCategory === null) {
        // Items like shoe trees now route cleanly to out_of_scope rather than leaking into feed
        expect(["out_of_scope", "unclassified"]).toContain(result.status);
      } else {
        expect(result.category).toBe(item.expectedCategory);
        expect(result.subcategory).toBe(item.expectedSubcategory);
        expect(result.matchedRuleId).toBe(item.expectedRuleId);
        expect(result.status).toBe("classified");
        for (const expectedOccasion of item.expectedOccasionsContain) {
          expect(result.occasions).toContain(expectedOccasion);
        }
      }
    });
  }

  it("classifies exported Bonobos & Faherty titles into in-scope or out_of_scope with 0% unclassified", () => {
    const remainingUnclassified: string[] = [];
    for (const row of unclassifiedExport) {
      const res = classifyProduct({
        title: row.name,
        breadcrumb: row.raw_breadcrumb,
        brandSlug: row.brand_slug,
      });
      if (res.status === "unclassified") {
        remainingUnclassified.push(`${row.brand_slug}: ${row.name}`);
      }
    }
    expect(remainingUnclassified).toEqual([]);
  });

  it("assigns specific exported in-scope items to accurate finance-uniform categories", () => {
    expect(
      classifyProduct({ title: "Stretch Lightweight Chinos", breadcrumb: "Men", brandSlug: "bonobos" })
        .category
    ).toBe("chinos-dress-pants");
    expect(
      classifyProduct({ title: "Tech 5-Pocket", breadcrumb: "Men", brandSlug: "bonobos" }).category
    ).toBe("performance-trousers");
    expect(
      classifyProduct({
        title: "Washable Merino Crew Neck Sweater",
        breadcrumb: "Men > Sale Sweaters",
        brandSlug: "bonobos",
      }).category
    ).toBe("quarter-zips-pullovers");
    expect(
      classifyProduct({
        title: "Legend Sweater Shirt - Charcoal Coast Plaid",
        breadcrumb: "Men > mens sale > Men's Button Ups",
        brandSlug: "faherty",
      }).category
    ).toBe("dress-shirts-ocbds");
    expect(
      classifyProduct({
        title: "The Clubhouse Stretch Belt",
        breadcrumb: "Men",
        brandSlug: "bonobos",
      }).category
    ).toBe("shoes-belts");
    expect(
      classifyProduct({
        title: "Blanket Stripe Zip Sweater - Desert Bloom Stripe",
        breadcrumb: "Men > mens sale > Men's Sweaters",
        brandSlug: "faherty",
      }).category
    ).toBe("quarter-zips-pullovers");
  });

  it("routes swim, athletic, tees, hats, gifts, home goods, kids, underwear & casual socks to out_of_scope", () => {
    const outOfScopeCases = [
      { title: "Core Muscle Tee", breadcrumb: "Men" },
      { title: "Easy Lightweight Shorts", breadcrumb: "Men" },
      { title: "Fall Baseball Hat - Blue Nights", breadcrumb: "Men > Accessories Hats" },
      { title: "Soft Everyday Socks", breadcrumb: "Men" },
      { title: "The Reusable Tote Bag", breadcrumb: "Men" },
      { title: "Nylon Windbreaker Pant", breadcrumb: "Men" },
      { title: "Digital Gift Card", breadcrumb: "Gifts" },
      { title: "Women's Linen Maxi Dress", breadcrumb: "Women > Dresses" },
      { title: "Beacon Swim Trunks 7\"", breadcrumb: "Men > Swim" },
      { title: "Kids Sunwashed Hoodie", breadcrumb: "Kids" },
      { title: "Adirondack Woven Blanket", breadcrumb: "Home" },
      { title: "Stretch Cotton Boxer Briefs", breadcrumb: "Men > Underwear" },
    ];

    for (const c of outOfScopeCases) {
      const res = classifyProduct({ title: c.title, breadcrumb: c.breadcrumb });
      expect(res.status).toBe("out_of_scope");
      expect(res.category).toBe("out_of_scope");
      expect(res.matchedRuleId).toMatch(/^oos-/);
    }
  });

  it("keeps dress socks in-scope while excluding casual/everyday socks", () => {
    const dressSocks = classifyProduct({
      title: "Over-the-Calf Merino Dress Socks",
      breadcrumb: "Men > Accessories",
    });
    expect(dressSocks.status).toBe("classified");
    expect(dressSocks.category).toBe("shoes-belts");
    expect(dressSocks.subcategory).toBe("Dress Socks");

    const casualSocks = classifyProduct({
      title: "Soft Everyday Socks",
      breadcrumb: "Men",
    });
    expect(casualSocks.status).toBe("out_of_scope");
  });

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

  it("supports custom admin-created rules taking priority over built-ins and out_of_scope", () => {
    const result = classifyProduct(
      {
        title: "Mystery Menswear Accessory",
        breadcrumb: "Men > New",
        brandSlug: "brooks-brothers",
      },
      [
        {
          ruleId: "custom-mystery",
          category: "ties-pocket-squares",
          subcategory: "Pocket Square",
          keywords: ["mystery menswear"],
          priority: 0,
        },
      ]
    );
    expect(result.status).toBe("classified");
    expect(result.matchedRuleId).toBe("custom-mystery");
    expect(result.category).toBe("ties-pocket-squares");
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
