"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, ExternalLink, CheckCircle2, HelpCircle } from "lucide-react";

export interface VerifiedStudentPromo {
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
  sourceUrl: string | null;
  verifiedAt: string;
}

export interface UnverifiedStudentBrand {
  brandSlug: string;
  brandName: string;
  brandCode: string;
  brandUrl: string;
  ingestionStatus: string;
  provider: string;
}

interface StudentDiscountsClientProps {
  verifiedPromos: VerifiedStudentPromo[];
  unverifiedBrands: UnverifiedStudentBrand[];
}

export function StudentDiscountsClient({
  verifiedPromos,
  unverifiedBrands,
}: StudentDiscountsClientProps) {
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set([
      ...verifiedPromos.map((p) => p.provider),
      ...unverifiedBrands.map((u) => u.provider),
    ]);
    return ["all", ...Array.from(set).sort()];
  }, [verifiedPromos, unverifiedBrands]);

  const filteredVerified = useMemo(() => {
    if (providerFilter === "all") return verifiedPromos;
    return verifiedPromos.filter((p) => p.provider === providerFilter);
  }, [verifiedPromos, providerFilter]);

  const filteredUnverified = useMemo(() => {
    if (providerFilter === "all") return unverifiedBrands;
    return unverifiedBrands.filter((u) => u.provider === providerFilter);
  }, [unverifiedBrands, providerFilter]);

  return (
    <div className="space-y-10">
      {/* Provider Filter */}
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
            {prov === "all" ? "All Platforms" : prov}
          </button>
        ))}
      </div>

      {/* Verified Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#14532D]" />
          <h2 className="font-serif text-xl font-semibold text-[#0F1D32]">
            Verified Student Offers ({filteredVerified.length})
          </h2>
        </div>

        {filteredVerified.length === 0 ? (
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-6 text-sm text-[#4B5869] space-y-1.5">
            <div className="font-semibold text-[#0F1D32]">
              No student offers are currently marked verified in our database.
            </div>
            <p className="text-xs leading-relaxed">
              Tape &amp; Tailor only publishes student discount percentages and terms here after an
              editor has directly verified the live offer and recorded a verification date. Until
              then, use the direct links below to check each brand&apos;s site directly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVerified.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border-2 border-[#14532D]/25 bg-white p-5 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#0F1D32] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E5C98B]">
                        {item.brandCode}
                      </span>
                      <h3 className="font-serif text-lg font-semibold text-[#0F1D32]">
                        {item.brandName}
                      </h3>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F3EC] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#14532D]">
                      <GraduationCap className="w-3 h-3" />
                      {item.provider}
                    </span>
                  </div>

                  <div className="text-base font-semibold text-[#14532D]">{item.offerText}</div>
                  {item.promoCode && (
                    <div className="font-mono text-xs text-[#7A6338]">
                      Code: <span className="font-semibold">{item.promoCode}</span>
                    </div>
                  )}
                  <p className="text-xs text-[#4B5869] leading-relaxed">{item.terms}</p>
                </div>

                <div className="pt-3 border-t border-[#EDE7DB] flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-[11px] text-[#14532D]">
                    Last verified:{" "}
                    {new Date(item.verifiedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <div className="flex items-center gap-3">
                    {item.ingestionStatus === "active" && (
                      <Link
                        href={`/?brands=${item.brandSlug}`}
                        className="font-mono text-[11px] font-semibold text-[#0F1D32] hover:underline"
                      >
                        Tracked items
                      </Link>
                    )}
                    <a
                      href={item.sourceUrl || item.brandUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5C6776] hover:text-[#0F1D32]"
                    >
                      Verify on brand site
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Unverified "Check the brand's site" Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#7A6338]" />
          <h2 className="font-serif text-xl font-semibold text-[#0F1D32]">
            Check the Brand&apos;s Site ({filteredUnverified.length})
          </h2>
        </div>
        <p className="text-xs text-[#5C6776] max-w-2xl">
          These brands have historically used the listed student verification platforms, but their
          current discount rates, exclusions, and eligibility terms have not been manually verified
          in our database. Check the brand&apos;s website directly before ordering.
        </p>

        <div className="rounded-lg border border-[#E2DCD0] bg-white divide-y divide-[#EDE7DB]">
          {filteredUnverified.map((item) => (
            <div
              key={`${item.brandSlug}-${item.provider}`}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded bg-[#EFEAE0] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F1D32]">
                  {item.brandCode}
                </span>
                <span className="font-semibold text-sm text-[#0F1D32]">{item.brandName}</span>
                <span className="rounded-full bg-[#FAF5E8] border border-[#E5C98B]/60 px-2.5 py-0.5 font-mono text-[10px] text-[#7A6338]">
                  Platform: {item.provider}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#7A8490]">
                  Unverified
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                {item.ingestionStatus === "active" && (
                  <Link
                    href={`/?brands=${item.brandSlug}`}
                    className="font-mono text-[11px] font-semibold text-[#0F1D32] hover:underline"
                  >
                    View price feed
                  </Link>
                )}
                <a
                  href={item.brandUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-[#D8D0C0] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#0F1D32] hover:border-[#0F1D32]"
                >
                  Check brand site
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
