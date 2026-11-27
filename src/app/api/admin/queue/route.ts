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

  const [
    unclassified,
    outOfScope,
    flagged,
    runs,
    brandRows,
    customRules,
    clickCountRows,
    promos,
    saleEvents,
    activeAlerts,
  ] = await Promise.all([
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
    db.select().from(schema.brandPromos).orderBy(desc(schema.brandPromos.createdAt)).limit(100),
    db.select().from(schema.saleEvents).orderBy(desc(schema.saleEvents.startsAt)).limit(50),
    db.select({ id: schema.alerts.id }).from(schema.alerts).where(eq(schema.alerts.active, true)),
  ]);

  const brandNameById = Object.fromEntries(brandRows.map((b) => [b.id, b.name]));

  return NextResponse.json({
    unclassified,
    outOfScope,
    flagged,
    crawlRuns: runs.map((r) => ({ ...r, brandName: brandNameById[r.brandId] ?? `#${r.brandId}` })),
    brands: brandRows,
    customRules,
    promos,
    saleEvents,
    activeAlertsCount: activeAlerts.length,
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

  if (action === "set_crawl_frequency") {
    const brandId = Number(body.brandId);
    const freq = String(body.crawlFrequency ?? "daily");
    if (!Number.isFinite(brandId) || !["daily", "high_freq", "paused"].includes(freq)) {
      return NextResponse.json(
        { error: "Valid brandId and crawlFrequency (daily|high_freq|paused) required." },
        { status: 400 }
      );
    }
    await db
      .update(schema.brands)
      .set({
        crawlFrequency: freq,
        highFrequencyMode: freq === "high_freq",
      })
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
      .set({
        highFrequencyMode: enabled,
        crawlFrequency: enabled ? "high_freq" : "daily",
      })
      .where(eq(schema.brands.id, brandId));
    return NextResponse.json({ ok: true });
  }

  if (action === "create_promo" || action === "update_promo") {
    const brandId = Number(body.brandId);
    const brandSlug = String(body.brandSlug ?? "").trim();
    const description = String(body.description ?? "").trim();
    const code = body.code ? String(body.code).trim().toUpperCase() : null;
    const percentOff =
      body.percentOff !== null && body.percentOff !== undefined && String(body.percentOff) !== ""
        ? Number(body.percentOff)
        : null;
    const amountOffCents =
      body.amountOffDollars !== null &&
      body.amountOffDollars !== undefined &&
      String(body.amountOffDollars) !== ""
        ? Math.round(Number(body.amountOffDollars) * 100)
        : null;
    const minSpendCents =
      body.minSpendDollars !== null &&
      body.minSpendDollars !== undefined &&
      String(body.minSpendDollars) !== ""
        ? Math.round(Number(body.minSpendDollars) * 100)
        : null;
    const appliesTo = String(body.appliesTo ?? "Sitewide").trim() || "Sitewide";
    const hasExclusions = Boolean(body.hasExclusions);
    const startsAt = new Date(String(body.startsAt ?? new Date().toISOString()));
    const endsAt = new Date(String(body.endsAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString()));
    const sourceUrl = body.sourceUrl ? String(body.sourceUrl).trim() : null;

    if (!Number.isFinite(brandId) || !brandSlug || !description) {
      return NextResponse.json(
        { error: "brandId, brandSlug, and description are required." },
        { status: 400 }
      );
    }

    if (action === "update_promo") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "Promo id required for update." }, { status: 400 });
      }
      await db
        .update(schema.brandPromos)
        .set({
          description,
          code,
          percentOff,
          amountOffCents,
          minSpendCents,
          appliesTo,
          hasExclusions,
          startsAt,
          endsAt,
          sourceUrl,
          verifiedAt: new Date(),
        })
        .where(eq(schema.brandPromos.id, id));
      return NextResponse.json({ ok: true });
    }

    await db.insert(schema.brandPromos).values({
      brandId,
      brandSlug,
      description,
      code,
      percentOff,
      amountOffCents,
      minSpendCents,
      appliesTo,
      hasExclusions,
      startsAt,
      endsAt,
      sourceUrl,
      verifiedAt: new Date(),
      active: true,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "expire_promo") {
    const id = Number(body.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid promo id required." }, { status: 400 });
    }
    await db
      .update(schema.brandPromos)
      .set({ active: false, endsAt: new Date() })
      .where(eq(schema.brandPromos.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "create_sale_event") {
    const name = String(body.name ?? "").trim();
    const slug =
      String(body.slug ?? "").trim() ||
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const brandSlug = body.brandSlug ? String(body.brandSlug).trim() : null;
    const startsAt = new Date(String(body.startsAt ?? new Date().toISOString()));
    const endsAt = new Date(String(body.endsAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString()));
    const typicalDiscountNote =
      String(body.typicalDiscountNote ?? "").trim() ||
      "Sitewide or tiered promotional event.";
    const triggersHighFrequency = body.triggersHighFrequency !== false;
    const confirmed = body.confirmed === true;

    if (!name) {
      return NextResponse.json({ error: "Sale event name is required." }, { status: 400 });
    }

    await db
      .insert(schema.saleEvents)
      .values({
        slug,
        name,
        brandSlug: brandSlug || null,
        startsAt,
        endsAt,
        typicalDiscountNote,
        triggersHighFrequency,
        confirmed,
        confirmedAt: confirmed ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: schema.saleEvents.slug,
        set: {
          name,
          brandSlug: brandSlug || null,
          startsAt,
          endsAt,
          typicalDiscountNote,
          triggersHighFrequency,
          confirmed,
          confirmedAt: confirmed ? new Date() : null,
        },
      });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_sale_event_confirmed") {
    const id = Number(body.id);
    const confirmed = Boolean(body.confirmed);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid sale event id required." }, { status: 400 });
    }
    await db
      .update(schema.saleEvents)
      .set({ confirmed, confirmedAt: confirmed ? new Date() : null })
      .where(eq(schema.saleEvents.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "verify_student_promo") {
    const id = Number(body.id);
    const verified = Boolean(body.verified);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid student promo id required." }, { status: 400 });
    }
    const offerText = body.offerText ? String(body.offerText).trim() : undefined;
    const terms = body.terms ? String(body.terms).trim() : undefined;
    const sourceUrl = body.sourceUrl ? String(body.sourceUrl).trim() : null;
    await db
      .update(schema.studentPromos)
      .set({
        verified,
        verifiedAt: verified ? new Date() : null,
        ...(offerText ? { offerText } : {}),
        ...(terms ? { terms } : {}),
        sourceUrl,
      })
      .where(eq(schema.studentPromos.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "expire_sale_event") {
    const id = Number(body.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Valid sale event id required." }, { status: 400 });
    }
    await db
      .update(schema.saleEvents)
      .set({ endsAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.saleEvents.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "crawl_now") {
    const brandSlug = body.brandSlug ? String(body.brandSlug).trim() : "";
    const ghToken = process.env.GITHUB_TOKEN?.trim();
    const ghRepo = process.env.GITHUB_REPO?.trim() || "Eryksonz/Discount-V1";

    if (!ghToken) {
      return NextResponse.json(
        {
          error:
            "GITHUB_TOKEN is not set on this server. Set GITHUB_TOKEN (with actions:write) in Vercel/env, or trigger 'Baseline Daily Crawl' manually in GitHub → Actions.",
        },
        { status: 503 }
      );
    }

    const res = await fetch(
      `https://api.github.com/repos/${ghRepo}/actions/workflows/crawl-baseline.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "master",
          inputs: {
            brand: brandSlug,
            mode: "manual",
            max_products: "",
          },
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `GitHub Actions dispatch failed (${res.status}): ${txt.slice(0, 200)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Dispatched full-catalog GitHub Actions crawl (${brandSlug || "all enabled brands"}).`,
    });
  }

  return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
}
