import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 text-[#0F1D32]">
      <Link href="/" className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline">
        ← Back to Deal Desk
      </Link>
      <h1 className="font-serif text-3xl font-semibold">Terms of Use &amp; Disclosures</h1>
      <div className="space-y-4 text-sm text-[#3E4C5E] leading-relaxed">
        <p className="rounded-md border border-[#D8D0C0] bg-[#F7F4EC] p-4 font-medium text-[#0F1D32]">
          Non-Affiliation Notice: Tape &amp; Tailor is an independent price-tracking
          publication and is not affiliated with, sponsored by, or endorsed by any of the
          brands listed on this site. All brand names and trademarks remain the sole
          property of their respective owners. Four-character brand codes shown on this site
          are internal catalog identifiers and are not stock ticker symbols or financial quotes.
        </p>
        <p>
          Tape &amp; Tailor does not sell clothing, process payments, or fulfill orders.
          Clicking any retailer button sends you directly to the brand&apos;s official website
          after strict domain allowlist verification.
        </p>
        <p>
          <strong>Price accuracy:</strong> Every listing displays a &ldquo;Checked [time]&rdquo;
          timestamp indicating when we last verified the price. Retailers may change prices,
          promo exclusions, or size availability at any time without notice. Always confirm
          final pricing at checkout on the brand&apos;s site.
        </p>
        <p>
          <strong>Affiliate disclosure:</strong> We may earn commissions on qualifying
          purchases made through outbound affiliate links. There is no paid brand placement
          in v1; all Deal Scores, labels, and notes are computed strictly by our open
          deterministic rules from stored price history.
        </p>
      </div>
    </main>
  );
}
