import { BRANDS, BRAND_BY_SLUG, type CrawlMethod } from "@config/brands";
import { parseJsonLdProductsFromHtml } from "../parsers/json-ld";
import { parseShopifyProducts, type ShopifyProductsPayload } from "../parsers/shopify";
import {
  discoverSitemapUrls,
  selectIncrementalUrls,
  type ExistingProductCrawlState,
  type IncrementalSelectionResult,
} from "../sitemap";
import type { BrandAdapter, CrawlAdapterContext, RawCrawledProduct } from "../types";
import { createRakutenFeedAdapter } from "./rakuten-feed";

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

/**
 * Sitemap-driven polite JSON-LD crawler (Brooks Brothers, Vineyard Vines, etc.):
 *  1. Discovers product URLs and `<lastmod>` timestamps from public XML sitemaps (honoring robots.txt).
 *  2. Selects URLs incrementally using hybrid rules (priority daily re-check, sitemap lastmod,
 *     newly discovered URLs, and rolling 7-day re-check for all in-stock items).
 *  3. Fetches each product HTML page at the brand's configured rate limit (no headless browser, no bot bypass)
 *     and parses schema.org `ProductGroup` / `Product` / `BreadcrumbList` JSON-LD.
 */
async function tryJsonLd(ctx: CrawlAdapterContext): Promise<{
  products: RawCrawledProduct[];
  errors: string[];
  circuitTripped: boolean;
  discoveredCatalogCount?: number;
  urlsFetched?: number;
  incrementalStats?: IncrementalSelectionResult["stats"];
}> {
  const { brand, http } = ctx;
  const safetyCap = ctx.maxProducts ?? brand.crawler.maxProductsSafetyCap ?? 200;
  const errors: string[] = [];
  const deduped = new Map<string, RawCrawledProduct>();

  if (brand.crawler.sitemapUrls.length > 0) {
    const discovery = await discoverSitemapUrls(brand, http);
    errors.push(...discovery.errors);
    if (discovery.circuitTripped) {
      return {
        products: [],
        errors,
        circuitTripped: true,
        discoveredCatalogCount: discovery.entries.length,
        urlsFetched: 0,
      };
    }

    if (discovery.entries.length > 0) {
      const existingByUrl = new Map<string, ExistingProductCrawlState>();
      for (const ex of ctx.existingProducts ?? []) {
        existingByUrl.set(ex.productUrl, ex);
      }

      const selection = selectIncrementalUrls({
        entries: discovery.entries,
        existingByUrl,
        priorityProductIds: ctx.priorityProductIds,
        forceFull: ctx.forceFull,
      });

      const batch = selection.selected.slice(0, safetyCap);
      let urlsFetched = 0;

      for (const entry of batch) {
        const res = await http.get(entry.loc, {
          rateLimitMs: brand.crawler.rateLimitMs,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        });

        if (res.circuitOpen) {
          errors.push(`Circuit breaker open while fetching ${entry.loc}`);
          return {
            products: Array.from(deduped.values()),
            errors,
            circuitTripped: true,
            discoveredCatalogCount: discovery.entries.length,
            urlsFetched,
            incrementalStats: selection.stats,
          };
        }

        if (res.blockedByRobots) {
          errors.push(`Blocked by robots.txt: ${entry.loc}`);
          continue;
        }

        urlsFetched += 1;
        if (!res.ok) {
          errors.push(`Product page ${entry.loc} returned HTTP ${res.status}`);
          continue;
        }

        const parsed = parseJsonLdProductsFromHtml(res.body, entry.loc);
        for (const item of parsed) {
          deduped.set(item.externalId, item);
        }
      }

      return {
        products: Array.from(deduped.values()),
        errors,
        circuitTripped: false,
        discoveredCatalogCount: discovery.entries.length,
        urlsFetched,
        incrementalStats: selection.stats,
      };
    }
  }

  // Fallback for brands without configured sitemaps: discover links from public salePaths
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

  let urlsFetched = 0;
  for (const productUrl of discoveredUrls) {
    if (deduped.size >= safetyCap) break;
    const res = await http.get(productUrl, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "text/html",
    });
    if (res.circuitOpen) {
      errors.push(`Circuit breaker open while fetching ${productUrl}`);
      return {
        products: Array.from(deduped.values()),
        errors,
        circuitTripped: true,
        urlsFetched,
      };
    }
    urlsFetched += 1;
    if (!res.ok) continue;

    for (const item of parseJsonLdProductsFromHtml(res.body, productUrl)) {
      deduped.set(item.externalId, item);
    }
  }

  return {
    products: Array.from(deduped.values()),
    errors,
    circuitTripped: false,
    discoveredCatalogCount: discoveredUrls.size,
    urlsFetched,
  };
}

export function createBrandAdapter(brandSlug: string): BrandAdapter {
  const rakutenAdapter = createRakutenFeedAdapter(brandSlug);

  return {
    brandSlug,
    async crawl(ctx) {
      if (ctx.brand.ingestionStatus === "feed_pending") {
        return {
          products: [],
          methodUsed: null,
          errors: [
            ctx.brand.statusNote ??
              `Brand "${brandSlug}" is marked feed_pending; direct crawling is disabled.`,
          ],
          circuitTripped: false,
        };
      }
      if (ctx.brand.ingestionStatus === "blocked") {
        return {
          products: [],
          methodUsed: null,
          errors: [
            ctx.brand.statusNote ??
              `Brand "${brandSlug}" is marked blocked; direct crawling is disabled.`,
          ],
          circuitTripped: false,
        };
      }

      const allErrors: string[] = [];

      for (const method of ctx.brand.crawler.preferredMethods) {
        if (method === "rakuten-feed") {
          return rakutenAdapter.crawl(ctx);
        }

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
              discoveredCatalogCount: res.discoveredCatalogCount,
              urlsFetched: res.urlsFetched,
              incrementalStats: res.incrementalStats,
            };
          }
          // For incremental sitemap runs, 0 fetched products when all URLs are fresh is still a valid completed run
          if (
            res.products.length > 0 ||
            (res.incrementalStats && res.incrementalStats.skippedFresh > 0 && res.urlsFetched === 0)
          ) {
            return {
              products: res.products,
              methodUsed: method,
              errors: allErrors,
              circuitTripped: false,
              discoveredCatalogCount: res.discoveredCatalogCount,
              urlsFetched: res.urlsFetched,
              incrementalStats: res.incrementalStats,
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

export const VERIFIED_CRAWL_BRANDS = [
  "faherty",
  "bonobos",
  "brooks-brothers",
  "vineyard-vines",
] as const;

/** Backward-compatible alias */
export const VERIFIED_PILOT_BRANDS = VERIFIED_CRAWL_BRANDS;

export function getBrandAdapter(brandSlug: string): BrandAdapter | null {
  if (!BRAND_BY_SLUG[brandSlug]) return null;
  return BRAND_ADAPTERS[brandSlug] ?? null;
}
