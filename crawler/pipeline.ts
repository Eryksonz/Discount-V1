import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Resend } from "resend";
import { BRAND_BY_SLUG, validateAndBuildOutboundUrl } from "@config/brands";
import { SANITY_CHECK_LIMITS } from "@config/deal-thresholds";
import * as schema from "@/db/schema";
import { classifyProduct, type CustomRuleDefinition } from "@/lib/classify";
import { evaluateProductDeal, validatePriceUpdate, type PriceSnapshotPoint } from "@/lib/deals";
import { uploadCrawlReport } from "@/lib/neon/storage";
import { getBrandAdapter } from "./adapters";
import { PoliteHttpClient } from "./http-client";
import type { AllCategorySlug } from "@config/categories";

export interface CrawlRunSummary {
  brandSlug: string;
  mode: "baseline" | "high-frequency" | "manual";
  status: "completed" | "failed" | "circuit_open";
  methodUsed: string | null;
  durationMs: number;
  productsSeen: number;
  expectedMinProducts: number | null;
  newProducts: number;
  priceChanges: number;
  quarantinedCount: number;
  classifiedCount: number;
  outOfScopeCount: number;
  unclassifiedCount: number;
  errorsCount: number;
  catalogDropAlertTriggered: boolean;
  dropPctVsPreviousRun: number | null;
}

export function shouldAppendSnapshot(
  latest: { priceCents: number; originalPriceCents: number; inStock: boolean } | null | undefined,
  incoming: { priceCents: number; originalPriceCents: number; inStock: boolean }
): boolean {
  if (!latest) return true;
  return (
    latest.priceCents !== incoming.priceCents ||
    latest.originalPriceCents !== incoming.originalPriceCents ||
    latest.inStock !== incoming.inStock
  );
}

export function detectCatalogDropAnomaly(
  previousProductsSeen: number | null | undefined,
  currentProductsSeen: number
): { anomalous: boolean; dropPct: number | null } {
  if (!previousProductsSeen || previousProductsSeen <= 0) {
    return { anomalous: false, dropPct: null };
  }
  const dropPct = ((previousProductsSeen - currentProductsSeen) / previousProductsSeen) * 100;
  return {
    anomalous: dropPct > SANITY_CHECK_LIMITS.maxBrandCatalogDropPct,
    dropPct: Math.round(dropPct * 10) / 10,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sendAdminDropAlert(params: {
  brandName: string;
  brandSlug: string;
  previousCount: number;
  currentCount: number;
  dropPct: number;
}): Promise<void> {
  const message = `[ALERT] ${params.brandName} (${params.brandSlug}) parsed product count dropped ${params.dropPct}% (${params.previousCount} -> ${params.currentCount}). Site markup or endpoint may have changed.`;
  console.error(message);

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_ALERT_EMAIL;
  const from = process.env.ALERT_FROM_EMAIL ?? "alerts@tapeandtailor.example.com";
  if (!apiKey || !to) return;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to,
      subject: `[Tape & Tailor] Crawler drop alert: ${params.brandName} (-${params.dropPct}%)`,
      text: `${message}\n\nCheck crawl_runs in /admin and verify crawler fixtures for ${params.brandSlug}.`,
    });
  } catch (err) {
    console.error("[Crawler] Failed to send admin drop alert email via Resend:", err);
  }
}

