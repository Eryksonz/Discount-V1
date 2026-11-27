import { NextResponse } from "next/server";
import { getSqlClient } from "@/db";
import { isObjectStorageConfigured, verifyObjectStorageRoundTrip } from "@/lib/neon/storage";
import { isRealtimeConfigured, sealRecentCrawlRunsQuery } from "@/lib/neon/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const isProd = process.env.NODE_ENV === "production";

  // 1. Postgres check (REQUIRED)
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

  // 2. Neon Object Storage (OPTIONAL — graceful skip when unconfigured)
  const storageConfigured = isObjectStorageConfigured();
  const storageStatus = storageConfigured
    ? await verifyObjectStorageRoundTrip()
    : { configured: false, ok: true, status: "not_configured" as const };

  // 3. Neon Realtime (OPTIONAL — graceful skip when unconfigured)
  const realtimeConfigured = isRealtimeConfigured();
  let realtimeStatus: {
    configured: boolean;
    ok: boolean;
    status?: "not_configured";
    url?: string;
    error?: string;
  } = {
    configured: realtimeConfigured,
    ok: !realtimeConfigured,
    ...(realtimeConfigured ? {} : { status: "not_configured" as const }),
  };

  if (realtimeConfigured) {
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
  }

  // Only Postgres is required; optional services must be healthy only when configured
  const allOk =
    postgresStatus.ok &&
    (!storageConfigured || storageStatus.ok) &&
    (!realtimeConfigured || realtimeStatus.ok);

  if (isProd) {
    return NextResponse.json(
      {
        ok: allOk,
        services: {
          postgres: { ok: postgresStatus.ok },
          objectStorage: storageConfigured
            ? { configured: true, ok: storageStatus.ok }
            : { configured: false, status: "not_configured" },
          realtime: realtimeConfigured
            ? { configured: true, ok: realtimeStatus.ok }
            : { configured: false, status: "not_configured" },
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
