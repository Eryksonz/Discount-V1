"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, ChevronDown, ChevronUp, Clock, Info, Tag } from "lucide-react";
import { DEAL_THRESHOLDS } from "@config/deal-thresholds";
import type { ProductFeedItem } from "@/lib/catalog/repository";
import { computeEstimatedPriceAfterPromo, formatPromoLine } from "@/lib/promos";
import { formatCurrency, formatRelativeTime, formatSignedPct } from "@/lib/utils";
import { useWatchlist } from "@/lib/watchlist";
import { PriceSparkline } from "./PriceSparkline";
import { GarmentEditorialVisual } from "./GarmentEditorialVisual";

interface DealCardProps {
  item: ProductFeedItem;
}

function getSignalStyles(dealLabel: string, historyDays: number) {
  if (historyDays < DEAL_THRESHOLDS.minHistoryDays) {
    return {
      text: `Building price history (${historyDays}/${DEAL_THRESHOLDS.minHistoryDays}d)`,
      className: "bg-[#F3EFE6] text-[#5C6776] border-[#D8D0C0]",
      dot: "bg-[#8B95A1]",
    };
  }
  switch (dealLabel) {
    case "Lowest in 90 days":
      return {
        text: "Lowest in 90 Days",
        className: "bg-[#0F4C29] text-[#FAF8F3] border-[#0F4C29]",
        dot: "bg-[#E5C98B]",
      };
    case "Real deal":
      return {
        text: "Real Deal",
        className: "bg-[#E8F3EC] text-[#14532D] border-[#14532D]/30",
        dot: "bg-[#14532D]",
      };
    case "Below 90-day median":
      return {
        text: "Below 90d Median",
        className: "bg-[#EBF0F6] text-[#1E3A5F] border-[#1E3A5F]/25",
        dot: "bg-[#1E3A5F]",
      };
    default:
      return {
        text: "Brand-Claimed Only",
        className: "bg-[#FAEEE9] text-[#8C3426] border-[#8C3426]/25",
        dot: "bg-[#8C3426]",
      };
  }
}

