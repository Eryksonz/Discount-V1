import type { BrandConfig } from "@config/brands";
import type { PoliteHttpClient } from "./http-client";

export interface SitemapUrlEntry {
  loc: string;
  lastmod: Date | null;
}

export interface ExistingProductCrawlState {
  id: string;
  productUrl: string;
  lastCheckedAt: Date;
  inStock: boolean;
  dealScore: number;
}

export type IncrementalFetchReason =
  | "priority_daily"
  | "new"
  | "lastmod_changed"
  | "weekly_recheck"
  | "forced_full";

export interface SelectedSitemapUrl extends SitemapUrlEntry {
  reason: IncrementalFetchReason;
}

export interface IncrementalSelectionResult {
  selected: SelectedSitemapUrl[];
  stats: {
    totalDiscovered: number;
    selectedCount: number;
    skippedFresh: number;
    newCount: number;
    lastmodChangedCount: number;
    weeklyRecheckCount: number;
    priorityDailyCount: number;
  };
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Pure parser for standard XML sitemaps and sitemap indexes.
 */
export function parseSitemapXml(xml: string): {
  childSitemaps: string[];
  urls: SitemapUrlEntry[];
} {
  const childSitemaps: string[] = [];
  const urls: SitemapUrlEntry[] = [];

  const sitemapRe = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
  let smMatch: RegExpExecArray | null;
  while ((smMatch = sitemapRe.exec(xml)) !== null) {
    const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(smMatch[1]);
    if (locMatch) {
      const loc = decodeXmlEntities(locMatch[1]);
      if (loc.startsWith("http")) childSitemaps.push(loc);
    }
  }

  const urlRe = /<url>([\s\S]*?)<\/url>/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRe.exec(xml)) !== null) {
    const block = urlMatch[1];
    const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(block);
    if (!locMatch) continue;
    const loc = decodeXmlEntities(locMatch[1]);
    if (!loc.startsWith("http")) continue;

    const lastmodMatch = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block);
    let lastmod: Date | null = null;
    if (lastmodMatch) {
      const parsed = new Date(lastmodMatch[1].trim());
      if (!Number.isNaN(parsed.getTime())) lastmod = parsed;
    }

    urls.push({ loc, lastmod });
  }

  return { childSitemaps, urls };
}

/**
 * Brand-specific URL scope filter applied before fetching individual product pages.
 * Keeps crawling strictly focused on in-scope men's product URLs to respect polite rate limits.
 */
export function filterBrandSitemapUrls(
  brandSlug: string,
  entries: SitemapUrlEntry[]
): SitemapUrlEntry[] {
  return entries.filter((entry) => {
    let pathname: string;
    try {
      pathname = new URL(entry.loc).pathname.toLowerCase();
    } catch {
      return false;
    }

    if (brandSlug === "vineyard-vines") {
      // Strictly restrict Vineyard Vines to men's product URLs
      if (!pathname.startsWith("/product/mens-")) return false;
      if (/gift-?card/i.test(pathname)) return false;
      return true;
    }

    if (brandSlug === "brooks-brothers") {
      // Product URLs on Brooks Brothers end with .html; skip obvious kids'/women's prefixes
      if (!pathname.endsWith(".html")) return false;
      if (/^\/(boys|girls|kids|womens|women)-/.test(pathname)) return false;
      if (/gift-?card|e-?gift/i.test(pathname)) return false;
      return true;
    }

    return true;
  });
}

/**
 * Discovers product URLs and `<lastmod>` timestamps from a brand's XML sitemap(s),
 * honoring robots.txt and per-domain rate limits via PoliteHttpClient.
 */
export async function discoverSitemapUrls(
  brand: BrandConfig,
  http: PoliteHttpClient
): Promise<{
  entries: SitemapUrlEntry[];
  errors: string[];
  circuitTripped: boolean;
}> {
  const errors: string[] = [];
  const visitedSitemaps = new Set<string>();
  const urlMap = new Map<string, SitemapUrlEntry>();
  const queue = [...brand.crawler.sitemapUrls];

  while (queue.length > 0) {
    const smUrl = queue.shift()!;
    if (visitedSitemaps.has(smUrl)) continue;
    visitedSitemaps.add(smUrl);

    const res = await http.get(smUrl, {
      rateLimitMs: brand.crawler.rateLimitMs,
      accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    });

    if (res.circuitOpen) {
      errors.push(`Circuit breaker open while fetching sitemap ${smUrl}`);
      return {
        entries: filterBrandSitemapUrls(brand.slug, Array.from(urlMap.values())),
        errors,
        circuitTripped: true,
      };
    }
    if (res.blockedByRobots) {
      errors.push(`Sitemap blocked by robots.txt: ${smUrl}`);
      continue;
    }
    if (!res.ok) {
      errors.push(`Sitemap ${smUrl} returned HTTP ${res.status}`);
      continue;
    }

    const parsed = parseSitemapXml(res.body);

    if (parsed.childSitemaps.length > 0) {
      // Prefer explicit product sitemaps when a sitemap index separates products from categories
      const productChildren = parsed.childSitemaps.filter((c) => /product/i.test(c));
      const nextChildren = productChildren.length > 0 ? productChildren : parsed.childSitemaps;
      for (const child of nextChildren) {
        if (!visitedSitemaps.has(child)) queue.push(child);
      }
    }

    for (const entry of parsed.urls) {
      if (!urlMap.has(entry.loc)) {
        urlMap.set(entry.loc, entry);
      }
    }
  }

  const filtered = filterBrandSitemapUrls(brand.slug, Array.from(urlMap.values()));
  return { entries: filtered, errors, circuitTripped: false };
}

