import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const dataSourceCounts = await sql`
    SELECT data_source, count(*)::int AS cnt FROM products GROUP BY data_source ORDER BY data_source
  `;
  console.log("Production DB data_source counts:", dataSourceCounts);

  const brands = ["faherty", "bonobos", "brooks-brothers", "vineyard-vines"];
  for (const brand of brands) {
    const [summary] = await sql`
      SELECT
        count(*)::int AS total_all,
        count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS public_total,
        count(*) FILTER (WHERE classification_status IN ('classified', 'manual') AND original_price_cents > current_price_cents)::int AS public_with_gap,
        count(*) FILTER (WHERE original_price_cents > current_price_cents)::int AS all_with_gap
      FROM products
      WHERE brand_slug = ${brand}
    `;

    // 5% bucket histogram across public catalog where original_price_cents > current_price_cents
    const buckets = await sql`
      WITH gaps AS (
        SELECT
          ((original_price_cents - current_price_cents)::float / original_price_cents::float) * 100.0 AS pct
        FROM products
        WHERE brand_slug = ${brand}
          AND classification_status IN ('classified', 'manual')
          AND original_price_cents > current_price_cents
      )
      SELECT
        (floor(pct / 5.0) * 5)::int AS bucket_low,
        (floor(pct / 5.0) * 5 + 5)::int AS bucket_high,
        count(*)::int AS cnt
      FROM gaps
      GROUP BY 1, 2
      ORDER BY 1
    `;

    // Exact rounded integer percentage clustering (top 10 most frequent exact % gaps)
    const exactClusters = await sql`
      WITH gaps AS (
        SELECT
          round((((original_price_cents - current_price_cents)::numeric / original_price_cents::numeric) * 100.0))::int AS pct_int
        FROM products
        WHERE brand_slug = ${brand}
          AND classification_status IN ('classified', 'manual')
          AND original_price_cents > current_price_cents
      )
      SELECT pct_int, count(*)::int AS cnt
      FROM gaps
      GROUP BY 1
      ORDER BY cnt DESC, pct_int ASC
      LIMIT 12
    `;

    // Measure share landing on exact multiples of 5% (e.g. 20%, 25%, 30%, 40%, 50%)
    const [roundStats] = await sql`
      WITH gaps AS (
        SELECT
          round((((original_price_cents - current_price_cents)::numeric / original_price_cents::numeric) * 100.0))::int AS pct_int
        FROM products
        WHERE brand_slug = ${brand}
          AND classification_status IN ('classified', 'manual')
          AND original_price_cents > current_price_cents
      )
      SELECT
        count(*)::int AS total_gapped,
        count(*) FILTER (WHERE pct_int % 5 = 0)::int AS mult_of_5,
        count(*) FILTER (WHERE pct_int IN (20, 25, 30, 35, 40, 50))::int AS classic_promo_pcts
      FROM gaps
    `;

    const publicSharePct =
      summary.public_total > 0
        ? ((summary.public_with_gap / summary.public_total) * 100).toFixed(1)
        : "0.0";
    const allSharePct =
      summary.total_all > 0
        ? ((summary.all_with_gap / summary.total_all) * 100).toFixed(1)
        : "0.0";

    console.log(`\n==================== ${brand.toUpperCase()} ====================`);
    console.log(
      `Public catalog: ${summary.public_with_gap} / ${summary.public_total} (${publicSharePct}%) have original_price > price`
    );
    console.log(
      `Full catalog:   ${summary.all_with_gap} / ${summary.total_all} (${allSharePct}%) have original_price > price`
    );
    console.log("\n5% Bucket Histogram (Public catalog with gap):");
    for (const b of buckets) {
      const pctOfGapped =
        summary.public_with_gap > 0
          ? ((b.cnt / summary.public_with_gap) * 100).toFixed(1)
          : "0.0";
      const bar = "#".repeat(Math.max(1, Math.round((b.cnt / Math.max(1, summary.public_with_gap)) * 40)));
      console.log(
        `  ${String(b.bucket_low).padStart(2)}-${String(b.bucket_high).padStart(2)}%: ${String(b.cnt).padStart(4)} (${pctOfGapped.padStart(5)}%) ${bar}`
      );
    }

    const mult5Share =
      roundStats.total_gapped > 0
        ? ((roundStats.mult_of_5 / roundStats.total_gapped) * 100).toFixed(1)
        : "0.0";
    const classicShare =
      roundStats.total_gapped > 0
        ? ((roundStats.classic_promo_pcts / roundStats.total_gapped) * 100).toFixed(1)
        : "0.0";
    console.log(
      `\nClustering check: ${roundStats.mult_of_5}/${roundStats.total_gapped} (${mult5Share}%) land on exact multiples of 5%; ${roundStats.classic_promo_pcts}/${roundStats.total_gapped} (${classicShare}%) on {20,25,30,35,40,50}%.`
    );
    console.log(
      "Top exact rounded % gaps:",
      exactClusters.map((c) => `${c.pct_int}% (${c.cnt})`).join(", ")
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
