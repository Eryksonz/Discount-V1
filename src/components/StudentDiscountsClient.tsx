"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, ExternalLink, CheckCircle2, Clock } from "lucide-react";

export interface StudentPromoItem {
  id: number;
  brandSlug: string;
  brandName: string;
  brandCode: string;
  brandUrl: string;
  ingestionStatus: string;
  provider: string;
  offerText: string;
  promoCode: string | null;
  terms: string;
  verifiedAt: string;
  activeCheckoutPromo: string | null;
}

interface StudentDiscountsClientProps {
  promos: StudentPromoItem[];
}

export function StudentDiscountsClient({ promos }: StudentDiscountsClientProps) {
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set(promos.map((p) => p.provider));
    return ["all", ...Array.from(set).sort()];
  }, [promos]);

  const filtered = useMemo(() => {
    if (providerFilter === "all") return promos;
    return promos.filter((p) => p.provider === providerFilter);
  }, [promos, providerFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {providers.map((prov) => (
          <button
            key={prov}
            type="button"
            onClick={() => setProviderFilter(prov)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs border transition-colors ${
              providerFilter === prov
                ? "bg-[#0F1D32] text-[#FAF8F3] border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#DDD5C7] hover:border-[#0F1D32]"
            }`}
          >
            {prov === "all" ? `All Providers (${promos.length})` : prov}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => {
          const isActiveBrand = item.ingestionStatus === "active";
          return (
            <div
              key={`${item.brandSlug}-${item.provider}`}
              className="rounded-lg border border-[#E2DCD0] bg-white p-5 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#0F1D32] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E5C98B]">
                      {item.brandCode}
                    </span>
                    <h2 className="font-serif text-lg font-semibold text-[#0F1D32]">
                      {item.brandName}
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EFEAE0] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F1D32]">
                    <GraduationCap className="w-3 h-3" />
                    {item.provider}
                  </span>
                </div>

                <div className="text-base font-semibold text-[#14532D]">{item.offerText}</div>

                <p className="text-xs text-[#4B5869] leading-relaxed">{item.terms}</p>

                {item.activeCheckoutPromo && (
                  <div className="rounded bg-[#FAF5E8] border border-[#E5C98B]/60 px-3 py-2 text-xs text-[#7A6338]">
                    <span className="font-mono text-[10px] uppercase font-semibold block">
                      Active brand promo (check brand terms for stacking):
                    </span>
                    {item.activeCheckoutPromo}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#EDE7DB] flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5C6776]">
                  {isActiveBrand ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#14532D]" />
                      Live price tracking
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-[#92400E]" />
                      {item.ingestionStatus === "feed_pending" ? "Feed pending" : "Tracking planned"}
                    </>
                  )}
                </span>

                <div className="flex items-center gap-3">
                  {isActiveBrand && (
                    <Link
                      href={`/?brands=${item.brandSlug}`}
                      className="font-mono text-[11px] font-semibold text-[#0F1D32] hover:underline"
                    >
                      View tracked items
                    </Link>
                  )}
                  <a
                    href={item.brandUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5C6776] hover:text-[#0F1D32]"
                  >
                    Brand site
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
