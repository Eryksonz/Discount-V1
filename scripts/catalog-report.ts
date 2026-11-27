import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const breakdown = await sql`
    SELECT
      brand_slug,
      count(*)::int AS total,
      count(*) FILTER (WHERE classification_status IN ('classified', 'manual'))::int AS classified,
      count(*) FILTER (WHERE classification_status = 'out_of_scope')::int AS out_of_scope,
      count(*) FILTER (WHERE classification_status = 'unclassified')::int AS unclassified,
      count(*) FILTER (WHERE original_price_cents > current_price_cents)::int AS has_compare_at_discount
    FROM products
    GROUP BY brand_slug
    ORDER BY brand_slug
  `;

  const snapshots = await sql`
    SELECT p.brand_slug, count(s.id)::int AS snapshot_count
    FROM price_snapshots s
    INNER JOIN products p ON p.id = s.product_id
    GROUP BY p.brand_slug
    ORDER BY p.brand_slug
  `;

  const remainingUnclassified = await sql`
    SELECT brand_slug, name, raw_breadcrumb
    FROM products
    WHERE classification_status = 'unclassified'
    ORDER BY brand_slug, name
    LIMIT 30
  `;

  console.log("=== PER-BRAND CLASSIFICATION BREAKDOWN ===");
  for (const row of breakdown) {
    const inScopePool = Number(row.classified) + Number(row.unclassified);
    const unclPctOfInScope =
      inScopePool > 0 ? ((Number(row.unclassified) / inScopePool) * 100).toFixed(1) : "0.0";
    console.log(
      `${String(row.brand_slug).padEnd(10)} | total=${row.total} | classified=${row.classified} | out_of_scope=${row.out_of_scope} | unclassified=${row.unclassified} (${unclPctOfInScope}% of non-OOS) | with_compare_at_discount=${row.has_compare_at_discount}`
    );
  }

  console.log("\n=== SNAPSHOT COUNTS ===");
  for (const s of snapshots) {
    console.log(`${String(s.brand_slug).padEnd(10)} | snapshots=${s.snapshot_count}`);
  }

  console.log(`\n=== SAMPLE REMAINING UNCLASSIFIED (${remainingUnclassified.length} shown) ===`);
  for (const u of remainingUnclassified) {
    console.log(`${String(u.brand_slug).padEnd(10)} | ${u.name} | ${u.raw_breadcrumb}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
