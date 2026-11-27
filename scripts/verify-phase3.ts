import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3096";

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error("Server failed to start");
}

async function main() {
  await waitReady();

  const health = await fetch(`${BASE}/api/health`);
  console.log("HEALTH:", health.status, await health.text());

  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  console.log(
    "HOME:",
    home.status,
    "| SALE_EVENT_LIVE=",
    homeHtml.includes("Sale Event Live"),
    "| BRAND_LISTED=",
    homeHtml.includes("Brand-listed"),
    "| BUILDING_HISTORY=",
    homeHtml.includes("Building price history")
  );

  const api = await fetch(`${BASE}/api/products?page=1&pageSize=24&inStockOnly=true`);
  const apiJson = (await api.json()) as {
    items: Array<{ id: string; slug: string; name: string }>;
    totalMatched: number;
    queryDurationMs: number;
  };
  const first = apiJson.items[0];
  console.log(
    "API_PRODUCTS:",
    api.status,
    "| count=",
    apiJson.items.length,
    "| matched=",
    apiJson.totalMatched,
    "| sqlMs=",
    apiJson.queryDurationMs
  );

  const pdp = await fetch(`${BASE}/p/${first.slug}`);
  const pdpHtml = await pdp.text();
  console.log(
    "PDP:",
    pdp.status,
    "| slug=",
    first.slug,
    "| HAS_CHART=",
    pdpHtml.includes("90-Day Price History"),
    "| HAS_ALERT_FORM=",
    pdpHtml.includes("Set a Price-Drop Alert")
  );

  const wl = await fetch(`${BASE}/watchlist`);
  const about = await fetch(`${BASE}/about`);
  console.log("WATCHLIST:", wl.status, "| ABOUT:", about.status);

  // Test POST /api/alerts -> GET /api/alerts/unsubscribe end-to-end on Neon Postgres, then clean up test row
  const alertRes = await fetch(`${BASE}/api/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "smoke-test@tapeandtailor.example.com",
      productId: first.id,
      targetPriceDollars: 25,
    }),
  });
  const alertJson = (await alertRes.json()) as { ok?: boolean; id?: number };
  console.log("ALERT_CREATE:", alertRes.status, JSON.stringify(alertJson));

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const [row] = await sql`SELECT id, unsubscribe_token, active FROM alerts WHERE id = ${alertJson.id!}`;
  const unsub = await fetch(`${BASE}/api/alerts/unsubscribe?token=${row.unsubscribe_token}`);
  const [afterRow] = await sql`SELECT active FROM alerts WHERE id = ${alertJson.id!}`;
  console.log("UNSUBSCRIBE:", unsub.status, "| active_before=", row.active, "| active_after=", afterRow.active);

  // Clean up synthetic smoke-test alert row
  await sql`DELETE FROM alerts WHERE id = ${alertJson.id!}`;
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
