import type { RawCrawledProduct } from "../types";

function toCents(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = Number(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

/**
 * Pure parser for schema.org `Product` / `Offer` JSON-LD blocks inside public HTML product pages.
 */
export function parseJsonLdProductsFromHtml(
  html: string,
  pageUrl: string,
  breadcrumbFallback = ""
): RawCrawledProduct[] {
  const results: RawCrawledProduct[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const obj = node as Record<string, unknown>;
    const typeField = obj["@type"];
    const types = Array.isArray(typeField) ? typeField : [typeField];
    const isProduct = types.some((t) => typeof t === "string" && t.toLowerCase() === "product");

    if (isProduct) {
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const offersRaw = obj.offers;
      const offersList = Array.isArray(offersRaw)
        ? (offersRaw as Record<string, unknown>[])
        : offersRaw && typeof offersRaw === "object"
          ? [offersRaw as Record<string, unknown>]
          : [];

      const prices = offersList
        .map((o) => toCents(o.price ?? o.lowPrice))
        .filter((c) => c > 0);

      if (name && prices.length > 0) {
        const currentPriceCents = Math.min(...prices);
        const highPrices = offersList
          .map((o) => toCents(o.highPrice))
          .filter((c) => c >= currentPriceCents);
        const originalPriceCents =
          highPrices.length > 0 ? Math.max(...highPrices) : currentPriceCents;

        const availabilityStr = offersList
          .map((o) => String(o.availability ?? ""))
          .join(" ");
        const inStock = !availabilityStr || /InStock|LimitedAvailability/i.test(availabilityStr);

        const imageRaw = obj.image;
        const imageUrl =
          typeof imageRaw === "string"
            ? imageRaw
            : Array.isArray(imageRaw) && typeof imageRaw[0] === "string"
              ? imageRaw[0]
              : null;

        const externalId = String(
          obj.sku ?? obj.productID ?? obj.mpn ?? new URL(pageUrl).pathname
        );

        const colorVal = typeof obj.color === "string" ? [obj.color] : [];
        const categoryVal = typeof obj.category === "string" ? obj.category : breadcrumbFallback;
        const currencyVal =
          typeof offersList[0]?.priceCurrency === "string"
            ? String(offersList[0].priceCurrency)
            : "USD";

        results.push({
          externalId,
          name,
          rawBreadcrumb: categoryVal,
          currentPriceCents,
          originalPriceCents,
          currency: currencyVal,
          productUrl:
            typeof obj.url === "string" && obj.url.startsWith("https://")
              ? obj.url
              : pageUrl,
          imageUrl,
          inStock,
          colors: colorVal,
          sizes: [],
          sourceMethod: "json-ld",
        });
      }
    }

    if (obj["@graph"]) visit(obj["@graph"]);
    if (obj.itemListElement) visit(obj.itemListElement);
    if (obj.item) visit(obj.item);
  };

  while ((match = regex.exec(html)) !== null) {
    try {
      visit(JSON.parse(match[1].trim()));
    } catch {
      // Skip malformed script tags
    }
  }

  return results;
}
