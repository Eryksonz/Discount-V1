import type { RawCrawledProduct } from "../types";

function toCents(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = Number(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageUrl(imageRaw: unknown): string | null {
  if (typeof imageRaw === "string" && imageRaw.startsWith("http")) {
    return imageRaw;
  }
  if (Array.isArray(imageRaw)) {
    for (const item of imageRaw) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
  }
  if (imageRaw && typeof imageRaw === "object") {
    const obj = imageRaw as Record<string, unknown>;
    if (typeof obj.url === "string" && obj.url.startsWith("http")) {
      return obj.url;
    }
    if (typeof obj.contentUrl === "string" && obj.contentUrl.startsWith("http")) {
      return obj.contentUrl;
    }
  }
  return null;
}

function normalizeOffers(offersRaw: unknown): Record<string, unknown>[] {
  if (Array.isArray(offersRaw)) {
    return offersRaw.filter((o): o is Record<string, unknown> => Boolean(o && typeof o === "object"));
  }
  if (offersRaw && typeof offersRaw === "object") {
    return [offersRaw as Record<string, unknown>];
  }
  return [];
}

function extractOfferPrices(offer: Record<string, unknown>): {
  priceCents: number;
  listPriceCents: number;
  inStock: boolean;
  currency: string;
} {
  const priceCents = toCents(offer.price ?? offer.lowPrice);
  let listPriceCents = toCents(offer.highPrice);

  const specRaw = offer.priceSpecification;
  const specs = Array.isArray(specRaw)
    ? specRaw
    : specRaw && typeof specRaw === "object"
      ? [specRaw]
      : [];

  for (const spec of specs) {
    if (!spec || typeof spec !== "object") continue;
    const s = spec as Record<string, unknown>;
    const priceType = String(s.priceType ?? "").toLowerCase();
    const specPrice = toCents(s.price ?? s.maxPrice);
    if (specPrice > 0) {
      if (
        priceType.includes("listprice") ||
        priceType.includes("msrp") ||
        priceType.includes("original") ||
        specPrice > priceCents
      ) {
        if (specPrice > listPriceCents) listPriceCents = specPrice;
      }
    }
  }

  if (listPriceCents < priceCents) {
    listPriceCents = priceCents;
  }

  const avail = String(offer.availability ?? "");
  const inStock =
    !avail ||
    /InStock|LimitedAvailability|OnlineOnly|PreOrder/i.test(avail);

  const currency =
    typeof offer.priceCurrency === "string" && offer.priceCurrency.trim()
      ? offer.priceCurrency.trim()
      : "USD";

  return { priceCents, listPriceCents, inStock, currency };
}

/**
 * Extracts Salesforce Commerce Cloud / Demandware strike-through compare-at price
 * only when JSON-LD does not emit a separate ListPrice specification.
 */
function extractHtmlStrikeThroughPriceCents(html: string): number {
  const strikeRe =
    /class=["'][^"']*strike-through[^"']*["'][^>]*>[\s\S]{0,240}?\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const m = strikeRe.exec(html);
  if (!m) return 0;
  return toCents(m[1]);
}

function deriveBreadcrumbFromUrl(pageUrl: string): string {
  try {
    const pathname = new URL(pageUrl).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0].toLowerCase() === "product") {
      return segments[1].replace(/-/g, " ");
    }
  } catch {
    // ignore
  }
  return "";
}

function extractBreadcrumbFromNode(node: Record<string, unknown>): string {
  const list = node.itemListElement;
  if (!Array.isArray(list) || list.length === 0) return "";
  const sorted = [...list].sort((a, b) => {
    const posA = Number((a as Record<string, unknown>)?.position ?? 0);
    const posB = Number((b as Record<string, unknown>)?.position ?? 0);
    return posA - posB;
  });
  const labels: string[] = [];
  for (const entry of sorted) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const itemObj = e.item && typeof e.item === "object" ? (e.item as Record<string, unknown>) : null;
    const rawName =
      typeof itemObj?.name === "string"
        ? itemObj.name
        : typeof e.name === "string"
          ? e.name
          : "";
    const cleaned = cleanText(rawName);
    if (cleaned && cleaned.toLowerCase() !== "home") {
      labels.push(cleaned);
    }
  }
  return labels.join(" > ");
}

