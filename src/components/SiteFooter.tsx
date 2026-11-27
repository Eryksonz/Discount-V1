import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-[#0F1D32] text-[#CBD5E1] border-t-2 border-[#B8924A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <div className="font-serif text-xl font-semibold text-[#FAF8F3]">
              Tape &amp; Tailor
            </div>
            <p className="text-xs leading-relaxed text-[#9AA8BA]">
              A free, independent, deterministic menswear price tracker. Zero paid placements.
              Zero AI-generated recommendations. Every signal and note is computed directly from
              stored price snapshots.
            </p>
            <p className="text-xs font-semibold text-[#E5C98B] pt-1">
              Tape &amp; Tailor is not affiliated with, sponsored by, or endorsed by any of the
              brands listed.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#E5C98B]">
              Non-Commercial &amp; Pricing Notice
            </div>
            <p className="text-xs leading-relaxed text-[#9AA8BA]">
              This site has no affiliate links and earns no revenue. Tape &amp; Tailor does not
              sell clothing—every outbound button links directly to the brand&apos;s own product
              page. Prices and stock are checked periodically and can change at checkout on the
              brand&apos;s site.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#E5C98B]">
              Explore &amp; Policies
            </div>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link href="/kits" className="hover:text-white transition-colors">
                  Interview &amp; Internship Kit Builder
                </Link>
              </li>
              <li>
                <Link href="/calendar" className="hover:text-white transition-colors">
                  Annual Menswear Sale Calendar
                </Link>
              </li>
              <li>
                <Link href="/students" className="hover:text-white transition-colors">
                  Student Discounts Directory
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About Tape &amp; Tailor
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Use &amp; Non-Affiliation Notice
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono text-[11px] text-[#7D8C9F]">
          <span>
            &copy; {new Date().getFullYear()} Tape &amp; Tailor. Brand codes are internal identifiers, not stock quotes. All trademarks belong to their respective owners.
          </span>
          <span>This site has no affiliate links and earns no revenue.</span>
        </div>
      </div>
    </footer>
  );
}
