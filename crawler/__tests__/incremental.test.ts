import { describe, expect, it } from "vitest";
import {
  filterBrandSitemapUrls,
  parseSitemapXml,
  selectIncrementalUrls,
  sliceUrlBatch,
  type ExistingProductCrawlState,
  type SitemapUrlEntry,
} from "../sitemap";

describe("Sitemap discovery & hybrid incremental URL selection", () => {
  it("parses sitemap index and standard urlset XML with lastmod timestamps", () => {
    const indexXml = `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://www.brooksbrothers.com/sitemap_0-product.xml</loc></sitemap>
        <sitemap><loc>https://www.brooksbrothers.com/sitemap_1-category.xml</loc></sitemap>
      </sitemapindex>`;
    const idx = parseSitemapXml(indexXml);
    expect(idx.childSitemaps).toEqual([
      "https://www.brooksbrothers.com/sitemap_0-product.xml",
      "https://www.brooksbrothers.com/sitemap_1-category.xml",
    ]);

    const urlsetXml = `<?xml version="1.0"?>
      <urlset>
        <url>
          <loc>https://www.vineyardvines.com/product/mens-polos/sankaty-polo/1K001.html</loc>
          <lastmod>2026-11-26T10:00:00Z</lastmod>
        </url>
      </urlset>`;
    const parsed = parseSitemapXml(urlsetXml);
    expect(parsed.urls).toHaveLength(1);
    expect(parsed.urls[0].lastmod?.toISOString()).toBe("2026-11-26T10:00:00.000Z");
  });

  it("restricts Vineyard Vines strictly to men's product URLs and filters kids/women's from Brooks Brothers", () => {
    const vvEntries: SitemapUrlEntry[] = [
      { loc: "https://www.vineyardvines.com/product/mens-polos/sankaty/1K01.html", lastmod: null },
      { loc: "https://www.vineyardvines.com/product/womens-dresses/dress/2K01.html", lastmod: null },
      { loc: "https://www.vineyardvines.com/product/boys-polos/polo/3K01.html", lastmod: null },
      { loc: "https://www.vineyardvines.com/category/mens-sale", lastmod: null },
    ];
    expect(filterBrandSitemapUrls("vineyard-vines", vvEntries).map((e) => e.loc)).toEqual([
      "https://www.vineyardvines.com/product/mens-polos/sankaty/1K01.html",
    ]);

    const bbEntries: SitemapUrlEntry[] = [
      { loc: "https://www.brooksbrothers.com/cotton-oxford-shirt/DG001.html", lastmod: null },
      { loc: "https://www.brooksbrothers.com/boys-oxford-shirt/078T.html", lastmod: null },
      { loc: "https://www.brooksbrothers.com/womens-blazer/W001.html", lastmod: null },
      { loc: "https://www.brooksbrothers.com/mens/sale", lastmod: null },
    ];
    expect(filterBrandSitemapUrls("brooks-brothers", bbEntries).map((e) => e.loc)).toEqual([
      "https://www.brooksbrothers.com/cotton-oxford-shirt/DG001.html",
    ]);
  });

  it("selects new, lastmod-changed, priority-daily, and weekly-recheck URLs while skipping fresh items", () => {
    const now = new Date("2026-11-26T18:00:00Z");
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

    const entries: SitemapUrlEntry[] = [
      { loc: "https://example.com/p/new-item.html", lastmod: daysAgo(1) },
      { loc: "https://example.com/p/lastmod-bumped.html", lastmod: hoursAgo(2) },
      { loc: "https://example.com/p/weekly-stale.html", lastmod: daysAgo(30) },
      { loc: "https://example.com/p/out-of-stock-old.html", lastmod: daysAgo(30) },
      { loc: "https://example.com/p/watchlisted-daily.html", lastmod: daysAgo(30) },
      { loc: "https://example.com/p/high-score-daily.html", lastmod: daysAgo(30) },
      { loc: "https://example.com/p/fresh-item.html", lastmod: daysAgo(10) },
    ];

    const existing = new Map<string, ExistingProductCrawlState>([
      [
        "https://example.com/p/lastmod-bumped.html",
        { id: "p-lastmod", productUrl: "https://example.com/p/lastmod-bumped.html", lastCheckedAt: daysAgo(1), inStock: true, dealScore: 50 },
      ],
      [
        "https://example.com/p/weekly-stale.html",
        { id: "p-weekly", productUrl: "https://example.com/p/weekly-stale.html", lastCheckedAt: daysAgo(8), inStock: true, dealScore: 40 },
      ],
      [
        "https://example.com/p/out-of-stock-old.html",
        { id: "p-oos", productUrl: "https://example.com/p/out-of-stock-old.html", lastCheckedAt: daysAgo(10), inStock: false, dealScore: 40 },
      ],
      [
        "https://example.com/p/watchlisted-daily.html",
        { id: "p-watch", productUrl: "https://example.com/p/watchlisted-daily.html", lastCheckedAt: hoursAgo(25), inStock: true, dealScore: 45 },
      ],
      [
        "https://example.com/p/high-score-daily.html",
        { id: "p-high", productUrl: "https://example.com/p/high-score-daily.html", lastCheckedAt: hoursAgo(22), inStock: true, dealScore: 82 },
      ],
      [
        "https://example.com/p/fresh-item.html",
        { id: "p-fresh", productUrl: "https://example.com/p/fresh-item.html", lastCheckedAt: daysAgo(2), inStock: true, dealScore: 55 },
      ],
    ]);

    const res = selectIncrementalUrls({
      entries,
      existingByUrl: existing,
      priorityProductIds: new Set(["p-watch"]),
      now,
    });

    const reasons = Object.fromEntries(res.selected.map((s) => [s.loc, s.reason]));
    expect(reasons["https://example.com/p/new-item.html"]).toBe("new");
    expect(reasons["https://example.com/p/lastmod-bumped.html"]).toBe("lastmod_changed");
    expect(reasons["https://example.com/p/weekly-stale.html"]).toBe("weekly_recheck");
    expect(reasons["https://example.com/p/watchlisted-daily.html"]).toBe("priority_daily");
    expect(reasons["https://example.com/p/high-score-daily.html"]).toBe("priority_daily");
    expect(reasons["https://example.com/p/fresh-item.html"]).toBeUndefined();
    expect(reasons["https://example.com/p/out-of-stock-old.html"]).toBeUndefined();

    expect(res.stats).toEqual({
      totalDiscovered: 7,
      selectedCount: 5,
      skippedFresh: 1,
      skippedOutOfStock: 1,
      newCount: 1,
      lastmodChangedCount: 1,
      weeklyRecheckCount: 1,
      priorityDailyCount: 2,
      forcedRefreshCount: 0,
    });
  });

  it("forceRefresh ignores 7-day skip for every in-stock URL and supports non-overlapping offset/max batching", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

    const entries: SitemapUrlEntry[] = [
      { loc: "https://example.com/p/d.html", lastmod: hoursAgo(48) },
      { loc: "https://example.com/p/a.html", lastmod: hoursAgo(48) },
      { loc: "https://example.com/p/c.html", lastmod: hoursAgo(48) },
      { loc: "https://example.com/p/b.html", lastmod: hoursAgo(48) },
      { loc: "https://example.com/p/oos.html", lastmod: hoursAgo(48) },
    ];

    const existing = new Map<string, ExistingProductCrawlState>([
      ["https://example.com/p/a.html", { id: "a", productUrl: "https://example.com/p/a.html", lastCheckedAt: hoursAgo(2), inStock: true, dealScore: 50 }],
      ["https://example.com/p/b.html", { id: "b", productUrl: "https://example.com/p/b.html", lastCheckedAt: hoursAgo(2), inStock: true, dealScore: 50 }],
      ["https://example.com/p/c.html", { id: "c", productUrl: "https://example.com/p/c.html", lastCheckedAt: hoursAgo(2), inStock: true, dealScore: 50 }],
      ["https://example.com/p/d.html", { id: "d", productUrl: "https://example.com/p/d.html", lastCheckedAt: hoursAgo(2), inStock: true, dealScore: 50 }],
      ["https://example.com/p/oos.html", { id: "oos", productUrl: "https://example.com/p/oos.html", lastCheckedAt: hoursAgo(2), inStock: false, dealScore: 50 }],
    ]);

    const res = selectIncrementalUrls({
      entries,
      existingByUrl: existing,
      now,
      forceRefresh: true,
    });

    // All 4 fresh in-stock URLs selected in deterministic alphabetical order; unchanged OOS skipped
    expect(res.selected.map((s) => s.loc)).toEqual([
      "https://example.com/p/a.html",
      "https://example.com/p/b.html",
      "https://example.com/p/c.html",
      "https://example.com/p/d.html",
    ]);
    expect(res.stats.forcedRefreshCount).toBe(4);
    expect(res.stats.skippedOutOfStock).toBe(1);

    // Split into 2 non-overlapping batches (offset=0, max=2 and offset=2, max=2)
    const batch1 = sliceUrlBatch(res.selected, 0, 2).map((s) => s.loc);
    const batch2 = sliceUrlBatch(res.selected, 2, 2).map((s) => s.loc);
    expect(batch1).toEqual(["https://example.com/p/a.html", "https://example.com/p/b.html"]);
    expect(batch2).toEqual(["https://example.com/p/c.html", "https://example.com/p/d.html"]);
    expect(new Set([...batch1, ...batch2]).size).toBe(4);
  });
});
