import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { classifyProduct } from "@/lib/classify";
import {
  extractCanonicalMerchantUrl,
  mapRakutenFeedRow,
  parseRakutenFeedText,
} from "../adapters/rakuten-feed";
import { parseJsonLdProductsFromHtml } from "../parsers/json-ld";
import { parseShopifyProducts, type ShopifyProductsPayload } from "../parsers/shopify";
import {
  detectCatalogDropAnomaly,
  detectParseYieldDrop,
  shouldAppendSnapshot,
} from "../pipeline";

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

  it("parses saved Brooks Brothers @graph ProductGroup + BreadcrumbList fixture into 1 canonical product", () => {
    const fixturePath = path.join(FIXTURES_DIR, "brooks-brothers.jsonld.html");
    expect(fs.existsSync(fixturePath)).toBe(true);
    const html = fs.readFileSync(fixturePath, "utf8");
    const pageUrl =
      "https://www.brooksbrothers.com/cotton-non-iron-oxford-button-down-collar-sport-shirt/DG00198.html";

    const products = parseJsonLdProductsFromHtml(html, pageUrl);
    // Must deduplicate ProductGroup + sibling Product node into exactly 1 canonical product
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.externalId).toBe("DG00198");
    expect(p.name).toBe("Cotton Non-Iron Oxford Button-Down Collar Sport Shirt");
    expect(p.rawBreadcrumb).toBe("Men > Clothing > Sport Shirts");
    expect(p.currentPriceCents).toBe(7080);
    expect(p.currency).toBe("USD");
    expect(p.inStock).toBe(true);
    expect(p.colors.length).toBeGreaterThan(0);
    expect(p.sizes.length).toBeGreaterThan(0);
    expect(p.imageUrl).toMatch(/^https:\/\/brooksbrothers\.bynder\.com\//);
    expect(p.sourceMethod).toBe("json-ld");

    const classified = classifyProduct({
      title: p.name,
      breadcrumb: p.rawBreadcrumb,
      brandSlug: "brooks-brothers",
      colors: p.colors,
      sizes: p.sizes,
    });
    expect(classified.status).toBe("classified");
    expect(classified.category).toBe("dress-shirts-ocbds");
  });

  it("parses saved Vineyard Vines ProductGroup + ListPrice priceSpecification fixture", () => {
    const fixturePath = path.join(FIXTURES_DIR, "vineyard-vines.jsonld.html");
    expect(fs.existsSync(fixturePath)).toBe(true);
    const html = fs.readFileSync(fixturePath, "utf8");
    const pageUrl =
      "https://www.vineyardvines.com/product/mens-sweaters/king-street-quarter-zip/1E001986.html";

    const products = parseJsonLdProductsFromHtml(html, pageUrl);
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.externalId).toBe("1E001986");
    expect(p.name).toBe("King Street Quarter-Zip");
    expect(p.rawBreadcrumb).toBe("mens sweaters");
    expect(p.currentPriceCents).toBe(11880);
    expect(p.originalPriceCents).toBe(19800);
    expect(p.currency).toBe("USD");
    expect(p.inStock).toBe(true);
    expect(p.colors.length).toBeGreaterThan(0);
    expect(p.sizes.length).toBeGreaterThan(0);
    expect(p.productUrl).toBe(pageUrl);
    expect(p.sourceMethod).toBe("json-ld");

    const classified = classifyProduct({
      title: p.name,
      breadcrumb: p.rawBreadcrumb,
      brandSlug: "vineyard-vines",
      colors: p.colors,
      sizes: p.sizes,
    });
    expect(classified.status).toBe("classified");
    expect(classified.category).toBe("quarter-zips-pullovers");
  });

  it("parses standalone schema.org Product/Offer JSON-LD fixture HTML", () => {
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

  it("maps Rakuten Advertising pipe-delimited product feed rows cleanly", () => {
    const wrapped =
      "https://click.linksynergy.com/deeplink?id=abc&mid=12345&murl=https%3A%2F%2Fwww.petermillar.com%2Fp%2Fperth-quarter-zip.html";
    expect(extractCanonicalMerchantUrl(wrapped)).toBe(
      "https://www.petermillar.com/p/perth-quarter-zip.html"
    );

    const row = mapRakutenFeedRow({
      productId: "PM-ME0EK40",
      productName: "Perth Performance Quarter-Zip",
      primaryCategory: "Men",
      secondaryCategory: "Pullovers",
      productUrl: wrapped,
      imageUrl: "https://www.petermillar.com/images/perth.jpg",
      retailPrice: "140.00",
      salePrice: "98.00",
      availability: "in-stock",
      currency: "USD",
      color: "Navy",
      size: "M,L",
    });
    expect(row).not.toBeNull();
    expect(row!.externalId).toBe("PM-ME0EK40");
    expect(row!.currentPriceCents).toBe(9800);
    expect(row!.originalPriceCents).toBe(14000);
    expect(row!.rawBreadcrumb).toBe("Men > Pullovers");
    expect(row!.productUrl).toBe("https://www.petermillar.com/p/perth-quarter-zip.html");
    expect(row!.sourceMethod).toBe("rakuten-feed");

    const cols = new Array(32).fill("");
    cols[0] = "PM-001";
    cols[1] = "Crown Crafted Dress Shirt";
    cols[3] = "Men";
    cols[4] = "Dress Shirts";
    cols[5] = "https://www.petermillar.com/p/crown-crafted.html";
    cols[6] = "https://www.petermillar.com/img/crown.jpg";
    cols[12] = "175.00";
    cols[13] = "122.50";
    cols[21] = "in-stock";
    cols[25] = "USD";
    cols[30] = "White";
    cols[31] = "M";
    const feed = `HDR|12345|Peter Millar\n${cols.join("|")}\nTRL|1`;
    const parsed = parseRakutenFeedText(feed, "|");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].currentPriceCents).toBe(12250);
    expect(parsed[0].originalPriceCents).toBe(17500);
  });

  it("appends price_snapshots ONLY when price, original_price, or stock changes", () => {
    const base = { priceCents: 12000, originalPriceCents: 16000, inStock: true };
    expect(shouldAppendSnapshot(null, base)).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base })).toBe(false);
    expect(shouldAppendSnapshot(base, { ...base, priceCents: 11000 })).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base, originalPriceCents: 17000 })).toBe(true);
    expect(shouldAppendSnapshot(base, { ...base, inStock: false })).toBe(true);
  });

  it("triggers catalog drop-off and parse-yield alerts when drop exceeds 30%", () => {
    expect(detectCatalogDropAnomaly(100, 75)).toEqual({ anomalous: false, dropPct: 25 });
    expect(detectCatalogDropAnomaly(100, 70)).toEqual({ anomalous: false, dropPct: 30 });
    expect(detectCatalogDropAnomaly(100, 69)).toEqual({ anomalous: true, dropPct: 31 });
    expect(detectCatalogDropAnomaly(null, 50)).toEqual({ anomalous: false, dropPct: null });

    expect(detectParseYieldDrop(50, 45)).toEqual({ anomalous: false, dropPct: 10 });
    expect(detectParseYieldDrop(50, 30)).toEqual({ anomalous: true, dropPct: 40 });
    expect(detectParseYieldDrop(5, 2)).toEqual({ anomalous: false, dropPct: null });
  });
});
