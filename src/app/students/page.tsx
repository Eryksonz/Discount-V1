import { GraduationCap } from "lucide-react";
import { BRANDS, BRAND_BY_SLUG } from "@config/brands";
import { getSqlClient } from "@/db";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  StudentDiscountsClient,
  type UnverifiedStudentBrand,
  type VerifiedStudentPromo,
} from "@/components/StudentDiscountsClient";

export const dynamic = "force-dynamic";

export default async function StudentDiscountsPage() {
  const sql = getSqlClient();
  const verifiedPromos: VerifiedStudentPromo[] = [];
  const unverifiedMap = new Map<string, UnverifiedStudentBrand>();
  let unclassifiedCount = 0;

  if (sql) {
    const [studentRows, countRows] = await Promise.all([
      sql`
        SELECT id, brand_slug, provider, offer_text, promo_code, terms, source_url, verified, verified_at
        FROM student_promos
        WHERE active = TRUE
        ORDER BY brand_slug ASC
      `,
      sql`
        SELECT count(*) FILTER (WHERE classification_status = 'unclassified')::int AS cnt
        FROM products
      `,
    ]);

    for (const r of studentRows) {
      const slug = String(r.brand_slug);
      const brand = BRAND_BY_SLUG[slug];
      const isVerified = Boolean(r.verified) && Boolean(r.verified_at);

      if (isVerified) {
        verifiedPromos.push({
          id: Number(r.id),
          brandSlug: slug,
          brandName: brand?.name ?? slug,
          brandCode: brand?.code ?? slug.slice(0, 4).toUpperCase(),
          brandUrl: brand?.baseUrl ?? "#",
          ingestionStatus: brand?.ingestionStatus ?? "planned",
          provider: String(r.provider),
          offerText: String(r.offer_text),
          promoCode: r.promo_code ? String(r.promo_code) : null,
          terms: String(r.terms),
          sourceUrl: r.source_url ? String(r.source_url) : null,
          verifiedAt: new Date(String(r.verified_at)).toISOString(),
        });
      } else {
        unverifiedMap.set(`${slug}:${String(r.provider)}`, {
          brandSlug: slug,
          brandName: brand?.name ?? slug,
          brandCode: brand?.code ?? slug.slice(0, 4).toUpperCase(),
          brandUrl: brand?.baseUrl ?? "#",
          ingestionStatus: brand?.ingestionStatus ?? "planned",
          provider: String(r.provider),
        });
      }
    }

    unclassifiedCount = Number(countRows[0]?.cnt ?? 0);
  }

  // Ensure any brand with a configured platform not yet verified appears in the honest "Check the brand's site" section
  const verifiedSlugs = new Set(verifiedPromos.map((p) => p.brandSlug));
  for (const b of BRANDS) {
    if (b.studentDiscount && !verifiedSlugs.has(b.slug)) {
      const key = `${b.slug}:${b.studentDiscount.provider}`;
      if (!unverifiedMap.has(key)) {
        unverifiedMap.set(key, {
          brandSlug: b.slug,
          brandName: b.name,
          brandCode: b.code,
          brandUrl: b.baseUrl,
          ingestionStatus: b.ingestionStatus,
          provider: b.studentDiscount.provider,
        });
      }
    }
  }

  const unverifiedBrands = Array.from(unverifiedMap.values()).sort((a, b) =>
    a.brandName.localeCompare(b.brandName)
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#141A22]">
      <SiteHeader
        source={sql ? "postgres" : "demo-fallback"}
        isDemoData={!sql}
        unclassifiedCount={unclassifiedCount}
        activeNav="students"
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="space-y-2 border-b border-[#E2DCD0] pb-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#7A6338]">
            <GraduationCap className="w-3.5 h-3.5" />
            Verified Campus Offers
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#0F1D32]">
            Student Discounts
          </h1>
          <p className="text-sm text-[#4B5869] max-w-2xl leading-relaxed">
            Only offers manually verified in our database are displayed with discount terms and a
            verification date. Unverified brand programs are listed below as direct pointers to
            check on the brand&apos;s website.
          </p>
        </header>

        <StudentDiscountsClient
          verifiedPromos={verifiedPromos}
          unverifiedBrands={unverifiedBrands}
        />

        <section className="rounded-lg border border-[#E2DCD0] bg-white p-5 text-xs text-[#4B5869] space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#0F1D32]">
            Independence Disclosure
          </div>
          <p>
            Tape &amp; Tailor is not affiliated with, sponsored by, or endorsed by any listed brand
            or student verification service. Always confirm current discount terms directly on the
            retailer&apos;s website.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
