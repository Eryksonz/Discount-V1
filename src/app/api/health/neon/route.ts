import { NextResponse } from "next/server";
import { getSqlClient } from "@/db";
import { verifyObjectStorageRoundTrip } from "@/lib/neon/storage";
import { isRealtimeConfigured, sealRecentCrawlRunsQuery } from "@/lib/neon/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const isProd = process.env.NODE_ENV === "production";

  // 1. Postgres check
  const sql = getSqlClient();
  let postgresStatus: { configured: boolean; ok: boolean; productCount?: number; error?: string } = {
    configured: Boolean(sql),
    ok: false,
  };
  if (sql) {
    try {
      const [row] = await sql`SELECT count(*)::int AS count FROM products`;
      postgresStatus = {
        configured: true,
        ok: true,
        productCount: Number(row?.count ?? 0),
      };
    } catch (err) {
      postgresStatus = { configured: true, ok: false, error: (err as Error).message };
    }
  } else {
    postgresStatus.error = "DATABASE_URL not configured";
  }

  // 2. Neon Object Storage round-trip check
  const storageStatus = await verifyObjectStorageRoundTrip();

  // 3. Neon Realtime query sealing check
  let realtimeStatus: { configured: boolean; ok: boolean; url?: string; error?: string } = {
    configured: isRealtimeConfigured(),
    ok: false,
  };
  if (realtimeStatus.configured) {
    try {
      const sealed = await sealRecentCrawlRunsQuery();
      realtimeStatus = {
        configured: true,
        ok: Boolean(sealed?.sealedQuery),
        url: sealed?.realtimeUrl,
      };
    } catch (err) {
      realtimeStatus = { configured: true, ok: false, error: (err as Error).message };
    }
  } else {
    realtimeStatus.error = "NEON_REALTIME_URL / NEON_REALTIME_SECRET not configured";
  }

  const allOk = postgresStatus.ok && storageStatus.ok && realtimeStatus.ok;

  // In production, never leak internal service URLs, bucket names, row counts, or error details
  if (isProd) {
    return NextResponse.json(
      {
        ok: allOk,
        services: {
          postgres: { ok: postgresStatus.ok },
          objectStorage: { ok: storageStatus.ok },
          realtime: { ok: realtimeStatus.ok },
        },
      },
      { status: allOk ? 200 : 503 }
    );
  }

  return NextResponse.json(
    {
      ok: allOk,
      services: {
        postgres: postgresStatus,
        objectStorage: storageStatus,
        realtime: realtimeStatus,
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
