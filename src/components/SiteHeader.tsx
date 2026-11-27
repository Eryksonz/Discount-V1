import Link from "next/link";
import { ShieldCheck, Database } from "lucide-react";

interface SiteHeaderProps {
  source: "postgres" | "demo-fallback";
  isDemoData: boolean;
  unclassifiedCount: number;
}

export function SiteHeader({ source, isDemoData, unclassifiedCount }: SiteHeaderProps) {
  return (
    <header className="bg-[#FAF8F3] border-b border-[#E2DCD0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="group flex items-baseline gap-2.5">
              <span className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F1D32]">
                Tape &amp; Tailor
              </span>
              <span className="hidden sm:inline-block h-4 w-px bg-[#B8924A]" />
              <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-[0.18em] text-[#5C6776]">
                Menswear Price Terminal
              </span>
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link
              href="/"
              className="font-semibold text-[#0F1D32] border-b-2 border-[#B8924A] pb-0.5"
            >
              Deal Desk
            </Link>
            <span
              className="text-[#7A8490] cursor-not-allowed flex items-center gap-1"
              title="Arriving in Phase 4"
            >
              Interview Kits
              <span className="font-mono text-[9px] uppercase px-1 py-0.5 rounded bg-[#EFEAE0] text-[#6B7684]">
                P4
              </span>
            </span>
            <span
              className="text-[#7A8490] cursor-not-allowed flex items-center gap-1"
              title="Arriving in Phase 4"
            >
              Sale Calendar
              <span className="font-mono text-[9px] uppercase px-1 py-0.5 rounded bg-[#EFEAE0] text-[#6B7684]">
                P4
              </span>
            </span>
            <Link
              href="/admin"
              className="text-[#3E4C5E] hover:text-[#0F1D32] transition-colors flex items-center gap-1"
            >
              Admin
              {unclassifiedCount > 0 && (
                <span className="font-mono text-[10px] rounded-full bg-[#EFEAE0] px-1.5 py-0.5 text-[#0F1D32]">
                  {unclassifiedCount}
                </span>
              )}
            </Link>
            <a
              href="#methodology"
              className="text-[#3E4C5E] hover:text-[#0F1D32] transition-colors"
            >
              Methodology
            </a>
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[#E2DCD0]">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] border ${
                  source === "postgres" && !isDemoData
                    ? "bg-[#E8F3EC] text-[#14532D] border-[#14532D]/20"
                    : "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/40"
                }`}
              >
                <Database className="w-3 h-3" />
                {source === "postgres"
                  ? isDemoData
                    ? "POSTGRES · DEMO SEED"
                    : "NEON LIVE"
                  : "DEMO MODE"}
              </span>
              {unclassifiedCount > 0 && (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] bg-[#EFEAE0] text-[#5C6776] hover:text-[#0F1D32]"
                  title="Review unclassified products in /admin"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {unclassifiedCount} queued
                </Link>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
