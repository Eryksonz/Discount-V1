import { config } from "dotenv";
import { VERIFIED_PILOT_BRANDS } from "./adapters";
import { runBrandCrawl } from "./pipeline";

config({ path: ".env.local" });
config({ path: ".env" });

function parseArg(prefix: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const brandArg = parseArg("--brand=");
  const modeArg = (parseArg("--mode=") ?? "manual") as "baseline" | "high-frequency" | "manual";
  const maxProductsArg = parseArg("--max=");
  const dryRun = process.argv.includes("--dry-run");
  const maxProducts = maxProductsArg ? Number(maxProductsArg) : 60;

  const targetBrands = brandArg
    ? brandArg.split(",").map((s) => s.trim()).filter(Boolean)
    : [...VERIFIED_PILOT_BRANDS];

  console.log(
    `[Tape & Tailor Crawler] mode=${modeArg} dryRun=${dryRun} brands=${targetBrands.join(", ")}`
  );

  const results = [];
  for (const slug of targetBrands) {
    const summary = await runBrandCrawl({
      brandSlug: slug,
      mode: modeArg,
      maxProducts,
      dryRun,
    });
    results.push(summary);
    console.log(
      `  -> ${summary.brandSlug.padEnd(14)} status=${summary.status} method=${summary.methodUsed ?? "none"} seen=${summary.productsSeen} new=${summary.newProducts} changes=${summary.priceChanges} quarantined=${summary.quarantinedCount} unclassified=${summary.unclassifiedCount} (${summary.durationMs}ms)`
    );
  }

  const anyFailed = results.some((r) => r.status === "failed");
  if (anyFailed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[Tape & Tailor Crawler] Fatal error:", err);
  process.exit(1);
});
