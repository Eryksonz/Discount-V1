import { BRANDS, BRAND_BY_SLUG, FEED_PENDING_BRAND_SLUGS, type BrandIngestionStatus } from "@config/brands";
import { getSqlClient, isDatabaseConfigured } from "@/db";
import { generateSeedCatalog, type SeededProductRecord } from "@/db/seed-data";
import type { ActiveBrandPromo, ActiveSaleEvent } from "@/lib/promos";

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
  sparkline: Array<{
    priceCents: number;
    originalPriceCents?: number;
    compareAtGapPct?: number | null;
    inStock?: boolean;
    capturedAt: string;
  }>;
  activePromo?: ActiveBrandPromo | null;
  activeSaleEvent?: ActiveSaleEvent | null;
}

export interface BrandCodeStat {
  slug: string;
  name: string;
  brandCode: string;
  swatchHex: string;
  ingestionStatus: BrandIngestionStatus;
  statusNote?: string;
  activeDeals: number;
  avgBelowMedianPct: number;
  topDealScore: number;
}

export interface CatalogFeedResponse {
  source: "postgres" | "demo-fallback";
  isDemoData: boolean;
  liveCrawledCount: number;
  demoSeededCount: number;
  totalMatched: number;
  totalCatalog: number;
  unclassifiedCount: number;
  page: number;
  pageSize: number;
  queryDurationMs?: number;
  activeSaleEvents: ActiveSaleEvent[];
  activePromosByBrand: Record<string, ActiveBrandPromo>;
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
  if (tokens.every((token) => corpus.includes(token))) return true;
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
      originalPriceCents: s.originalPriceCents,
      inStock: s.inStock,
      capturedAt: s.capturedAt.toISOString(),
    })),
  };
}

function mapPgProductRow(
  row: Record<string, unknown>,
  snapMap: Map<string, ProductFeedItem["sparkline"]>,
  promosByBrand: Record<string, ActiveBrandPromo>,
  saleEvents: ActiveSaleEvent[]
): ProductFeedItem {
  const brandSlug = String(row.brand_slug);
  const brand = BRAND_BY_SLUG[brandSlug];
  const matchingSale =
    saleEvents.find((e) => e.brandSlug === brandSlug) ??
    saleEvents.find((e) => e.brandSlug === null) ??
    null;

  return {
    id: String(row.id),
    slug: String(row.slug),
    brandSlug,
    brandName: brand?.name ?? brandSlug,
    brandCode: brand?.code ?? brandSlug.slice(0, 4).toUpperCase(),
    brandSwatchHex: brand?.swatchHex ?? "#1B365D",
    name: String(row.name),
    dataSource: row.data_source === "demo" ? "demo" : "crawler",
    category: row.category ? String(row.category) : null,
    subcategory: row.subcategory ? String(row.subcategory) : null,
    occasions: Array.isArray(row.occasions) ? (row.occasions as string[]) : [],
    colors: Array.isArray(row.colors) ? (row.colors as string[]) : [],
    sizes: Array.isArray(row.sizes) ? (row.sizes as string[]) : [],
    matchedRuleId: row.matched_rule_id ? String(row.matched_rule_id) : null,
    currentPriceCents: Number(row.current_price_cents),
    originalPriceCents: Number(row.original_price_cents),
    currency: String(row.currency ?? "USD"),
    productUrl: String(row.product_url),
    imageUrl: row.image_url ? String(row.image_url) : null,
    inStock: Boolean(row.in_stock),
    dataNote: row.data_note ? String(row.data_note) : null,
    lastCheckedAt: new Date(String(row.last_checked_at)).toISOString(),
    median30dCents: Number(row.median_30d_cents),
    median90dCents: Number(row.median_90d_cents),
    low90dCents: Number(row.low_90d_cents),
    allTimeLowCents: Number(row.all_time_low_cents),
    timesAtOrBelowCurrent: Number(row.times_at_or_below_current),
    lastPriceChangeCents: Number(row.last_price_change_cents),
    lastPriceChangeAt: row.last_price_change_at
      ? new Date(String(row.last_price_change_at)).toISOString()
      : null,
    pctBelowMedian: Number(row.pct_below_median),
    pctBelowOriginal: Number(row.pct_below_original),
    historyDays: Number(row.history_days),
    dealLabel: String(row.deal_label),
    dealScore: Number(row.deal_score),
    dealScoreBreakdown: row.deal_score_breakdown as ProductFeedItem["dealScoreBreakdown"],
    dealBlurb: String(row.deal_blurb ?? ""),
    sparkline: snapMap.get(String(row.id)) ?? [],
    activePromo: promosByBrand[brandSlug] ?? null,
    activeSaleEvent: matchingSale,
  };
}

