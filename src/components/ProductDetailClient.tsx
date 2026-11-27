"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Bookmark, CheckCircle2, Clock, Tag } from "lucide-react";
import { DEAL_THRESHOLDS } from "@config/deal-thresholds";
import type { ProductFeedItem } from "@/lib/catalog/repository";
import { computeEstimatedPriceAfterPromo, formatPromoLine } from "@/lib/promos";
import { formatCurrency, formatRelativeTime, formatSignedPct } from "@/lib/utils";
import { useWatchlist } from "@/lib/watchlist";
import { GarmentEditorialVisual } from "./GarmentEditorialVisual";
import { PriceHistoryChart } from "./PriceHistoryChart";

interface ProductDetailClientProps {
  product: ProductFeedItem;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const { isSaved, toggle } = useWatchlist();
  const saved = isSaved(product.id);

  // Alert form state
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState(
    String(Math.max(10, Math.round((product.currentPriceCents * 0.9) / 100)))
  );
  const [targetDiscount, setTargetDiscount] = useState("");
  const [alertStatus, setAlertStatus] = useState<{
    kind: "idle" | "saving" | "ok" | "error";
    text?: string;
  }>({ kind: "idle" });

  const isBuildingHistory = product.historyDays < DEAL_THRESHOLDS.minHistoryDays;
  const estAfterPromo = product.activePromo
    ? computeEstimatedPriceAfterPromo(product.currentPriceCents, product.activePromo)
    : null;

