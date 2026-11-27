"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  TrendingDown,
  Award,
  Layers,
  Clock,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { BRANDS } from "@config/brands";
import { OCCASIONS, PRODUCT_CATEGORIES } from "@config/categories";
import { DEAL_SCORE_WEIGHTS, DEAL_THRESHOLDS } from "@config/deal-thresholds";
import type { CatalogFeedResponse } from "@/lib/catalog/repository";
import { formatRelativeTime } from "@/lib/utils";
import { TickerTape } from "./TickerTape";
import { SiteHeader } from "./SiteHeader";
import { DealCard } from "./DealCard";
import { SiteFooter } from "./SiteFooter";

interface DealFeedClientProps {
  initialData: CatalogFeedResponse;
}

type SignalFilter = "all" | "verified_only" | "lowest_90d" | "real_deal";
type SortOption = "score_desc" | "discount_desc" | "price_asc" | "price_desc" | "newest_drop";

export function DealFeedClient({ initialData }: DealFeedClientProps) {
  const [data, setData] = useState<CatalogFeedResponse>(initialData);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [query, setQuery] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minDiscount, setMinDiscount] = useState<string>("");
  const [signal, setSignal] = useState<SignalFilter>("all");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [sort, setSort] = useState<SortOption>("score_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isFirstRender = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFeed = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedBrands.length > 0) params.set("brands", selectedBrands.join(","));
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedOccasions.length > 0) params.set("occasions", selectedOccasions.join(","));
    if (selectedSize) params.set("size", selectedSize);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (minDiscount) params.set("minDiscount", minDiscount);
    if (signal !== "all") params.set("signal", signal);
    if (inStockOnly) params.set("inStockOnly", "true");
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    setLoading(true);
    try {
      const res = await fetch(`/api/products?${params.toString()}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const json: CatalogFeedResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Failed to fetch deal feed:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [
    query,
    selectedBrands,
    selectedCategories,
    selectedOccasions,
    selectedSize,
    maxPrice,
    minDiscount,
    signal,
    inStockOnly,
    sort,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchFeed();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchFeed]);

  const toggleItem = (list: string[], value: string, setter: (v: string[]) => void) => {
    setPage(1);
    setter(list.includes(value) ? list.filter((i) => i !== value) : [...list, value]);
  };

  const resetAllFilters = () => {
    setQuery("");
    setSelectedBrands([]);
    setSelectedCategories([]);
    setSelectedOccasions([]);
    setSelectedSize("");
    setMaxPrice("");
    setMinDiscount("");
    setSignal("all");
    setInStockOnly(true);
    setSort("score_desc");
    setPage(1);
  };

  const activeFilterCount =
    selectedBrands.length +
    selectedCategories.length +
    selectedOccasions.length +
    (selectedSize ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (minDiscount ? 1 : 0) +
    (signal !== "all" ? 1 : 0) +
    (!inStockOnly ? 1 : 0);

  const totalPages = Math.max(1, Math.ceil(data.totalMatched / data.pageSize));

  const filterPanelContent = (
    <div className="space-y-6">
      {/* Occasion Tags */}
      <div>
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5C6776] mb-2.5">
          Occasion
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {OCCASIONS.map((occ) => {
            const active = selectedOccasions.includes(occ);
            return (
              <button
                key={occ}
                type="button"
                onClick={() => toggleItem(selectedOccasions, occ, setSelectedOccasions)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? "bg-[#0F1D32] text-[#FAF8F3] border-[#0F1D32]"
                    : "bg-white text-[#3E4C5E] border-[#DDD5C7] hover:border-[#0F1D32]"
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>
      </div>

      {/* Price & Discount Bounds */}
      <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-[#E6E0D4]">
        <div>
          <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#5C6776] mb-1">
            Max Price ($)
          </label>
          <input
            type="number"
            min={20}
            step={10}
            placeholder="e.g. 150"
            value={maxPrice}
            onChange={(e) => {
              setPage(1);
              setMaxPrice(e.target.value);
            }}
            className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#5C6776] mb-1">
            Min % Off Med.
          </label>
          <select
            value={minDiscount}
            onChange={(e) => {
              setPage(1);
              setMinDiscount(e.target.value);
            }}
            className="w-full rounded border border-[#D8D0C0] bg-white px-2 py-1.5 font-mono text-xs text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
          >
            <option value="">Any</option>
            <option value="10">10%+ below</option>
            <option value="15">15%+ (Real)</option>
            <option value="25">25%+ deep</option>
            <option value="35">35%+ steep</option>
          </select>
        </div>
      </div>

      {/* Size + Stock */}
      <div className="space-y-2.5 pt-4 border-t border-[#E6E0D4]">
        <div>
          <label className="block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5C6776] mb-1.5">
            Size
          </label>
          <select
            value={selectedSize}
            onChange={(e) => {
              setPage(1);
              setSelectedSize(e.target.value);
            }}
            className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
          >
            <option value="">All Sizes</option>
            {data.facets.availableSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#3E4C5E] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => {
              setPage(1);
              setInStockOnly(e.target.checked);
            }}
            className="rounded border-[#C8bfb0] accent-[#14532D]"
          />
          <span>In-stock items only</span>
        </label>
      </div>

      {/* Product Categories */}
      <div className="pt-4 border-t border-[#E6E0D4]">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5C6776] mb-2">
          Category
        </h3>
        <div className="space-y-1.5">
          {PRODUCT_CATEGORIES.map((cat) => {
            const count = data.facets.categoryCounts[cat.slug] ?? 0;
            const checked = selectedCategories.includes(cat.slug);
            return (
              <label
                key={cat.slug}
                className="flex items-center justify-between text-xs text-[#3E4C5E] hover:text-[#0F1D32] cursor-pointer py-0.5"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleItem(selectedCategories, cat.slug, setSelectedCategories)
                    }
                    className="rounded border-[#C8BFB0] accent-[#0F1D32]"
                  />
                  <span>{cat.shortLabel}</span>
                </span>
                <span className="font-mono text-[10px] text-[#7A8490] tabular-nums">
                  {count}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Curated Brands */}
      <div className="pt-4 border-t border-[#E6E0D4]">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5C6776] mb-2">
          Curated Brands ({BRANDS.length})
        </h3>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {BRANDS.map((brand) => {
            const isFeedPending = brand.ingestionStatus === "feed_pending";
            const count = isFeedPending ? 0 : (data.facets.brandCounts[brand.slug] ?? 0);
            const checked = selectedBrands.includes(brand.slug);
            return (
              <label
                key={brand.slug}
                title={isFeedPending ? brand.statusNote : undefined}
                className={`flex items-center justify-between text-xs py-0.5 ${
                  isFeedPending
                    ? "text-[#8A94A3] cursor-not-allowed"
                    : "text-[#3E4C5E] hover:text-[#0F1D32] cursor-pointer"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    disabled={isFeedPending}
                    checked={checked}
                    onChange={() => {
                      if (!isFeedPending) toggleItem(selectedBrands, brand.slug, setSelectedBrands);
                    }}
                    className="rounded border-[#C8BFB0] accent-[#0F1D32] disabled:opacity-40"
                  />
                  <span className="font-mono text-[10px] font-semibold text-[#0F1D32] w-11 shrink-0">
                    {brand.code}
                  </span>
                  <span className="truncate">{brand.name}</span>
                </span>
                {isFeedPending ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider rounded bg-[#EFEAE0] px-1.5 py-0.5 text-[#7A6338] shrink-0">
                    Feed pending
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-[#7A8490] tabular-nums">
                    {count}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={resetAllFilters}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-[#C8BFB0] bg-white hover:bg-[#F3EFE6] px-3 py-2 text-xs font-semibold text-[#0F1D32] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Filters
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {data.isDemoData && (
        <div
          role="status"
          className="w-full bg-[#FEF3C7] border-b-2 border-[#D97706] text-[#78350F] px-4 py-2.5"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#B45309]" />
              <span>
                <strong className="font-mono uppercase tracking-wider mr-1.5">Demo Data:</strong>
                {data.liveCrawledCount > 0
                  ? `Showing ${data.liveCrawledCount} live crawled products alongside ${data.demoSeededCount} simulated demo items.`
                  : "Prices, stock, and 90-day histories below are simulated seed data for previewing the interface—not live retailer prices."}
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider rounded bg-[#FDE68A] px-2 py-0.5 text-[#78350F] border border-[#D97706]/30">
              {data.source === "postgres" ? "Postgres · Seeded Demo" : "DEMO_MODE=true"}
            </span>
          </div>
        </div>
      )}

      <TickerTape
        items={data.brandStrip}
        selectedBrands={selectedBrands}
        onToggleBrand={(slug) => toggleItem(selectedBrands, slug, setSelectedBrands)}
      />
      <SiteHeader
        source={data.source}
        isDemoData={data.isDemoData}
        unclassifiedCount={data.unclassifiedCount}
      />

      {data.activeSaleEvents.length > 0 && (
        <div
          role="status"
          className="w-full bg-[#14532D] text-[#FAF8F3] border-b border-[#B8924A]/50 px-4 py-2"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-[#0B351D] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#E5C98B]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
                Sale Event Live
              </span>
              <span className="font-semibold">
                {data.activeSaleEvents.map((e) => e.name).join(" · ")}
              </span>
            </div>
            <span className="text-[11px] text-[#DCECE2]">
              Prices reflect a sitewide sale; compare against price history, not the brand-listed
              price.
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Editorial Hero + Compact Market Overview Strip */}
        <section className="pb-6 border-b border-[#E2DCD0]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="max-w-2xl">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7A5B1F] mb-1.5">
                Direct-to-Brand Price Intelligence · Finance Uniform Coverage
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[#0F1D32] leading-tight">
                What&apos;s genuinely on sale today—measured against 90-day trading history.
              </h1>
              <p className="mt-2 text-sm text-[#4A5568] leading-relaxed">
                We track prices directly on 16 curated menswear sites and flag fake &ldquo;always-on-sale&rdquo;
                markups. Verified deal badges unlock only after 21+ days of price snapshots.
              </p>
            </div>

            {/* Market KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="rounded-md bg-white border border-[#E2DCD0] px-3 py-2.5">
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                  <TrendingDown className="w-3 h-3 text-[#14532D]" />
                  Verified Deals
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-[#14532D] tabular-nums">
                  {data.marketStats.verifiedDealsCount}
                </div>
              </div>

              <div className="rounded-md bg-white border border-[#E2DCD0] px-3 py-2.5">
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                  <Award className="w-3 h-3 text-[#B8924A]" />
                  90-Day Lows
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-[#0F1D32] tabular-nums">
                  {data.marketStats.lowest90dCount}
                </div>
              </div>

              <div className="rounded-md bg-white border border-[#E2DCD0] px-3 py-2.5">
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                  <Layers className="w-3 h-3 text-[#1B365D]" />
                  Med. Savings
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-[#14532D] tabular-nums">
                  -{data.marketStats.medianVerifiedSavingsPct}%
                </div>
              </div>

              <div className="rounded-md bg-white border border-[#E2DCD0] px-3 py-2.5">
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                  <Clock className="w-3 h-3 text-[#5C6776]" />
                  Last Check
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#0F1D32] tabular-nums pt-0.5">
                  {formatRelativeTime(data.marketStats.lastCheckedAt)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Search, Signal Tabs & Sort Control Bar */}
        <section className="py-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B7684] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
                placeholder='Search quarter-zips, loafers, "Peter Millar", "Napoli suit" (typo-tolerant)...'
                className="w-full rounded-md border border-[#D8D0C0] bg-white pl-9 pr-4 py-2 text-sm text-[#0F1D32] placeholder:text-[#8A94A0] focus:border-[#0F1D32] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-1.5 rounded-md border border-[#D8D0C0] bg-white px-3 py-2 text-xs font-semibold text-[#0F1D32]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[#0F1D32] text-white px-1.5 py-0.5 font-mono text-[10px]">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-2 flex-1 md:flex-none">
                <label
                  htmlFor="sort-select"
                  className="font-mono text-[11px] uppercase tracking-wider text-[#6B7684] hidden sm:inline"
                >
                  Sort
                </label>
                <select
                  id="sort-select"
                  value={sort}
                  onChange={(e) => {
                    setPage(1);
                    setSort(e.target.value as SortOption);
                  }}
                  className="w-full md:w-auto rounded-md border border-[#D8D0C0] bg-white px-3 py-2 text-xs font-semibold text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
                >
                  <option value="score_desc">Deal Score (High → Low)</option>
                  <option value="discount_desc">% Below 90d Median</option>
                  <option value="newest_drop">Newest Price Drop</option>
                  <option value="price_asc">Price (Low → High)</option>
                  <option value="price_desc">Price (High → Low)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Signal Quick-Filter Pills + Result Count */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "All Tracked" },
                  { id: "verified_only", label: "Verified Deals Only" },
                  { id: "lowest_90d", label: "Lowest in 90 Days" },
                  { id: "real_deal", label: "Real Deal (≤85% Med.)" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setSignal(tab.id);
                  }}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium border transition-colors ${
                    signal === tab.id
                      ? "bg-[#0F1D32] text-[#FAF8F3] border-[#0F1D32]"
                      : "bg-white text-[#3E4C5E] border-[#E2DCD0] hover:border-[#0F1D32]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 font-mono text-xs text-[#5C6776] tabular-nums">
              {loading ? (
                <span>Refreshing tape...</span>
              ) : (
                <span>
                  Showing <strong className="text-[#0F1D32]">{data.items.length}</strong> of{" "}
                  <strong className="text-[#0F1D32]">{data.totalMatched}</strong> matching SKUs
                </span>
              )}
              <select
                aria-label="Items per page"
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded border border-[#D8D0C0] bg-white px-2 py-1 text-[11px] text-[#0F1D32]"
              >
                <option value={24}>24 / page</option>
                <option value={36}>36 / page</option>
                <option value={48}>48 / page</option>
              </select>
            </div>
          </div>
        </section>

        {/* Main Two-Column Layout: Sticky Filter Rail + Dense Deal Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          <aside className="hidden lg:block sticky top-4 rounded-lg border border-[#E2DCD0] bg-white p-4">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E6E0D4]">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F1D32]">
                Filter Desk
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="font-mono text-[10px] uppercase text-[#8C3426] hover:underline"
                >
                  Clear ({activeFilterCount})
                </button>
              )}
            </div>
            {filterPanelContent}
          </aside>

          {/* Feed Grid */}
          <div>
            {data.items.length === 0 ? (
              <div className="rounded-lg border border-[#E2DCD0] bg-white p-12 text-center space-y-3">
                <p className="font-serif text-xl text-[#0F1D32]">
                  No tracked menswear matches those filters.
                </p>
                <p className="text-sm text-[#5C6776]">
                  Try widening your max price, relaxing the minimum discount threshold, or clearing
                  selected brands.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F1D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1B365D]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.items.map((item) => (
                    <DealCard key={item.id} item={item} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-between border-t border-[#E2DCD0] pt-4">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-[#D8D0C0] bg-white px-3.5 py-1.5 font-mono text-xs font-semibold text-[#0F1D32] disabled:opacity-40 hover:border-[#0F1D32]"
                    >
                      ← Prev
                    </button>
                    <span className="font-mono text-xs text-[#5C6776] tabular-nums">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded border border-[#D8D0C0] bg-white px-3.5 py-1.5 font-mono text-xs font-semibold text-[#0F1D32] disabled:opacity-40 hover:border-[#0F1D32]"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Transparent Methodology Callout */}
            <section
              id="methodology"
              className="mt-12 rounded-lg border border-[#D8D0C0] bg-white p-6 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E6E0D4] pb-3">
                <h2 className="font-serif text-2xl font-semibold text-[#0F1D32]">
                  Deterministic Valuation Methodology
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#14532D]">
                  100% Rule-Based · Zero AI Guesses
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-[#3E4C5E] leading-relaxed">
                <div className="space-y-1.5">
                  <div className="font-mono font-bold text-[#0F1D32] uppercase tracking-wider">
                    1. 90-Day Time-Weighted Median
                  </div>
                  <p>
                    Snapshots are logged only when price, brand MSRP, or stock changes. We weight
                    each price by how many days it held over the trailing 90 days—so perpetual
                    &ldquo;40% off MSRP&rdquo; promos never pass as real deals.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="font-mono font-bold text-[#0F1D32] uppercase tracking-wider">
                    2. Explicit Deal Thresholds
                  </div>
                  <ul className="space-y-1 font-mono text-[11px]">
                    <li>
                      <strong className="text-[#0F4C29]">Lowest in 90d:</strong> price &le; 90d
                      min &amp; &ge;{DEAL_THRESHOLDS.minHistoryDays}d history
                    </li>
                    <li>
                      <strong className="text-[#14532D]">Real deal:</strong> &le;85% of 90d
                      median &amp; &ge;{DEAL_THRESHOLDS.minHistoryDays}d history
                    </li>
                    <li>
                      <strong className="text-[#8C3426]">Brand-claimed only:</strong> &lt;21d
                      history or &gt;90% of median
                    </li>
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <div className="font-mono font-bold text-[#0F1D32] uppercase tracking-wider">
                    3. Auditable Deal Score (0–100)
                  </div>
                  <p>
                    Click any card&apos;s <span className="font-mono font-semibold">SCORE</span>{" "}
                    pill to inspect its exact points: up to{" "}
                    {DEAL_SCORE_WEIGHTS.belowMedian.maxPoints} pts below 90d median,{" "}
                    {DEAL_SCORE_WEIGHTS.belowOriginal.maxPoints} pts below brand MSRP,{" "}
                    {DEAL_SCORE_WEIGHTS.recency.maxPoints} pts for drop recency, and{" "}
                    {DEAL_SCORE_WEIGHTS.stock.maxPoints} pts for stock &amp; size depth.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Mobile Filter Drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0F1D32]/50"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative z-10 w-80 max-w-[85vw] bg-[#FAF8F3] h-full overflow-y-auto p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#D8D0C0]">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F1D32]">
                Filter Desk
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 text-[#0F1D32]"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterPanelContent}
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
