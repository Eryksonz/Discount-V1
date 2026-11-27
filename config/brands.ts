export type CrawlMethod = "json-ld" | "shopify-json" | "internal-api" | "playwright";

export type AffiliateNetwork =
  | "rakuten"
  | "impact"
  | "cj"
  | "awin"
  | "shareasale"
  | "direct";

export interface BrandConfig {
  slug: string;
  name: string;
  /** Unambiguous 4-character internal brand code (intentionally avoids NYSE/NASDAQ 2-letter tickers) */
  code: string;
  domain: string;
  /** Strict host allowlist enforced by /go/[id] outbound redirects */
  allowedHosts: string[];
  baseUrl: string;
  priceTier: "accessible" | "mid-premium" | "luxury-tailored";
  /** Hex accent used only for editorial swatches / charts */
  swatchHex: string;
  studentDiscount?: {
    provider: "UNiDAYS" | "Student Beans" | "SheerID" | "Direct .edu";
    offer: string;
  };
  affiliate: {
    network: AffiliateNetwork;
    /** Optional template where {url} is encoded target URL */
    urlTemplate?: string;
    active: boolean;
  };
  crawler: {
    preferredMethods: CrawlMethod[];
    rateLimitMs: number;
    sitemapUrls: string[];
    salePaths: string[];
    shopifyCollections?: string[];
  };
}

/** Allowlisted affiliate redirect hosts for /go/[id] verification */
export const ALLOWED_AFFILIATE_HOSTS: ReadonlySet<string> = new Set([
  "click.linksynergy.com", // Rakuten
  "www.kqzyfj.com", // CJ
  "www.jdoqocy.com", // CJ
  "www.tkqlhce.com", // CJ
  "www.anrdoezrs.net", // CJ
  "www.awin1.com", // Awin
  "www.shareasale.com", // ShareASale
  "goto.target.com",
  "imp.i123456.net", // Impact placeholder pattern checked via suffix below
]);

/**
 * Curated v1 brand registry for Tape & Tailor.
 * Adding a brand requires only appending one entry here.
 * Tape & Tailor is independent and not affiliated with or endorsed by any listed brand.
 */
