import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/catalog/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-zA-Z0-9_-]{1,128}$/.test(s))
    .slice(0, 50);

  if (ids.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const items = await getProductsByIds(ids);
  return NextResponse.json({ items });
}
