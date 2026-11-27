import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { CATEGORY_BY_SLUG, OUT_OF_SCOPE_CATEGORY, type AllCategorySlug } from "@config/categories";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { classifyProduct, type CustomRuleDefinition } from "@/lib/classify";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured. Connect Neon Postgres to use /admin queues." },
      { status: 503 }
    );
  }

  const [unclassified, outOfScope, flagged, runs, brandRows, customRules, clickCountRows] =
    await Promise.all([
      db
        .select()
        .from(schema.products)
        .where(eq(schema.products.classificationStatus, "unclassified"))
        .orderBy(desc(schema.products.lastCheckedAt))
        .limit(100),
      db
        .select()
        .from(schema.products)
        .where(eq(schema.products.classificationStatus, "out_of_scope"))
        .orderBy(desc(schema.products.lastCheckedAt))
        .limit(100),
      db
        .select()
        .from(schema.flaggedUpdates)
        .where(eq(schema.flaggedUpdates.status, "pending"))
        .orderBy(desc(schema.flaggedUpdates.createdAt))
        .limit(100),
      db
        .select({
          id: schema.crawlRuns.id,
          brandId: schema.crawlRuns.brandId,
          mode: schema.crawlRuns.mode,
          status: schema.crawlRuns.status,
          startedAt: schema.crawlRuns.startedAt,
          durationMs: schema.crawlRuns.durationMs,
          productsSeen: schema.crawlRuns.productsSeen,
          priceChanges: schema.crawlRuns.priceChanges,
          newProducts: schema.crawlRuns.newProducts,
          quarantinedCount: schema.crawlRuns.quarantinedCount,
          errorsCount: schema.crawlRuns.errorsCount,
          errorSummary: schema.crawlRuns.errorSummary,
        })
        .from(schema.crawlRuns)
        .orderBy(desc(schema.crawlRuns.startedAt))
        .limit(30),
      db.select().from(schema.brands).orderBy(schema.brands.name),
      db
        .select()
        .from(schema.customClassificationRules)
        .orderBy(desc(schema.customClassificationRules.createdAt)),
      db.select({ id: schema.outboundClicks.id }).from(schema.outboundClicks).limit(1000),
    ]);

  const brandNameById = Object.fromEntries(brandRows.map((b) => [b.id, b.name]));

  return NextResponse.json({
    unclassified,
    outOfScope,
    flagged,
    crawlRuns: runs.map((r) => ({ ...r, brandName: brandNameById[r.brandId] ?? `#${r.brandId}` })),
    brands: brandRows,
    customRules,
    outboundClicksSampled: clickCountRows.length,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "classify") {
    const productId = String(body.productId ?? "");
    const category = String(body.category ?? "") as AllCategorySlug;
    const subcategory = String(body.subcategory ?? "").trim();
    const createRule = Boolean(body.createRule);
    const ruleKeywordsRaw = String(body.ruleKeywords ?? "");

    const isValidCat = category === OUT_OF_SCOPE_CATEGORY || Boolean(CATEGORY_BY_SLUG[category]);
    if (!productId || !isValidCat || !subcategory) {
      return NextResponse.json(
        { error: "Valid productId, category, and subcategory are required." },
        { status: 400 }
      );
    }

    let createdRuleId: string | null = null;
    if (createRule && ruleKeywordsRaw.trim()) {
      const keywords = ruleKeywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length > 0) {
        createdRuleId = `custom-${category}-${Date.now()}`;
        await db.insert(schema.customClassificationRules).values({
          ruleId: createdRuleId,
          category,
          subcategory,
          keywords,
          priority: 0,
        });
      }
    }

    const nextStatus = category === OUT_OF_SCOPE_CATEGORY ? "out_of_scope" : "manual";
    await db
      .update(schema.products)
      .set({
        category,
        subcategory,
        classificationStatus: nextStatus,
        matchedRuleId: createdRuleId ?? "manual-admin",
      })
      .where(eq(schema.products.id, productId));

    let reclassifiedCount = 0;
    if (createdRuleId) {
      const allCustom = await db.select().from(schema.customClassificationRules);
      const customDefs: CustomRuleDefinition[] = allCustom.map((r) => ({
        ruleId: r.ruleId,
        category: r.category as AllCategorySlug,
        subcategory: r.subcategory,
        keywords: r.keywords ?? [],
        regexPattern: r.regexPattern,
        brandSlug: r.brandSlug,
        priority: r.priority,
      }));
      const remaining = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.classificationStatus, "unclassified"));
      for (const item of remaining) {
        const res = classifyProduct(
          {
            title: item.name,
            breadcrumb: item.rawBreadcrumb,
            brandSlug: item.brandSlug,
            colors: item.colors,
            sizes: item.sizes,
          },
          customDefs
        );
        if (res.status !== "unclassified") {
          reclassifiedCount += 1;
          await db
            .update(schema.products)
            .set({
              category: res.category,
              subcategory: res.subcategory,
              occasions: res.occasions,
              matchedRuleId: res.matchedRuleId,
              classificationStatus: res.status,
            })
            .where(eq(schema.products.id, item.id));
        }
      }
    }

    return NextResponse.json({ ok: true, createdRuleId, reclassifiedCount });
  }

  if (action === "resolve_flagged") {
    const id = Number(body.id);
    const status = body.status === "approved" ? "approved" : "rejected";
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid flagged update id required." }, { status: 400 });
    }
    await db
      .update(schema.flaggedUpdates)
      .set({ status })
      .where(eq(schema.flaggedUpdates.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "reset_circuit") {
    const brandId = Number(body.brandId);
    if (!Number.isFinite(brandId)) {
      return NextResponse.json({ error: "Valid brandId required." }, { status: 400 });
    }
    await db
      .update(schema.brands)
      .set({ circuitState: "active", consecutiveErrors: 0 })
      .where(eq(schema.brands.id, brandId));
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle_high_freq") {
    const brandId = Number(body.brandId);
    const enabled = Boolean(body.enabled);
    if (!Number.isFinite(brandId)) {
      return NextResponse.json({ error: "Valid brandId required." }, { status: 400 });
    }
    await db
      .update(schema.brands)
      .set({ highFrequencyMode: enabled })
      .where(eq(schema.brands.id, brandId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
}
