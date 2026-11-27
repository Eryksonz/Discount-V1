import { NextResponse } from "next/server";
import { BRANDS } from "@config/brands";
import { getSqlClient } from "@/db";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getSqlClient();
  if (!sql) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const [totalsRows, brandProductRows, brandSnapRows, brandCrawlRows, alertRows] =
    await Promise.all([
      sql`
        SELECT
          count(*)::int AS total_products,
          count(*) FILTER (WHERE data_source = 'crawler')::int AS crawler_products,
          count(*) FILTER (WHERE data_source = 'demo')::int AS demo_products,
          count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS public_products,
          count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified_products
        FROM products
      `,
      sql`
        SELECT
          brand_slug,
          count(*)::int AS total_products,
          count(*) FILTER (WHERE last_checked_at >= NOW() - INTERVAL '24 hours')::int AS fetched_last_24h,
          count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS public_products,
          count(*) FILTER (WHERE classification_status = 'out_of_scope')::int AS out_of_scope_products,
          count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified_products,
          count(*) FILTER (WHERE data_source = 'demo')::int AS demo_products
        FROM products
        GROUP BY brand_slug
      `,
      sql`
        SELECT
          p.brand_slug,
          count(ps.id)::int AS snapshot_count
        FROM price_snapshots ps
        INNER JOIN products p ON p.id = ps.product_id
        GROUP BY p.brand_slug
      `,
      sql`
        SELECT
          b.slug AS brand_slug,
          b.circuit_state,
          b.crawl_frequency,
          MAX(cr.finished_at) FILTER (WHERE cr.status = 'completed') AS last_successful_crawl_at,
          latest.status AS last_run_status,
          latest.duration_ms AS last_run_duration_ms,
          latest.urls_discovered AS last_run_discovered,
          latest.urls_selected AS last_run_selected,
          latest.urls_fetched AS last_run_fetched,
          latest.urls_parsed AS last_run_parsed,
          latest.urls_quarantined AS last_run_quarantined,
          latest.urls_skipped_fresh AS last_run_skipped_fresh,
          latest.urls_skipped_oos AS last_run_skipped_oos,
          latest.batch_offset AS last_run_batch_offset,
          latest.batch_max_products AS last_run_batch_max_products,
          latest.forced_refresh AS last_run_forced_refresh
        FROM brands b
        LEFT JOIN crawl_runs cr ON cr.brand_id = b.id
        LEFT JOIN LATERAL (
          SELECT
            status, duration_ms, urls_discovered, urls_selected, urls_fetched,
            urls_parsed, urls_quarantined, urls_skipped_fresh, urls_skipped_oos,
            batch_offset, batch_max_products, forced_refresh
          FROM crawl_runs
          WHERE brand_id = b.id
          ORDER BY started_at DESC
          LIMIT 1
        ) latest ON TRUE
        GROUP BY
          b.id, b.slug, b.circuit_state, b.crawl_frequency,
          latest.status, latest.duration_ms, latest.urls_discovered, latest.urls_selected,
          latest.urls_fetched, latest.urls_parsed, latest.urls_quarantined,
          latest.urls_skipped_fresh, latest.urls_skipped_oos,
          latest.batch_offset, latest.batch_max_products, latest.forced_refresh
      `,
      sql`SELECT count(*)::int AS active_alerts FROM alerts WHERE active = TRUE`,
    ]);

  const prodByBrand = new Map(brandProductRows.map((r) => [String(r.brand_slug), r]));
  const snapByBrand = new Map(brandSnapRows.map((r) => [String(r.brand_slug), Number(r.snapshot_count)]));
  const crawlByBrand = new Map(brandCrawlRows.map((r) => [String(r.brand_slug), r]));

  const brands = BRANDS.map((b) => {
    const p = prodByBrand.get(b.slug);
    const c = crawlByBrand.get(b.slug);
    const fetchedLast24h = Number(p?.fetched_last_24h ?? 0);
    const discovered =
      c?.last_run_discovered !== null && c?.last_run_discovered !== undefined
        ? Number(c.last_run_discovered)
        : null;
    const forcedRefresh = Boolean(c?.last_run_forced_refresh);
    const coverage24hPct =
      discovered !== null && discovered > 0
        ? Math.round((fetchedLast24h / discovered) * 1000) / 10
        : null;
    const coverageWarning = Boolean(
      forcedRefresh && coverage24hPct !== null && coverage24hPct < 95
    );

    return {
      slug: b.slug,
      name: b.name,
      code: b.code,
      ingestionStatus: b.ingestionStatus,
      circuitState: c?.circuit_state ? String(c.circuit_state) : "active",
      crawlFrequency: c?.crawl_frequency ? String(c.crawl_frequency) : "daily",
      lastSuccessfulCrawlAt: c?.last_successful_crawl_at
        ? new Date(String(c.last_successful_crawl_at)).toISOString()
        : null,
      lastRunStatus: c?.last_run_status ? String(c.last_run_status) : null,
      lastRunDurationMs:
        c?.last_run_duration_ms !== null && c?.last_run_duration_ms !== undefined
          ? Number(c.last_run_duration_ms)
          : null,
      fetchedLast24h,
      coverage24hPct,
      coverageWarning,
      lastRunCoverage: {
        discovered,
        selected:
          c?.last_run_selected !== null && c?.last_run_selected !== undefined
            ? Number(c.last_run_selected)
            : null,
        fetched:
          c?.last_run_fetched !== null && c?.last_run_fetched !== undefined
            ? Number(c.last_run_fetched)
            : null,
        parsed:
          c?.last_run_parsed !== null && c?.last_run_parsed !== undefined
            ? Number(c.last_run_parsed)
            : null,
        quarantined:
          c?.last_run_quarantined !== null && c?.last_run_quarantined !== undefined
            ? Number(c.last_run_quarantined)
            : null,
        skippedFresh:
          c?.last_run_skipped_fresh !== null && c?.last_run_skipped_fresh !== undefined
            ? Number(c.last_run_skipped_fresh)
            : null,
        skippedOos:
          c?.last_run_skipped_oos !== null && c?.last_run_skipped_oos !== undefined
            ? Number(c.last_run_skipped_oos)
            : null,
        batchOffset:
          c?.last_run_batch_offset !== null && c?.last_run_batch_offset !== undefined
            ? Number(c.last_run_batch_offset)
            : null,
        batchMaxProducts:
          c?.last_run_batch_max_products !== null && c?.last_run_batch_max_products !== undefined
            ? Number(c.last_run_batch_max_products)
            : null,
        forcedRefresh,
      },
      totalProducts: Number(p?.total_products ?? 0),
      publicProducts: Number(p?.public_products ?? 0),
      outOfScopeProducts: Number(p?.out_of_scope_products ?? 0),
      unclassifiedProducts: Number(p?.unclassified_products ?? 0),
      demoProducts: Number(p?.demo_products ?? 0),
      snapshotsCount: snapByBrand.get(b.slug) ?? 0,
    };
  });

  const totals = totalsRows[0];
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: {
      totalProducts: Number(totals?.total_products ?? 0),
      crawlerProducts: Number(totals?.crawler_products ?? 0),
      demoProducts: Number(totals?.demo_products ?? 0),
      publicProducts: Number(totals?.public_products ?? 0),
      unclassifiedProducts: Number(totals?.unclassified_products ?? 0),
      totalSnapshots: brands.reduce((acc, b) => acc + b.snapshotsCount, 0),
      activeAlerts: Number(alertRows[0]?.active_alerts ?? 0),
    },
    brands,
  });
}
