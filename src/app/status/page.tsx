import Link from "next/link";
import { Lock, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { BRANDS } from "@config/brands";
import { getSqlClient } from "@/db";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function AdminStatusPage() {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#141A22]">
        <SiteHeader source="postgres" isDemoData={false} unclassifiedCount={0} activeNav="admin" />
        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-20">
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-8 text-center space-y-4 shadow-xs">
            <div className="mx-auto w-10 h-10 rounded-full bg-[#0F1D32]/10 flex items-center justify-center text-[#0F1D32]">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="font-serif text-2xl font-semibold text-[#0F1D32]">
              Admin Authentication Required
            </h1>
            <p className="text-xs text-[#4B5869] leading-relaxed">
              The crawler &amp; catalog status dashboard is restricted to authenticated
              administrators. Sign in via <span className="font-mono">/admin</span> first.
            </p>
            <Link
              href="/admin"
              className="inline-block rounded bg-[#0F1D32] px-4 py-2 font-mono text-xs font-semibold text-[#FAF8F3] hover:bg-[#1B365D]"
            >
              Sign in at /admin
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const sql = getSqlClient();
  let totalProducts = 0;
  let crawlerProducts = 0;
  let demoProducts = 0;
  let totalSnapshots = 0;
  let unclassifiedCount = 0;

  const brandRows: Array<{
    slug: string;
    name: string;
    code: string;
    ingestionStatus: string;
    lastSuccessfulCrawlAt: string | null;
    lastRunDiscovered: number | null;
    lastRunFetched: number | null;
    lastRunParsed: number | null;
    lastRunSkippedFresh: number | null;
    totalProducts: number;
    publicProducts: number;
    outOfScopeProducts: number;
    unclassifiedProducts: number;
    snapshotsCount: number;
  }> = [];

  if (sql) {
    const [totalsRes, prodRes, snapRes, crawlRes] = await Promise.all([
      sql`
        SELECT
          count(*)::int AS total_products,
          count(*) FILTER (WHERE data_source = 'crawler')::int AS crawler_products,
          count(*) FILTER (WHERE data_source = 'demo')::int AS demo_products,
          count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified_products
        FROM products
      `,
      sql`
        SELECT
          brand_slug,
          count(*)::int AS total_products,
          count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS public_products,
          count(*) FILTER (WHERE classification_status = 'out_of_scope')::int AS out_of_scope_products,
          count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified_products
        FROM products
        GROUP BY brand_slug
      `,
      sql`
        SELECT p.brand_slug, count(ps.id)::int AS snapshot_count
        FROM price_snapshots ps
        INNER JOIN products p ON p.id = ps.product_id
        GROUP BY p.brand_slug
      `,
      sql`
        SELECT
          b.slug AS brand_slug,
          MAX(cr.finished_at) FILTER (WHERE cr.status = 'completed') AS last_successful_crawl_at,
          latest.urls_discovered,
          latest.urls_fetched,
          latest.urls_parsed,
          latest.urls_skipped_fresh
        FROM brands b
        LEFT JOIN crawl_runs cr ON cr.brand_id = b.id
        LEFT JOIN LATERAL (
          SELECT urls_discovered, urls_fetched, urls_parsed, urls_skipped_fresh
          FROM crawl_runs
          WHERE brand_id = b.id
          ORDER BY started_at DESC
          LIMIT 1
        ) latest ON TRUE
        GROUP BY
          b.id, b.slug, latest.urls_discovered, latest.urls_fetched, latest.urls_parsed, latest.urls_skipped_fresh
      `,
    ]);

    totalProducts = Number(totalsRes[0]?.total_products ?? 0);
    crawlerProducts = Number(totalsRes[0]?.crawler_products ?? 0);
    demoProducts = Number(totalsRes[0]?.demo_products ?? 0);
    unclassifiedCount = Number(totalsRes[0]?.unclassified_products ?? 0);

    const prodMap = new Map(prodRes.map((r) => [String(r.brand_slug), r]));
    const snapMap = new Map(snapRes.map((r) => [String(r.brand_slug), Number(r.snapshot_count)]));
    const crawlMap = new Map(crawlRes.map((r) => [String(r.brand_slug), r]));

    for (const b of BRANDS) {
      const p = prodMap.get(b.slug);
      const c = crawlMap.get(b.slug);
      const snaps = snapMap.get(b.slug) ?? 0;
      totalSnapshots += snaps;
      brandRows.push({
        slug: b.slug,
        name: b.name,
        code: b.code,
        ingestionStatus: b.ingestionStatus,
        lastSuccessfulCrawlAt: c?.last_successful_crawl_at
          ? new Date(String(c.last_successful_crawl_at)).toISOString()
          : null,
        lastRunDiscovered:
          c?.urls_discovered !== null && c?.urls_discovered !== undefined
            ? Number(c.urls_discovered)
            : null,
        lastRunFetched:
          c?.urls_fetched !== null && c?.urls_fetched !== undefined
            ? Number(c.urls_fetched)
            : null,
        lastRunParsed:
          c?.urls_parsed !== null && c?.urls_parsed !== undefined ? Number(c.urls_parsed) : null,
        lastRunSkippedFresh:
          c?.urls_skipped_fresh !== null && c?.urls_skipped_fresh !== undefined
            ? Number(c.urls_skipped_fresh)
            : null,
        totalProducts: Number(p?.total_products ?? 0),
        publicProducts: Number(p?.public_products ?? 0),
        outOfScopeProducts: Number(p?.out_of_scope_products ?? 0),
        unclassifiedProducts: Number(p?.unclassified_products ?? 0),
        snapshotsCount: snaps,
      });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#141A22]">
      <SiteHeader
        source={sql ? "postgres" : "demo-fallback"}
        isDemoData={demoProducts > 0}
        unclassifiedCount={unclassifiedCount}
        activeNav="admin"
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E2DCD0] pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#7A6338]">
              <Activity className="w-3.5 h-3.5" />
              Admin Operational Status
            </div>
            <h1 className="font-serif text-3xl font-semibold text-[#0F1D32]">
              Crawler &amp; Catalog Coverage Status
            </h1>
          </div>
          <Link
            href="/admin"
            className="font-mono text-xs font-semibold text-[#0F1D32] hover:underline"
          >
            ← Back to /admin console
          </Link>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
            <div className="font-mono text-[10px] uppercase text-[#5C6776]">Live Crawled SKUs</div>
            <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
              {crawlerProducts.toLocaleString()}
            </div>
            <div className="font-mono text-[11px] text-[#5C6776]">
              of {totalProducts.toLocaleString()} total
            </div>
          </div>
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
            <div className="font-mono text-[10px] uppercase text-[#5C6776]">Demo / Seed Rows</div>
            <div
              className={`font-mono text-2xl font-semibold mt-1 tabular-nums flex items-center gap-2 ${
                demoProducts === 0 ? "text-[#14532D]" : "text-[#92400E]"
              }`}
            >
              {demoProducts}
              {demoProducts === 0 ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div className="font-mono text-[11px] text-[#5C6776]">
              {demoProducts === 0 ? "Clean production DB" : "Remove demo rows!"}
            </div>
          </div>
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
            <div className="font-mono text-[10px] uppercase text-[#5C6776]">Price Snapshots</div>
            <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
              {totalSnapshots.toLocaleString()}
            </div>
            <div className="font-mono text-[11px] text-[#5C6776]">State-change history</div>
          </div>
          <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
            <div className="font-mono text-[10px] uppercase text-[#5C6776]">Unclassified Queue</div>
            <div className="font-mono text-2xl font-semibold text-[#0F1D32] mt-1 tabular-nums">
              {unclassifiedCount.toLocaleString()}
            </div>
            <div className="font-mono text-[11px] text-[#5C6776]">Review in /admin</div>
          </div>
        </div>

        {/* Per-Brand Table with Crawl Coverage */}
        <div className="rounded-lg border border-[#E2DCD0] bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF8F3] border-b border-[#E2DCD0] font-mono text-[10px] uppercase tracking-wider text-[#5C6776]">
              <tr>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Successful Crawl</th>
                <th className="px-4 py-3 text-right">Last Run (Disc / Fetch / Parse / Skip)</th>
                <th className="px-4 py-3 text-right">Total SKUs</th>
                <th className="px-4 py-3 text-right">Public</th>
                <th className="px-4 py-3 text-right">Snapshots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7DB]">
              {brandRows.map((b) => (
                <tr key={b.slug} className="hover:bg-[#FAF8F3]/60">
                  <td className="px-4 py-3 font-medium text-[#0F1D32]">
                    <span className="font-mono text-[10px] text-[#7A6338] mr-2">{b.code}</span>
                    {b.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                        b.ingestionStatus === "active"
                          ? "bg-[#E8F3EC] text-[#14532D]"
                          : b.ingestionStatus === "feed_pending"
                            ? "bg-[#FEF3C7] text-[#92400E]"
                            : "bg-[#EFEAE0] text-[#5C6776]"
                      }`}
                    >
                      {b.ingestionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#3E4C5E]">
                    {b.lastSuccessfulCrawlAt
                      ? new Date(b.lastSuccessfulCrawlAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums text-[#3E4C5E]">
                    {b.lastRunDiscovered !== null
                      ? `${b.lastRunDiscovered} / ${b.lastRunFetched ?? "—"} / ${b.lastRunParsed ?? "—"} / ${b.lastRunSkippedFresh ?? 0}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {b.totalProducts.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#14532D]">
                    {b.publicProducts.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#0F1D32]">
                    {b.snapshotsCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
