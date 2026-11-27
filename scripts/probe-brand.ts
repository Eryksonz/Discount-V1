import "dotenv/config";
import { BRANDS, type BrandConfig } from "@config/brands";

export interface ProbeMethodResult {
  supported: boolean;
  status: number | null;
  sampleCount: number;
  sampleTitle?: string;
  samplePrice?: string;
  notes: string;
}

export interface BrandProbeReport {
  brandName: string;
  brandSlug: string;
  baseUrl: string;
  robotsStatus: number | null;
  robotsAllowsProductsJson: boolean;
  robotsAllowsSalePath: boolean;
  crawlDelaySec: number | null;
  methods: {
    jsonLd: ProbeMethodResult;
    shopifyJson: ProbeMethodResult;
    internalApi: ProbeMethodResult;
    playwrightFallbackNeeded: boolean;
  };
  recommendedMethod: "shopify-json" | "json-ld" | "internal-api" | "playwright" | "blocked";
}

const CONTACT_EMAIL =
  process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@tapeandtailor.example.com";
const USER_AGENT = `TapeAndTailorBot/0.1 (+https://tapeandtailor.example.com; contact: ${CONTACT_EMAIL})`;

async function politeFetch(url: string, timeoutMs = 10000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ParsedRobots {
  disallows: string[];
  crawlDelaySec: number | null;
}

function parseRobotsTxt(body: string): ParsedRobots {
  const lines = body.split(/\r?\n/);
  let inStar = false;
  const disallows: string[] = [];
  let crawlDelaySec: number | null = null;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    if (!keyRaw || rest.length === 0) continue;
    const key = keyRaw.trim().toLowerCase();
    const val = rest.join(":").trim();

    if (key === "user-agent") {
      inStar = val === "*" || val.toLowerCase().includes("tapeandtailor");
    } else if (inStar && key === "disallow" && val) {
      disallows.push(val);
    } else if (inStar && key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n)) crawlDelaySec = n;
    }
  }
  return { disallows, crawlDelaySec };
}

function isPathAllowed(path: string, disallows: string[]): boolean {
  for (const rule of disallows) {
    if (rule === "/") return false;
    if (rule.includes("*")) {
      const re = new RegExp(
        "^" +
          rule
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
      );
      if (re.test(path)) return false;
    } else if (path.startsWith(rule)) {
      return false;
    }
  }
  return true;
}

function extractJsonLdProducts(html: string): Array<{ name?: string; price?: string; currency?: string }> {
  const results: Array<{ name?: string; price?: string; currency?: string }> = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    const typeVal = obj["@type"];
    const types = Array.isArray(typeVal) ? typeVal : [typeVal];
    if (types.some((t) => typeof t === "string" && t.toLowerCase() === "product")) {
      const offers = obj.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      const firstOffer = Array.isArray(offers) ? offers[0] : offers;
      const price = firstOffer?.price ?? firstOffer?.lowPrice;
      const currency = firstOffer?.priceCurrency;
      results.push({
        name: typeof obj.name === "string" ? obj.name : undefined,
        price: price !== undefined ? String(price) : undefined,
        currency: typeof currency === "string" ? currency : undefined,
      });
    }
    if (obj["@graph"]) visit(obj["@graph"]);
    if (obj.itemListElement) visit(obj.itemListElement);
    if (obj.item) visit(obj.item);
  };

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      visit(parsed);
    } catch {
      // Ignore malformed JSON-LD script blocks
    }
  }

  return results;
}

function discoverProductLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  const links = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const raw = match[1];
    if (
      /\/(products?|p|item|pd|dp)\/[a-z0-9_-]{3,}/i.test(raw) &&
      !raw.includes(".js") &&
      !raw.includes(".css")
    ) {
      try {
        const resolved = new URL(raw, origin);
        if (resolved.origin === origin) {
          links.add(resolved.toString());
        }
      } catch {
        // skip
      }
    }
    if (links.size >= 5) break;
  }
  return Array.from(links);
}