export function DealCard({ item }: DealCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showDataNote, setShowDataNote] = useState(false);
  const { isSaved, toggle } = useWatchlist();
  const saved = isSaved(item.id);

  const signal = getSignalStyles(item.dealLabel, item.historyDays);
  const isBuildingHistory = item.historyDays < DEAL_THRESHOLDS.minHistoryDays;
  const hasGenuineMedianDiscount = !isBuildingHistory && item.pctBelowMedian > 0;
  const estAfterPromo = item.activePromo
    ? computeEstimatedPriceAfterPromo(item.currentPriceCents, item.activePromo)
    : null;

  return (
    <article className="bg-white rounded-lg border border-[#E2DCD0] shadow-[0_1px_2px_rgba(15,29,50,0.04)] hover:border-[#B8924A] transition-colors flex flex-col justify-between p-4 gap-3">
      <div className="flex flex-col gap-3">
        {/* Top Row: Internal Brand Code + Brand Name + Watchlist + Deal Score */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="shrink-0 rounded border border-[#D8D0C0] bg-[#F5F1E8] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[#0F1D32]"
              title={`Internal brand code: ${item.brandCode}`}
            >
              {item.brandCode}
            </span>
            <span className="text-xs font-semibold text-[#3E4C5E] truncate">
              {item.brandName}
            </span>
            {item.dataSource === "demo" && (
              <span className="shrink-0 rounded bg-[#FEF3C7] px-1 py-0.5 font-mono text-[9px] font-semibold uppercase text-[#92400E]">
                Demo
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className={`rounded border p-1 transition-colors ${
                saved
                  ? "bg-[#F7F1E3] border-[#B8924A] text-[#7A5B1F]"
                  : "bg-white border-[#DDD5C7] text-[#6B7684] hover:text-[#0F1D32]"
              }`}
              title={saved ? "Remove from watchlist" : "Save to watchlist"}
              aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
            >
              <Bookmark className={`w-3.5 h-3.5 ${saved ? "fill-[#B8924A]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                item.dealScore >= 75
                  ? "bg-[#E8F3EC] text-[#14532D] border-[#14532D]/30 hover:bg-[#DCECE2]"
                  : item.dealScore >= 45
                    ? "bg-[#F7F1E3] text-[#7A5B1F] border-[#B8924A]/40 hover:bg-[#EFE5CE]"
                    : "bg-[#F3EFE6] text-[#5C6776] border-[#DDD5C7] hover:bg-[#EAE3D5]"
              }`}
              title="Inspect deterministic 0–100 Deal Score formula breakdown"
            >
              <span>SCORE {item.dealScore}</span>
              <Info className="w-3 h-3 opacity-75" />
            </button>
          </div>
        </div>

        {/* Deterministic Deal Score Breakdown Drawer */}
        {showBreakdown && (
          <div className="rounded-md bg-[#0F1D32] text-[#FAF8F3] p-3 font-mono text-[11px] space-y-1.5">
            <div className="flex items-center justify-between border-b border-white/15 pb-1 text-[#E5C98B]">
              <span>SCORE BREAKDOWN</span>
              <span className="font-bold">{item.dealScoreBreakdown.total} / 100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#CBD5E1]">Below 90d median (max 45)</span>
              <span className="tabular-nums font-semibold">
                {item.dealScoreBreakdown.belowMedian}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#CBD5E1]">Below brand-listed (max 20)</span>
              <span className="tabular-nums font-semibold">
                {item.dealScoreBreakdown.belowOriginal}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#CBD5E1]">Price-drop recency (max 20)</span>
              <span className="tabular-nums font-semibold">{item.dealScoreBreakdown.recency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#CBD5E1]">Stock &amp; size depth (max 15)</span>
              <span className="tabular-nums font-semibold">{item.dealScoreBreakdown.stock}</span>
            </div>
            {item.matchedRuleId && (
              <div className="pt-1 border-t border-white/15 text-[10px] text-[#94A3B8] flex justify-between">
                <span>Classifier Rule</span>
                <span>{item.matchedRuleId}</span>
              </div>
            )}
          </div>
        )}

        {/* Clickable Product Image / Editorial Silhouette -> /p/[slug] */}
        <Link href={`/p/${item.slug}`} className="block group">
          <GarmentEditorialVisual
            imageUrl={item.imageUrl}
            name={item.name}
            brandCode={item.brandCode}
            brandSwatchHex={item.brandSwatchHex}
            category={item.category}
            subcategory={item.subcategory}
            colors={item.colors}
            inStock={item.inStock}
          />
        </Link>

        {/* Signal Badge + Occasion Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide border ${signal.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${signal.dot}`} />
            {signal.text}
          </span>
          {item.occasions.slice(0, 2).map((occ) => (
            <span
              key={occ}
              className="rounded bg-[#F3EFE6] px-1.5 py-0.5 text-[10px] font-medium text-[#4A5568]"
            >
              {occ}
            </span>
          ))}
        </div>

        {/* Clickable Product Title */}
        <Link href={`/p/${item.slug}`} className="group">
          <h3 className="font-serif text-lg font-semibold leading-snug text-[#0F1D32] group-hover:text-[#1B365D] group-hover:underline line-clamp-2">
            {item.name}
          </h3>
        </Link>

        {/* Primary Comparison: Own History; Secondary Label: "Brand-listed" */}
        <div className="grid grid-cols-2 gap-2 rounded-md bg-[#FAF8F3] border border-[#E8E2D6] p-2.5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
              Current Price
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-xl font-bold text-[#0F1D32] tabular-nums">
                {formatCurrency(item.currentPriceCents, item.currency)}
              </span>
              {hasGenuineMedianDiscount && (
                <span className="font-mono text-xs font-bold text-[#14532D] tabular-nums">
                  {formatSignedPct(item.pctBelowMedian)}
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] text-[#5C6776] tabular-nums">
              {isBuildingHistory
                ? "Building history (<21d)"
                : `vs. ${formatCurrency(item.median90dCents)} 90d med.`}
            </div>
          </div>

          <div className="border-l border-[#E2DCD0] pl-2.5 flex flex-col justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                Brand-listed
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-mono text-sm text-[#6B7684] line-through tabular-nums">
                  {formatCurrency(item.originalPriceCents, item.currency)}
                </span>
              </div>
            </div>
            <div className="font-mono text-[10px] text-[#6B7684] tabular-nums">
              {item.inStock
                ? `${item.sizes.length} size${item.sizes.length === 1 ? "" : "s"} in stock`
                : "Sold out"}
            </div>
          </div>
        </div>

        {/* Active Brand Checkout Promo (Display Layer Only) */}
        {item.activePromo && (
          <div className="rounded border border-[#14532D]/25 bg-[#E8F3EC] px-2.5 py-1.5 text-[11px] text-[#0F4C29] space-y-0.5">
            <div className="flex items-center gap-1 font-medium">
              <Tag className="w-3 h-3 shrink-0" />
              <span>{formatPromoLine(item.activePromo)}</span>
            </div>
            {estAfterPromo !== null && (
              <div className="font-mono text-[10px] font-bold">
                Est. after promo: {formatCurrency(estAfterPromo, item.currency)}
              </div>
            )}
          </div>
        )}

        {/* Active Sitewide Sale Neutral Note */}
        {item.activeSaleEvent && (
          <p className="rounded bg-[#F7F4EC] border border-[#E6E0D4] px-2 py-1 text-[10px] leading-snug text-[#5C6776]">
            Prices reflect a sitewide sale; compare against price history, not the brand-listed
            price.
          </p>
        )}

        {/* 90-Day Price Tape Sparkline */}
        <PriceSparkline
          points={item.sparkline}
          median90dCents={item.median90dCents}
          low90dCents={item.low90dCents}
          currentPriceCents={item.currentPriceCents}
          dealLabel={item.dealLabel}
        />

        {/* Deterministic Template Blurb */}
        <p className="text-xs leading-relaxed text-[#3E4C5E]">{item.dealBlurb}</p>

        {/* Data-Derived History Summary */}
        {item.dataNote && (
          <div className="border-t border-[#EFEAE0] pt-2">
            <button
              type="button"
              onClick={() => setShowDataNote((v) => !v)}
              className="flex items-center justify-between w-full text-left text-[11px] font-semibold text-[#1B365D] hover:text-[#0F1D32]"
            >
              <span>Tracked History Summary</span>
              {showDataNote ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showDataNote && (
              <p className="mt-1.5 font-mono text-[11px] text-[#3E4C5E] leading-relaxed bg-[#F7F4EC] rounded p-2 border-l-2 border-[#B8924A]">
                {item.dataNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer: Freshness Timestamp + Detail Link + Direct-to-Brand Affiliate CTA */}
      <div className="pt-2 border-t border-[#E8E2D6] space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-1 font-mono text-[10px] text-[#6B7684]"
            title={`Prices last checked ${new Date(item.lastCheckedAt).toLocaleString()} — prices may change on retailer site`}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>Checked {formatRelativeTime(item.lastCheckedAt)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href={`/p/${item.slug}`}
              className="rounded border border-[#D8D0C0] bg-white hover:border-[#0F1D32] px-2.5 py-1.5 text-xs font-semibold text-[#0F1D32] transition-colors"
            >
              Chart
            </Link>
            <a
              href={`/go/${item.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-[#0F1D32] hover:bg-[#1B365D] px-3 py-1.5 text-xs font-semibold text-[#FAF8F3] transition-colors"
            >
              <span>Shop</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
        <div className="text-[10px] text-[#7A8490] text-right">
          Affiliate link · checkout on {item.brandName}&apos;s site
        </div>
      </div>
    </article>
  );
}
