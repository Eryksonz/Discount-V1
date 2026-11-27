import { config } from "dotenv";
import postgres from "postgres";
import { VERIFIED_PILOT_BRANDS } from "./adapters";
import { runBrandCrawl } from "./pipeline";

config({ path: ".env.local" });
config({ path: ".env" });

function parseArg(prefix: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/**
 * Determines which brands are eligible for high-frequency crawling (strictly opt-in to conserve Actions budget):
 *  1. Brand explicitly has `high_frequency_mode = true`, OR
 *  2. An active `sale_events` window covers the brand (or is market-wide) with `triggers_high_frequency = true`, OR
 *  3. The brand has at least one product with an active user alert (`alerts.active = true`).
 */
async function resolveOptInHighFrequencyBrands(): Promise<string[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];

  const sql = postgres(dbUrl, { max: 1 });
  try {
    const pilotSet = new Set<string>(VERIFIED_PILOT_BRANDS);
    const eligible = new Set<string>();

    const optInBrands = await sql`
      SELECT slug FROM brands WHERE high_frequency_mode = TRUE AND circuit_state != 'disabled'
    `;
    for (const r of optInBrands) {
      if (pilotSet.has(r.slug)) eligible.add(r.slug);
    }

    const activeSaleEvents = await sql`
      SELECT brand_slug FROM sale_events
      WHERE triggers_high_frequency = TRUE
        AND starts_at <= NOW()
        AND ends_at >= NOW()
    `;
    for (const ev of activeSaleEvents) {
      if (!ev.brand_slug) {
        // Market-wide event (e.g. Black Friday / Memorial Day) activates all verified pilot brands
        for (const slug of VERIFIED_PILOT_BRANDS) eligible.add(slug);
      } else if (pilotSet.has(ev.brand_slug)) {
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
      if (pilotSet.has(r.brand_slug)) eligible.add(r.brand_slug);
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
  const dryRun = process.argv.includes("--dry-run");
  const maxProducts = maxProductsArg ? Number(maxProductsArg) : undefined;

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
    targetBrands = [...VERIFIED_PILOT_BRANDS];
  }

  console.log(
    `[Tape & Tailor Crawler] mode=${modeArg} dryRun=${dryRun} cap=${maxProducts ?? "brand-config-default"} brands=${targetBrands.join(", ")}`
  );

  const results = [];
  for (const slug of targetBrands) {
    const summary = await runBrandCrawl({
      brandSlug: slug,
      mode: modeArg,
      maxProducts,
      dryRun,
    });
    results.push(summary);
    const expectedStr =
      summary.expectedMinProducts !== null ? `/${summary.expectedMinProducts}+ exp` : "";
    console.log(
      `  -> ${summary.brandSlug.padEnd(10)} status=${summary.status} method=${summary.methodUsed ?? "none"} seen=${summary.productsSeen}${expectedStr} new=${summary.newProducts} changes=${summary.priceChanges} classified=${summary.classifiedCount} out_of_scope=${summary.outOfScopeCount} unclassified=${summary.unclassifiedCount} quarantined=${summary.quarantinedCount} (${summary.durationMs}ms)`
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
