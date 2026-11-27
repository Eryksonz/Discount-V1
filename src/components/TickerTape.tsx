"use client";

import type { BrandCodeStat } from "@/lib/catalog/repository";

interface TickerTapeProps {
  items: BrandCodeStat[];
  selectedBrands: string[];
  onToggleBrand: (slug: string) => void;
}

/**
 * Editorial brand-index strip using internal 4-character Brand Codes (not stock quotes).
 * Clicking any brand filters the feed to that retailer.
 */
export function TickerTape({ items, selectedBrands, onToggleBrand }: TickerTapeProps) {
  const doubled = [...items, ...items];

  return (
    <div
      className="w-full overflow-hidden bg-[#0F1D32] text-[#FAF8F3] border-b border-[#B8924A]/40"
      aria-label="Tracked menswear brand index"
    >
      <div className="flex items-center">
        <div className="shrink-0 z-10 bg-[#0B1525] px-3 py-2 border-r border-[#B8924A]/40 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#B8924A]" />
          <span className="font-mono text-[11px] font-semibold tracking-widest uppercase text-[#E5C98B]">
            BRAND INDEX
          </span>
        </div>
        <div className="overflow-hidden flex-1">
          <div className="ticker-track py-1.5">
            {doubled.map((stat, idx) => {
              const active = selectedBrands.includes(stat.slug);
              return (
                <button
                  key={`${stat.slug}-${idx}`}
                  type="button"
                  onClick={() => onToggleBrand(stat.slug)}
                  className={`mx-1.5 inline-flex items-center gap-2 rounded px-2.5 py-0.5 text-xs transition-colors border ${
                    active
                      ? "bg-[#B8924A]/25 border-[#B8924A] text-white"
                      : "bg-transparent border-white/10 hover:bg-white/10 text-[#DCE3EC]"
                  }`}
                  title={`Filter by ${stat.name} (Brand code: ${stat.brandCode} · ${stat.activeDeals} verified deals)`}
                >
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[#E5C98B]">
                    {stat.brandCode}
                  </span>
                  <span className="font-sans text-xs text-white/90 hidden sm:inline">
                    {stat.name}
                  </span>
                  {stat.avgBelowMedianPct > 0 ? (
                    <span className="font-mono text-[11px] text-[#4ADE80] font-semibold tabular-nums">
                      -{stat.avgBelowMedianPct}% med
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-[#94A3B8] tabular-nums">
                      0% med
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-[#9AA8BA] tabular-nums">
                    ({stat.activeDeals})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
