import { createRealtime, rawSql } from "@neon/realtime/server";

export interface LiveCrawlRunRow {
  id: number;
  brand_id: number;
  mode: string;
  status: string;
  started_at: string;
  duration_ms: number;
  products_seen: number;
  price_changes: number;
  new_products: number;
  quarantined_count: number;
  errors_count: number;
}

function getDbNameFromUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "neondb";
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, "") || "neondb";
  } catch {
    return "neondb";
  }
}

export function isRealtimeConfigured(): boolean {
  return Boolean(process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET);
}

export function getRealtimeServer() {
  if (!isRealtimeConfigured()) return null;
  return createRealtime({
    secret: process.env.NEON_REALTIME_SECRET!,
    db: getDbNameFromUrl(),
  });
}

/**
 * Seals a deterministic, read-only live SQL query over recent crawl runs for the /admin dashboard.
 */
export async function sealRecentCrawlRunsQuery() {
  const rt = getRealtimeServer();
  if (!rt) return null;

  const query = rawSql<LiveCrawlRunRow>(
    `SELECT id, brand_id, mode, status, started_at, duration_ms, products_seen, price_changes, new_products, quarantined_count, errors_count FROM crawl_runs ORDER BY started_at DESC LIMIT 25`,
    []
  );

  const sealed = await rt.seal({ query });
  return {
    realtimeUrl: process.env.NEON_REALTIME_URL!,
    sealedQuery: sealed,
  };
}
