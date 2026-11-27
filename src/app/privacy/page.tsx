import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 text-[#0F1D32]">
      <Link href="/" className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline">
        ← Back to Deal Desk
      </Link>
      <h1 className="font-serif text-3xl font-semibold">Privacy Policy &amp; Email Compliance</h1>
      <div className="space-y-4 text-sm text-[#3E4C5E] leading-relaxed">
        <p>
          Tape &amp; Tailor tracks public menswear pricing and never sells your personal data.
          When price-drop email alerts launch in Phase 3, we store only your email address,
          selected product ID, target price or discount threshold, and a unique one-click
          unsubscribe token.
        </p>
        <p>
          Every alert email complies with CAN-SPAM requirements, includes a single-click
          unsubscribe link that immediately deactivates the alert, and deduplicates notifications
          so you are never emailed twice for the same price level.
        </p>
        <p>
          Outbound links to brand websites may include affiliate tracking parameters set by the
          retailer&apos;s affiliate network (such as Rakuten, Impact, CJ, Awin, or ShareASale).
          All purchases occur exclusively on the brand&apos;s own website under their privacy policy.
        </p>
      </div>
    </main>
  );
}
