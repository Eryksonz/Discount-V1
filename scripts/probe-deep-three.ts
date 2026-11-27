import "dotenv/config";

const CONTACT_EMAIL =
  process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@tapeandtailor.example.com";
const UA = `TapeAndTailorBot/0.1 (+https://tapeandtailor.example.com; contact: ${CONTACT_EMAIL})`;

interface BrandTarget {
  name: string;
  slug: string;
  baseUrl: string;
  sitemapCandidates: string[];
}

const TARGETS: BrandTarget[] = [
  {
    name: "Peter Millar",
    slug: "peter-millar",
    baseUrl: "https://www.petermillar.com",
    sitemapCandidates: [
      "https://www.petermillar.com/sitemap_index.xml",
      "https://www.petermillar.com/sitemap.xml",
    ],
  },
  {
    name: "Vineyard Vines",
    slug: "vineyard-vines",
    baseUrl: "https://www.vineyardvines.com",
    sitemapCandidates: [
      "https://www.vineyardvines.com/sitemap_index.xml",
      "https://www.vineyardvines.com/sitemap.xml",
    ],
  },
  {
    name: "Brooks Brothers",
    slug: "brooks-brothers",
    baseUrl: "https://www.brooksbrothers.com",
    sitemapCandidates: [
      "https://www.brooksbrothers.com/sitemap_index.xml",
      "https://www.brooksbrothers.com/sitemap.xml",
    ],
  },
];

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function politeGet(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await r.text();
    return { status: r.status, ok: r.ok, url: r.url, text };
  } catch (err) {
    return { status: 0, ok: false, url, text: "", error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

function parseRobots(text: string) {
  const disallows: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelay: number | null = null;
  let inStar = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();

    if (key === "sitemap") {
      sitemaps.push(val);
    } else if (key === "user-agent") {
      inStar = val === "*" || val.toLowerCase().includes("tapeandtailor");
    } else if (inStar && key === "disallow" && val) {
      disallows.push(val);
    } else if (inStar && key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n)) crawlDelay = n;
    }
  }
  return { disallows, sitemaps, crawlDelay };
}

function isAllowed(pathname: string, disallows: string[]): boolean {
  for (const rule of disallows) {
    if (rule === "/") return false;
    if (rule.includes("*")) {
      const re = new RegExp(
        "^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
      );
      if (re.test(pathname)) return false;
    } else if (pathname.startsWith(rule)) {
      return false;
    }
  }
  return true;
}

function extractLocs(xml: string): Array<{ loc: string; lastmod: string | null }> {
  const entries: Array<{ loc: string; lastmod: string | null }> = [];
  const blockRe = /<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[2];
    const locM = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i);
    if (!locM) continue;
    const modM = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i);
    entries.push({ loc: locM[1].trim(), lastmod: modM ? modM[1].trim() : null });
  }
  return entries;
}

function extractProductJsonLd(html: string) {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const found: Array<{ name?: string; price?: string; currency?: string; availability?: string }> = [];

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => typeof x === "string" && x.toLowerCase() === "product")) {
      const offers = obj.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      const first = Array.isArray(offers) ? offers[0] : offers;
      found.push({
        name: typeof obj.name === "string" ? obj.name : undefined,
        price:
          first?.price !== undefined
            ? String(first.price)
            : first?.lowPrice !== undefined
              ? String(first.lowPrice)
              : undefined,
        currency: typeof first?.priceCurrency === "string" ? first.priceCurrency : undefined,
        availability: typeof first?.availability === "string" ? first.availability : undefined,
      });
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };

  while ((m = regex.exec(html)) !== null) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      // skip
    }
  }
  return found;
}