/**
 * Loads the deal feed using indexed SQL filtering, Postgres FTS + pg_trgm search, and SQL LIMIT/OFFSET pagination.
 * Fetches snapshots ONLY for the current page's product IDs (typically 24-48 rows).
 */
export async function queryCatalogFeed(
  params: CatalogQueryParams = {}
): Promise<CatalogFeedResponse> {
  const t0 = Date.now();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 24));
  const offset = (page - 1) * pageSize;

  if (!isDatabaseConfigured()) {
    assertDemoFallbackAllowed("DATABASE_URL is not configured");
  }

  const sql = getSqlClient();
  if (sql) {
    try {
      const q = params.q?.trim() ?? "";
      const feedPendingList = Array.from(FEED_PENDING_BRAND_SLUGS);
      const whereClauses: string[] = [`p.classification_status IN ('classified', 'manual')`];
      const bindValues: unknown[] = [];

      const pushParam = (val: unknown): string => {
        bindValues.push(val);
        return `$${bindValues.length}`;
      };

      if (feedPendingList.length > 0) {
        const pendingRef = pushParam(feedPendingList);
        whereClauses.push(`NOT (p.brand_slug = ANY(${pendingRef}::text[]))`);
      }

      let searchRankExpr = "0";
      if (q) {
        const qParam = pushParam(q);
        const likeParam = pushParam(`%${q}%`);
        whereClauses.push(
          `(p.search_vector @@ websearch_to_tsquery('english', ${qParam}) OR similarity(p.name, ${qParam}) > 0.2 OR p.brand_slug ILIKE ${likeParam})`
        );
        searchRankExpr = `(ts_rank(p.search_vector, websearch_to_tsquery('english', ${qParam})) * 2.0 + similarity(p.name, ${qParam}))`;
      }

      if (params.brands && params.brands.length > 0) {
        const pRef = pushParam(params.brands);
        whereClauses.push(`p.brand_slug = ANY(${pRef}::text[])`);
      }

      if (params.categories && params.categories.length > 0) {
        const pRef = pushParam(params.categories);
        whereClauses.push(`p.category = ANY(${pRef}::text[])`);
      }

      if (params.occasions && params.occasions.length > 0) {
        const pRef = pushParam(params.occasions);
        whereClauses.push(`p.occasions ?| ${pRef}::text[]`);
      }

      if (params.size?.trim()) {
        const pRef = pushParam(params.size.trim().toUpperCase());
        whereClauses.push(`p.sizes ? ${pRef}`);
      }

      if (typeof params.minPrice === "number" && Number.isFinite(params.minPrice)) {
        const pRef = pushParam(Math.round(params.minPrice * 100));
        whereClauses.push(`p.current_price_cents >= ${pRef}`);
      }

      if (typeof params.maxPrice === "number" && Number.isFinite(params.maxPrice)) {
        const pRef = pushParam(Math.round(params.maxPrice * 100));
        whereClauses.push(`p.current_price_cents <= ${pRef}`);
      }

      if (typeof params.minDiscountVsMedian === "number" && params.minDiscountVsMedian > 0) {
        const pRef = pushParam(params.minDiscountVsMedian);
        whereClauses.push(`p.pct_below_median >= ${pRef}`);
      }

      if (params.dealSignal === "lowest_90d") {
        whereClauses.push(`p.deal_label = 'Lowest in 90 days'`);
      } else if (params.dealSignal === "real_deal") {
        whereClauses.push(`p.deal_label = 'Real deal'`);
      } else if (params.dealSignal === "verified_only") {
        whereClauses.push(`p.deal_label IN ('Lowest in 90 days', 'Real deal')`);
      }

      if (params.inStockOnly) {
        whereClauses.push(`p.in_stock = TRUE`);
      }

      const whereSql = whereClauses.join(" AND ");

      let orderBySql = `p.deal_score DESC, p.pct_below_median DESC, p.id ASC`;
      switch (params.sort) {
        case "discount_desc":
          orderBySql = `p.pct_below_median DESC, p.deal_score DESC, p.id ASC`;
          break;
        case "price_asc":
          orderBySql = `p.current_price_cents ASC, p.deal_score DESC, p.id ASC`;
          break;
        case "price_desc":
          orderBySql = `p.current_price_cents DESC, p.deal_score DESC, p.id ASC`;
          break;
        case "newest_drop":
          orderBySql = `CASE WHEN p.last_price_change_cents < 0 THEN p.last_price_change_at ELSE NULL END DESC NULLS LAST, p.deal_score DESC`;
          break;
        case "score_desc":
        default:
          orderBySql = q
            ? `${searchRankExpr} DESC, p.deal_score DESC, p.pct_below_median DESC`
            : `p.deal_score DESC, p.pct_below_median DESC, p.id ASC`;
          break;
      }

      const limitRef = `$${bindValues.length + 1}`;
      const offsetRef = `$${bindValues.length + 2}`;

      // Run paginated page query, filtered total count, market aggregates, active promos, and active sale events in parallel
      const [
        pageRows,
        countRows,
        summaryRows,
        brandAggRows,
        categoryAggRows,
        sizeRows,
        promoRows,
        saleEventRows,
      ] = await Promise.all([
        sql.unsafe(
          `SELECT p.* FROM products p WHERE ${whereSql} ORDER BY ${orderBySql} LIMIT ${limitRef} OFFSET ${offsetRef}`,
          [...bindValues, pageSize, offset] as never[]
        ),
        sql.unsafe(
          `SELECT count(*)::int AS total FROM products p WHERE ${whereSql}`,
          bindValues as never[]
        ),
        sql`
          SELECT
            count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS total_catalog,
            count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified_count,
            count(*) FILTER (WHERE classification_status IN ('classified', 'manual') AND data_source = 'crawler')::int AS live_count,
            count(*) FILTER (WHERE classification_status IN ('classified', 'manual') AND data_source = 'demo')::int AS demo_count,
            count(*) FILTER (WHERE classification_status IN ('classified', 'manual') AND deal_label IN ('Lowest in 90 days', 'Real deal'))::int AS verified_deals,
            count(*) FILTER (WHERE classification_status IN ('classified', 'manual') AND deal_label = 'Lowest in 90 days')::int AS lowest_90d,
            COALESCE(
              ROUND(
                percentile_cont(0.5) WITHIN GROUP (ORDER BY pct_below_median)
                FILTER (WHERE classification_status IN ('classified', 'manual') AND deal_label IN ('Lowest in 90 days', 'Real deal') AND pct_below_median > 0)
              ),
              0
            )::int AS med_savings,
            MAX(last_checked_at) AS last_checked_at
          FROM products
        `,
        sql`
          SELECT
            brand_slug,
            count(*)::int AS total_count,
            count(*) FILTER (WHERE deal_label IN ('Lowest in 90 days', 'Real deal'))::int AS active_deals,
            COALESCE(
              ROUND(AVG(pct_below_median) FILTER (WHERE deal_label IN ('Lowest in 90 days', 'Real deal') AND pct_below_median > 0)),
              0
            )::int AS avg_below_median,
            COALESCE(MAX(deal_score), 0)::int AS top_score
          FROM products
          WHERE classification_status IN ('classified', 'manual')
          GROUP BY brand_slug
        `,
        sql`
          SELECT category, count(*)::int AS cnt
          FROM products
          WHERE classification_status IN ('classified', 'manual') AND category IS NOT NULL
          GROUP BY category
        `,
        sql`
          SELECT DISTINCT s.val AS size
          FROM products p, LATERAL jsonb_array_elements_text(p.sizes) AS s(val)
          WHERE p.classification_status IN ('classified', 'manual')
          ORDER BY s.val
          LIMIT 80
        `,
        sql`
          SELECT id, brand_slug, description, code, percent_off, amount_off_cents, min_spend_cents, applies_to, has_exclusions, starts_at, ends_at, source_url
          FROM brand_promos
          WHERE active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()
          ORDER BY verified_at DESC
        `,
        sql`
          SELECT id, slug, name, brand_slug, starts_at, ends_at, typical_discount_note
          FROM sale_events
          WHERE starts_at <= NOW() AND ends_at >= NOW()
          ORDER BY starts_at DESC
        `,
      ]);

      // Fetch snapshots ONLY for the current page's product IDs (24-48 IDs instead of all 6,589!)
      const pageProductIds = pageRows.map((r) => String(r.id));
      const snapMap = new Map<string, ProductFeedItem["sparkline"]>();
      if (pageProductIds.length > 0) {
        const pageSnapshots = await sql`
          SELECT product_id, price_cents, original_price_cents, compare_at_gap_pct, in_stock, captured_at
          FROM price_snapshots
          WHERE product_id = ANY(${pageProductIds}::text[])
          ORDER BY captured_at ASC
        `;
        for (const s of pageSnapshots) {
          const pid = String(s.product_id);
          const list = snapMap.get(pid) ?? [];
          list.push({
            priceCents: Number(s.price_cents),
            originalPriceCents: Number(s.original_price_cents),
            compareAtGapPct:
              s.compare_at_gap_pct !== null && s.compare_at_gap_pct !== undefined
                ? Number(s.compare_at_gap_pct)
                : null,
            inStock: Boolean(s.in_stock),
            capturedAt: new Date(String(s.captured_at)).toISOString(),
          });
          snapMap.set(pid, list);
        }
      }

      const activePromosByBrand: Record<string, ActiveBrandPromo> = {};
      for (const pr of promoRows) {
        const bSlug = String(pr.brand_slug);
        if (!activePromosByBrand[bSlug]) {
          activePromosByBrand[bSlug] = {
            id: Number(pr.id),
            brandSlug: bSlug,
            description: String(pr.description),
            code: pr.code ? String(pr.code) : null,
            percentOff: pr.percent_off !== null ? Number(pr.percent_off) : null,
            amountOffCents: pr.amount_off_cents !== null ? Number(pr.amount_off_cents) : null,
            minSpendCents: pr.min_spend_cents !== null ? Number(pr.min_spend_cents) : null,
            appliesTo: String(pr.applies_to ?? "Sitewide"),
            hasExclusions: Boolean(pr.has_exclusions),
            startsAt: new Date(String(pr.starts_at)).toISOString(),
            endsAt: new Date(String(pr.ends_at)).toISOString(),
            sourceUrl: pr.source_url ? String(pr.source_url) : null,
          };
        }
      }

      const activeSaleEvents: ActiveSaleEvent[] = saleEventRows.map((ev) => ({
        id: Number(ev.id),
        slug: String(ev.slug),
        name: String(ev.name),
        brandSlug: ev.brand_slug ? String(ev.brand_slug) : null,
        startsAt: new Date(String(ev.starts_at)).toISOString(),
        endsAt: new Date(String(ev.ends_at)).toISOString(),
        typicalDiscountNote: String(ev.typical_discount_note ?? ""),
      }));

      const items = pageRows.map((row) =>
        mapPgProductRow(row, snapMap, activePromosByBrand, activeSaleEvents)
      );

      const summary = summaryRows[0];
      const brandAggMap = new Map(
        brandAggRows.map((r) => [String(r.brand_slug), r])
      );
      const brandCounts: Record<string, number> = {};
      const brandStrip: BrandCodeStat[] = BRANDS.map((brand) => {
        const isPending = brand.ingestionStatus === "feed_pending";
        const agg = isPending ? undefined : brandAggMap.get(brand.slug);
        brandCounts[brand.slug] = Number(agg?.total_count ?? 0);
        return {
          slug: brand.slug,
          name: brand.name,
          brandCode: brand.code,
          swatchHex: brand.swatchHex,
          ingestionStatus: brand.ingestionStatus,
          statusNote: brand.statusNote,
          activeDeals: Number(agg?.active_deals ?? 0),
          avgBelowMedianPct: Number(agg?.avg_below_median ?? 0),
          topDealScore: Number(agg?.top_score ?? 0),
        };
      });

      const categoryCounts: Record<string, number> = {};
      for (const c of categoryAggRows) {
        categoryCounts[String(c.category)] = Number(c.cnt);
      }

      const demoCount = Number(summary?.demo_count ?? 0);
      const liveCount = Number(summary?.live_count ?? 0);

      return {
        source: "postgres",
        isDemoData: demoCount > 0,
        liveCrawledCount: liveCount,
        demoSeededCount: demoCount,
        totalMatched: Number(countRows[0]?.total ?? 0),
        totalCatalog: Number(summary?.total_catalog ?? 0),
        unclassifiedCount: Number(summary?.unclassified_count ?? 0),
        page,
        pageSize,
        queryDurationMs: Date.now() - t0,
        activeSaleEvents,
        activePromosByBrand,
        items,
        marketStats: {
          verifiedDealsCount: Number(summary?.verified_deals ?? 0),
          lowest90dCount: Number(summary?.lowest_90d ?? 0),
          medianVerifiedSavingsPct: Number(summary?.med_savings ?? 0),
          brandsTracked: BRANDS.length,
          lastCheckedAt: summary?.last_checked_at
            ? new Date(String(summary.last_checked_at)).toISOString()
            : new Date().toISOString(),
        },
        brandStrip,
        facets: {
          brandCounts,
          categoryCounts,
          availableSizes: sizeRows.map((r) => String(r.size)),
        },
      };
    } catch (err) {
      if (process.env.NODE_ENV === "production" || !isDemoModeEnabled()) {
        throw new Error(`[Tape & Tailor] PostgreSQL query failed: ${(err as Error).message}`);
      }
    }
  }

  // Fallback path (strictly gated behind DEMO_MODE=true)
  assertDemoFallbackAllowed("PostgreSQL unavailable");
  const allRaw = getFallbackCatalog();
  const classified = allRaw
    .filter(
      (i) =>
        i.classificationStatus === "classified" &&
        !FEED_PENDING_BRAND_SLUGS.has(i.brandSlug)
    )
    .map(toFeedItem);
  const unclassifiedCount = allRaw.filter((i) => i.classificationStatus === "unclassified").length;

  let filtered = classified;
  if (params.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    const byId = new Map(allRaw.map((r) => [r.id, r]));
    filtered = filtered.filter((item) => {
      const rec = byId.get(item.id);
      return rec ? matchesSearchFallback(rec, q) : item.name.toLowerCase().includes(q);
    });
  }
  if (params.brands?.length) {
    const set = new Set(params.brands);
    filtered = filtered.filter((i) => set.has(i.brandSlug));
  }
  if (params.categories?.length) {
    const set = new Set(params.categories);
    filtered = filtered.filter((i) => i.category && set.has(i.category));
  }
  if (params.occasions?.length) {
    const set = new Set(params.occasions);
    filtered = filtered.filter((i) => i.occasions.some((o) => set.has(o)));
  }
  if (params.size?.trim()) {
    const target = params.size.trim().toUpperCase();
    filtered = filtered.filter((i) => i.sizes.some((s) => s.toUpperCase() === target));
  }
  if (typeof params.minPrice === "number") {
    filtered = filtered.filter((i) => i.currentPriceCents >= params.minPrice! * 100);
  }
  if (typeof params.maxPrice === "number") {
    filtered = filtered.filter((i) => i.currentPriceCents <= params.maxPrice! * 100);
  }
  if (typeof params.minDiscountVsMedian === "number" && params.minDiscountVsMedian > 0) {
    filtered = filtered.filter((i) => i.pctBelowMedian >= params.minDiscountVsMedian!);
  }
  if (params.dealSignal === "lowest_90d") {
    filtered = filtered.filter((i) => i.dealLabel === "Lowest in 90 days");
  } else if (params.dealSignal === "real_deal") {
    filtered = filtered.filter((i) => i.dealLabel === "Real deal");
  } else if (params.dealSignal === "verified_only") {
    filtered = filtered.filter(
      (i) => i.dealLabel === "Lowest in 90 days" || i.dealLabel === "Real deal"
    );
  }
  if (params.inStockOnly) {
    filtered = filtered.filter((i) => i.inStock);
  }

  filtered = [...filtered].sort((a, b) => {
    switch (params.sort) {
      case "discount_desc":
        return b.pctBelowMedian - a.pctBelowMedian || b.dealScore - a.dealScore;
      case "price_asc":
        return a.currentPriceCents - b.currentPriceCents;
      case "price_desc":
        return b.currentPriceCents - a.currentPriceCents;
      case "newest_drop": {
        const at = a.lastPriceChangeCents < 0 && a.lastPriceChangeAt ? new Date(a.lastPriceChangeAt).getTime() : 0;
        const bt = b.lastPriceChangeCents < 0 && b.lastPriceChangeAt ? new Date(b.lastPriceChangeAt).getTime() : 0;
        return bt - at || b.dealScore - a.dealScore;
      }
      default:
        return b.dealScore - a.dealScore || b.pctBelowMedian - a.pctBelowMedian;
    }
  });

  const verified = classified.filter(
    (i) => i.dealLabel === "Lowest in 90 days" || i.dealLabel === "Real deal"
  );
  const lowest90d = classified.filter((i) => i.dealLabel === "Lowest in 90 days");
  const brandCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const sizeSet = new Set<string>();
  for (const item of classified) {
    brandCounts[item.brandSlug] = (brandCounts[item.brandSlug] ?? 0) + 1;
    if (item.category) categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    for (const s of item.sizes) sizeSet.add(s);
  }

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
    queryDurationMs: Date.now() - t0,
    activeSaleEvents: [],
    activePromosByBrand: {},
    items: filtered.slice(offset, offset + pageSize),
    marketStats: {
      verifiedDealsCount: verified.length,
      lowest90dCount: lowest90d.length,
      medianVerifiedSavingsPct: 24,
      brandsTracked: BRANDS.length,
      lastCheckedAt: new Date().toISOString(),
    },
    brandStrip: BRANDS.map((brand) => ({
      slug: brand.slug,
      name: brand.name,
      brandCode: brand.code,
      swatchHex: brand.swatchHex,
      ingestionStatus: brand.ingestionStatus,
      statusNote: brand.statusNote,
      activeDeals:
        brand.ingestionStatus === "feed_pending"
          ? 0
          : verified.filter((v) => v.brandSlug === brand.slug).length,
      avgBelowMedianPct: 0,
      topDealScore: 0,
    })),
    facets: {
      brandCounts,
      categoryCounts,
      availableSizes: Array.from(sizeSet).sort(),
    },
  };
}

