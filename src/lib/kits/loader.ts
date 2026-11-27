import { BRAND_BY_SLUG, FEED_PENDING_BRAND_SLUGS } from "@config/brands";
import { getSqlClient } from "@/db";
import type { KitCandidateProduct } from "./index";

const KIT_CATEGORIES = [
  "suits",
  "blazers-sport-coats",
  "dress-shirts-ocbds",
  "chinos-dress-pants",
  "performance-trousers",
  "quarter-zips-pullovers",
  "shoes-belts",
];

export async function loadKitCandidates(): Promise<{
  candidates: KitCandidateProduct[];
  source: "postgres" | "demo-fallback";
  unclassifiedCount: number;
}> {
  const sql = getSqlClient();
  if (!sql) {
    return { candidates: [], source: "demo-fallback", unclassifiedCount: 0 };
  }

  const pendingSlugs = Array.from(FEED_PENDING_BRAND_SLUGS);
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        id, slug, brand_slug, name, category, subcategory,
        current_price_cents, original_price_cents, median_90d_cents,
        pct_below_median, deal_score, deal_label, in_stock,
        sizes, image_url, product_url
      FROM products
      WHERE classification_status IN ('classified', 'manual')
        AND in_stock = TRUE
        AND category = ANY(${KIT_CATEGORIES}::text[])
        AND NOT (brand_slug = ANY(${pendingSlugs}::text[]))
      ORDER BY deal_score DESC, current_price_cents ASC
    `,
    sql`
      SELECT count(*) FILTER (WHERE classification_status = 'unclassified')::int AS cnt
      FROM products
    `,
  ]);

  const candidates: KitCandidateProduct[] = rows.map((r) => {
    const brandSlug = String(r.brand_slug);
    const brand = BRAND_BY_SLUG[brandSlug];
    return {
      id: String(r.id),
      slug: String(r.slug),
      brandSlug,
      brandName: brand?.name ?? brandSlug,
      brandCode: brand?.code ?? brandSlug.slice(0, 4).toUpperCase(),
      name: String(r.name),
      category: r.category ? String(r.category) : null,
      subcategory: r.subcategory ? String(r.subcategory) : null,
      currentPriceCents: Number(r.current_price_cents),
      originalPriceCents: Number(r.original_price_cents),
      median90dCents: Number(r.median_90d_cents),
      pctBelowMedian: Number(r.pct_below_median),
      dealScore: Number(r.deal_score),
      dealLabel: String(r.deal_label),
      inStock: Boolean(r.in_stock),
      sizes: Array.isArray(r.sizes) ? (r.sizes as string[]) : [],
      imageUrl: r.image_url ? String(r.image_url) : null,
      productUrl: String(r.product_url),
    };
  });

  return {
    candidates,
    source: "postgres",
    unclassifiedCount: Number(countRows[0]?.cnt ?? 0),
  };
}
