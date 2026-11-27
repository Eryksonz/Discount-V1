import type { BrandConfig, CrawlMethod } from "@config/brands";
import type { ExistingProductCrawlState, IncrementalSelectionResult } from "./sitemap";

export interface RawCrawledProduct {
  externalId: string;
  name: string;
  rawBreadcrumb: string;
  currentPriceCents: number;
  originalPriceCents: number;
  currency: string;
  productUrl: string;
  imageUrl: string | null;
  inStock: boolean;
  colors: string[];
  sizes: string[];
  sourceMethod: CrawlMethod;
}

export interface CrawlAdapterContext {
  brand: BrandConfig;
  http: import("./http-client").PoliteHttpClient;
  /** Optional ceiling per brand run so manual/CI checks stay bounded and polite */
  maxProducts?: number;
  /** Existing DB product states for hybrid sitemap incremental crawling */
  existingProducts?: ExistingProductCrawlState[];
  /** Watchlisted or active-alert product IDs prioritized for daily re-checks */
  priorityProductIds?: Set<string>;
  /** Force re-fetch of every discovered sitemap URL regardless of freshness */
  forceFull?: boolean;
}

export interface BrandAdapter {
  brandSlug: string;
  /** Runs discovery -> fetch -> parse using ordered fallback methods for this brand */
  crawl(ctx: CrawlAdapterContext): Promise<{
    products: RawCrawledProduct[];
    methodUsed: CrawlMethod | null;
    errors: string[];
    circuitTripped: boolean;
    /** Total catalog URLs discovered (e.g. from sitemap) before incremental filtering */
    discoveredCatalogCount?: number;
    /** Number of individual product URLs attempted in this run */
    urlsFetched?: number;
    incrementalStats?: IncrementalSelectionResult["stats"];
  }>;
}
