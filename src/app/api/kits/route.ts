import { NextResponse } from "next/server";
import {
  buildInterviewKit,
  type BudgetTierId,
  type KitSizePreferences,
} from "@/lib/kits";
import { loadKitCandidates } from "@/lib/kits/loader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tierParam = (searchParams.get("tier") ?? "intern") as BudgetTierId;
    const tierId: BudgetTierId =
      tierParam === "student" || tierParam === "intern" || tierParam === "full_time"
        ? tierParam
        : "intern";

    const sizes: KitSizePreferences = {
      topSize: searchParams.get("topSize") || undefined,
      bottomSize: searchParams.get("bottomSize") || undefined,
      jacketSize: searchParams.get("jacketSize") || undefined,
      footwearSize: searchParams.get("footwearSize") || undefined,
    };

    const { candidates } = await loadKitCandidates();
    const kit = buildInterviewKit(candidates, { tierId, sizes });

    return NextResponse.json(kit);
  } catch (err) {
    console.error("[GET /api/kits] Error:", err);
    return NextResponse.json(
      { error: "Failed to build interview kit" },
      { status: 500 }
    );
  }
}
