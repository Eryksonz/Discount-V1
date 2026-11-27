import { BRANDS, BRAND_BY_SLUG } from "@config/brands";
import { getSqlClient, isDatabaseConfigured } from "@/db";
import { generateSeedCatalog, type SeededProductRecord } from "@/db/seed-data";

export interface CatalogQueryParams {
  q?: string;
  brands?: string[];
  categories?: string[];
  occasions?: string[];
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  minDiscountVsMedian?: number;
  dealSignal?: "all" | "lowest_90d" | "real_deal" | "verified_only";
  inStockOnly?: boolean;
  sort?: "score_desc" | "discount_desc" | "price_asc" | "price_desc" | "newest_drop";
  page?: number;
  pageSize?: number;
}

export interface ProductFeedItem {
  id: string;
  slug: string;
  brandSlug: string;
  brandName: string;
  brandCode: string;
  brandSwatchHex: string;
  name: string;
  dataSource: "demo" | "crawler";
  category: string | null;
  subcategory: string | null;
  occasions: string[];
  colors: string[];
  sizes: string[];
  matchedRuleId: string | null;
  currentPriceCents: number;
  originalPriceCents: number;
  currency: string;
  productUrl: string;
  imageUrl: string | null;
  inStock: boolean;
  dataNote: string | null;
  lastCheckedAt: string;
  median30dCents: number;
  median90dCents: number;
  low90dCents: number;
  allTimeLowCents: number;
  timesAtOrBelowCurrent: number;
  lastPriceChangeCents: number;
  lastPriceChangeAt: string | null;
  pctBelowMedian: number;
  pctBelowOriginal: number;
  historyDays: number;
  dealLabel: string;
  dealScore: number;
  dealScoreBreakdown: {
    belowMedian: number;
    belowOriginal: number;
    recency: number;
    stock: number;
    total: number;
  };
  dealBlurb: string;
  sparkline: Array<{ priceCents: number; capturedAt: string }>;
}

export interface BrandCodeStat {
  slug: string;
  name: string;
  brandCode: string;
  swatchHex: string;
  activeDeals: number;
  avgBelowMedianPct: number;
  topDealScore: number;
}

export interface CatalogFeedResponse {
  source: "postgres" | "demo-fallback";
  /** True whenever demo/simulated products are being shown (either via fallback OR demo-seeded DB rows) */
  isDemoData: boolean;
  liveCrawledCount: number;
  demoSeededCount: number;
  totalMatched: number;
  totalCatalog: number;
  unclassifiedCount: number;
  page: number;
  pageSize: number;
  items: ProductFeedItem[];
  marketStats: {
    verifiedDealsCount: number;
    lowest90dCount: number;
    medianVerifiedSavingsPct: number;
    brandsTracked: number;
    lastCheckedAt: string;
  };
  brandStrip: BrandCodeStat[];
  facets: {
    brandCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    availableSizes: string[];
  };
}

let cachedFallbackCatalog: SeededProductRecord[] | null = null;

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

function assertDemoFallbackAllowed(reason: string): void {
  if (!isDemoModeEnabled()) {
    throw new Error(
      `[Tape & Tailor] ${reason}. Refusing silent fallback to demo data. Configure DATABASE_URL for PostgreSQL or explicitly set DEMO_MODE=true for local demo previews.`
    );
  }
}

