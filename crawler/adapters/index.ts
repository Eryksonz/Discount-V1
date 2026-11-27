import { BRANDS, BRAND_BY_SLUG, type CrawlMethod } from "@config/brands";
import { parseJsonLdProductsFromHtml } from "../parsers/json-ld";
import { parseShopifyProducts, type ShopifyProductsPayload } from "../parsers/shopify";
import type { BrandAdapter, CrawlAdapterContext, RawCrawledProduct } from "../types";

async function tryShopifyJson(ctx: CrawlAdapterContext): Promise<{
  products: RawCrawledProduct[];
  errors: string[];
  circuitTripped: boolean;
}> {
  const { brand, http, maxProducts = 120 } = ctx;
  const errors: string[] = [];
  const deduped = new Map<string, RawCrawledProduct>();

  const collections = brand.crawler.shopifyCollections ?? [];
  const endpoints: Array<{ path: string; hint: string }> = [
    ...collections.map((c) => ({
      path: `/collections/${c}/products.json?limit=50&page=1`,
      hint: c,
    })),
    { path: "/products.json?limit=50&page=1", hint: "" },
    { path: "/products.json?limit=50&page=2", hint: "" },
  ];

  for (const ep of endpoints) {
    if (deduped.size >= maxProducts) break;
    const url = `${brand.baseUrl.replace(/\/+$/, "")}${ep.path}`;
    const res = await http.get(url, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "application/json",
    });

    if (res.circuitOpen) {
      errors.push(`Circuit breaker open on ${brand.domain} (HTTP ${res.status})`);
      return { products: Array.from(deduped.values()), errors, circuitTripped: true };
    }
    if (res.blockedByRobots) {
      errors.push(`Blocked by robots.txt: ${ep.path}`);
      continue;
    }
    if (!res.ok) {
      errors.push(`Shopify endpoint ${ep.path} returned HTTP ${res.status}`);
      continue;
    }

    try {
      const payload = JSON.parse(res.body) as ShopifyProductsPayload;
      const parsed = parseShopifyProducts(payload, brand.baseUrl, ep.hint);
      for (const item of parsed) {
        if (!deduped.has(item.externalId) && deduped.size < maxProducts) {
          deduped.set(item.externalId, item);
        }
      }
    } catch {
      errors.push(`Non-JSON body at ${ep.path}`);
    }
  }

  return { products: Array.from(deduped.values()), errors, circuitTripped: false };
}

async function tryJsonLd(ctx: CrawlAdapterContext): Promise<{
  products: RawCrawledProduct[];
  errors: string[];
  circuitTripped: boolean;
}> {
  const { brand, http, maxProducts = 30 } = ctx;
  const errors: string[] = [];
  const deduped = new Map<string, RawCrawledProduct>();

  const base = brand.baseUrl.replace(/\/+$/, "");
  const discoveredUrls = new Set<string>();

  for (const salePath of brand.crawler.salePaths) {
    const res = await http.get(`${base}${salePath}`, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "text/html",
    });
    if (res.circuitOpen) {
      errors.push(`Circuit breaker open on ${brand.domain}`);
      return { products: [], errors, circuitTripped: true };
    }
    if (!res.ok) {
      errors.push(`Sale page ${salePath} returned HTTP ${res.status}`);
      continue;
    }

    // Parse any JSON-LD embedded directly on sale page
    for (const item of parseJsonLdProductsFromHtml(res.body, res.url, salePath)) {
      deduped.set(item.externalId, item);
    }

    // Discover product links for detail JSON-LD checks
    const hrefRe = /href=["']([^"'#]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(res.body)) !== null) {
      const href = m[1];
      if (/\/(products?|p|item|pd)\/[a-z0-9_-]{3,}/i.test(href)) {
        try {
          const resolved = new URL(href, base);
          if (resolved.origin === new URL(base).origin) {
            discoveredUrls.add(resolved.toString());
          }
        } catch {
          // ignore
        }
      }
      if (discoveredUrls.size >= maxProducts) break;
    }
  }

  for (const productUrl of discoveredUrls) {
    if (deduped.size >= maxProducts) break;
    const res = await http.get(productUrl, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "text/html",
    });
    if (res.circuitOpen) {
      errors.push(`Circuit breaker open while fetching ${productUrl}`);
      return { products: Array.from(deduped.values()), errors, circuitTripped: true };
    }
    if (!res.ok) continue;

    for (const item of parseJsonLdProductsFromHtml(res.body, productUrl)) {
      deduped.set(item.externalId, item);
    }
  }

  return { products: Array.from(deduped.values()), errors, circuitTripped: false };
}

/**
 * Factory creating a standard BrandAdapter that executes each brand's configured
 * fallback chain in order: json-ld / shopify-json -> internal-api -> playwright (last resort).
 */
export function createBrandAdapter(brandSlug: string): BrandAdapter {
  return {
    brandSlug,
    async crawl(ctx) {
      const allErrors: string[] = [];

      for (const method of ctx.brand.crawler.preferredMethods) {
        if (method === "shopify-json") {
          const res = await tryShopifyJson(ctx);
          allErrors.push(...res.errors);
          if (res.circuitTripped) {
            return {
              products: res.products,
              methodUsed: method,
              errors: allErrors,
              circuitTripped: true,
            };
          }
          if (res.products.length > 0) {
            return {
              products: res.products,
              methodUsed: method,
              errors: allErrors,
              circuitTripped: false,
            };
          }
        } else if (method === "json-ld") {
          const res = await tryJsonLd(ctx);
          allErrors.push(...res.errors);
          if (res.circuitTripped) {
            return {
              products: res.products,
              methodUsed: method,
              errors: allErrors,
              circuitTripped: true,
            };
          }
          if (res.products.length > 0) {
            return {
              products: res.products,
              methodUsed: method,
              errors: allErrors,
              circuitTripped: false,
            };
          }
        } else if (method === "internal-api" || method === "playwright") {
          // Reserved per-brand hooks: never evade bot protection or 403/429 walls
          allErrors.push(`Method "${method}" not implemented for ${brandSlug}; skipping.`);
        }
      }

      return {
        products: [],
        methodUsed: null as CrawlMethod | null,
        errors: allErrors,
        circuitTripped: false,
      };
    },
  };
}

/**
 * One adapter per configured brand, with Faherty and Bonobos verified via live 16-brand probe.
 */
export const BRAND_ADAPTERS: Record<string, BrandAdapter> = Object.fromEntries(
  BRANDS.map((brand) => [brand.slug, createBrandAdapter(brand.slug)])
);

/** Cleanest pilot brands proven by scripts/probe-brand.ts (Shopify JSON + robots=200) */
export const VERIFIED_PILOT_BRANDS = ["faherty", "bonobos"] as const;

export function getBrandAdapter(brandSlug: string): BrandAdapter | null {
  if (!BRAND_BY_SLUG[brandSlug]) return null;
  return BRAND_ADAPTERS[brandSlug] ?? null;
}
