"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Bookmark, CheckCircle2, X } from "lucide-react";
import type { AlertsMode } from "@config/app";
import type { ProductFeedItem } from "@/lib/catalog/repository";
import { formatCurrency } from "@/lib/utils";
import { evaluateLocalPriceTarget, useWatchlist } from "@/lib/watchlist";
import { DealCard } from "./DealCard";

interface WatchlistClientProps {
  alertsMode?: AlertsMode;
}

export function WatchlistClient({ alertsMode = "local" }: WatchlistClientProps) {
  const { ids, getTargetPrice, setTargetPrice } = useWatchlist();
  const [items, setItems] = useState<ProductFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/watchlist?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => r.json())
      .then((json) => setItems(json.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [ids.join(",")]);

  const droppedItems = useMemo(() => {
    return items.filter((item) => {
      const target = getTargetPrice(item.id);
      return evaluateLocalPriceTarget(item.currentPriceCents, item.inStock, target).met;
    });
  }, [items, getTargetPrice]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E2DCD0] pb-4">
        <div>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline"
          >
            ← Back to Deal Desk
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-[#0F1D32] mt-1 flex items-center gap-2">
            <Bookmark className="w-6 h-6 text-[#B8924A]" />
            Saved Watchlist ({ids.length})
          </h1>
          <p className="text-xs text-[#5C6776] mt-1">
            {alertsMode === "local"
              ? "Stored locally in your browser with live tracked prices. Set target prices below—items meeting your target are highlighted automatically whenever you check back."
              : "Stored locally in your browser with live tracked prices. Set local target prices below or open any item to configure email alerts."}
          </p>
        </div>
      </div>

      {/* Price Dropped Banner when 1+ saved items meet their local target price */}
      {droppedItems.length > 0 && (
        <div className="rounded-lg border-2 border-[#14532D]/40 bg-[#E8F3EC] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#0F4C29]">
          <div className="flex items-start gap-2.5">
            <BellRing className="w-5 h-5 shrink-0 mt-0.5 text-[#14532D]" />
            <div className="space-y-0.5">
              <div className="font-mono text-xs font-bold uppercase tracking-wider">
                Price Dropped — {droppedItems.length} Watched Item
                {droppedItems.length === 1 ? "" : "s"} Met Your Target!
              </div>
              <p className="text-xs text-[#14532D]">
                {droppedItems.map((d) => d.name).join(" · ")}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#14532D] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-white shrink-0 self-start sm:self-center">
            <CheckCircle2 className="w-3 h-3" />
            Target Met
          </span>
        </div>
      )}

      {loading ? (
        <p className="font-mono text-xs text-[#5C6776]">Loading saved items...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-12 text-center space-y-3">
          <p className="font-serif text-xl text-[#0F1D32]">Your watchlist is empty.</p>
          <p className="text-sm text-[#5C6776]">
            Click the bookmark icon on any deal card to track items and set local target prices in
            your browser.
          </p>
          <Link
            href="/"
            className="inline-block rounded bg-[#0F1D32] px-4 py-2 text-xs font-semibold text-white"
          >
            Browse Deal Desk
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const targetCents = getTargetPrice(item.id);
            const targetCheck = evaluateLocalPriceTarget(
              item.currentPriceCents,
              item.inStock,
              targetCents
            );
            const draftVal =
              drafts[item.id] ?? (targetCents !== null ? String(Math.round(targetCents / 100)) : "");

            return (
              <div key={item.id} className="flex flex-col gap-2">
                {targetCheck.met && targetCents !== null && (
                  <div className="rounded-md bg-[#14532D] text-[#FAF8F3] px-3 py-1.5 font-mono text-[11px] font-semibold flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5 text-[#E5C98B]" />
                      PRICE DROPPED
                    </span>
                    <span>
                      Now {formatCurrency(item.currentPriceCents, item.currency)} ≤{" "}
                      {formatCurrency(targetCents, item.currency)} target
                    </span>
                  </div>
                )}

                <DealCard item={item} />

                {/* Inline Local Target Price Controls */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const num = Number(draftVal);
                    if (Number.isFinite(num) && num > 0) {
                      setTargetPrice(item.id, Math.round(num * 100));
                    }
                  }}
                  className="rounded-md border border-[#E2DCD0] bg-white px-3 py-2 flex items-center gap-2 text-xs"
                >
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776] shrink-0">
                    Target $
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    placeholder={String(Math.max(10, Math.round((item.currentPriceCents * 0.9) / 100)))}
                    value={draftVal}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="w-20 rounded border border-[#D8D0C0] px-2 py-1 font-mono text-xs text-[#0F1D32]"
                  />
                  <button
                    type="submit"
                    className="rounded bg-[#0F1D32] hover:bg-[#1B365D] px-2.5 py-1 font-mono text-[10px] font-semibold text-white"
                  >
                    {targetCents !== null ? "Update" : "Set Target"}
                  </button>
                  {targetCents !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetPrice(item.id, null);
                        setDrafts((prev) => ({ ...prev, [item.id]: "" }));
                      }}
                      className="ml-auto text-[#7A8490] hover:text-[#8C3426]"
                      title="Clear target price"
                      aria-label="Clear target price"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