/**
 * Pure hybrid incremental URL selector:
 *  1. Priority daily re-check: watchlisted/alerted products or high-score deals (>=70) older than `dailyReCheckHours` (default 20h)
 *  2. Newly discovered URLs not yet in the database
 *  3. Sitemap `<lastmod>` newer than `existing.lastCheckedAt`
 *  4. Rolling weekly re-check: every in-stock product whose `lastCheckedAt` is >= `weeklyReCheckDays` (default 7d) old,
 *     ensuring price drops are caught even when a retailer changes price without bumping `<lastmod>`.
 */
export function selectIncrementalUrls(params: {
  entries: SitemapUrlEntry[];
  existingByUrl: Map<string, ExistingProductCrawlState>;
  priorityProductIds?: Set<string>;
  weeklyReCheckDays?: number;
  dailyReCheckHours?: number;
  highScoreThreshold?: number;
  now?: Date;
  forceFull?: boolean;
}): IncrementalSelectionResult {
  const now = params.now ?? new Date();
  const weeklyMs = (params.weeklyReCheckDays ?? 7) * 24 * 60 * 60 * 1000;
  const dailyMs = (params.dailyReCheckHours ?? 20) * 60 * 60 * 1000;
  const highScoreThreshold = params.highScoreThreshold ?? 70;
  const priorityIds = params.priorityProductIds ?? new Set<string>();

  const priorityDaily: SelectedSitemapUrl[] = [];
  const newUrls: SelectedSitemapUrl[] = [];
  const lastmodChanged: SelectedSitemapUrl[] = [];
  const weeklyRecheck: SelectedSitemapUrl[] = [];
  const forcedFull: SelectedSitemapUrl[] = [];
  let skippedFresh = 0;

  for (const entry of params.entries) {
    const existing = params.existingByUrl.get(entry.loc);

    if (!existing) {
      newUrls.push({ ...entry, reason: "new" });
      continue;
    }

    if (params.forceFull) {
      forcedFull.push({ ...entry, reason: "forced_full" });
      continue;
    }

    const ageMs = now.getTime() - existing.lastCheckedAt.getTime();
    const isPriority = priorityIds.has(existing.id) || existing.dealScore >= highScoreThreshold;

    if (isPriority && ageMs >= dailyMs) {
      priorityDaily.push({ ...entry, reason: "priority_daily" });
      continue;
    }

    if (entry.lastmod && entry.lastmod.getTime() > existing.lastCheckedAt.getTime()) {
      lastmodChanged.push({ ...entry, reason: "lastmod_changed" });
      continue;
    }

    if (existing.inStock && ageMs >= weeklyMs) {
      weeklyRecheck.push({ ...entry, reason: "weekly_recheck" });
      continue;
    }

    skippedFresh += 1;
  }

  // Sort weekly re-checks oldest-first so bounded batches always advance the rolling window
  weeklyRecheck.sort((a, b) => {
    const tA = params.existingByUrl.get(a.loc)?.lastCheckedAt.getTime() ?? 0;
    const tB = params.existingByUrl.get(b.loc)?.lastCheckedAt.getTime() ?? 0;
    return tA - tB;
  });

  // Sort lastmod-changed newest-lastmod-first
  lastmodChanged.sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));

  const selected = [
    ...priorityDaily,
    ...lastmodChanged,
    ...newUrls,
    ...weeklyRecheck,
    ...forcedFull,
  ];

  return {
    selected,
    stats: {
      totalDiscovered: params.entries.length,
      selectedCount: selected.length,
      skippedFresh,
      newCount: newUrls.length,
      lastmodChangedCount: lastmodChanged.length,
      weeklyRecheckCount: weeklyRecheck.length,
      priorityDailyCount: priorityDaily.length,
    },
  };
}