export async function getProductDetailBySlug(slug: string): Promise<ProductFeedItem | null> {
  const sql = getSqlClient();
  if (sql) {
    const rows = await sql`SELECT * FROM products WHERE slug = ${slug} LIMIT 1`;
    if (!rows[0]) return null;
    const row = rows[0];
    if (FEED_PENDING_BRAND_SLUGS.has(String(row.brand_slug))) return null;
    const [snaps, promos, events] = await Promise.all([
      sql`
        SELECT product_id, price_cents, original_price_cents, compare_at_gap_pct, in_stock, captured_at
        FROM price_snapshots
        WHERE product_id = ${String(row.id)}
        ORDER BY captured_at ASC
      `,
      sql`
        SELECT id, brand_slug, description, code, percent_off, amount_off_cents, min_spend_cents, applies_to, has_exclusions, starts_at, ends_at, source_url
        FROM brand_promos
        WHERE brand_slug = ${String(row.brand_slug)} AND active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()
        ORDER BY verified_at DESC
        LIMIT 1
      `,
      sql`
        SELECT id, slug, name, brand_slug, starts_at, ends_at, typical_discount_note
        FROM sale_events
        WHERE (brand_slug IS NULL OR brand_slug = ${String(row.brand_slug)})
          AND starts_at <= NOW() AND ends_at >= NOW()
        ORDER BY starts_at DESC
      `,
    ]);

    const snapMap = new Map<string, ProductFeedItem["sparkline"]>();
    snapMap.set(
      String(row.id),
      snaps.map((s) => ({
        priceCents: Number(s.price_cents),
        originalPriceCents: Number(s.original_price_cents),
        compareAtGapPct:
          s.compare_at_gap_pct !== null && s.compare_at_gap_pct !== undefined
            ? Number(s.compare_at_gap_pct)
            : null,
        inStock: Boolean(s.in_stock),
        capturedAt: new Date(String(s.captured_at)).toISOString(),
      }))
    );

    const promosByBrand: Record<string, ActiveBrandPromo> = {};
    if (promos[0]) {
      const pr = promos[0];
      promosByBrand[String(row.brand_slug)] = {
        id: Number(pr.id),
        brandSlug: String(pr.brand_slug),
        description: String(pr.description),
        code: pr.code ? String(pr.code) : null,
        percentOff: pr.percent_off !== null ? Number(pr.percent_off) : null,
        amountOffCents: pr.amount_off_cents !== null ? Number(pr.amount_off_cents) : null,
        minSpendCents: pr.min_spend_cents !== null ? Number(pr.min_spend_cents) : null,
        appliesTo: String(pr.applies_to ?? "Sitewide"),
        hasExclusions: Boolean(pr.has_exclusions),
        startsAt: new Date(String(pr.starts_at)).toISOString(),
        endsAt: new Date(String(pr.ends_at)).toISOString(),
        sourceUrl: pr.source_url ? String(pr.source_url) : null,
      };
    }

    const activeEvents: ActiveSaleEvent[] = events.map((ev) => ({
      id: Number(ev.id),
      slug: String(ev.slug),
      name: String(ev.name),
      brandSlug: ev.brand_slug ? String(ev.brand_slug) : null,
      startsAt: new Date(String(ev.starts_at)).toISOString(),
      endsAt: new Date(String(ev.ends_at)).toISOString(),
      typicalDiscountNote: String(ev.typical_discount_note ?? ""),
    }));

    return mapPgProductRow(row, snapMap, promosByBrand, activeEvents);
  }

  assertDemoFallbackAllowed("DATABASE_URL required for /p/[slug]");
  const found = getFallbackCatalog().find((p) => p.slug === slug);
  return found ? toFeedItem(found) : null;
}

