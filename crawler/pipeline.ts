import { eq, desc } from "drizzle-orm";
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
import type { CategorySlug } from "@config/categories";

export interface CrawlRunSummary {
  brandSlug: string;
  mode: "baseline" | "high-frequency" | "manual";
  status: "completed" | "failed" | "circuit_open";
  methodUsed: string | null;
  durationMs: number;
  productsSeen: number;
  newProducts: number;
  priceChanges: number;
  quarantinedCount: number;
  unclassifiedCount: number;
  errorsCount: number;
  catalogDropAlertTriggered: boolean;
  dropPctVsPreviousRun: number | null;
}

/** Pure helper determining whether a new price_snapshots row must be appended */
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

/** Pure helper checking >30% parsed product count drop vs prior completed run */
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

  const http = new PoliteHttpClient({ defaultRateLimitMs: brandConfig.crawler.rateLimitMs });

  if (params.dryRun || !dbUrl) {
    const res = await adapter.crawl({
      brand: brandConfig,
      http,
      maxProducts: params.maxProducts ?? 40,
    });
    let unclassifiedCount = 0;
    for (const p of res.products) {
      const c = classifyProduct({
        title: p.name,
        breadcrumb: p.rawBreadcrumb,
        brandSlug: brandConfig.slug,
        colors: p.colors,
        sizes: p.sizes,
      });
      if (c.status === "unclassified") unclassifiedCount += 1;
    }
    return {
      brandSlug: brandConfig.slug,
      mode: params.mode,
      status: res.circuitTripped ? "circuit_open" : res.products.length > 0 ? "completed" : "failed",
      methodUsed: res.methodUsed,
      durationMs: Date.now() - startedAt.getTime(),
      productsSeen: res.products.length,
      newProducts: res.products.length,
      priceChanges: res.products.length,
      quarantinedCount: 0,
      unclassifiedCount,
      errorsCount: res.errors.length,
      catalogDropAlertTriggered: false,
      dropPctVsPreviousRun: null,
    };
  }

  const client = postgres(dbUrl, { max: 2 });
  const db = drizzle(client, { schema });

  try {
    // Ensure brand exists in Postgres
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
        newProducts: 0,
        priceChanges: 0,
        quarantinedCount: 0,
        unclassifiedCount: 0,
        errorsCount: 1,
        catalogDropAlertTriggered: false,
        dropPctVsPreviousRun: null,
      };
    }

    // Load custom admin rules
    const customRuleRows = await db.select().from(schema.customClassificationRules);
    const customRules: CustomRuleDefinition[] = customRuleRows.map((r) => ({
      ruleId: r.ruleId,
      category: r.category as CategorySlug,
      subcategory: r.subcategory,
      keywords: r.keywords ?? [],
      regexPattern: r.regexPattern,
      brandSlug: r.brandSlug,
      priority: r.priority,
    }));

    // Load prior completed run for >30% drop anomaly check
    const [prevRun] = await db
      .select()
      .from(schema.crawlRuns)
      .where(eq(schema.crawlRuns.brandId, brandRow.id))
      .orderBy(desc(schema.crawlRuns.startedAt))
      .limit(1);

    // Execute adapter
    const crawlRes = await adapter.crawl({
      brand: brandConfig,
      http,
      maxProducts: params.maxProducts ?? 80,
    });

    let newProducts = 0;
    let priceChanges = 0;
    let quarantinedCount = 0;
    let unclassifiedCount = 0;
    const now = new Date();

    for (const raw of crawlRes.products) {
      // Strictly validate outbound URL against brand host allowlist before storing
      const validatedUrl = validateAndBuildOutboundUrl(brandConfig.slug, raw.productUrl);
      if (!validatedUrl.ok) {
        quarantinedCount += 1;
        await db.insert(schema.flaggedUpdates).values({
          brandSlug: brandConfig.slug,
          externalId: raw.externalId,
          reason: `URL failed allowlist check: ${validatedUrl.reason}`,
          payload: raw as unknown as Record<string, unknown>,
        });
        continue;
      }

      const productId = `${brandConfig.slug}-${raw.externalId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const [existing] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .limit(1);

      // Deterministic sanity check gate
      const sanity = validatePriceUpdate({
        newPriceCents: raw.currentPriceCents,
        originalPriceCents: raw.originalPriceCents,
        previousPriceCents: existing?.currentPriceCents ?? null,
      });

      if (!sanity.valid) {
        quarantinedCount += 1;
        await db.insert(schema.flaggedUpdates).values({
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
      if (classified.status === "unclassified") {
        unclassifiedCount += 1;
      }

      // Preserve manual admin overrides if previously classified manually
      const keepManual = existing?.classificationStatus === "manual";
      const finalCategory = keepManual ? existing.category : classified.category;
      const finalSubcategory = keepManual ? existing.subcategory : classified.subcategory;
      const finalStatus = keepManual ? "manual" : classified.status;
      const finalMatchedRuleId = keepManual ? existing.matchedRuleId : classified.matchedRuleId;

      // Load existing snapshot history
      const existingSnapshots = existing
        ? await db
            .select()
            .from(schema.priceSnapshots)
            .where(eq(schema.priceSnapshots.productId, productId))
            .orderBy(schema.priceSnapshots.capturedAt)
        : [];

      const latestSnap = existingSnapshots[existingSnapshots.length - 1];
      const changed = shouldAppendSnapshot(latestSnap, {
        priceCents: raw.currentPriceCents,
        originalPriceCents: raw.originalPriceCents,
        inStock: raw.inStock,
      });

      const allSnapshots: PriceSnapshotPoint[] = existingSnapshots.map((s) => ({
        priceCents: s.priceCents,
        originalPriceCents: s.originalPriceCents,
        inStock: s.inStock,
        capturedAt: s.capturedAt,
      }));

      if (changed) {
        allSnapshots.push({
          priceCents: raw.currentPriceCents,
          originalPriceCents: raw.originalPriceCents,
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

      const slug = existing?.slug ?? `${brandConfig.slug}-${slugify(raw.name)}-${raw.externalId}`.slice(0, 120);

      await db
        .insert(schema.products)
        .values({
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
        })
        .onConflictDoUpdate({
          target: schema.products.id,
          set: {
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
            productUrl: raw.productUrl,
            affiliateUrl: validatedUrl.isAffiliate ? validatedUrl.url : null,
            imageUrl: raw.imageUrl,
            inStock: raw.inStock,
            dataNote: evaluation.dataNote,
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
          },
        });

      if (!existing) {
        newProducts += 1;
      }

      if (changed) {
        priceChanges += 1;
        await db.insert(schema.priceSnapshots).values({
          productId,
          priceCents: raw.currentPriceCents,
          originalPriceCents: raw.originalPriceCents,
          inStock: raw.inStock,
          capturedAt: now,
        });
      }
    }

    // Update brand health / circuit-breaker state
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

    // Log crawl run telemetry
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

    // Check >30% product count drop vs prior run
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

    const summary: CrawlRunSummary = {
      brandSlug: brandConfig.slug,
      mode: params.mode,
      status,
      methodUsed: crawlRes.methodUsed,
      durationMs,
      productsSeen: crawlRes.products.length,
      newProducts,
      priceChanges,
      quarantinedCount,
      unclassifiedCount,
      errorsCount: crawlRes.errors.length,
      catalogDropAlertTriggered: anomaly.anomalous,
      dropPctVsPreviousRun: anomaly.dropPct,
    };

    // Archive structured crawl summary in Neon Object Storage if configured
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
