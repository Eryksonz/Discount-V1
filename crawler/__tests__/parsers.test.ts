import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { classifyProduct } from "@/lib/classify";
import { parseShopifyProducts, type ShopifyProductsPayload } from "../parsers/shopify";
import { parseJsonLdProductsFromHtml } from "../parsers/json-ld";
import { detectCatalogDropAnomaly, shouldAppendSnapshot } from "../pipeline";

const FIXTURES_DIR = path.resolve(process.cwd(), "crawler/fixtures");

describe("Crawler parser regression tests against saved brand fixtures", () => {
  it("parses saved Faherty Shopify JSON fixture and preserves compare_at_price separately", () => {
    const fixturePath = path.join(FIXTURES_DIR, "faherty.shopify.json");
    expect(fs.existsSync(fixturePath)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as ShopifyProductsPayload;

    const products = parseShopifyProducts(payload, "https://fahertybrand.com");
    expect(products.length).toBeGreaterThan(0);

    for (const p of products) {
      expect(p.externalId.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.currentPriceCents).toBeGreaterThan(0);
      expect(p.originalPriceCents).toBeGreaterThanOrEqual(p.currentPriceCents);
      expect(p.productUrl.startsWith("https://fahertybrand.com/products/")).toBe(true);
      expect(p.sourceMethod).toBe("shopify-json");
    }

    // Confirm compare_at_price > price is preserved distinctly on discounted items
    const discounted = products.filter((p) => p.originalPriceCents > p.currentPriceCents);
    expect(discounted.length).toBeGreaterThan(0);
  });

  it("parses saved Bonobos Shopify JSON fixture and routes Gift Cards to out_of_scope via classifier", () => {
    const fixturePath = path.join(FIXTURES_DIR, "bonobos.shopify.json");
    expect(fs.existsSync(fixturePath)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as ShopifyProductsPayload;

    const products = parseShopifyProducts(payload, "https://bonobos.com");
    expect(products.length).toBeGreaterThan(0);

    const giftCard = products.find((p) => /gift\s*card/i.test(p.name));
    if (giftCard) {
      const classified = classifyProduct({
        title: giftCard.name,
        breadcrumb: giftCard.rawBreadcrumb,
        brandSlug: "bonobos",
      });
      expect(classified.status).toBe("out_of_scope");
      expect(classified.matchedRuleId).toBe("oos-gift-card");
    }
  });

  it("parses schema.org Product/Offer JSON-LD fixture HTML", () => {
    const html = fs.readFileSync(
      path.join(FIXTURES_DIR, "sample-product.jsonld.html"),
      "utf8"
    );
    const products = parseJsonLdProductsFromHtml(
      html,
      "https://www.petermillar.com/p/perth-performance-quarter-zip"
    );
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Perth Performance Quarter-Zip");
    expect(products[0].currentPriceCents).toBe(9800);
    expect(products[0].originalPriceCents).toBe(14000);
    expect(products[0].inStock).toBe(true);
    expect(products[0].sourceMethod).toBe("json-ld");
  });

  it("appends price_snapshots ONLY when price, original_price, or stock changes", () => {
    const base = { priceCents: 12000, originalPriceCents: 16000, inStock: true };
    expect(shouldAppendSnapshot(null, base)).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base })).toBe(false);
    expect(shouldAppendSnapshot(base, { ...base, priceCents: 11000 })).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base, originalPriceCents: 17000 })).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base, inStock: false })).toBe(true);
  });

  it("triggers catalog drop-off alert when parsed product count drops > 30% vs prior run", () => {
    expect(detectCatalogDropAnomaly(100, 75)).toEqual({ anomalous: false, dropPct: 25 });
    expect(detectCatalogDropAnomaly(100, 70)).toEqual({ anomalous: false, dropPct: 30 });
    expect(detectCatalogDropAnomaly(100, 69)).toEqual({ anomalous: true, dropPct: 31 });
    expect(detectCatalogDropAnomaly(null, 50)).toEqual({ anomalous: false, dropPct: null });
  });
});
