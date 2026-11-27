import { config } from "dotenv";
import { queryCatalogFeed } from "@/lib/catalog/repository";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Warm up connection pool once
  await queryCatalogFeed({ page: 1, pageSize: 24, inStockOnly: true });

  const cases: Array<{ name: string; params: Parameters<typeof queryCatalogFeed>[0] }> = [
    { name: "Default feed (page 1, 24 items, inStock)", params: { page: 1, pageSize: 24, inStockOnly: true } },
    { name: "Page 5 pagination (48 items)", params: { page: 5, pageSize: 48, inStockOnly: true } },
    { name: "Brand + Category + MaxPrice filter", params: { brands: ["bonobos"], categories: ["dress-shirts-ocbds"], maxPrice: 120, page: 1, pageSize: 24 } },
    { name: "Occasion + Size JSONB filter (Interview, M)", params: { occasions: ["Interview"], size: "M", page: 1, pageSize: 24 } },
    { name: "Full-text search ('blazer')", params: { q: "blazer", page: 1, pageSize: 24 } },
    { name: "Typo-tolerant trigram search ('sweter')", params: { q: "sweter", page: 1, pageSize: 24 } },
  ];

  console.log("=== SQL PAGINATION & SEARCH BENCHMARK (LIVE NEON ~3,448 PUBLIC PRODUCTS) ===");
  for (const c of cases) {
    const t0 = Date.now();
    const res = await queryCatalogFeed(c.params);
    const ms = Date.now() - t0;
    console.log(
      `${c.name.padEnd(46)} | ${String(ms).padStart(4)}ms | returned=${String(res.items.length).padStart(2)} | matched=${String(res.totalMatched).padStart(4)} | catalog=${res.totalCatalog} | activeSales=${res.activeSaleEvents.length}`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
