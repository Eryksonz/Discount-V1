import type { BrandConfig, CrawlMethod } from "@config/brands";

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
}

export interface BrandAdapter {
  brandSlug: string;
  /** Runs discovery -> fetch -> parse using ordered fallback methods for this brand */
  crawl(ctx: CrawlAdapterContext): Promise<{
    products: RawCrawledProduct[];
    methodUsed: CrawlMethod | null;
    errors: string[];
    circuitTripped: boolean;
  }>;
}