export async function getProductsByIds(ids: string[]): Promise<ProductFeedItem[]> {
  if (ids.length === 0) return [];
  const sql = getSqlClient();
  if (sql) {
    const [rows, promoRows, saleEventRows] = await Promise.all([
      sql`SELECT * FROM products WHERE id = ANY(${ids.slice(0, 50)}::text[])`,
      sql`
        SELECT id, brand_slug, description, code, percent_off, amount_off_cents, min_spend_cents, applies_to, has_exclusions, starts_at, ends_at, source_url
        FROM brand_promos
        WHERE active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()
      `,
      sql`
        SELECT id, slug, name, brand_slug, starts_at, ends_at, typical_discount_note
        FROM sale_events
        WHERE starts_at <= NOW() AND ends_at >= NOW()
      `,
    ]);
    const promosByBrand: Record<string, ActiveBrandPromo> = {};
    for (const pr of promoRows) {
      promosByBrand[String(pr.brand_slug)] = {
        id: Number(pr.id),
        brandSlug: String(pr.brand_slug),
        description: String(pr.description),
        code: pr.code ? String(pr.code) : null,
        percentOff: pr.percent_off !== null ? Number(pr.percent_off) : null,
        amountOffCents: pr.amount_off_cents !== null ? Number(pr.amount_off_cents) : null,
        minSpendCents: pr.min_spend_cents !== null ? Number(pr.min_spend_cents) : null,
        appliesTo: String(pr.applies_to ?? "Sitewide"),
        hasExclusions: Boolean(pr.has_exclusions),
        startsAt: new Date(String(pr.starts_at)).toISOString(),
        endsAt: new Date(String(pr.ends_at)).toISOString(),
        sourceUrl: pr.source_url ? String(pr.source_url) : null,
      };
    }
    const events: ActiveSaleEvent[] = saleEventRows.map((ev) => ({
      id: Number(ev.id),
      slug: String(ev.slug),
      name: String(ev.name),
      brandSlug: ev.brand_slug ? String(ev.brand_slug) : null,
      startsAt: new Date(String(ev.starts_at)).toISOString(),
      endsAt: new Date(String(ev.ends_at)).toISOString(),
      typicalDiscountNote: String(ev.typical_discount_note ?? ""),
    }));
    const snapMap = new Map<string, ProductFeedItem["sparkline"]>();
    return rows.map((r) => mapPgProductRow(r, snapMap, promosByBrand, events));
  }

  assertDemoFallbackAllowed("DATABASE_URL required for watchlist lookup");
  const set = new Set(ids);
  return getFallbackCatalog()
    .filter((p) => set.has(p.id))
    .map(toFeedItem);
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
        id: String(rows[0].id),
        brandSlug: String(rows[0].brand_slug),
        productUrl: String(rows[0].product_url),
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