export async function probeBrandTarget(target: {
  brandName: string;
  brandSlug: string;
  baseUrl: string;
  salePath?: string;
  shopifyCollections?: string[];
}): Promise<BrandProbeReport> {
  const base = target.baseUrl.replace(/\/+$/, "");
  const salePath = target.salePath ?? "/";

  // 0. Check robots.txt
  const robotsResp = await politeFetch(`${base}/robots.txt`);
  const robotsStatus = robotsResp?.status ?? null;
  const robotsText = robotsResp && robotsResp.ok ? await robotsResp.text() : "";
  const robots = parseRobotsTxt(robotsText);
  const robotsAllowsProductsJson = isPathAllowed("/products.json", robots.disallows);
  const robotsAllowsSalePath = isPathAllowed(salePath, robots.disallows);

  // 1. Check Shopify public JSON endpoints (/products.json & /collections/<handle>/products.json)
  let shopifyJson: ProbeMethodResult = {
    supported: false,
    status: null,
    sampleCount: 0,
    notes: "Not Shopify JSON or endpoint unavailable",
  };

  if (robotsAllowsProductsJson) {
    const candidatePaths = [
      "/products.json?limit=5",
      ...(target.shopifyCollections ?? []).slice(0, 2).map((c) => `/collections/${c}/products.json?limit=5`),
    ];
    for (const p of candidatePaths) {
      const resp = await politeFetch(`${base}${p}`);
      if (!resp) continue;
      shopifyJson.status = resp.status;
      if (resp.ok) {
        try {
          const data = (await resp.json()) as {
            products?: Array<{
              title?: string;
              variants?: Array<{ price?: string; compare_at_price?: string | null }>;
            }>;
          };
          if (Array.isArray(data.products) && data.products.length > 0) {
            const first = data.products[0];
            const firstVariant = first.variants?.[0];
            shopifyJson = {
              supported: true,
              status: resp.status,
              sampleCount: data.products.length,
              sampleTitle: first.title,
              samplePrice: firstVariant?.price
                ? `$${firstVariant.price}${firstVariant.compare_at_price ? ` (orig $${firstVariant.compare_at_price})` : ""}`
                : undefined,
              notes: `Clean Shopify JSON at ${p}`,
            };
            break;
          }
        } catch {
          shopifyJson.notes = `HTTP ${resp.status} non-JSON response at ${p}`;
        }
      } else {
        shopifyJson.notes = `HTTP ${resp.status} at ${p}`;
      }
    }
  } else {
    shopifyJson.notes = "Disallowed by robots.txt";
  }

  // 2. Check schema.org JSON-LD (via sale page + discovered product page) & 3. internal JSON/SSR data
  let jsonLd: ProbeMethodResult = {
    supported: false,
    status: null,
    sampleCount: 0,
    notes: "No Product JSON-LD detected",
  };
  let internalApi: ProbeMethodResult = {
    supported: false,
    status: null,
    sampleCount: 0,
    notes: "No public category JSON payload detected",
  };
  let blockedByWaf = false;

  if (robotsAllowsSalePath) {
    const saleResp = await politeFetch(`${base}${salePath}`);
    if (saleResp) {
      jsonLd.status = saleResp.status;
      internalApi.status = saleResp.status;
      if (saleResp.status === 403 || saleResp.status === 429) {
        blockedByWaf = true;
        jsonLd.notes = `Blocked with HTTP ${saleResp.status} on ${salePath}`;
        internalApi.notes = `Blocked with HTTP ${saleResp.status}`;
      } else if (saleResp.ok) {
        const saleHtml = await saleResp.text();

        // Check embedded SSR JSON payloads (__NEXT_DATA__, Shopify meta, Demandware/SFCC data)
        if (saleHtml.includes("__NEXT_DATA__")) {
          internalApi = {
            supported: true,
            status: saleResp.status,
            sampleCount: 1,
            notes: "Next.js __NEXT_DATA__ JSON payload present on sale page",
          };
        } else if (/window\.ShopifyAnalytics|Shopify\.shop/i.test(saleHtml)) {
          internalApi = {
            supported: true,
            status: saleResp.status,
            sampleCount: 1,
            notes: "Shopify storefront detected (meta/suggest.json available)",
          };
        }

        // Check JSON-LD directly on sale page first
        let ldProducts = extractJsonLdProducts(saleHtml);

        // If none on listing page, follow first discovered product URL
        if (ldProducts.length === 0) {
          const productUrls = discoverProductLinks(saleHtml, base);
          for (const pUrl of productUrls.slice(0, 2)) {
            const pPath = new URL(pUrl).pathname;
            if (!isPathAllowed(pPath, robots.disallows)) continue;
            const pResp = await politeFetch(pUrl);
            if (pResp && pResp.ok) {
              const pHtml = await pResp.text();
              ldProducts = extractJsonLdProducts(pHtml);
              if (ldProducts.length > 0) {
                jsonLd = {
                  supported: true,
                  status: pResp.status,
                  sampleCount: ldProducts.length,
                  sampleTitle: ldProducts[0].name,
                  samplePrice: ldProducts[0].price
                    ? `${ldProducts[0].currency ?? "USD"} ${ldProducts[0].price}`
                    : undefined,
                  notes: `Clean schema.org Product JSON-LD on ${pPath}`,
                };
                break;
              }
            } else if (pResp && (pResp.status === 403 || pResp.status === 429)) {
              blockedByWaf = true;
              jsonLd.notes = `Product page returned HTTP ${pResp.status}`;
            }
          }
        } else {
          jsonLd = {
            supported: true,
            status: saleResp.status,
            sampleCount: ldProducts.length,
            sampleTitle: ldProducts[0].name,
            samplePrice: ldProducts[0].price
              ? `${ldProducts[0].currency ?? "USD"} ${ldProducts[0].price}`
              : undefined,
            notes: `schema.org Product JSON-LD directly on ${salePath}`,
          };
        }
      } else {
        jsonLd.notes = `Sale page returned HTTP ${saleResp.status} at ${salePath}`;
      }
    } else {
      jsonLd.notes = "Network timeout / connection error";
    }
  } else {
    jsonLd.notes = `Sale path ${salePath} disallowed by robots.txt`;
  }

  let recommendedMethod: BrandProbeReport["recommendedMethod"] = "playwright";
  if (shopifyJson.supported) {
    recommendedMethod = "shopify-json";
  } else if (jsonLd.supported) {
    recommendedMethod = "json-ld";
  } else if (internalApi.supported) {
    recommendedMethod = "internal-api";
  } else if (blockedByWaf) {
    recommendedMethod = "blocked";
  }

  return {
    brandName: target.brandName,
    brandSlug: target.brandSlug,
    baseUrl: base,
    robotsStatus,
    robotsAllowsProductsJson,
    robotsAllowsSalePath,
    crawlDelaySec: robots.crawlDelaySec,
    methods: {
      jsonLd,
      shopifyJson,
      internalApi,
      playwrightFallbackNeeded: recommendedMethod === "playwright",
    },
    recommendedMethod,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes("--all") || args.length === 0;
  const targets: Array<{
    brandName: string;
    brandSlug: string;
    baseUrl: string;
    salePath?: string;
    shopifyCollections?: string[];
  }> = [];

  if (runAll) {
    for (const b of BRANDS as readonly BrandConfig[]) {
      targets.push({
        brandName: b.name,
        brandSlug: b.slug,
        baseUrl: b.baseUrl,
        salePath: b.crawler.salePaths[0],
        shopifyCollections: b.crawler.shopifyCollections,
      });
    }
  } else {
    const arg = args[0];
    const bySlug = BRANDS.find((b) => b.slug === arg);
    if (bySlug) {
      targets.push({
        brandName: bySlug.name,
        brandSlug: bySlug.slug,
        baseUrl: bySlug.baseUrl,
        salePath: bySlug.crawler.salePaths[0],
        shopifyCollections: bySlug.crawler.shopifyCollections,
      });
    } else {
      const url = arg.startsWith("http") ? arg : `https://${arg}`;
      const host = new URL(url).hostname;
      targets.push({
        brandName: host,
        brandSlug: host.replace(/^www\./, "").split(".")[0],
        baseUrl: new URL(url).origin,
        salePath: new URL(url).pathname || "/",
      });
    }
  }

  console.log(`Probing ${targets.length} brand(s) with User-Agent: ${USER_AGENT}\n`);

  const reports: BrandProbeReport[] = [];
  for (const t of targets) {
    const report = await probeBrandTarget(t);
    reports.push(report);
    const badge = report.recommendedMethod.toUpperCase().padEnd(12);
    const detail = report.methods.shopifyJson.supported
      ? `${report.methods.shopifyJson.notes} | sample: "${report.methods.shopifyJson.sampleTitle}" ${report.methods.shopifyJson.samplePrice ?? ""}`
      : report.methods.jsonLd.supported
        ? `${report.methods.jsonLd.notes} | sample: "${report.methods.jsonLd.sampleTitle}" ${report.methods.jsonLd.samplePrice ?? ""}`
        : `shopify=${report.methods.shopifyJson.status ?? "err"} (${report.methods.shopifyJson.notes}) | ld=${report.methods.jsonLd.status ?? "err"} (${report.methods.jsonLd.notes})`;
    console.log(`[${badge}] ${report.brandName.padEnd(18)} | robots=${report.robotsStatus ?? "err"} | ${detail}`);
  }

  console.log("\nSummary of clean (Shopify JSON / JSON-LD) candidates:");
  const clean = reports.filter(
    (r) => r.recommendedMethod === "shopify-json" || r.recommendedMethod === "json-ld"
  );
  for (const c of clean) {
    console.log(`  - ${c.brandName} (${c.brandSlug}): ${c.recommendedMethod}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Probe failed:", err);
    process.exit(1);
  });
}
