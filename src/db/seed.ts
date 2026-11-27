import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { BRANDS } from "@config/brands";
import * as schema from "./schema";
import { generateSeedCatalog } from "./seed-data";

config({ path: ".env.local" });
config({ path: ".env" });

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Configure .env / .env.local before running db:seed.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  console.log(`Seeding ${BRANDS.length} curated brands...`);
  const brandIdBySlug = new Map<string, number>();

  for (const brand of BRANDS) {
    const [row] = await db
      .insert(schema.brands)
      .values({
        slug: brand.slug,
        name: brand.name,
        brandCode: brand.code,
        domain: brand.domain,
        baseUrl: brand.baseUrl,
        priceTier: brand.priceTier,
        swatchHex: brand.swatchHex,
        affiliateNetwork: brand.affiliate.network,
        affiliateUrlTemplate: brand.affiliate.urlTemplate ?? null,
        affiliateActive: brand.affiliate.active,
        rateLimitMs: brand.crawler.rateLimitMs,
        lastCrawledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.brands.slug,
        set: {
          name: brand.name,
          brandCode: brand.code,
          domain: brand.domain,
          baseUrl: brand.baseUrl,
          priceTier: brand.priceTier,
          swatchHex: brand.swatchHex,
          rateLimitMs: brand.crawler.rateLimitMs,
        },
      })
      .returning({ id: schema.brands.id, slug: schema.brands.slug });

    brandIdBySlug.set(row.slug, row.id);
  }

  const catalog = generateSeedCatalog(new Date());
  console.log(`Seeding ${catalog.length} demo products + 90-day price snapshots...`);

  for (const item of catalog) {
    const brandId = brandIdBySlug.get(item.brandSlug);
    if (!brandId) continue;

    await db
      .insert(schema.products)
      .values({
        id: item.id,
        brandId,
        brandSlug: item.brandSlug,
        externalId: item.externalId,
        slug: item.slug,
        name: item.name,
        rawBreadcrumb: item.rawBreadcrumb,
        dataSource: "demo",
        category: item.category,
        subcategory: item.subcategory,
        occasions: item.occasions,
        colors: item.colors,
        sizes: item.sizes,
        matchedRuleId: item.matchedRuleId,
        classificationStatus: item.classificationStatus,
        currentPriceCents: item.currentPriceCents,
        originalPriceCents: item.originalPriceCents,
        currency: item.currency,
        productUrl: item.productUrl,
        affiliateUrl: item.affiliateUrl,
        imageUrl: item.imageUrl,
        inStock: item.inStock,
        dataNote: item.dataNote,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        lastCheckedAt: item.lastCheckedAt,
        median30dCents: item.median30dCents,
        median90dCents: item.median90dCents,
        low90dCents: item.low90dCents,
        allTimeLowCents: item.allTimeLowCents,
        timesAtOrBelowCurrent: item.timesAtOrBelowCurrent,
        lastPriceChangeCents: item.lastPriceChangeCents,
        lastPriceChangeAt: item.lastPriceChangeAt,
        pctBelowMedian: item.pctBelowMedian,
        pctBelowOriginal: item.pctBelowOriginal,
        historyDays: item.historyDays,
        dealLabel: item.dealLabel,
        dealScore: item.dealScore,
        dealScoreBreakdown: item.dealScoreBreakdown,
        dealBlurb: item.dealBlurb,
      })
      .onConflictDoUpdate({
        target: schema.products.id,
        set: {
          dataSource: "demo",
          currentPriceCents: item.currentPriceCents,
          originalPriceCents: item.originalPriceCents,
          inStock: item.inStock,
          dataNote: item.dataNote,
          lastCheckedAt: item.lastCheckedAt,
          median30dCents: item.median30dCents,
          median90dCents: item.median90dCents,
          low90dCents: item.low90dCents,
          allTimeLowCents: item.allTimeLowCents,
          pctBelowMedian: item.pctBelowMedian,
          pctBelowOriginal: item.pctBelowOriginal,
          historyDays: item.historyDays,
          dealLabel: item.dealLabel,
          dealScore: item.dealScore,
          dealScoreBreakdown: item.dealScoreBreakdown,
          dealBlurb: item.dealBlurb,
        },
      });

    await db.delete(schema.priceSnapshots).where(eq(schema.priceSnapshots.productId, item.id));
    if (item.snapshots.length > 0) {
      await db.insert(schema.priceSnapshots).values(
        item.snapshots.map((snap) => ({
          productId: item.id,
          priceCents: snap.priceCents,
          originalPriceCents: snap.originalPriceCents,
          inStock: snap.inStock,
          capturedAt: snap.capturedAt,
        }))
      );
    }
  }

  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