  async function handleAlertSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlertStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          productId: product.id,
          targetPriceDollars: targetPrice || null,
          targetDiscountPct: targetDiscount || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAlertStatus({ kind: "error", text: json.error ?? "Failed to create alert." });
        return;
      }
      setAlertStatus({ kind: "ok", text: json.message });
      setEmail("");
    } catch {
      setAlertStatus({ kind: "error", text: "Network error while saving alert." });
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#5C6776]">
        <Link href="/" className="hover:text-[#0F1D32] hover:underline">
          ← Deal Desk
        </Link>
        <span>/</span>
        <span>{product.brandName}</span>
        {product.subcategory && (
          <>
            <span>/</span>
            <span>{product.subcategory}</span>
          </>
        )}
      </nav>

      {/* Top Grid: Visual + Core Pricing & CTA */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        <div className="space-y-3">
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-3">
            <GarmentEditorialVisual
              imageUrl={product.imageUrl}
              name={product.name}
              brandCode={product.brandCode}
              brandSwatchHex={product.brandSwatchHex}
              category={product.category}
              subcategory={product.subcategory}
              colors={product.colors}
              inStock={product.inStock}
              tall
            />
          </div>

          <button
            type="button"
            onClick={() => toggle(product.id)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-xs font-semibold transition-colors ${
              saved
                ? "bg-[#F7F1E3] text-[#7A5B1F] border-[#B8924A]"
                : "bg-white text-[#0F1D32] border-[#D8D0C0] hover:border-[#0F1D32]"
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? "fill-[#B8924A]" : ""}`} />
            {saved ? "Saved in Watchlist" : "Save to Watchlist"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-[#D8D0C0] bg-[#F5F1E8] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-[#0F1D32]">
              {product.brandCode}
            </span>
            <span className="text-sm font-semibold text-[#3E4C5E]">{product.brandName}</span>
            <span className="rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase border bg-[#F3EFE6] text-[#0F1D32] border-[#D8D0C0]">
              {isBuildingHistory
                ? `Building price history (${product.historyDays}/${DEAL_THRESHOLDS.minHistoryDays}d)`
                : product.dealLabel}
            </span>
            <span className="ml-auto font-mono text-xs font-bold rounded bg-[#0F1D32] text-[#E5C98B] px-2.5 py-0.5">
              DEAL SCORE {product.dealScore}/100
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#0F1D32] leading-tight">
            {product.name}
          </h1>

          {/* Primary Price vs Own History + Secondary Brand-Listed Price */}
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
                Current Tracked Price
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-[#0F1D32] tabular-nums">
                  {formatCurrency(product.currentPriceCents, product.currency)}
                </span>
                {!isBuildingHistory && product.pctBelowMedian > 0 && (
                  <span className="font-mono text-sm font-bold text-[#14532D] tabular-nums">
                    {formatSignedPct(product.pctBelowMedian)}
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-[#5C6776] mt-0.5">
                {isBuildingHistory
                  ? "Building price history (<21d)"
                  : `vs. ${formatCurrency(product.median90dCents)} 90d median`}
              </div>
            </div>

            <div className="sm:border-l sm:border-[#E6E0D4] sm:pl-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B7684]">
                Brand-listed
              </div>
              <div className="mt-1 font-mono text-lg text-[#6B7684] line-through tabular-nums">
                {formatCurrency(product.originalPriceCents, product.currency)}
              </div>
              <div className="font-mono text-[11px] text-[#6B7684] mt-0.5">
                Secondary reference only
              </div>
            </div>

            <div className="sm:border-l sm:border-[#E6E0D4] sm:pl-4 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-[#5C6776]">30d Median</span>
                <span className="font-semibold">{formatCurrency(product.median30dCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5C6776]">90d Low</span>
                <span className="font-semibold text-[#14532D]">
                  {formatCurrency(product.low90dCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5C6776]">All-Time Low</span>
                <span className="font-semibold">{formatCurrency(product.allTimeLowCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5C6776]">Times &le; Current</span>
                <span className="font-semibold">{product.timesAtOrBelowCurrent}x</span>
              </div>
            </div>
          </div>

          {/* Active Checkout Promo (Strictly Display Layer) */}
          {product.activePromo && (
            <div className="rounded-md border border-[#14532D]/30 bg-[#E8F3EC] p-3.5 text-xs text-[#0F4C29] space-y-1">
              <div className="flex items-center gap-1.5 font-mono font-semibold uppercase tracking-wider text-[11px]">
                <Tag className="w-3.5 h-3.5" />
                Active Checkout Promo ({product.activePromo.appliesTo})
              </div>
              <p className="font-medium">{formatPromoLine(product.activePromo)}</p>
              {estAfterPromo !== null && (
                <p className="font-mono font-bold text-[#0F4C29]">
                  Estimated price after promo: {formatCurrency(estAfterPromo, product.currency)}{" "}
                  <span className="font-normal text-[#14532D]/80">
                    (display estimate only; not stored in price history)
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Active Sale Event Neutral Note */}
          {product.activeSaleEvent && (
            <div className="rounded-md border border-[#D8D0C0] bg-[#F7F4EC] px-3.5 py-2.5 text-xs text-[#3E4C5E]">
              <strong className="font-mono uppercase text-[10px] tracking-wider text-[#7A5B1F] mr-2">
                {product.activeSaleEvent.name}:
              </strong>
              Prices reflect a sitewide sale; compare against price history, not the brand-listed
              price.
            </div>
          )}

          <p className="text-sm text-[#3E4C5E] leading-relaxed">{product.dealBlurb}</p>
          {product.dataNote && (
            <p className="font-mono text-xs text-[#5C6776] bg-[#FAF8F3] border border-[#E6E0D4] rounded p-3">
              {product.dataNote}
            </p>
          )}

          {/* Outbound Retailer Button + Affiliate Disclosure */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href={`/go/${product.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-[#0F1D32] hover:bg-[#1B365D] px-5 py-3 text-sm font-semibold text-[#FAF8F3] transition-colors"
            >
              <span>Buy on {product.brandName}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <div className="text-xs text-[#5C6776] space-y-0.5">
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Prices last checked {formatRelativeTime(product.lastCheckedAt)} (
                  {new Date(product.lastCheckedAt).toLocaleString()})
                </span>
              </div>
              <div className="text-[11px] text-[#6B7684]">
                Affiliate link — checkout happens on {product.brandName}&apos;s site; prices can
                change at any time.
              </div>
            </div>
          </div>

          {/* Available Sizes & Colors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="rounded border border-[#E6E0D4] bg-white p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1.5">
                Sizes In Stock ({product.sizes.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.sizes.length > 0 ? (
                  product.sizes.map((s) => (
                    <span
                      key={s}
                      className="rounded border border-[#D8D0C0] bg-[#FAF8F3] px-2 py-0.5 font-mono text-[11px]"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#8C3426]">Currently out of stock</span>
                )}
              </div>
            </div>
            <div className="rounded border border-[#E6E0D4] bg-white p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1.5">
                Occasions &amp; Colors
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.occasions.map((occ) => (
                  <span
                    key={occ}
                    className="rounded bg-[#EBF0F6] px-2 py-0.5 text-[11px] font-medium text-[#1E3A5F]"
                  >
                    {occ}
                  </span>
                ))}
                {product.colors.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-[#F3EFE6] px-2 py-0.5 text-[11px] text-[#4A5568]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive 90-Day Step Price Chart */}
      <PriceHistoryChart
        snapshots={product.sparkline}
        currentPriceCents={product.currentPriceCents}
        median90dCents={product.median90dCents}
        low90dCents={product.low90dCents}
        historyDays={product.historyDays}
      />

      {/* Two-column Bottom: Deal Score Breakdown + Price-Drop Alert Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-[#E2DCD0] bg-white p-5 space-y-3">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F1D32]">
            Deal Score Breakdown ({product.dealScoreBreakdown.total} / 100)
          </h2>
          <div className="space-y-2.5 font-mono text-xs">
            {[
              {
                label: "Below 90-day median (locked to 0 when <21d history)",
                val: product.dealScoreBreakdown.belowMedian,
                max: 45,
              },
              {
                label: "Below brand-listed price",
                val: product.dealScoreBreakdown.belowOriginal,
                max: 20,
              },
              {
                label: "Recency of latest price drop",
                val: product.dealScoreBreakdown.recency,
                max: 20,
              },
              {
                label: "Stock & size depth",
                val: product.dealScoreBreakdown.stock,
                max: 15,
              },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#3E4C5E]">{row.label}</span>
                  <span className="font-bold text-[#0F1D32]">
                    {row.val} / {row.max}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded bg-[#EFEAE0] overflow-hidden">
                  <div
                    className="h-full bg-[#14532D]"
                    style={{ width: `${Math.round((row.val / row.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {product.matchedRuleId && (
            <div className="pt-2 border-t border-[#EFEAE0] font-mono text-[11px] text-[#6B7684]">
              Matched classifier rule: <strong>{product.matchedRuleId}</strong>
            </div>
          )}
        </section>

        {/* Price-Drop Email Alert Form */}
        <section className="rounded-lg border border-[#D8D0C0] bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#B8924A]" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F1D32]">
              Set a Price-Drop Alert
            </h2>
          </div>
          <p className="text-xs text-[#5C6776]">
            We check active alerts after each crawl and email you at most once per price level.
            Every email includes a CAN-SPAM one-click unsubscribe link.
          </p>

          <form onSubmit={handleAlertSubmit} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-[#D8D0C0] px-3 py-2 text-sm text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1">
                  Target Price ($)
                </label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full rounded border border-[#D8D0C0] px-3 py-2 font-mono text-sm text-[#0F1D32]"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1">
                  Or % Below 90d Med.
                </label>
                <input
                  type="number"
                  min={5}
                  max={90}
                  placeholder="e.g. 25"
                  value={targetDiscount}
                  onChange={(e) => setTargetDiscount(e.target.value)}
                  className="w-full rounded border border-[#D8D0C0] px-3 py-2 font-mono text-sm text-[#0F1D32]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={alertStatus.kind === "saving"}
              className="w-full rounded bg-[#14532D] hover:bg-[#0F4C29] py-2.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
            >
              {alertStatus.kind === "saving" ? "Saving Alert..." : "Notify Me on Price Drop"}
            </button>

            {alertStatus.kind === "ok" && (
              <div className="flex items-start gap-2 rounded bg-[#E8F3EC] p-2.5 text-xs text-[#14532D]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{alertStatus.text}</span>
              </div>
            )}
            {alertStatus.kind === "error" && (
              <p className="text-xs text-[#8C3426] font-medium">{alertStatus.text}</p>
            )}
          </form>
        </section>
      </div>

      {/* Snapshot History Table */}
      <section className="rounded-lg border border-[#E2DCD0] bg-white overflow-x-auto">
        <div className="px-4 py-3 border-b border-[#E6E0D4] font-mono text-xs font-bold uppercase tracking-wider text-[#0F1D32]">
          Recorded Price Snapshots ({product.sparkline.length})
        </div>
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-[#FAF8F3] text-[#5C6776] border-b border-[#E6E0D4]">
            <tr>
              <th className="p-2.5">Captured</th>
              <th className="p-2.5">Tracked Price</th>
              <th className="p-2.5">Brand-listed</th>
              <th className="p-2.5">Compare-at Gap</th>
              <th className="p-2.5">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE0]">
            {[...product.sparkline].reverse().map((s, i) => (
              <tr key={`${s.capturedAt}-${i}`}>
                <td className="p-2.5 text-[#5C6776]">
                  {new Date(s.capturedAt).toLocaleString()}
                </td>
                <td className="p-2.5 font-semibold tabular-nums">
                  {formatCurrency(s.priceCents, product.currency)}
                </td>
                <td className="p-2.5 text-[#6B7684] tabular-nums">
                  {s.originalPriceCents
                    ? formatCurrency(s.originalPriceCents, product.currency)
                    : "—"}
                </td>
                <td className="p-2.5 tabular-nums">
                  {s.compareAtGapPct !== null && s.compareAtGapPct !== undefined
                    ? `${s.compareAtGapPct.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="p-2.5">{s.inStock === false ? "Out of stock" : "In stock"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
