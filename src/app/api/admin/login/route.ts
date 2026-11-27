import { NextRequest, NextResponse } from "next/server";
import {
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  clearAdminSessionCookie,
  recordAdminLoginFailure,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/admin/auth";

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export async function POST(request: NextRequest) {
  const clientKey = getClientKey(request);
  const limit = checkAdminLoginRateLimit(clientKey);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many failed login attempts. Try again in ${limit.retryAfterSec}s.` },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const check = verifyAdminPassword(String(body.password ?? ""));
  if (!check.ok) {
    recordAdminLoginFailure(clientKey);
    return NextResponse.json({ error: check.error }, { status: 401 });
  }

  clearAdminLoginFailures(clientKey);
  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
