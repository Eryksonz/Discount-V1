import { Briefcase } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { InterviewKitsClient } from "@/components/InterviewKitsClient";
import { loadKitCandidates } from "@/lib/kits/loader";
import { buildInterviewKit } from "@/lib/kits";

export const dynamic = "force-dynamic";

export default async function InterviewKitsPage() {
  const { candidates, source, unclassifiedCount } = await loadKitCandidates();
  const initialKit = buildInterviewKit(candidates, { tierId: "intern" });

  const collectSizes = (cats: string[], subs?: string[]) => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (c.category && cats.includes(c.category)) {
        if (subs && (!c.subcategory || !subs.includes(c.subcategory))) continue;
        for (const s of c.sizes) set.add(s);
      }
    }
    return Array.from(set).sort().slice(0, 40);
  };

  const availableSizes = {
    jacket: collectSizes(["suits", "blazers-sport-coats"]),
    top: collectSizes(["dress-shirts-ocbds", "quarter-zips-pullovers"]),
    bottom: collectSizes(["chinos-dress-pants", "performance-trousers"]),
    shoes: collectSizes(["shoes-belts"], ["Oxford Dress Shoe", "Derby / Monk Strap", "Penny Loafer"]),
    belt: collectSizes(["shoes-belts"], ["Dress Belt"]),
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#141A22]">
      <SiteHeader
        source={source}
        isDemoData={source !== "postgres"}
        unclassifiedCount={unclassifiedCount}
        activeNav="kits"
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="space-y-2 border-b border-[#E2DCD0] pb-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#7A6338]">
            <Briefcase className="w-3.5 h-3.5" />
            Deterministic Bundle Solver
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#0F1D32]">
            Interview &amp; Internship Kits
          </h1>
          <p className="text-sm text-[#4B5869] max-w-2xl leading-relaxed">
            Built purely from live, in-stock catalog snapshots—zero AI or sponsored picks. Our
            solver enforces neutral color palettes, leather &amp; tailoring pairing rules, minimum
            slot formality per tier, max 2 items per brand, and your budget cap. When no compliant
            item exists, the slot stays open rather than relaxing rules.
          </p>
        </header>

        <InterviewKitsClient initialKit={initialKit} availableSizes={availableSizes} />
      </main>

      <SiteFooter />
    </div>
  );
}
