import { NextRequest, NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const check = verifyAdminPassword(String(body.password ?? ""));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 401 });
  }
  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
