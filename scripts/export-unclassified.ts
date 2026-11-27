import { config } from "dotenv";
import fs from "fs";
import path from "path";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  const rows = await sql`
    SELECT brand_slug, name, raw_breadcrumb, current_price_cents, original_price_cents
    FROM products
    WHERE classification_status = 'unclassified'
    ORDER BY brand_slug, name
  `;
  const outPath = path.resolve(
    process.cwd(),
    "src/lib/classify/__tests__/unclassified-export.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Exported ${rows.length} unclassified products to ${outPath}`);
  for (const r of rows) {
    console.log(`${String(r.brand_slug).padEnd(10)} | ${r.name} | ${r.raw_breadcrumb}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
