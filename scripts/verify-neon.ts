import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3098";

async function waitUntilReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health/neon`);
      if (r.status > 0) return;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not respond at ${BASE}`);
}

async function main() {
  await waitUntilReady();

  const health = await fetch(`${BASE}/api/health/neon`);
  const healthJson = await health.json();
  console.log("NEON_HEALTH_STATUS =", health.status);
  console.log("NEON_HEALTH =", JSON.stringify(healthJson, null, 2));

  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  console.log(
    "HOME_STATUS =",
    home.status,
    "| HAS_NEON_LIVE =",
    homeHtml.includes("NEON LIVE"),
    "| HAS_DEMO_BANNER =",
    homeHtml.includes("Demo Data:")
  );

  const api = await fetch(`${BASE}/api/products?inStockOnly=true`);
  const apiJson = (await api.json()) as {
    source: string;
    isDemoData: boolean;
    liveCrawledCount: number;
    unclassifiedCount: number;
    items: Array<{ id: string; brandName: string; name: string; currentPriceCents: number }>;
  };
  console.log(
    "API_STATUS =",
    api.status,
    "| SOURCE =",
    apiJson.source,
    "| IS_DEMO =",
    apiJson.isDemoData,
    "| LIVE_COUNT =",
    apiJson.liveCrawledCount,
    "| UNCLASSIFIED =",
    apiJson.unclassifiedCount
  );

  const first = apiJson.items[0];
  if (first) {
    console.log(
      "FIRST_PRODUCT =",
      `${first.id} | ${first.brandName} | ${first.name} | $${(first.currentPriceCents / 100).toFixed(2)}`
    );

    const goOk = await fetch(`${BASE}/go/${first.id}`, { redirect: "manual" });
    console.log("GO_OK_STATUS =", goOk.status, "| LOCATION =", goOk.headers.get("location"));

    const goBad = await fetch(`${BASE}/go/${first.id}?url=https://evil.example`, {
      redirect: "manual",
    });
    console.log("GO_OPEN_REDIRECT_BLOCKED_STATUS =", goBad.status);
  }

  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    const [clicks] = await sql`SELECT count(*)::int AS count FROM outbound_clicks`;
    const [snaps] = await sql`SELECT count(*)::int AS count FROM price_snapshots`;
    const [runs] = await sql`SELECT count(*)::int AS count FROM crawl_runs`;
    const [prods] = await sql`SELECT count(*)::int AS count FROM products`;
    console.log(
      "NEON_DB_COUNTS =",
      `products=${prods.count} snapshots=${snaps.count} crawl_runs=${runs.count} outbound_clicks=${clicks.count}`
    );
    await sql.end();
  }

  if (!healthJson.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
