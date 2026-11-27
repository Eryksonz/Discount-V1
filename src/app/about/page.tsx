import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function AboutPage() {
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
            Tape &amp; Tailor tracks public prices across a curated roster of 16 menswear brands
            commonly worn by finance students, summer analysts, and young professionals. We do not
            sell clothing—every outbound link sends you directly to the brand&apos;s official
            website for checkout.
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
            0–100 Deal Score, and history summary is produced by open, rule-based logic from stored
            snapshots—never paid brand placement or opaque AI recommendations.
          </p>
          <p className="rounded-md border border-[#D8D0C0] bg-[#F7F4EC] p-4 text-xs text-[#0F1D32]">
            <strong>Non-Affiliation &amp; Affiliate Disclosure:</strong> Tape &amp; Tailor is an
            independent publication and is not affiliated with, sponsored by, or endorsed by any of
            the brands listed. We may earn affiliate commissions on qualifying purchases made
            through outbound links at no additional cost to you. Commissions never influence
            rankings or deal badges.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
