import type { BrandAdapter, CrawlAdapterContext, RawCrawledProduct } from "../types";

/**
 * Rakuten Advertising (LinkShare) Merchandiser Product Catalog Feed — Schema & Adapter Stub.
 *
 * Used for affiliate-enrolled brands that enforce WAF/bot protection on public HTML (e.g., Peter Millar).
 * Rather than scraping protected pages, Tape & Tailor ingests the advertiser's official daily
 * pipe-delimited (`|`) or tab-delimited (`\t`) catalog feed delivered via Rakuten SFTP / Merchandiser API.
 *
 * Official Rakuten Advertising 38-column Product Catalog Feed mapping:
 *  - Column 0  (`Product ID`)          -> `externalId`
 *  - Column 1  (`Product Name`)        -> `name`
 *  - Column 2  (`SKU Number`)          -> fallback `externalId`
 *  - Column 3  (`Primary Category`)    -> `rawBreadcrumb` (part 1)
 *  - Column 4  (`Secondary Category`)  -> `rawBreadcrumb` (part 2, joined by ` > `)
 *  - Column 5  (`Product URL`)         -> `affiliateUrl` / canonical destination URL (unwrapped murl -> `productUrl`)
 *  - Column 6  (`Product Image URL`)   -> `imageUrl`
 *  - Column 12 (`Retail Price`)        -> `originalPriceCents` (brand-listed MSRP)
 *  - Column 13 (`Sale Price`)          -> `currentPriceCents` (falls back to `Retail Price` when empty)
 *  - Column 21 (`Availability`)        -> `inStock` (`in-stock` / `in stock` / `yes` -> true)
 *  - Column 25 (`Currency`)            -> `currency` (defaults to `USD`)
 *  - Column 30 (`Color` / attribute)   -> `colors[]`
 *  - Column 31 (`Size` / attribute)    -> `sizes[]`
 *
 * Environment variables required once Rakuten publisher approval is granted:
 *  - `RAKUTEN_FTP_HOST` / `RAKUTEN_FEED_URL_<BRAND_SLUG>` (or SFTP download into Neon Object Storage)
 *  - `RAKUTEN_PUBLISHER_ID`
 *  - `RAKUTEN_ADVERTISER_MID_<BRAND_SLUG>`
 */
export interface RakutenFeedRow {
  productId: string;
  productName: string;
  sku?: string;
  primaryCategory?: string;
  secondaryCategory?: string;
  productUrl: string;
  imageUrl?: string;
  retailPrice: string | number;
  salePrice?: string | number;
  availability?: string;
  currency?: string;
  color?: string;
  size?: string;
}