async function probeOne(target: BrandTarget) {
  console.log(`\n==================== ${target.name.toUpperCase()} ====================`);
  const robotsRes = await politeGet(`${target.baseUrl}/robots.txt`);
  const robots = parseRobots(robotsRes.ok ? robotsRes.text : "");
  console.log(`robots.txt status: ${robotsRes.status} | crawl-delay: ${robots.crawlDelay ?? "none"}`);

  const relevantDisallows = robots.disallows.filter((d) =>
    /sale|cat|prod|\/p\/|\/c\/|\/s\/|search|filter|sort|men|shop/i.test(d)
  );
  console.log(
    `Disallow rules (${robots.disallows.length} total; sale/cat/product matches: ${relevantDisallows.length}):`,
    relevantDisallows.slice(0, 20)
  );
  console.log(`Sitemaps declared in robots.txt (${robots.sitemaps.length}):`, robots.sitemaps.slice(0, 6));

  // Check sitemap(s) for product URLs + lastmod
  const sitemapQueue = Array.from(new Set([...robots.sitemaps, ...target.sitemapCandidates]));
  let productSitemapUrl: string | null = null;
  let productUrls: Array<{ loc: string; lastmod: string | null }> = [];
  let childSitemapsCount = 0;

  for (const smUrl of sitemapQueue.slice(0, 3)) {
    await sleep(2000);
    const smRes = await politeGet(smUrl);
    console.log(`Sitemap fetch ${smUrl} -> HTTP ${smRes.status} (${smRes.text.length} bytes)`);
    if (!smRes.ok) continue;
    const entries = extractLocs(smRes.text);
    const childProductMaps = entries.filter(
      (e) => /\.xml/i.test(e.loc) && /prod|pdp|item|en_us/i.test(e.loc)
    );
    const anyChildMaps = entries.filter((e) => /\.xml/i.test(e.loc));

    if (anyChildMaps.length > 0) {
      childSitemapsCount = anyChildMaps.length;
      const picked = childProductMaps[0] ?? anyChildMaps[0];
      productSitemapUrl = picked.loc;
      console.log(`  Found sitemap index (${anyChildMaps.length} children). Sampling child: ${picked.loc}`);
      await sleep(2000);
      const childRes = await politeGet(picked.loc);
      console.log(`  Child sitemap HTTP ${childRes.status} (${childRes.text.length} bytes)`);
      if (childRes.ok) {
        productUrls = extractLocs(childRes.text);
      }
      break;
    } else if (entries.length > 0) {
      productSitemapUrl = smUrl;
      productUrls = entries;
      break;
    }
  }

  const withLastmod = productUrls.filter((u) => Boolean(u.lastmod)).length;
  console.log(
    `Sitemap URLs found in sampled map (${productSitemapUrl ?? "none"}): ${productUrls.length} | with <lastmod>: ${withLastmod} | index children: ${childSitemapsCount}`
  );
  if (productUrls.length > 0) {
    console.log("  Sample URLs:", productUrls.slice(0, 3));
  }

  // Pick EXACTLY ONE allowed product-looking URL and fetch it
  const productCandidate =
    productUrls.find(
      (u) =>
        /\/(p|product|products|mens)\//i.test(u.loc) &&
        /\.html|\/p\/|\/products\//i.test(u.loc) &&
        isAllowed(new URL(u.loc).pathname, robots.disallows)
    ) ??
    productUrls.find((u) => {
      try {
        return isAllowed(new URL(u.loc).pathname, robots.disallows);
      } catch {
        return false;
      }
    });

  if (productCandidate) {
    await sleep(2000);
    const pRes = await politeGet(productCandidate.loc);
    const ld = pRes.ok ? extractProductJsonLd(pRes.text) : [];
    console.log(`Single product fetch: ${productCandidate.loc}`);
    console.log(`  HTTP ${pRes.status} | bytes=${pRes.text.length} | JSON-LD Product count=${ld.length}`);
    if (ld.length > 0) {
      console.log("  JSON-LD sample:", JSON.stringify(ld[0]));
    }
  } else {
    console.log("Single product fetch: no allowed product URL discovered in sitemap.");
  }
}

async function main() {
  for (const t of TARGETS) {
    await probeOne(t);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
