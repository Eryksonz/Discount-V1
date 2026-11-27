import { config } from "dotenv";
import postgres from "postgres";
import { VERIFIED_CRAWL_BRANDS } from "./adapters";
import { runBrandCrawl } from "./pipeline";

config({ path: ".env.local" });
config({ path: ".env" });

function parseArg(prefix: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/**
 * Determines which brands are eligible for high-frequency crawling (strictly opt-in to conserve Actions budget):
 *  1. Brand explicitly has `high_frequency_mode = true` or `crawl_frequency = 'high_freq'`, OR
 *  2. An active `sale_events` window covers the brand (or is market-wide) with `triggers_high_frequency = true`, OR
 *  3. The brand has at least one product with an active user alert (`alerts.active = true`).
 */
async function resolveOptInHighFrequencyBrands(): Promise<string[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];

  const sql = postgres(dbUrl, { max: 1 });
  try {
    const activeSet = new Set<string>(VERIFIED_CRAWL_BRANDS);
    const eligible = new Set<string>();

    const optInBrands = await sql`
      SELECT slug FROM brands
      WHERE (high_frequency_mode = TRUE OR crawl_frequency = 'high_freq')
        AND crawl_frequency != 'paused'
        AND circuit_state != 'disabled'
    `;
    for (const r of optInBrands) {
      if (activeSet.has(r.slug)) eligible.add(r.slug);
    }

    const activeSaleEvents = await sql`
      SELECT brand_slug FROM sale_events
      WHERE triggers_high_frequency = TRUE
        AND starts_at <= NOW()
        AND ends_at >= NOW()
    `;
    for (const ev of activeSaleEvents) {
      if (!ev.brand_slug) {
        for (const slug of VERIFIED_CRAWL_BRANDS) eligible.add(slug);
      } else if (activeSet.has(ev.brand_slug)) {
        eligible.add(ev.brand_slug);
      }
    }

    const alertBrands = await sql`
      SELECT DISTINCT p.brand_slug
      FROM alerts a
      INNER JOIN products p ON p.id = a.product_id
      WHERE a.active = TRUE
    `;
    for (const r of alertBrands) {
      if (activeSet.has(r.brand_slug)) eligible.add(r.brand_slug);
    }

    return Array.from(eligible);
  } finally {
    await sql.end();
  }
}

async function main() {
  const brandArg = parseArg("--brand=");
  const modeArg = (parseArg("--mode=") ?? "manual") as "baseline" | "high-frequency" | "manual";
  const maxProductsArg = parseArg("--max=");
  const offsetArg = parseArg("--offset=");
  const dryRun = process.argv.includes("--dry-run");
  const forceRefresh =
    process.argv.includes("--force-refresh") || process.argv.includes("--force-full");
  const maxProducts = maxProductsArg ? Number(maxProductsArg) : undefined;
  const offset = offsetArg ? Math.max(0, Number(offsetArg)) : 0;

  let targetBrands: string[];
  if (brandArg) {
    targetBrands = brandArg.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (modeArg === "high-frequency") {
    targetBrands = await resolveOptInHighFrequencyBrands();
    if (targetBrands.length === 0) {
      console.log(
        "[Tape & Tailor Crawler] mode=high-frequency: 0 brands opted in (no active sale_events, high_frequency_mode flags, or active user alerts). Exiting cleanly to conserve Actions minutes."
      );
      return;
    }
  } else {
    targetBrands = [...VERIFIED_CRAWL_BRANDS];
  }

  console.log(
    `[Tape & Tailor Crawler] mode=${modeArg} dryRun=${dryRun} forceRefresh=${forceRefresh} offset=${offset} cap=${maxProducts ?? "brand-config-default"} brands=${targetBrands.join(", ")}`
  );

  const results = [];
  for (const slug of targetBrands) {
    const summary = await runBrandCrawl({
      brandSlug: slug,
      mode: modeArg,
      maxProducts,
      offset,
      dryRun,
      forceRefresh,
    });
    results.push(summary);
    const expectedStr =
      summary.expectedMinProducts !== null ? `/${summary.expectedMinProducts}+ exp` : "";
    const discStr =
      summary.discoveredCatalogCount !== null
        ? ` discovered=${summary.discoveredCatalogCount} fetched=${summary.urlsFetched ?? 0}`
        : "";
    console.log(
      `  -> ${summary.brandSlug.padEnd(15)} status=${summary.status} method=${summary.methodUsed ?? "none"}${discStr} parsed=${summary.productsSeen}${expectedStr} new=${summary.newProducts} changes=${summary.priceChanges} classified=${summary.classifiedCount} out_of_scope=${summary.outOfScopeCount} unclassified=${summary.unclassifiedCount} quarantined=${summary.quarantinedCount} (${summary.durationMs}ms)`
    );
  }

  if (results.some((r) => r.status === "failed")) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[Tape & Tailor Crawler] Fatal error:", err);
  process.exit(1);
});
