import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BRANDS, validateAndBuildOutboundUrl } from "@config/brands";
import { generateSeedCatalog } from "@/db/seed-data";
import { queryCatalogFeed } from "../repository";

describe("Deterministic seed catalog, DEMO_MODE gating, and /go/[id] allowlist", () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.DEMO_MODE = "true";
  });

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it("throws loudly when DATABASE_URL is missing and DEMO_MODE is not 'true'", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DEMO_MODE;
    await expect(queryCatalogFeed({})).rejects.toThrow(/DEMO_MODE=true/);
  });

  it("generates at least 200 deterministic products covering all 16 curated brands", () => {
    const catalog = generateSeedCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(200);

    const presentBrands = new Set(catalog.map((p) => p.brandSlug));
    for (const brand of BRANDS) {
      expect(presentBrands.has(brand.slug)).toBe(true);
    }

    const unclassified = catalog.filter((p) => p.classificationStatus === "unclassified");
    expect(unclassified.length).toBe(3);
  });

  it("supports typo-tolerant search without any AI/embeddings", async () => {
    const res = await queryCatalogFeed({ q: "Petr Milar" });
    expect(res.isDemoData).toBe(true);
    expect(res.totalMatched).toBeGreaterThan(0);
    expect(res.items.some((item) => item.brandSlug === "peter-millar")).toBe(true);
  });

  it("filters accurately by brand, occasion, maxPrice, and verified deal signal", async () => {
    const res = await queryCatalogFeed({
      brands: ["brooks-brothers", "suitsupply", "spier-mackay"],
      occasions: ["Interview"],
      maxPrice: 600,
      dealSignal: "verified_only",
    });

    for (const item of res.items) {
      expect(["brooks-brothers", "suitsupply", "spier-mackay"]).toContain(item.brandSlug);
      expect(item.occasions).toContain("Interview");
      expect(item.currentPriceCents).toBeLessThanOrEqual(60000);
      expect(["Lowest in 90 days", "Real deal"]).toContain(item.dealLabel);
    }
  });

  it("enforces strict brand host allowlist on outbound redirects (/go/[id])", () => {
    const ok = validateAndBuildOutboundUrl(
      "peter-millar",
      "https://www.petermillar.com/p/perth-quarter-zip"
    );
    expect(ok.ok).toBe(true);

    // Reject non-HTTPS
    expect(
      validateAndBuildOutboundUrl("peter-millar", "http://www.petermillar.com/p/perth").ok
    ).toBe(false);

    // Reject spoofed host / open redirect
    expect(
      validateAndBuildOutboundUrl("peter-millar", "https://www.petermillar.com.evil.example/p/x").ok
    ).toBe(false);

    // Reject cross-brand mismatch
    expect(
      validateAndBuildOutboundUrl("peter-millar", "https://www.brooksbrothers.com/p/shirt").ok
    ).toBe(false);

    // Reject javascript: URI
    expect(
      validateAndBuildOutboundUrl("peter-millar", "javascript:alert(1)").ok
    ).toBe(false);
  });
});
