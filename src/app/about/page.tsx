import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BRANDS } from "@config/brands";
import { SiteFooter } from "@/components/SiteFooter";

export default function AboutPage() {
  const untrackedBrands = BRANDS.filter((b) => b.ingestionStatus !== "active");

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3]">
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 text-[#0F1D32]">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline"
        >
          ← Back to Deal Desk
        </Link>

        <div className="space-y-2 border-b border-[#E2DCD0] pb-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7A5B1F]">
            About Tape &amp; Tailor
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold">
            Transparent price history for men&apos;s professional wardrobes.
          </h1>
        </div>

        <div className="space-y-4 text-sm text-[#3E4C5E] leading-relaxed">
          <p>
            Tape &amp; Tailor is a free, non-commercial project that tracks public prices across
            menswear brands commonly worn by college students, summer interns, and young
            professionals. We do not sell clothing—every outbound link sends you directly to the
            brand&apos;s official website for checkout.
          </p>
          <p>
            <strong>Why we benchmark against 90-day medians:</strong> Retail &ldquo;compare-at&rdquo;
            or brand-listed prices can stay permanently inflated. Tape &amp; Tailor logs change-only
            price snapshots and computes time-weighted 30-day and 90-day medians. Products require
            at least 21 days of stored history before earning a verified &ldquo;Real deal&rdquo; or
            &ldquo;Lowest in 90 days&rdquo; badge; newer items are explicitly labeled{" "}
            <em>Building price history</em>.
          </p>
          <p>
            <strong>Fully deterministic, zero paid placement:</strong> Every category assignment,
            0–100 Deal Score, Interview Kit selection, and history summary is produced by open,
            rule-based logic from stored snapshots—never paid brand placement or opaque AI
            recommendations.
          </p>
          <p className="rounded-md border border-[#D8D0C0] bg-[#F7F4EC] p-4 text-xs text-[#0F1D32]">
            <strong>Non-Commercial &amp; Non-Affiliation Notice:</strong> This site has no
            affiliate links and earns no revenue. Tape &amp; Tailor is an independent project and is
            not affiliated with, sponsored by, or endorsed by any of the brands listed.
          </p>
        </div>

        {/* Brands Not Tracked Yet (including Peter Millar with plain link, no prices) */}
        <section className="pt-4 border-t border-[#E2DCD0] space-y-3">
          <h2 className="font-serif text-2xl font-semibold text-[#0F1D32]">
            Brands Not Tracked Yet
          </h2>
          <p className="text-xs text-[#4B5869] leading-relaxed">
            Some brands in our curated menswear list either block automated requests or do not have
            an active catalog adapter yet. We never publish unverified prices—use the plain links
            below to browse those brands directly on their own websites.
          </p>
          <div className="rounded-lg border border-[#E2DCD0] bg-white divide-y divide-[#EDE7DB]">
            {untrackedBrands.map((brand) => (
              <div
                key={brand.slug}
                className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="rounded bg-[#EFEAE0] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F1D32]">
                    {brand.code}
                  </span>
                  <span className="font-semibold text-[#0F1D32]">{brand.name}</span>
                </div>
                <a
                  href={brand.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-[#1B365D] hover:underline shrink-0"
                >
                  {brand.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