function getFallbackCatalog(): SeededProductRecord[] {
  if (!cachedFallbackCatalog) {
    cachedFallbackCatalog = generateSeedCatalog();
  }
  return cachedFallbackCatalog;
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()}  `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const gram of ta) {
    if (tb.has(gram)) intersection += 1;
  }
  return intersection / (ta.size + tb.size - intersection);
}

function matchesSearchFallback(item: SeededProductRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const corpus = `${item.name} ${item.brandName} ${item.brandCode} ${item.subcategory ?? ""} ${item.category ?? ""} ${item.colors.join(" ")}`.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => corpus.includes(token))) {
    return true;
  }
  const words = corpus.split(/\s+/);
  return tokens.every(
    (token) =>
      corpus.includes(token) ||
      words.some((w) => trigramSimilarity(token, w) >= 0.34) ||
      trigramSimilarity(q, item.name) >= 0.24
  );
}

function toFeedItem(item: SeededProductRecord): ProductFeedItem {
  return {
    id: item.id,
    slug: item.slug,
    brandSlug: item.brandSlug,
    brandName: item.brandName,
    brandCode: item.brandCode,
    brandSwatchHex: item.brandSwatchHex,
    name: item.name,
    dataSource: item.dataSource,
    category: item.category,
    subcategory: item.subcategory,
    occasions: item.occasions,
    colors: item.colors,
    sizes: item.sizes,
    matchedRuleId: item.matchedRuleId,
    currentPriceCents: item.currentPriceCents,
    originalPriceCents: item.originalPriceCents,
    currency: item.currency,
    productUrl: item.productUrl,
    imageUrl: item.imageUrl,
    inStock: item.inStock,
    dataNote: item.dataNote,
    lastCheckedAt: item.lastCheckedAt.toISOString(),
    median30dCents: item.median30dCents,
    median90dCents: item.median90dCents,
    low90dCents: item.low90dCents,
    allTimeLowCents: item.allTimeLowCents,
    timesAtOrBelowCurrent: item.timesAtOrBelowCurrent,
    lastPriceChangeCents: item.lastPriceChangeCents,
    lastPriceChangeAt: item.lastPriceChangeAt ? item.lastPriceChangeAt.toISOString() : null,
    pctBelowMedian: item.pctBelowMedian,
    pctBelowOriginal: item.pctBelowOriginal,
    historyDays: item.historyDays,
    dealLabel: item.dealLabel,
    dealScore: item.dealScore,
    dealScoreBreakdown: item.dealScoreBreakdown,
    dealBlurb: item.dealBlurb,
    sparkline: item.snapshots.map((s) => ({
      priceCents: s.priceCents,
      capturedAt: s.capturedAt.toISOString(),
    })),
  };
}

function buildStripAndStats(classifiedItems: ProductFeedItem[]) {
  const verified = classifiedItems.filter(
    (i) => i.dealLabel === "Lowest in 90 days" || i.dealLabel === "Real deal"
  );
  const lowest90d = classifiedItems.filter((i) => i.dealLabel === "Lowest in 90 days");

  const savingsSorted = verified
    .map((i) => i.pctBelowMedian)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianVerifiedSavingsPct =
    savingsSorted.length > 0
      ? Math.round(savingsSorted[Math.floor(savingsSorted.length / 2)])
      : 0;

  const lastCheckedMs = classifiedItems.reduce(
    (max, i) => Math.max(max, new Date(i.lastCheckedAt).getTime()),
    0
  );

  const brandStrip: BrandCodeStat[] = BRANDS.map((brand) => {
    const brandItems = classifiedItems.filter((i) => i.brandSlug === brand.slug);
    const brandDeals = brandItems.filter(
      (i) => i.dealLabel === "Lowest in 90 days" || i.dealLabel === "Real deal"
    );
    const avgBelowMedianPct =
      brandDeals.length > 0
        ? Math.round(
            brandDeals.reduce((acc, i) => acc + Math.max(0, i.pctBelowMedian), 0) /
              brandDeals.length
          )
        : 0;
    const topDealScore = brandItems.reduce((m, i) => Math.max(m, i.dealScore), 0);
    return {
      slug: brand.slug,
      name: brand.name,
      brandCode: brand.code,
      swatchHex: brand.swatchHex,
      activeDeals: brandDeals.length,
      avgBelowMedianPct,
      topDealScore,
    };
  });

  const brandCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const sizeSet = new Set<string>();

  for (const item of classifiedItems) {
    brandCounts[item.brandSlug] = (brandCounts[item.brandSlug] ?? 0) + 1;
    if (item.category) {
      categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    }
    for (const s of item.sizes) sizeSet.add(s);
  }

  return {
    marketStats: {
      verifiedDealsCount: verified.length,
      lowest90dCount: lowest90d.length,
      medianVerifiedSavingsPct,
      brandsTracked: BRANDS.length,
      lastCheckedAt: lastCheckedMs
        ? new Date(lastCheckedMs).toISOString()
        : new Date().toISOString(),
    },
    brandStrip,
    facets: {
      brandCounts,
      categoryCounts,
      availableSizes: Array.from(sizeSet).sort(),
    },
  };
}

function filterAndSortItems(
  allItems: ProductFeedItem[],
  params: CatalogQueryParams,
  skipSearchFilter = false
): ProductFeedItem[] {
  let result = allItems;

  if (!skipSearchFilter && params.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    const fallbackById = new Map(getFallbackCatalog().map((r) => [r.id, r]));
    result = result.filter((item) => {
      const rec = fallbackById.get(item.id);
      if (rec) return matchesSearchFallback(rec, q);
      const corpus = `${item.name} ${item.brandName} ${item.brandCode} ${item.subcategory ?? ""}`.toLowerCase();
      return corpus.includes(q) || trigramSimilarity(q, item.name) >= 0.25;
    });
  }

  if (params.brands && params.brands.length > 0) {
    const set = new Set(params.brands);
    result = result.filter((i) => set.has(i.brandSlug));
  }

  if (params.categories && params.categories.length > 0) {
    const set = new Set(params.categories);
    result = result.filter((i) => i.category && set.has(i.category));
  }

  if (params.occasions && params.occasions.length > 0) {
    const set = new Set(params.occasions);
    result = result.filter((i) => i.occasions.some((occ) => set.has(occ)));
  }

  if (params.size?.trim()) {
    const target = params.size.trim().toUpperCase();
    result = result.filter((i) => i.sizes.some((s) => s.toUpperCase() === target));
  }

  if (typeof params.minPrice === "number" && Number.isFinite(params.minPrice)) {
    result = result.filter((i) => i.currentPriceCents >= params.minPrice! * 100);
  }

  if (typeof params.maxPrice === "number" && Number.isFinite(params.maxPrice)) {
    result = result.filter((i) => i.currentPriceCents <= params.maxPrice! * 100);
  }

  if (typeof params.minDiscountVsMedian === "number" && params.minDiscountVsMedian > 0) {
    result = result.filter((i) => i.pctBelowMedian >= params.minDiscountVsMedian!);
  }

  if (params.dealSignal === "lowest_90d") {
    result = result.filter((i) => i.dealLabel === "Lowest in 90 days");
  } else if (params.dealSignal === "real_deal") {
    result = result.filter((i) => i.dealLabel === "Real deal");
  } else if (params.dealSignal === "verified_only") {
    result = result.filter(
      (i) => i.dealLabel === "Lowest in 90 days" || i.dealLabel === "Real deal"
    );
  }

  if (params.inStockOnly) {
    result = result.filter((i) => i.inStock);
  }

  const sortMode = params.sort ?? "score_desc";
  result = [...result].sort((a, b) => {
    switch (sortMode) {
      case "discount_desc":
        return b.pctBelowMedian - a.pctBelowMedian || b.dealScore - a.dealScore;
      case "price_asc":
        return a.currentPriceCents - b.currentPriceCents;
      case "price_desc":
        return b.currentPriceCents - a.currentPriceCents;
      case "newest_drop": {
        const aTime =
          a.lastPriceChangeCents < 0 && a.lastPriceChangeAt
            ? new Date(a.lastPriceChangeAt).getTime()
            : 0;
        const bTime =
          b.lastPriceChangeCents < 0 && b.lastPriceChangeAt
            ? new Date(b.lastPriceChangeAt).getTime()
            : 0;
        return bTime - aTime || b.dealScore - a.dealScore;
      }
      case "score_desc":
      default:
        return b.dealScore - a.dealScore || b.pctBelowMedian - a.pctBelowMedian;
    }
  });

  return result;
}

/**
 * Loads the deal feed from PostgreSQL (FTS + pg_trgm).
 * Only falls back to deterministic demo seed data when DEMO_MODE=true; throws loudly otherwise.
 */
export async function queryCatalogFeed(
  params: CatalogQueryParams = {}
): Promise<CatalogFeedResponse> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 24));

  if (!isDatabaseConfigured()) {
    assertDemoFallbackAllowed("DATABASE_URL is not configured");
  }

  const sql = getSqlClient();
  if (sql) {
    try {
      const q = params.q?.trim() ?? "";
      const rows = q
        ? await sql`
            SELECT p.*,
              (
                ts_rank(p.search_vector, websearch_to_tsquery('english', ${q})) * 2.0 +
                similarity(p.name, ${q})
              ) AS search_rank
            FROM products p
            WHERE p.classification_status IN ('classified', 'manual')
              AND (
                p.search_vector @@ websearch_to_tsquery('english', ${q})
                OR similarity(p.name, ${q}) > 0.2
                OR p.brand_slug ILIKE ${"%" + q + "%"}
              )
            ORDER BY search_rank DESC, p.deal_score DESC
          `
        : await sql`
            SELECT p.* FROM products p
            WHERE p.classification_status IN ('classified', 'manual')
            ORDER BY p.deal_score DESC
          `;

      const [{ count: unclassifiedCountRaw }] = await sql`
        SELECT count(*)::int AS count FROM products WHERE classification_status = 'unclassified'
      `;

      const allSnapshots = await sql`
        SELECT product_id, price_cents, captured_at
        FROM price_snapshots
        ORDER BY captured_at ASC
      `;
      const snapMap = new Map<string, Array<{ priceCents: number; capturedAt: string }>>();
      for (const s of allSnapshots) {
        const list = snapMap.get(s.product_id) ?? [];
        list.push({
          priceCents: Number(s.price_cents),
          capturedAt: new Date(s.captured_at).toISOString(),
        });
        snapMap.set(s.product_id, list);
      }

      const mapped: ProductFeedItem[] = rows.map((row) => {
        const brand = BRAND_BY_SLUG[row.brand_slug];
        return {
          id: row.id,
          slug: row.slug,
          brandSlug: row.brand_slug,
          brandName: brand?.name ?? row.brand_slug,
          brandCode: brand?.code ?? row.brand_slug.slice(0, 4).toUpperCase(),
          brandSwatchHex: brand?.swatchHex ?? "#1B365D",
          name: row.name,
          dataSource: row.data_source === "demo" ? "demo" : "crawler",
          category: row.category,
          subcategory: row.subcategory,
          occasions: Array.isArray(row.occasions) ? row.occasions : [],
          colors: Array.isArray(row.colors) ? row.colors : [],
          sizes: Array.isArray(row.sizes) ? row.sizes : [],
          matchedRuleId: row.matched_rule_id,
          currentPriceCents: Number(row.current_price_cents),
          originalPriceCents: Number(row.original_price_cents),
          currency: row.currency,
          productUrl: row.product_url,
          imageUrl: row.image_url,
          inStock: Boolean(row.in_stock),
          dataNote: row.data_note ?? null,
          lastCheckedAt: new Date(row.last_checked_at).toISOString(),
          median30dCents: Number(row.median_30d_cents),
          median90dCents: Number(row.median_90d_cents),
          low90dCents: Number(row.low_90d_cents),
          allTimeLowCents: Number(row.all_time_low_cents),
          timesAtOrBelowCurrent: Number(row.times_at_or_below_current),
          lastPriceChangeCents: Number(row.last_price_change_cents),
          lastPriceChangeAt: row.last_price_change_at
            ? new Date(row.last_price_change_at).toISOString()
            : null,
          pctBelowMedian: Number(row.pct_below_median),
          pctBelowOriginal: Number(row.pct_below_original),
          historyDays: Number(row.history_days),
          dealLabel: row.deal_label,
          dealScore: Number(row.deal_score),
          dealScoreBreakdown: row.deal_score_breakdown,
          dealBlurb: row.deal_blurb,
          sparkline: snapMap.get(row.id) ?? [],
        };
      });

      const liveCrawledCount = mapped.filter((i) => i.dataSource === "crawler").length;
      const demoSeededCount = mapped.filter((i) => i.dataSource === "demo").length;
      const statsBundle = buildStripAndStats(mapped);
      const filtered = filterAndSortItems(mapped, params, Boolean(q));
      const start = (page - 1) * pageSize;

      return {
        source: "postgres",
        isDemoData: demoSeededCount > 0,
        liveCrawledCount,
        demoSeededCount,
        totalMatched: filtered.length,
        totalCatalog: mapped.length,
        unclassifiedCount: Number(unclassifiedCountRaw ?? 0),
        page,
        pageSize,
        items: filtered.slice(start, start + pageSize),
        ...statsBundle,
      };
    } catch (err) {
      if (process.env.NODE_ENV === "production" || !isDemoModeEnabled()) {
        throw new Error(
          `[Tape & Tailor] PostgreSQL query failed: ${(err as Error).message}`
        );
      }
    }
  }

  assertDemoFallbackAllowed("PostgreSQL unavailable");
  const allRaw = getFallbackCatalog();
  const classified = allRaw
    .filter((i) => i.classificationStatus === "classified")
    .map(toFeedItem);
  const unclassifiedCount = allRaw.filter(
    (i) => i.classificationStatus === "unclassified"
  ).length;
  const statsBundle = buildStripAndStats(classified);
  const filtered = filterAndSortItems(classified, params, false);
  const start = (page - 1) * pageSize;

  return {
    source: "demo-fallback",
    isDemoData: true,
    liveCrawledCount: 0,
    demoSeededCount: classified.length,
    totalMatched: filtered.length,
    totalCatalog: classified.length,
    unclassifiedCount,
    page,
    pageSize,
    items: filtered.slice(start, start + pageSize),
    ...statsBundle,
  };
}

export async function findProductForRedirect(id: string): Promise<{
  id: string;
  brandSlug: string;
  productUrl: string;
  inDatabase: boolean;
} | null> {
  const sql = getSqlClient();
  if (sql) {
    const rows = await sql`
      SELECT id, brand_slug, product_url
      FROM products
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows[0]) {
      return {
        id: rows[0].id,
        brandSlug: rows[0].brand_slug,
        productUrl: rows[0].product_url,
        inDatabase: true,
      };
    }
    return null;
  }

  assertDemoFallbackAllowed("DATABASE_URL is required for /go/[id] redirects");
  const found = getFallbackCatalog().find((p) => p.id === id);
  return found
    ? { id: found.id, brandSlug: found.brandSlug, productUrl: found.productUrl, inDatabase: false }
    : null;
}

export async function recordOutboundClick(params: {
  productId: string;
  brandSlug: string;
  targetHost: string;
  isAffiliate: boolean;
  referer: string | null;
}): Promise<void> {
  const sql = getSqlClient();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO outbound_clicks (product_id, brand_slug, target_host, is_affiliate, referer)
      VALUES (${params.productId}, ${params.brandSlug}, ${params.targetHost}, ${params.isAffiliate}, ${params.referer})
    `;
  } catch (err) {
    console.error("[/go] Failed to record outbound click:", err);
  }
}
