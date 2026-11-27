import { config } from "dotenv";
import { KIT_BUDGET_TIERS, buildInterviewKit } from "@/lib/kits";
import { loadKitCandidates } from "@/lib/kits/loader";
import { formatCurrency } from "@/lib/utils";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { candidates, source } = await loadKitCandidates();
  console.log(`=== TAPE & TAILOR INTERVIEW KIT REPORT (source=${source}, candidates=${candidates.length}) ===`);

  for (const tier of KIT_BUDGET_TIERS) {
    const kit = buildInterviewKit(candidates, { tierId: tier.id });
    const budgetUsedPct =
      tier.budgetCapCents > 0
        ? ((kit.totalPriceCents / tier.budgetCapCents) * 100).toFixed(1)
        : "0.0";

    console.log(
      `\n--- ${tier.label.toUpperCase()} (${tier.id} | cap: ${formatCurrency(tier.budgetCapCents)}) ---`
    );
    console.log(
      `Summary: required=${kit.requiredFilledCount}/${kit.requiredTotalCount} | total_slots=${kit.filledCount}/${kit.totalSlots} | total=${formatCurrency(kit.totalPriceCents)} (${budgetUsedPct}% of cap) | remaining=${formatCurrency(kit.remainingBudgetCents)} | avg_score=${kit.averageDealScore}/100 | brands=${JSON.stringify(kit.brandCounts)}`
    );

    for (const s of kit.slots) {
      const reqTag = s.slot.required ? "REQ" : "OPT";
      if (s.item) {
        console.log(
          `  [${reqTag}] ${s.slot.label.padEnd(18)} -> ${s.item.brandName} (${s.item.brandCode}) | ${s.item.name} | ${formatCurrency(s.item.currentPriceCents)} | color=${s.matchedColor} | formality=${s.itemFormality} | score=${s.item.dealScore}`
        );
      } else {
        console.log(
          `  [${reqTag}] ${s.slot.label.padEnd(18)} -> UNFILLED (${s.status}): ${s.selectionReason}`
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Kit report failed:", err);
    process.exit(1);
  });