function toCents(val: string | number | undefined): number {
  if (val === undefined || val === null || val === "") return 0;
  const num = Number(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

/**
 * Extracts the direct merchant product URL from a Rakuten `click.linksynergy.com` tracking URL (`murl=` param),
 * or returns the URL directly if it is already a direct merchant URL.
 */
export function extractCanonicalMerchantUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase().includes("linksynergy.com")) {
      const murl = parsed.searchParams.get("murl");
      if (murl && murl.startsWith("https://")) {
        return murl;
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Pure mapper converting one Rakuten Advertising product catalog row into `RawCrawledProduct`.
 */
export function mapRakutenFeedRow(row: RakutenFeedRow): RawCrawledProduct | null {
  const externalId = (row.productId || row.sku || "").trim();
  const name = (row.productName || "").trim();
  if (!externalId || !name) return null;

  const retailCents = toCents(row.retailPrice);
  const saleCents = toCents(row.salePrice);
  const currentPriceCents = saleCents > 0 ? saleCents : retailCents;
  if (currentPriceCents <= 0) return null;

  const originalPriceCents = Math.max(retailCents, currentPriceCents);
  const breadcrumbParts = [row.primaryCategory, row.secondaryCategory]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  const avail = (row.availability ?? "in-stock").toLowerCase().trim();
  const inStock =
    !avail ||
    avail === "y" ||
    avail === "yes" ||
    avail.includes("in-stock") ||
    avail.includes("in stock") ||
    avail.includes("available");

  const canonicalUrl = extractCanonicalMerchantUrl(row.productUrl);

  return {
    externalId,
    name,
    rawBreadcrumb: breadcrumbParts.join(" > "),
    currentPriceCents,
    originalPriceCents,
    currency: (row.currency ?? "USD").trim().toUpperCase() || "USD",
    productUrl: canonicalUrl,
    imageUrl: row.imageUrl && row.imageUrl.startsWith("https://") ? row.imageUrl : null,
    inStock,
    colors: row.color ? row.color.split(/[,/]/).map((s) => s.trim()).filter(Boolean) : [],
    sizes: row.size ? row.size.split(/[,/]/).map((s) => s.trim()).filter(Boolean) : [],
    sourceMethod: "rakuten-feed",
  };
}

/**
 * Parses a pipe-delimited (`|`) or tab-delimited (`\t`) Rakuten catalog feed file with header row.
 */
export function parseRakutenFeedText(feedText: string, delimiter: "|" | "\t" = "|"): RawCrawledProduct[] {
  const lines = feedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("HDR|") && !l.startsWith("TRL|"));

  if (lines.length === 0) return [];

  const results: RawCrawledProduct[] = [];
  for (const line of lines) {
    const cols = line.split(delimiter);
    // Skip header lines
    if (cols[0]?.toLowerCase() === "product id" || cols[0]?.toLowerCase() === "product_id") {
      continue;
    }
    if (cols.length < 14) continue;

    const mapped = mapRakutenFeedRow({
      productId: cols[0] ?? "",
      productName: cols[1] ?? "",
      sku: cols[2] ?? "",
      primaryCategory: cols[3] ?? "",
      secondaryCategory: cols[4] ?? "",
      productUrl: cols[5] ?? "",
      imageUrl: cols[6] ?? "",
      retailPrice: cols[12] ?? "",
      salePrice: cols[13] ?? "",
      availability: cols[21] ?? "in-stock",
      currency: cols[25] ?? "USD",
      color: cols[30] ?? "",
      size: cols[31] ?? "",
    });
    if (mapped) results.push(mapped);
  }

  return results;
}

/**
 * Rakuten Advertising feed ingestion adapter stub.
 * Remains a clean no-op while `brand.ingestionStatus === "feed_pending"` or no feed URL is configured.
 */
export function createRakutenFeedAdapter(brandSlug: string): BrandAdapter {
  return {
    brandSlug,
    async crawl(ctx: CrawlAdapterContext) {
      if (ctx.brand.ingestionStatus === "feed_pending") {
        return {
          products: [],
          methodUsed: "rakuten-feed",
          errors: [
            `Rakuten feed pending for ${brandSlug}: set RAKUTEN_FEED_URL_${brandSlug.toUpperCase().replace(/-/g, "_")} and flip ingestionStatus to "active" once Rakuten advertiser approval is live.`,
          ],
          circuitTripped: false,
        };
      }

      const envKey = `RAKUTEN_FEED_URL_${brandSlug.toUpperCase().replace(/-/g, "_")}`;
      const feedUrl = process.env[envKey];
      if (!feedUrl) {
        return {
          products: [],
          methodUsed: "rakuten-feed",
          errors: [`Missing ${envKey} environment variable for Rakuten feed ingestion.`],
          circuitTripped: false,
        };
      }

      const res = await ctx.http.get(feedUrl, {
        rateLimitMs: ctx.brand.crawler.rateLimitMs,
        accept: "text/plain,text/tab-separated-values,*/*",
      });
      if (!res.ok) {
        return {
          products: [],
          methodUsed: "rakuten-feed",
          errors: [`Rakuten feed request failed with HTTP ${res.status}`],
          circuitTripped: Boolean(res.circuitOpen),
        };
      }

      const delimiter = res.body.includes("|") ? "|" : "\t";
      const parsed = parseRakutenFeedText(res.body, delimiter);
      const cap = ctx.maxProducts ?? ctx.brand.crawler.maxProductsSafetyCap ?? 5000;

      return {
        products: parsed.slice(0, cap),
        methodUsed: "rakuten-feed",
        errors: [],
        circuitTripped: false,
        discoveredCatalogCount: parsed.length,
        urlsFetched: parsed.length,
      };
    },
  };
}
