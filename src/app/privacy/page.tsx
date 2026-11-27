import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3]">
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 text-[#0F1D32]">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline"
        >
          ← Back to Deal Desk
        </Link>
        <h1 className="font-serif text-3xl font-semibold">Privacy Policy</h1>
        <div className="space-y-4 text-sm text-[#3E4C5E] leading-relaxed">
          <p>
            Tape &amp; Tailor is a free, non-commercial price tracker. This site has no affiliate
            links, earns no revenue, runs no third-party ad trackers, and never sells personal data.
          </p>
          <p>
            <strong>Local Watchlist &amp; Target Prices:</strong> By default (local alerts mode),
            your saved watchlist items and target prices are stored solely in your own
            browser&apos;s <code className="font-mono text-xs">localStorage</code> and never sent to
            our servers or tied to an email address.
          </p>
          <p>
            <strong>Outbound Links:</strong> Clicking a product link redirects directly to the
            brand&apos;s official website with no affiliate tracking parameters. Optional aggregate
            click counters record only the product ID, brand, destination domain, and timestamp—no
            IP addresses, user agents, cookies, or personal identifiers are stored.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
