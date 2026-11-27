"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Briefcase,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import {
  KIT_BUDGET_TIERS,
  type BudgetTierId,
  type BuiltInterviewKit,
} from "@/lib/kits";
import { formatCurrency } from "@/lib/utils";

interface InterviewKitsClientProps {
  initialKit: BuiltInterviewKit;
  availableSizes: {
    top: string[];
    bottom: string[];
    jacket: string[];
    footwear: string[];
  };
}

export function InterviewKitsClient({
  initialKit,
  availableSizes,
}: InterviewKitsClientProps) {
  const [tier, setTier] = useState<BudgetTierId>(initialKit.tier.id);
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [jacketSize, setJacketSize] = useState("");
  const [footwearSize, setFootwearSize] = useState("");
  const [kit, setKit] = useState<BuiltInterviewKit>(initialKit);
  const [loading, setLoading] = useState(false);

  async function recompute(next: {
    tier: BudgetTierId;
    topSize: string;
    bottomSize: string;
    jacketSize: string;
    footwearSize: string;
  }) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tier: next.tier });
      if (next.topSize) params.set("topSize", next.topSize);
      if (next.bottomSize) params.set("bottomSize", next.bottomSize);
      if (next.jacketSize) params.set("jacketSize", next.jacketSize);
      if (next.footwearSize) params.set("footwearSize", next.footwearSize);
      const res = await fetch(`/api/kits?${params.toString()}`);
      if (res.ok) {
        setKit((await res.json()) as BuiltInterviewKit);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Budget Tier Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {KIT_BUDGET_TIERS.map((t) => {
          const active = tier === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTier(t.id);
                void recompute({ tier: t.id, topSize, bottomSize, jacketSize, footwearSize });
              }}
              className={`text-left rounded-lg p-4 border transition-all ${
                active
                  ? "bg-[#0F1D32] text-[#FAF8F3] border-[#0F1D32] shadow-sm"
                  : "bg-white text-[#141A22] border-[#E2DCD0] hover:border-[#0F1D32]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-lg font-semibold">{t.label}</span>
                <span
                  className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                    active ? "bg-[#B8924A]/25 text-[#E5C98B]" : "bg-[#EFEAE0] text-[#0F1D32]"
                  }`}
                >
                  ≤ {formatCurrency(t.budgetCapCents)}
                </span>
              </div>
              <p className={`text-xs mt-1.5 ${active ? "text-[#CBD5E1]" : "text-[#5C6776]"}`}>
                {t.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      {/* Size Filters */}
      <div className="rounded-lg border border-[#E2DCD0] bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5C6776]">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Optional Size Filters (In-Stock Only)
          </div>
          {loading && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#7A6338]">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Solving bundle...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block font-mono text-[10px] uppercase text-[#5C6776] mb-1">
              Jacket / Blazer
            </label>
            <select
              value={jacketSize}
              onChange={(e) => {
                const v = e.target.value;
                setJacketSize(v);
                void recompute({ tier, topSize, bottomSize, jacketSize: v, footwearSize });
              }}
              className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32]"
            >
              <option value="">Any in-stock</option>
              {availableSizes.jacket.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-[#5C6776] mb-1">
              Shirt &amp; Layer
            </label>
            <select
              value={topSize}
              onChange={(e) => {
                const v = e.target.value;
                setTopSize(v);
                void recompute({ tier, topSize: v, bottomSize, jacketSize, footwearSize });
              }}
              className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32]"
            >
              <option value="">Any in-stock</option>
              {availableSizes.top.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-[#5C6776] mb-1">
              Trousers / Chinos
            </label>
            <select
              value={bottomSize}
              onChange={(e) => {
                const v = e.target.value;
                setBottomSize(v);
                void recompute({ tier, topSize, bottomSize: v, jacketSize, footwearSize });
              }}
              className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32]"
            >
              <option value="">Any in-stock</option>
              {availableSizes.bottom.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-[#5C6776] mb-1">
              Shoes / Belt
            </label>
            <select
              value={footwearSize}
              onChange={(e) => {
                const v = e.target.value;
                setFootwearSize(v);
                void recompute({ tier, topSize, bottomSize, jacketSize, footwearSize: v });
              }}
              className="w-full rounded border border-[#D8D0C0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F1D32]"
            >
              <option value="">Any in-stock</option>
              {availableSizes.footwear.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
            Kit Total
          </div>
          <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
            {formatCurrency(kit.totalPriceCents)}
          </div>
          <div className="font-mono text-[11px] text-[#14532D]">
            {formatCurrency(kit.remainingBudgetCents)} under {formatCurrency(kit.tier.budgetCapCents)} cap
          </div>
        </div>
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
            Slots Filled
          </div>
          <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
            {kit.filledCount} / {kit.totalSlots}
          </div>
          <div className="font-mono text-[11px] text-[#5C6776]">
            {kit.degraded ? "Partial inventory" : "Complete kit"}
          </div>
        </div>
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
            Avg Deal Score
          </div>
          <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
            {kit.averageDealScore} / 100
          </div>
          <div className="font-mono text-[11px] text-[#5C6776]">
            Sum: {kit.totalDealScore} pts
          </div>
        </div>
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
            Brand Diversity
          </div>
          <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
            {Object.keys(kit.brandCounts).length} brands
          </div>
          <div className="font-mono text-[11px] text-[#5C6776]">
            Max {kit.maxItemsPerBrand} items / brand
          </div>
        </div>
      </div>

      {/* Graceful Degradation Notice */}
      {kit.degraded && (
        <div className="rounded-lg border border-[#D97706]/40 bg-[#FEF3C7]/60 p-4 flex items-start gap-3 text-xs text-[#92400E]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Partial kit notice:</span> One or more slots did not
            have enough eligible in-scope, in-stock inventory fitting the selected size and budget
            constraints. Tape &amp; Tailor leaves those slots open instead of forcing off-category
            substitutes.
          </div>
        </div>
      )}

      {/* Slot Cards */}
      <div className="space-y-4">
        {kit.slots.map((entry) => (
          <div
            key={entry.slot.id}
            className="rounded-lg border border-[#E2DCD0] bg-white p-4 sm:p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#EDE7DB]">
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#B8924A]" />
                  <h2 className="font-serif text-lg font-semibold text-[#0F1D32]">
                    {entry.slot.label}
                  </h2>
                </div>
                <p className="text-xs text-[#5C6776]">{entry.slot.description}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider self-start sm:self-center ${
                  entry.status === "filled"
                    ? "bg-[#E8F3EC] text-[#14532D]"
                    : "bg-[#EFEAE0] text-[#7A6338]"
                }`}
              >
                {entry.status === "filled" ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Selected ({entry.eligibleCount} eligible)
                  </>
                ) : (
                  "Not enough in-scope inventory yet"
                )}
              </span>
            </div>

            {entry.item ? (
              <div className="pt-4 flex flex-col sm:flex-row gap-4 items-start">
                <div className="relative w-24 h-28 rounded border border-[#EDE7DB] bg-[#FAF8F3] overflow-hidden shrink-0">
                  {entry.item.imageUrl ? (
                    <Image
                      src={entry.item.imageUrl}
                      alt={entry.item.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#8A94A3]">
                      {entry.item.brandCode}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#0F1D32] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E5C98B]">
                      {entry.item.brandCode}
                    </span>
                    <span className="text-xs font-medium text-[#5C6776]">
                      {entry.item.brandName}
                    </span>
                    {entry.item.subcategory && (
                      <span className="text-xs text-[#7A8490]">· {entry.item.subcategory}</span>
                    )}
                  </div>

                  <Link
                    href={`/p/${entry.item.slug}`}
                    className="block font-serif text-base sm:text-lg font-semibold text-[#0F1D32] hover:underline"
                  >
                    {entry.item.name}
                  </Link>

                  <div className="rounded bg-[#FAF8F3] border border-[#EDE7DB] px-3 py-2 font-mono text-xs text-[#3E4C5E]">
                    <span className="font-semibold text-[#0F1D32]">Why selected: </span>
                    {entry.selectionReason}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-lg font-bold text-[#0F1D32] tabular-nums">
                        {formatCurrency(entry.item.currentPriceCents)}
                      </span>
                      {entry.item.originalPriceCents > entry.item.currentPriceCents && (
                        <span className="font-mono text-xs text-[#7A8490] line-through tabular-nums">
                          Brand-listed {formatCurrency(entry.item.originalPriceCents)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/p/${entry.item.slug}`}
                        className="font-mono text-xs font-semibold text-[#0F1D32] hover:underline"
                      >
                        Price history →
                      </Link>
                      <a
                        href={`/go/${entry.item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded bg-[#0F1D32] px-3 py-1.5 font-mono text-xs font-semibold text-[#FAF8F3] hover:bg-[#1B365D] transition-colors"
                      >
                        Shop at {entry.item.brandName}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-4 text-xs text-[#5C6776]">{entry.selectionReason}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