function hasType(obj: Record<string, unknown>, target: string): boolean {
  const typeField = obj["@type"];
  const types = Array.isArray(typeField) ? typeField : [typeField];
  const targetLower = target.toLowerCase();
  return types.some((t) => typeof t === "string" && t.toLowerCase() === targetLower);
}

/**
 * Pure parser for schema.org `ProductGroup` (with `hasVariant[]`), `Product`, `Offer`,
 * `UnitPriceSpecification` (`ListPrice`), and `BreadcrumbList` JSON-LD blocks inside public HTML pages.
 */
export function parseJsonLdProductsFromHtml(
  html: string,
  pageUrl: string,
  breadcrumbFallback = ""
): RawCrawledProduct[] {
  const blocks: unknown[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Skip malformed script tags
    }
  }

  let detectedBreadcrumb = "";
  const productGroups: Record<string, unknown>[] = [];
  const standaloneProducts: Record<string, unknown>[] = [];

  const collect = (node: unknown, insideProductGroup = false) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) collect(item, insideProductGroup);
      return;
    }

    const obj = node as Record<string, unknown>;

    if (hasType(obj, "BreadcrumbList") && !detectedBreadcrumb) {
      detectedBreadcrumb = extractBreadcrumbFromNode(obj);
    }

    if (hasType(obj, "ProductGroup")) {
      productGroups.push(obj);
      // Do not recurse into hasVariant as standalone products; handled in ProductGroup aggregation
      return;
    }

    if (!insideProductGroup && hasType(obj, "Product")) {
      standaloneProducts.push(obj);
    }

    if (obj["@graph"]) collect(obj["@graph"], insideProductGroup);
    if (obj.itemListElement && !hasType(obj, "BreadcrumbList")) {
      collect(obj.itemListElement, insideProductGroup);
    }
    if (obj.item) collect(obj.item, insideProductGroup);
  };

  for (const block of blocks) {
    collect(block, false);
  }

  const effectiveBreadcrumb =
    detectedBreadcrumb || breadcrumbFallback || deriveBreadcrumbFromUrl(pageUrl);
  const htmlStrikeThroughCents = extractHtmlStrikeThroughPriceCents(html);

  const results: RawCrawledProduct[] = [];
  const seenExternalIds = new Set<string>();

  const resolveOriginalPrice = (currentCents: number, ldOriginalCents: number): number => {
    if (ldOriginalCents > currentCents) return ldOriginalCents;
    if (
      htmlStrikeThroughCents > currentCents &&
      htmlStrikeThroughCents <= currentCents * 5
    ) {
      return htmlStrikeThroughCents;
    }
    return currentCents;
  };

  // 1. Parse ProductGroup nodes first (aggregates all color/size variants into one canonical SKU)
  for (const group of productGroups) {
    const name = typeof group.name === "string" ? cleanText(group.name) : "";
    if (!name) continue;

    const variantsRaw = Array.isArray(group.hasVariant)
      ? (group.hasVariant as Record<string, unknown>[])
      : [];

    const inStockPrices: number[] = [];
    const allPrices: number[] = [];
    const listPrices: number[] = [];
    const inStockColors = new Set<string>();
    const allColors = new Set<string>();
    const inStockSizes = new Set<string>();
    const allSizes = new Set<string>();
    let anyInStock = false;
    let currency = "USD";
    let variantImage: string | null = null;

    for (const v of variantsRaw) {
      if (!v || typeof v !== "object") continue;
      if (!variantImage) variantImage = extractImageUrl(v.image);
      const vColor = typeof v.color === "string" ? cleanText(v.color) : "";
      const vSize = typeof v.size === "string" ? cleanText(v.size) : "";
      if (vColor) allColors.add(vColor);
      if (vSize) allSizes.add(vSize);

      const offers = normalizeOffers(v.offers);
      for (const offer of offers) {
        const parsed = extractOfferPrices(offer);
        if (parsed.currency) currency = parsed.currency;
        if (parsed.priceCents > 0) {
          allPrices.push(parsed.priceCents);
          if (parsed.listPriceCents > 0) listPrices.push(parsed.listPriceCents);
          if (parsed.inStock) {
            anyInStock = true;
            inStockPrices.push(parsed.priceCents);
            if (vColor) inStockColors.add(vColor);
            if (vSize) inStockSizes.add(vSize);
          }
        }
      }
    }

    // Also inspect group-level offers if present
    for (const offer of normalizeOffers(group.offers)) {
      const parsed = extractOfferPrices(offer);
      if (parsed.currency) currency = parsed.currency;
      if (parsed.priceCents > 0) {
        allPrices.push(parsed.priceCents);
        if (parsed.listPriceCents > 0) listPrices.push(parsed.listPriceCents);
        if (parsed.inStock) {
          anyInStock = true;
          inStockPrices.push(parsed.priceCents);
        }
      }
    }

    const activePrices = inStockPrices.length > 0 ? inStockPrices : allPrices;
    if (activePrices.length === 0) continue;

    const currentPriceCents = Math.min(...activePrices);
    const ldOriginalCents = listPrices.length > 0 ? Math.max(...listPrices) : currentPriceCents;
    const originalPriceCents = resolveOriginalPrice(currentPriceCents, ldOriginalCents);

    const externalId = String(
      group.productGroupID ?? group.sku ?? group.id ?? new URL(pageUrl).pathname
    ).trim();
    if (!externalId || seenExternalIds.has(externalId)) continue;
    seenExternalIds.add(externalId);

    const imageUrl = extractImageUrl(group.image) ?? variantImage;
    const categoryVal =
      typeof group.category === "string" && group.category.trim()
        ? cleanText(group.category)
        : effectiveBreadcrumb;

    const finalColors = Array.from(inStockColors.size > 0 ? inStockColors : allColors);
    const finalSizes = Array.from(inStockSizes.size > 0 ? inStockSizes : allSizes);

    results.push({
      externalId,
      name,
      rawBreadcrumb: categoryVal,
      currentPriceCents,
      originalPriceCents,
      currency,
      productUrl: pageUrl,
      imageUrl,
      inStock: anyInStock,
      colors: finalColors,
      sizes: finalSizes,
      sourceMethod: "json-ld",
    });
  }

  // 2. Parse standalone Product nodes ONLY when no ProductGroup was emitted on this page
  // (prevents duplicate rows on @graph PDPs where sibling Product uses a variant-padded SKU)
  if (results.length > 0) {
    return results;
  }

  for (const obj of standaloneProducts) {
    const externalId = String(
      obj.sku ?? obj.productID ?? obj.mpn ?? new URL(pageUrl).pathname
    ).trim();
    if (!externalId || seenExternalIds.has(externalId)) continue;

    const name = typeof obj.name === "string" ? cleanText(obj.name) : "";
    const offersList = normalizeOffers(obj.offers);
    const extracted = offersList.map(extractOfferPrices).filter((o) => o.priceCents > 0);

    if (!name || extracted.length === 0) continue;

    const inStockOffers = extracted.filter((o) => o.inStock);
    const pricePool = inStockOffers.length > 0 ? inStockOffers : extracted;
    const currentPriceCents = Math.min(...pricePool.map((o) => o.priceCents));
    const ldOriginalCents = Math.max(...extracted.map((o) => o.listPriceCents));
    const originalPriceCents = resolveOriginalPrice(currentPriceCents, ldOriginalCents);
    const inStock = inStockOffers.length > 0;
    const currency = pricePool[0]?.currency ?? "USD";

    const imageUrl = extractImageUrl(obj.image);
    const colorVal = typeof obj.color === "string" && obj.color.trim() ? [cleanText(obj.color)] : [];
    const sizeVal = typeof obj.size === "string" && obj.size.trim() ? [cleanText(obj.size)] : [];
    const categoryVal =
      typeof obj.category === "string" && obj.category.trim()
        ? cleanText(obj.category)
        : effectiveBreadcrumb;

    const canonicalUrl =
      typeof obj.url === "string" && obj.url.startsWith("https://") && !obj.url.includes("color=null")
        ? obj.url
        : pageUrl;

    seenExternalIds.add(externalId);
    results.push({
      externalId,
      name,
      rawBreadcrumb: categoryVal,
      currentPriceCents,
      originalPriceCents,
      currency,
      productUrl: canonicalUrl,
      imageUrl,
      inStock,
      colors: colorVal,
      sizes: sizeVal,
      sourceMethod: "json-ld",
    });
  }

  return results;
}
