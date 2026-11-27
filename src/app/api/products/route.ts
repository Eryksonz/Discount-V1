import { NextRequest, NextResponse } from "next/server";
import { queryCatalogFeed, type CatalogQueryParams } from "@/lib/catalog/repository";

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const sortParam = sp.get("sort");
  const validSorts = new Set([
    "score_desc",
    "discount_desc",
    "price_asc",
    "price_desc",
    "newest_drop",
  ]);

  const signalParam = sp.get("signal");
  const validSignals = new Set(["all", "lowest_90d", "real_deal", "verified_only"]);

  const params: CatalogQueryParams = {
    q: sp.get("q") ?? undefined,
    brands: parseList(sp.get("brands")),
    categories: parseList(sp.get("categories")),
    occasions: parseList(sp.get("occasions")),
    size: sp.get("size") ?? undefined,
    minPrice: parseNumber(sp.get("minPrice")),
    maxPrice: parseNumber(sp.get("maxPrice")),
    minDiscountVsMedian: parseNumber(sp.get("minDiscount")),
    dealSignal:
      signalParam && validSignals.has(signalParam)
        ? (signalParam as CatalogQueryParams["dealSignal"])
        : "all",
    inStockOnly: sp.get("inStockOnly") === "true",
    sort:
      sortParam && validSorts.has(sortParam)
        ? (sortParam as CatalogQueryParams["sort"])
        : "score_desc",
    page: parseNumber(sp.get("page")) ?? 1,
    pageSize: parseNumber(sp.get("pageSize")) ?? 24,
  };

  const feed = await queryCatalogFeed(params);
  return NextResponse.json(feed);
}
