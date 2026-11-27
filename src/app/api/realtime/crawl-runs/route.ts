import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { sealRecentCrawlRunsQuery } from "@/lib/neon/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sealed = await sealRecentCrawlRunsQuery();
  if (!sealed) {
    return NextResponse.json({
      configured: false,
      message: "Neon Realtime is not configured (optional).",
    });
  }

  return NextResponse.json({ configured: true, ...sealed });
}
