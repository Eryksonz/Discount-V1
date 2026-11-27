import type { RawCrawledProduct } from "../types";

export interface ShopifyVariant {
  id: number | string;
  title?: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  price?: string | number;
  compare_at_price?: string | number | null;
  available?: boolean;
}

export interface ShopifyProduct {
  id: number | string;
  title?: string;
  handle?: string;
  product_type?: string;
  vendor?: string;
  tags?: string[] | string;
  options?: Array<{ name?: string; values?: string[] }>;
  variants?: ShopifyVariant[];
  images?: Array<{ src?: string }>;
}

export interface ShopifyProductsPayload {
  products?: ShopifyProduct[];
}

function toCents(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = typeof val === "number" ? val : Number(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function extractColorAndSize(
  product: ShopifyProduct,
  availableVariants: ShopifyVariant[]
): { colors: string[]; sizes: string[] } {
  const colors = new Set<string>();
  const sizes = new Set<string>();

  const optionNames = (product.options ?? []).map((o) => (o.name ?? "").toLowerCase());
  const colorIdx = optionNames.findIndex((n) => n.includes("color") || n.includes("colour"));
  const sizeIdx = optionNames.findIndex(
    (n) => n.includes("size") || n.includes("waist") || n.includes("neck") || n.includes("fit")
  );

  // Also infer color from title pattern "Product Name - Navy"
  if (product.title && product.title.includes(" - ")) {
    const suffix = product.title.split(" - ").slice(1).join(" - ").trim();
    if (suffix && suffix.length <= 40) {
      colors.add(suffix);
    }
  }

  for (const variant of availableVariants) {
    const opts = [variant.option1, variant.option2, variant.option3];
    if (colorIdx >= 0 && opts[colorIdx]) {
      colors.add(String(opts[colorIdx]).trim());
    }
    if (sizeIdx >= 0 && opts[sizeIdx]) {
      sizes.add(String(opts[sizeIdx]).trim());
    } else if (sizeIdx === -1 && variant.title && variant.title !== "Default Title") {
      // Single-option Shopify products commonly put size directly in variant.title
      sizes.add(variant.title.trim());
    }
  }

  return {
    colors: Array.from(colors).filter((c) => c && c.toLowerCase() !== "default title"),
    sizes: Array.from(sizes).filter((s) => s && s.toLowerCase() !== "default title"),
  };
}

/**
 * Pure parser for Shopify `/products.json` and `/collections/<handle>/products.json` payloads.
 * Skips gift cards and women's/kids'-only items when clearly tagged so the menswear catalog stays focused.
 */
export function parseShopifyProducts(
  payload: ShopifyProductsPayload,
  baseUrl: string,
  collectionHint = ""
): RawCrawledProduct[] {
  const origin = new URL(baseUrl).origin;
  const results: RawCrawledProduct[] = [];

  for (const p of payload.products ?? []) {
    const title = (p.title ?? "").trim();
    const handle = (p.handle ?? "").trim();
    if (!title || !handle) continue;

    // Exclude non-garment gift cards
    if (/\bgift\s*card\b/i.test(title) || /\bgift\s*card\b/i.test(p.product_type ?? "")) {
      continue;
    }

    const tagsArray = Array.isArray(p.tags)
      ? p.tags
      : typeof p.tags === "string"
        ? p.tags.split(",").map((t) => t.trim())
        : [];
    const tagsLower = tagsArray.map((t) => t.toLowerCase());
    const typeLower = (p.product_type ?? "").toLowerCase();

    // Skip explicitly women's-only or kids' items if pulling from global /products.json
    if (
      /\b(women|women's|womens|dress|skirt|bra|bikini|legging|maternity|kids|youth|toddler|baby)\b/i.test(
        `${title} ${typeLower} ${tagsLower.join(" ")}`
      ) &&
      !/\b(dress\s+shirt|dress\s+pant|dress\s+trouser|dress\s+shoe|dress\s+belt)\b/i.test(title)
    ) {
      continue;
    }

    const variants = p.variants ?? [];
    if (variants.length === 0) continue;

    const availableVariants = variants.filter((v) => v.available !== false);
    const inStock = availableVariants.length > 0;
    const pricingPool = availableVariants.length > 0 ? availableVariants : variants;

    const validPrices = pricingPool.map((v) => toCents(v.price)).filter((c) => c > 0);
    if (validPrices.length === 0) continue;

    const currentPriceCents = Math.min(...validPrices);

    const comparePrices = pricingPool
      .map((v) => toCents(v.compare_at_price))
      .filter((c) => c >= currentPriceCents);
    const originalPriceCents =
      comparePrices.length > 0 ? Math.max(...comparePrices) : currentPriceCents;

    const { colors, sizes } = extractColorAndSize(p, availableVariants);

    const breadcrumbParts = [
      "Men",
      collectionHint ? collectionHint.replace(/-/g, " ") : "",
      p.product_type ?? "",
    ].filter(Boolean);

    results.push({
      externalId: String(p.id),
      name: title,
      rawBreadcrumb: breadcrumbParts.join(" > "),
      currentPriceCents,
      originalPriceCents,
      currency: "USD",
      productUrl: `${origin}/products/${handle}`,
      imageUrl: p.images?.[0]?.src ?? null,
      inStock,
      colors,
      sizes,
      sourceMethod: "shopify-json",
    });
  }

  return results;
}
