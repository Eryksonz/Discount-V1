import { BRANDS, BRAND_BY_SLUG, type CrawlMethod } from "@config/brands";
import { parseJsonLdProductsFromHtml } from "../parsers/json-ld";
import { parseShopifyProducts, type ShopifyProductsPayload } from "../parsers/shopify";
import type { BrandAdapter, CrawlAdapterContext, RawCrawledProduct } from "../types";

const SHOPIFY_PAGE_LIMITS = [250, 100, 50] as const;
const DEFAULT_SAFETY_CAP = 5000;

/**
 * Full-catalog Shopify crawler: paginates `/products.json?limit=250&page=1..N` until an empty
 * (or partial) page is returned, bounded only by the brand's configurable `maxProductsSafetyCap`.
 * Automatically steps down page size (250 -> 100 -> 50) if a variant-heavy store returns HTTP 500
 * on oversized JSON pages (e.g. Bonobos's multi-fit/waist/inseam SKUs).
 */
async function tryShopifyJson(ctx: CrawlAdapterContext): Promise<{
  products: RawCrawledProduct[];
  errors: string[];
  circuitTripped: boolean;
}> {
  const { brand, http } = ctx;
  const safetyCap = ctx.maxProducts ?? brand.crawler.maxProductsSafetyCap ?? DEFAULT_SAFETY_CAP;
  const errors: string[] = [];
  const deduped = new Map<string, RawCrawledProduct>();

  let pageLimit: number = SHOPIFY_PAGE_LIMITS[0];
  let page = 1;

  while (deduped.size < safetyCap) {
    const maxPages = Math.max(1, Math.ceil(safetyCap / pageLimit) + 1);
    if (page > maxPages) break;

    const path = `/products.json?limit=${pageLimit}&page=${page}`;
    const url = `${brand.baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await http.get(url, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "application/json",
    });

    if (res.circuitOpen) {
      errors.push(`Circuit breaker open on ${brand.domain} (HTTP ${res.status})`);
      return { products: Array.from(deduped.values()), errors, circuitTripped: true };
    }
    if (res.blockedByRobots) {
      errors.push(`Blocked by robots.txt: ${path}`);
      break;
    }

    // Step down page limit on page 1 if store rejects oversized page size
    if (!res.ok && (res.status === 500 || res.status === 413 || res.status === 422)) {
      if (page === 1) {
        const nextIdx = SHOPIFY_PAGE_LIMITS.indexOf(pageLimit as 250 | 100 | 50) + 1;
        if (nextIdx < SHOPIFY_PAGE_LIMITS.length) {
          pageLimit = SHOPIFY_PAGE_LIMITS[nextIdx];
          continue;
        }
      } else if (pageLimit >= 50) {
        // Recover mid-catalog 500 caused by a single oversized variant SKU by bisecting into 25-item sub-pages
        const subLimit = 25;
        const factor = Math.floor(pageLimit / subLimit);
        const startSubPage = (page - 1) * factor + 1;
        let recoveredAny = false;
        for (let sp = startSubPage; sp < startSubPage + factor && deduped.size < safetyCap; sp++) {
          const subPath = `/products.json?limit=${subLimit}&page=${sp}`;
          const subRes = await http.get(`${brand.baseUrl.replace(/\/+$/, "")}${subPath}`, {
            rateLimitMs: brand.crawler.rateLimitMs,
            accept: "application/json",
          });
          if (!subRes.ok) {
            errors.push(`Skipped oversized Shopify slice ${subPath} (HTTP ${subRes.status})`);
            continue;
          }
          try {
            const subPayload = JSON.parse(subRes.body) as ShopifyProductsPayload;
            const subRaw = subPayload.products ?? [];
            if (subRaw.length > 0) recoveredAny = true;
            for (const item of parseShopifyProducts(subPayload, brand.baseUrl, "")) {
              if (!deduped.has(item.externalId) && deduped.size < safetyCap) {
                deduped.set(item.externalId, item);
              }
            }
          } catch {
            // ignore non-JSON sub-slice
          }
        }
        if (recoveredAny) {
          page += 1;
          continue;
        }
      }
    }

    if (!res.ok) {
      errors.push(`Shopify endpoint ${path} returned HTTP ${res.status}`);
      break;
    }

    let payload: ShopifyProductsPayload;
    try {
      payload = JSON.parse(res.body) as ShopifyProductsPayload;
    } catch {
      errors.push(`Non-JSON body at ${path}`);
      break;
    }

    const rawList = payload.products ?? [];
    if (rawList.length === 0) {
      break; // Reached end of Shopify catalog
    }

    const parsed = parseShopifyProducts(payload, brand.baseUrl, "");
    for (const item of parsed) {
      if (!deduped.has(item.externalId) && deduped.size < safetyCap) {
        deduped.set(item.externalId, item);
      }
    }

    if (rawList.length < pageLimit) {
      break; // Final partial page
    }

    page += 1;
  }

  return { products: Array.from(deduped.values()), errors, circuitTripped: false };
}

async function tryJsonLd(ctx: CrawlAdapterContext): Promise<{
  products: RawCrawledProduct[];
  errors: string[];
  circuitTripped: boolean;
}> {
  const { brand, http } = ctx;
  const safetyCap = ctx.maxProducts ?? brand.crawler.maxProductsSafetyCap ?? 200;
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

    for (const item of parseJsonLdProductsFromHtml(res.body, res.url, salePath)) {
      deduped.set(item.externalId, item);
    }

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
      if (discoveredUrls.size >= safetyCap) break;
    }
  }

  for (const productUrl of discoveredUrls) {
    if (deduped.size >= safetyCap) break;
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

export const BRAND_ADAPTERS: Record<string, BrandAdapter> = Object.fromEntries(
  BRANDS.map((brand) => [brand.slug, createBrandAdapter(brand.slug)])
);

export const VERIFIED_PILOT_BRANDS = ["faherty", "bonobos"] as const;

export function getBrandAdapter(brandSlug: string): BrandAdapter | null {
  if (!BRAND_BY_SLUG[brandSlug]) return null;
  return BRAND_ADAPTERS[brandSlug] ?? null;
}
