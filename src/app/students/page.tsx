import { GraduationCap } from "lucide-react";
import { BRANDS, BRAND_BY_SLUG } from "@config/brands";
import { getSqlClient } from "@/db";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  StudentDiscountsClient,
  type StudentPromoItem,
} from "@/components/StudentDiscountsClient";

export const dynamic = "force-dynamic";

export default async function StudentDiscountsPage() {
  const sql = getSqlClient();
  let promos: StudentPromoItem[] = [];
  let unclassifiedCount = 0;

  if (sql) {
    const [studentRows, brandPromoRows, countRows] = await Promise.all([
      sql`
        SELECT id, brand_slug, provider, offer_text, promo_code, terms, verified_at
        FROM student_promos
        WHERE active = TRUE
        ORDER BY brand_slug ASC
      `,
      sql`
        SELECT brand_slug, description, code
        FROM brand_promos
        WHERE active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()
      `,
      sql`
        SELECT count(*) FILTER (WHERE classification_status = 'unclassified')::int AS cnt
        FROM products
      `,
    ]);

    const activeCheckoutByBrand = new Map<string, string>();
    for (const bp of brandPromoRows) {
      const slug = String(bp.brand_slug);
      if (!activeCheckoutByBrand.has(slug)) {
        const codeStr = bp.code ? ` (Code: ${String(bp.code)})` : "";
        activeCheckoutByBrand.set(slug, `${String(bp.description)}${codeStr}`);
      }
    }

    promos = studentRows.map((r) => {
      const slug = String(r.brand_slug);
      const brand = BRAND_BY_SLUG[slug];
      return {
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
        verifiedAt: new Date(String(r.verified_at)).toISOString(),
        activeCheckoutPromo: activeCheckoutByBrand.get(slug) ?? null,
      };
    });

    unclassifiedCount = Number(countRows[0]?.cnt ?? 0);
  }

  // Fallback to brand config metadata if table hasn't been seeded yet
  if (promos.length === 0) {
    promos = BRANDS.filter((b) => b.studentDiscount).map((b, idx) => ({
      id: idx + 1,
      brandSlug: b.slug,
      brandName: b.name,
      brandCode: b.code,
      brandUrl: b.baseUrl,
      ingestionStatus: b.ingestionStatus,
      provider: b.studentDiscount!.provider,
      offerText: b.studentDiscount!.offer,
      promoCode: null,
      terms: `Verify active college/university enrollment via ${b.studentDiscount!.provider}. Exclusions and stacking limits are governed by the brand at checkout.`,
      verifiedAt: new Date().toISOString(),
      activeCheckoutPromo: null,
    }));
  }

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
            Verified .edu &amp; Campus Programs
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#0F1D32]">
            Student Discounts Directory
          </h1>
          <p className="text-sm text-[#4B5869] max-w-2xl leading-relaxed">
            Standing student discount programs across our curated menswear brands. Student codes are
            applied directly at checkout via SheerID, Student Beans, or UNiDAYS and are tracked
            separately from our 90-day item price history.
          </p>
        </header>

        <StudentDiscountsClient promos={promos} />

        <section className="rounded-lg border border-[#E2DCD0] bg-white p-5 text-xs text-[#4B5869] space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#0F1D32]">
            Verification &amp; Stacking Note
          </div>
          <p>
            Tape &amp; Tailor is independent and not affiliated with any listed brand or student
            verification service. Always confirm current discount eligibility and final-sale
            stacking rules directly on the retailer&apos;s checkout page.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