export const BRANDS: readonly BrandConfig[] = [
  {
    slug: "peter-millar",
    name: "Peter Millar",
    code: "PMLR",
    domain: "www.petermillar.com",
    allowedHosts: ["www.petermillar.com", "petermillar.com"],
    baseUrl: "https://www.petermillar.com",
    priceTier: "mid-premium",
    swatchHex: "#1B365D",
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.petermillar.com/sitemap_index.xml"],
      salePaths: ["/c/men/sale"],
    },
  },
  {
    slug: "vineyard-vines",
    name: "Vineyard Vines",
    code: "VYNV",
    domain: "www.vineyardvines.com",
    allowedHosts: ["www.vineyardvines.com", "vineyardvines.com"],
    baseUrl: "https://www.vineyardvines.com",
    priceTier: "mid-premium",
    swatchHex: "#204068",
    studentDiscount: {
      provider: "SheerID",
      offer: "15% student discount program",
    },
    affiliate: { network: "cj", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.vineyardvines.com/sitemap_index.xml"],
      salePaths: ["/category/sale/mens"],
    },
  },
  {
    slug: "brooks-brothers",
    name: "Brooks Brothers",
    code: "BRKS",
    domain: "www.brooksbrothers.com",
    allowedHosts: ["www.brooksbrothers.com", "brooksbrothers.com"],
    baseUrl: "https://www.brooksbrothers.com",
    priceTier: "mid-premium",
    swatchHex: "#14263D",
    studentDiscount: {
      provider: "Student Beans",
      offer: "15% student discount program",
    },
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2500,
      sitemapUrls: ["https://www.brooksbrothers.com/sitemap_index.xml"],
      salePaths: ["/mens/sale"],
    },
  },
  {
    slug: "johnnie-o",
    name: "Johnnie-O",
    code: "JHNO",
    domain: "www.johnnie-o.com",
    allowedHosts: ["www.johnnie-o.com", "johnnie-o.com"],
    baseUrl: "https://www.johnnie-o.com",
    priceTier: "mid-premium",
    swatchHex: "#284B63",
    affiliate: { network: "impact", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.johnnie-o.com/sitemap.xml"],
      salePaths: ["/collections/mens-sale"],
      shopifyCollections: ["mens-sale", "mens-quarter-zips", "mens-polos"],
    },
  },
  {
    slug: "faherty",
    name: "Faherty",
    code: "FHRT",
    domain: "fahertybrand.com",
    allowedHosts: ["fahertybrand.com", "www.fahertybrand.com"],
    baseUrl: "https://fahertybrand.com",
    priceTier: "mid-premium",
    swatchHex: "#3C5248",
    studentDiscount: {
      provider: "SheerID",
      offer: "20% student discount program",
    },
    affiliate: { network: "impact", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://fahertybrand.com/sitemap.xml"],
      salePaths: ["/collections/mens-sale"],
      shopifyCollections: ["mens-sale", "mens-shirts", "mens-sweaters"],
    },
  },
  {
    slug: "mizzen-main",
    name: "Mizzen+Main",
    code: "MZMN",
    domain: "www.mizzenandmain.com",
    allowedHosts: ["www.mizzenandmain.com", "mizzenandmain.com"],
    baseUrl: "https://www.mizzenandmain.com",
    priceTier: "mid-premium",
    swatchHex: "#1E3A5F",
    affiliate: { network: "impact", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.mizzenandmain.com/sitemap.xml"],
      salePaths: ["/collections/sale"],
      shopifyCollections: ["sale", "dress-shirts", "pants"],
    },
  },
  {
    slug: "rhone",
    name: "Rhone",
    code: "RHNE",
    domain: "www.rhone.com",
    allowedHosts: ["www.rhone.com", "rhone.com"],
    baseUrl: "https://www.rhone.com",
    priceTier: "mid-premium",
    swatchHex: "#2F3E46",
    affiliate: { network: "impact", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.rhone.com/sitemap.xml"],
      salePaths: ["/collections/sale"],
      shopifyCollections: ["sale", "commuter"],
    },
  },
  {
    slug: "bonobos",
    name: "Bonobos",
    code: "BNBS",
    domain: "bonobos.com",
    allowedHosts: ["bonobos.com", "www.bonobos.com"],
    baseUrl: "https://bonobos.com",
    priceTier: "mid-premium",
    swatchHex: "#2A4365",
    studentDiscount: {
      provider: "SheerID",
      offer: "20% student discount program",
    },
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://bonobos.com/sitemap.xml"],
      salePaths: ["/shop/final-sale"],
      shopifyCollections: [],
    },
  },
  {
    slug: "ralph-lauren",
    name: "Ralph Lauren",
    code: "RLPH",
    domain: "www.ralphlauren.com",
    allowedHosts: ["www.ralphlauren.com", "ralphlauren.com"],
    baseUrl: "https://www.ralphlauren.com",
    priceTier: "luxury-tailored",
    swatchHex: "#0F1D32",
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2500,
      sitemapUrls: ["https://www.ralphlauren.com/sitemap_index.xml"],
      salePaths: ["/sale-men"],
    },
  },
  {
    slug: "j-crew",
    name: "J.Crew",
    code: "JCRW",
    domain: "www.jcrew.com",
    allowedHosts: ["www.jcrew.com", "jcrew.com"],
    baseUrl: "https://www.jcrew.com",
    priceTier: "accessible",
    swatchHex: "#324A5E",
    studentDiscount: {
      provider: "SheerID",
      offer: "15% student discount program",
    },
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.jcrew.com/sitemap_index.xml"],
      salePaths: ["/sale/men"],
    },
  },
  {
    slug: "charles-tyrwhitt",
    name: "Charles Tyrwhitt",
    code: "CTYR",
    domain: "www.charlestyrwhitt.com",
    allowedHosts: ["www.charlestyrwhitt.com", "charlestyrwhitt.com"],
    baseUrl: "https://www.charlestyrwhitt.com",
    priceTier: "accessible",
    swatchHex: "#1C3144",
    studentDiscount: {
      provider: "UNiDAYS",
      offer: "15% student discount program",
    },
    affiliate: { network: "awin", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.charlestyrwhitt.com/us/sitemap_index.xml"],
      salePaths: ["/us/clearance/"],
    },
  },
  {
    slug: "banana-republic",
    name: "Banana Republic",
    code: "BNRP",
    domain: "bananarepublic.gap.com",
    allowedHosts: ["bananarepublic.gap.com", "www.bananarepublic.com", "bananarepublic.com"],
    baseUrl: "https://bananarepublic.gap.com",
    priceTier: "accessible",
    swatchHex: "#4A4238",
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://bananarepublic.gap.com/sitemap_index.xml"],
      salePaths: ["/browse/category.do?cid=1014757"],
    },
  },
  {
    slug: "todd-snyder",
    name: "Todd Snyder",
    code: "TSNY",
    domain: "www.toddsnyder.com",
    allowedHosts: ["www.toddsnyder.com", "toddsnyder.com"],
    baseUrl: "https://www.toddsnyder.com",
    priceTier: "luxury-tailored",
    swatchHex: "#1E2D24",
    affiliate: { network: "rakuten", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.toddsnyder.com/sitemap.xml"],
      salePaths: ["/collections/sale"],
      shopifyCollections: ["sale", "suits-tailoring", "sweaters"],
    },
  },
  {
    slug: "suitsupply",
    name: "Suitsupply",
    code: "STSP",
    domain: "suitsupply.com",
    allowedHosts: ["suitsupply.com", "www.suitsupply.com"],
    baseUrl: "https://suitsupply.com",
    priceTier: "luxury-tailored",
    swatchHex: "#16202A",
    affiliate: { network: "cj", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2500,
      sitemapUrls: ["https://suitsupply.com/en-us/sitemap_index.xml"],
      salePaths: ["/en-us/men/suits"],
    },
  },
  {
    slug: "spier-mackay",
    name: "Spier & Mackay",
    code: "SPMK",
    domain: "www.spierandmackay.com",
    allowedHosts: ["www.spierandmackay.com", "spierandmackay.com"],
    baseUrl: "https://www.spierandmackay.com",
    priceTier: "accessible",
    swatchHex: "#243B53",
    affiliate: { network: "shareasale", active: false },
    crawler: {
      preferredMethods: ["json-ld", "internal-api", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.spierandmackay.com/sitemap.xml"],
      salePaths: ["/collection/sale"],
    },
  },
  {
    slug: "public-rec",
    name: "Public Rec",
    code: "PREC",
    domain: "www.publicrec.com",
    allowedHosts: ["www.publicrec.com", "publicrec.com"],
    baseUrl: "https://www.publicrec.com",
    priceTier: "mid-premium",
    swatchHex: "#364152",
    studentDiscount: {
      provider: "SheerID",
      offer: "15% student discount program",
    },
    affiliate: { network: "impact", active: false },
    crawler: {
      preferredMethods: ["shopify-json", "json-ld", "playwright"],
      rateLimitMs: 2000,
      sitemapUrls: ["https://www.publicrec.com/sitemap.xml"],
      salePaths: ["/collections/sale"],
      shopifyCollections: ["sale", "pants", "tops"],
    },
  },
] as const;