export async function runBrandCrawl(params: {
  brandSlug: string;
  mode: "baseline" | "high-frequency" | "manual";
  maxProducts?: number;
  dryRun?: boolean;
}): Promise<CrawlRunSummary> {
  const startedAt = new Date();
  const brandConfig = BRAND_BY_SLUG[params.brandSlug];
  if (!brandConfig) {
    throw new Error(`Unknown brand slug: ${params.brandSlug}`);
  }
  const adapter = getBrandAdapter(params.brandSlug);
  if (!adapter) {
    throw new Error(`No adapter registered for brand: ${params.brandSlug}`);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && !params.dryRun) {
    throw new Error("DATABASE_URL is required to persist crawler runs (or pass --dry-run).");
  }

  const safetyCap =
    params.maxProducts ?? brandConfig.crawler.maxProductsSafetyCap ?? 5000;
  const expectedMin = brandConfig.crawler.expectedMinProducts ?? null;
  const http = new PoliteHttpClient({ defaultRateLimitMs: brandConfig.crawler.rateLimitMs });

  if (params.dryRun || !dbUrl) {
    const res = await adapter.crawl({
      brand: brandConfig,
      http,
      maxProducts: safetyCap,
    });
    let classifiedCount = 0;
    let outOfScopeCount = 0;
    let unclassifiedCount = 0;
    for (const p of res.products) {
      const c = classifyProduct({
        title: p.name,
        breadcrumb: p.rawBreadcrumb,
        brandSlug: brandConfig.slug,
        colors: p.colors,
        sizes: p.sizes,
      });
      if (c.status === "classified") classifiedCount += 1;
      else if (c.status === "out_of_scope") outOfScopeCount += 1;
      else unclassifiedCount += 1;
    }
    return {
      brandSlug: brandConfig.slug,
      mode: params.mode,
      status: res.circuitTripped ? "circuit_open" : res.products.length > 0 ? "completed" : "failed",
      methodUsed: res.methodUsed,
      durationMs: Date.now() - startedAt.getTime(),
      productsSeen: res.products.length,
      expectedMinProducts: expectedMin,
      newProducts: res.products.length,
      priceChanges: res.products.length,
      quarantinedCount: 0,
      classifiedCount,
      outOfScopeCount,
      unclassifiedCount,
      errorsCount: res.errors.length,
      catalogDropAlertTriggered: false,
      dropPctVsPreviousRun: null,
    };
  }

  const client = postgres(dbUrl, { max: 3 });
  const db = drizzle(client, { schema });

  try {
    // Ensure brand exists
    const [brandRow] = await db
      .insert(schema.brands)
      .values({
        slug: brandConfig.slug,
        name: brandConfig.name,
        brandCode: brandConfig.code,
        domain: brandConfig.domain,
        baseUrl: brandConfig.baseUrl,
        priceTier: brandConfig.priceTier,
        swatchHex: brandConfig.swatchHex,
        affiliateNetwork: brandConfig.affiliate.network,
        affiliateUrlTemplate: brandConfig.affiliate.urlTemplate ?? null,
        affiliateActive: brandConfig.affiliate.active,
        rateLimitMs: brandConfig.crawler.rateLimitMs,
      })
      .onConflictDoUpdate({
        target: schema.brands.slug,
        set: {
          name: brandConfig.name,
          brandCode: brandConfig.code,
          domain: brandConfig.domain,
          baseUrl: brandConfig.baseUrl,
        },
      })
      .returning();

    if (brandRow.circuitState === "disabled" && params.mode !== "manual") {
      return {
        brandSlug: brandConfig.slug,
        mode: params.mode,
        status: "circuit_open",
        methodUsed: null,
        durationMs: Date.now() - startedAt.getTime(),
        productsSeen: 0,
        expectedMinProducts: expectedMin,
        newProducts: 0,
        priceChanges: 0,
        quarantinedCount: 0,
        classifiedCount: 0,
        outOfScopeCount: 0,
        unclassifiedCount: 0,
        errorsCount: 1,
        catalogDropAlertTriggered: false,
        dropPctVsPreviousRun: null,
      };
    }

    // Batch-load custom rules, prior run, existing products, and existing snapshots in 4 single queries
    const [customRuleRows, prevRuns, existingProductRows, existingSnapshotRows] =
      await Promise.all([
        db.select().from(schema.customClassificationRules),
        db
          .select()
          .from(schema.crawlRuns)
          .where(eq(schema.crawlRuns.brandId, brandRow.id))
          .orderBy(desc(schema.crawlRuns.startedAt))
          .limit(1),
        db
          .select()
          .from(schema.products)
          .where(eq(schema.products.brandId, brandRow.id)),
        db
          .select({
            productId: schema.priceSnapshots.productId,
            priceCents: schema.priceSnapshots.priceCents,
            originalPriceCents: schema.priceSnapshots.originalPriceCents,
            inStock: schema.priceSnapshots.inStock,
            capturedAt: schema.priceSnapshots.capturedAt,
          })
          .from(schema.priceSnapshots)
          .innerJoin(schema.products, eq(schema.priceSnapshots.productId, schema.products.id))
          .where(eq(schema.products.brandId, brandRow.id))
          .orderBy(schema.priceSnapshots.capturedAt),
      ]);

    const prevRun = prevRuns[0];
    const customRules: CustomRuleDefinition[] = customRuleRows.map((r) => ({
      ruleId: r.ruleId,
      category: r.category as AllCategorySlug,
      subcategory: r.subcategory,
      keywords: r.keywords ?? [],
      regexPattern: r.regexPattern,
      brandSlug: r.brandSlug,
      priority: r.priority,
    }));

    const existingById = new Map(existingProductRows.map((p) => [p.id, p]));
    const snapshotsByProductId = new Map<string, PriceSnapshotPoint[]>();
    for (const s of existingSnapshotRows) {
      const list = snapshotsByProductId.get(s.productId) ?? [];
      list.push({
        priceCents: s.priceCents,
        originalPriceCents: s.originalPriceCents,
        inStock: s.inStock,
        capturedAt: s.capturedAt,
      });
      snapshotsByProductId.set(s.productId, list);
    }

    // Execute polite full-catalog adapter
    const crawlRes = await adapter.crawl({
      brand: brandConfig,
      http,
      maxProducts: safetyCap,
    });

    let newProducts = 0;
    let priceChanges = 0;
    let quarantinedCount = 0;
    let classifiedCount = 0;
    let outOfScopeCount = 0;
    let unclassifiedCount = 0;
    const now = new Date();

    const productsToUpsert: Array<typeof schema.products.$inferInsert> = [];
    const snapshotsToInsert: Array<typeof schema.priceSnapshots.$inferInsert> = [];
    const flaggedToInsert: Array<typeof schema.flaggedUpdates.$inferInsert> = [];

    for (const raw of crawlRes.products) {
      const validatedUrl = validateAndBuildOutboundUrl(brandConfig.slug, raw.productUrl);
      if (!validatedUrl.ok) {
        quarantinedCount += 1;
        flaggedToInsert.push({
          brandSlug: brandConfig.slug,
          externalId: raw.externalId,
          reason: `URL failed allowlist check: ${validatedUrl.reason}`,
          payload: raw as unknown as Record<string, unknown>,
        });
        continue;
      }

      const productId = `${brandConfig.slug}-${raw.externalId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const existing = existingById.get(productId);

      const sanity = validatePriceUpdate({
        newPriceCents: raw.currentPriceCents,
        originalPriceCents: raw.originalPriceCents,
        previousPriceCents: existing?.currentPriceCents ?? null,
      });

      if (!sanity.valid) {
        quarantinedCount += 1;
        flaggedToInsert.push({
          brandSlug: brandConfig.slug,
          productId: existing?.id ?? null,
          externalId: raw.externalId,
          reason: sanity.reason ?? "Failed price sanity check",
          payload: raw as unknown as Record<string, unknown>,
        });
        continue;
      }

      const classified = classifyProduct(
        {
          title: raw.name,
          breadcrumb: raw.rawBreadcrumb,
          brandSlug: brandConfig.slug,
          colors: raw.colors,
          sizes: raw.sizes,
        },
        customRules
      );

      const keepManual = existing?.classificationStatus === "manual";
      const finalCategory = keepManual ? existing.category : classified.category;
      const finalSubcategory = keepManual ? existing.subcategory : classified.subcategory;
      const finalStatus = keepManual ? "manual" : classified.status;
      const finalMatchedRuleId = keepManual ? existing.matchedRuleId : classified.matchedRuleId;

      if (finalStatus === "classified" || finalStatus === "manual") classifiedCount += 1;
      else if (finalStatus === "out_of_scope") outOfScopeCount += 1;
      else unclassifiedCount += 1;

      const existingSnaps = snapshotsByProductId.get(productId) ?? [];
      const latestSnap = existingSnaps[existingSnaps.length - 1];
      const changed = shouldAppendSnapshot(latestSnap, {
        priceCents: raw.currentPriceCents,
        originalPriceCents: raw.originalPriceCents,
        inStock: raw.inStock,
      });

      const allSnapshots: PriceSnapshotPoint[] = [...existingSnaps];
      if (changed) {
        allSnapshots.push({
          priceCents: raw.currentPriceCents,
          originalPriceCents: raw.originalPriceCents,
          inStock: raw.inStock,
          capturedAt: now,
        });
        priceChanges += 1;
        const compareAtGapPct =
          raw.originalPriceCents > 0 && raw.originalPriceCents >= raw.currentPriceCents
            ? Math.round(
                ((raw.originalPriceCents - raw.currentPriceCents) / raw.originalPriceCents) *
                  10000
              ) / 100
            : null;
        snapshotsToInsert.push({
          productId,
          priceCents: raw.currentPriceCents,
          originalPriceCents: raw.originalPriceCents,
          compareAtGapPct,
          inStock: raw.inStock,
          capturedAt: now,
        });
      }

      const evaluation = evaluateProductDeal({
        currentPriceCents: raw.currentPriceCents,
        originalPriceCents: raw.originalPriceCents,
        inStock: raw.inStock,
        availableSizesCount: classified.normalizedSizes.length,
        snapshots: allSnapshots,
        asOf: now,
      });

      if (!existing) newProducts += 1;

      const slug =
        existing?.slug ??
        `${brandConfig.slug}-${slugify(raw.name)}-${raw.externalId}`.slice(0, 120);

      productsToUpsert.push({
        id: productId,
        brandId: brandRow.id,
        brandSlug: brandConfig.slug,
        externalId: raw.externalId,
        slug,
        name: raw.name,
        rawBreadcrumb: raw.rawBreadcrumb,
        dataSource: "crawler",
        category: finalCategory,
        subcategory: finalSubcategory,
        occasions: classified.occasions,
        colors: classified.normalizedColors,
        sizes: classified.normalizedSizes,
        matchedRuleId: finalMatchedRuleId,
        classificationStatus: finalStatus,
        currentPriceCents: evaluation.currentPriceCents,
        originalPriceCents: evaluation.originalPriceCents,
        currency: raw.currency,
        productUrl: raw.productUrl,
        affiliateUrl: validatedUrl.isAffiliate ? validatedUrl.url : null,
        imageUrl: raw.imageUrl,
        inStock: raw.inStock,
        dataNote: evaluation.dataNote,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        lastCheckedAt: now,
        median30dCents: evaluation.median30dCents,
        median90dCents: evaluation.median90dCents,
        low90dCents: evaluation.low90dCents,
        allTimeLowCents: evaluation.allTimeLowCents,
        timesAtOrBelowCurrent: evaluation.timesAtOrBelowCurrent,
        lastPriceChangeCents: evaluation.lastPriceChangeCents,
        lastPriceChangeAt: evaluation.lastPriceChangeAt,
        pctBelowMedian: evaluation.pctBelowMedian,
        pctBelowOriginal: evaluation.pctBelowOriginal,
        historyDays: evaluation.historyDays,
        dealLabel: evaluation.dealLabel,
        dealScore: evaluation.dealScore,
        dealScoreBreakdown: evaluation.dealScoreBreakdown,
        dealBlurb: evaluation.dealBlurb,
      });
    }

    // Bulk upsert products in chunks of 100
    for (const batch of chunkArray(productsToUpsert, 100)) {
      await db
        .insert(schema.products)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.products.id,
          set: {
            name: drizzleSql`excluded.name`,
            rawBreadcrumb: drizzleSql`excluded.raw_breadcrumb`,
            dataSource: drizzleSql`excluded.data_source`,
            category: drizzleSql`excluded.category`,
            subcategory: drizzleSql`excluded.subcategory`,
            occasions: drizzleSql`excluded.occasions`,
            colors: drizzleSql`excluded.colors`,
            sizes: drizzleSql`excluded.sizes`,
            matchedRuleId: drizzleSql`excluded.matched_rule_id`,
            classificationStatus: drizzleSql`excluded.classification_status`,
            currentPriceCents: drizzleSql`excluded.current_price_cents`,
            originalPriceCents: drizzleSql`excluded.original_price_cents`,
            productUrl: drizzleSql`excluded.product_url`,
            affiliateUrl: drizzleSql`excluded.affiliate_url`,
            imageUrl: drizzleSql`excluded.image_url`,
            inStock: drizzleSql`excluded.in_stock`,
            dataNote: drizzleSql`excluded.data_note`,
            lastSeenAt: drizzleSql`excluded.last_seen_at`,
            lastCheckedAt: drizzleSql`excluded.last_checked_at`,
            median30dCents: drizzleSql`excluded.median_30d_cents`,
            median90dCents: drizzleSql`excluded.median_90d_cents`,
            low90dCents: drizzleSql`excluded.low_90d_cents`,
            allTimeLowCents: drizzleSql`excluded.all_time_low_cents`,
            timesAtOrBelowCurrent: drizzleSql`excluded.times_at_or_below_current`,
            lastPriceChangeCents: drizzleSql`excluded.last_price_change_cents`,
            lastPriceChangeAt: drizzleSql`excluded.last_price_change_at`,
            pctBelowMedian: drizzleSql`excluded.pct_below_median`,
            pctBelowOriginal: drizzleSql`excluded.pct_below_original`,
            historyDays: drizzleSql`excluded.history_days`,
            dealLabel: drizzleSql`excluded.deal_label`,
            dealScore: drizzleSql`excluded.deal_score`,
            dealScoreBreakdown: drizzleSql`excluded.deal_score_breakdown`,
            dealBlurb: drizzleSql`excluded.deal_blurb`,
          },
        });
    }

    // Bulk insert changed snapshots in chunks of 200
    for (const batch of chunkArray(snapshotsToInsert, 200)) {
      await db.insert(schema.priceSnapshots).values(batch);
    }

    // Bulk insert quarantined updates
    for (const batch of chunkArray(flaggedToInsert, 100)) {
      await db.insert(schema.flaggedUpdates).values(batch);
    }

    const nextCircuitState = crawlRes.circuitTripped ? "disabled" : "active";
    const nextErrors = crawlRes.circuitTripped ? brandRow.consecutiveErrors + 1 : 0;
    await db
      .update(schema.brands)
      .set({
        circuitState: nextCircuitState,
        consecutiveErrors: nextErrors,
        lastCrawledAt: now,
      })
      .where(eq(schema.brands.id, brandRow.id));

    const durationMs = Date.now() - startedAt.getTime();
    const status = crawlRes.circuitTripped
      ? "circuit_open"
      : crawlRes.products.length > 0
        ? "completed"
        : "failed";

    await db.insert(schema.crawlRuns).values({
      brandId: brandRow.id,
      mode: params.mode,
      status,
      startedAt,
      finishedAt: new Date(),
      durationMs,
      productsSeen: crawlRes.products.length,
      priceChanges,
      newProducts,
      quarantinedCount,
      errorsCount: crawlRes.errors.length,
      errorSummary: crawlRes.errors.length > 0 ? crawlRes.errors.slice(0, 5).join(" | ") : null,
    });

    const anomaly = detectCatalogDropAnomaly(prevRun?.productsSeen, crawlRes.products.length);
    if (anomaly.anomalous && anomaly.dropPct !== null) {
      await sendAdminDropAlert({
        brandName: brandConfig.name,
        brandSlug: brandConfig.slug,
        previousCount: prevRun!.productsSeen,
        currentCount: crawlRes.products.length,
        dropPct: anomaly.dropPct,
      });
    }

    if (expectedMin !== null && crawlRes.products.length < expectedMin) {
      console.warn(
        `[Crawler] Coverage warning for ${brandConfig.slug}: found ${crawlRes.products.length} products vs expected minimum ${expectedMin}.`
      );
    }

    const summary: CrawlRunSummary = {
      brandSlug: brandConfig.slug,
      mode: params.mode,
      status,
      methodUsed: crawlRes.methodUsed,
      durationMs,
      productsSeen: crawlRes.products.length,
      expectedMinProducts: expectedMin,
      newProducts,
      priceChanges,
      quarantinedCount,
      classifiedCount,
      outOfScopeCount,
      unclassifiedCount,
      errorsCount: crawlRes.errors.length,
      catalogDropAlertTriggered: anomaly.anomalous,
      dropPctVsPreviousRun: anomaly.dropPct,
    };

    await uploadCrawlReport(
      `crawl-runs/${brandConfig.slug}/${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
      summary as unknown as Record<string, unknown>
    ).catch((err) => {
      console.warn("[Crawler] Object storage report upload skipped:", (err as Error).message);
    });

    return summary;
  } finally {
    await client.end();
  }
}