export const BRAND_BY_SLUG: Record<string, BrandConfig> = Object.fromEntries(
  BRANDS.map((brand) => [brand.slug, brand])
);

export type OutboundValidationResult =
  | { ok: true; url: string; targetHost: string; isAffiliate: boolean }
  | { ok: false; reason: string };

/**
 * Strictly validates a stored product URL against the brand's allowlisted hosts
 * before wrapping it with an affiliate template (if active). Prevents open-redirect abuse.
 */
export function validateAndBuildOutboundUrl(
  brandSlug: string,
  storedProductUrl: string
): OutboundValidationResult {
  const brand = BRAND_BY_SLUG[brandSlug];
  if (!brand) {
    return { ok: false, reason: `Unknown brand slug: ${brandSlug}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(storedProductUrl);
  } catch {
    return { ok: false, reason: "Malformed product URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `Disallowed URL protocol: ${parsed.protocol}` };
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowlisted = brand.allowedHosts.some((allowed) => allowed.toLowerCase() === host);
  if (!isAllowlisted) {
    return {
      ok: false,
      reason: `Host "${host}" is not on the allowlist for brand "${brandSlug}"`,
    };
  }

  if (brand.affiliate.active && brand.affiliate.urlTemplate) {
    const wrapped = brand.affiliate.urlTemplate.replace(
      "{url}",
      encodeURIComponent(parsed.toString())
    );
    try {
      const affiliateParsed = new URL(wrapped);
      const affHost = affiliateParsed.hostname.toLowerCase();
      const affAllowed =
        affiliateParsed.protocol === "https:" &&
        (ALLOWED_AFFILIATE_HOSTS.has(affHost) || affHost.endsWith(".sjv.io") || affHost.endsWith(".pxf.io"));
      if (!affAllowed) {
        return { ok: false, reason: `Disallowed affiliate host: ${affHost}` };
      }
      return { ok: true, url: affiliateParsed.toString(), targetHost: host, isAffiliate: true };
    } catch {
      return { ok: false, reason: "Malformed affiliate URL template" };
    }
  }

  return { ok: true, url: parsed.toString(), targetHost: host, isAffiliate: false };
}
