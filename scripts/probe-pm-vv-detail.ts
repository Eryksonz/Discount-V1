import "dotenv/config";

const UA = `TapeAndTailorBot/0.1 (+https://tapeandtailor.example.com; contact: ${process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@tapeandtailor.example.com"})`;

async function main() {
  // 1. Inspect Peter Millar's 1,152-byte sitemap_index.xml and fetch 1 product URL from its sale page
  const pmSm = await fetch("https://www.petermillar.com/sitemap_index.xml", {
    headers: { "User-Agent": UA },
  });
  const pmSmText = await pmSm.text();
  console.log("=== PETER MILLAR sitemap_index.xml (first 900 chars) ===");
  console.log(pmSmText.slice(0, 900));

  const pmSale = await fetch("https://www.petermillar.com/c/men/sale", {
    headers: { "User-Agent": UA },
  });
  const pmSaleHtml = await pmSale.text();
  const pmLinks = Array.from(
    new Set(
      [...pmSaleHtml.matchAll(/href=["'](\/p\/[^"'?#]+)["']/gi)].map(
        (m) => `https://www.petermillar.com${m[1]}`
      )
    )
  );
  console.log("PM discovered /p/ links on /c/men/sale:", pmLinks.slice(0, 3));
  if (pmLinks[0]) {
    await new Promise((r) => setTimeout(r, 2000));
    const pmProd = await fetch(pmLinks[0], { headers: { "User-Agent": UA } });
    const pmHtml = await pmProd.text();
    const ldBlocks = [...pmHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    console.log("PM 1-product fetch:", pmLinks[0], "HTTP", pmProd.status, "LD blocks:", ldBlocks.length);
    for (const b of ldBlocks) {
      if (b[1].toLowerCase().includes("product")) {
        console.log("PM PRODUCT LD:", b[1].trim().slice(0, 600));
      }
    }
  }

  // 2. Inspect Vineyard Vines JSON-LD on 1 product page
  await new Promise((r) => setTimeout(r, 2000));
  const vvUrl =
    "https://www.vineyardvines.com/product/boys-t-shirts/kids-long-sleeve-vintage-whale-graphic-t-shirt/3V0164.html";
  const vvRes = await fetch(vvUrl, { headers: { "User-Agent": UA } });
  const vvHtml = await vvRes.text();
  const vvBlocks = [...vvHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  console.log("\n=== VINEYARD VINES 1-product JSON-LD ===");
  console.log("VV HTTP", vvRes.status, "LD blocks:", vvBlocks.length);
  for (const b of vvBlocks) {
    if (b[1].toLowerCase().includes("product")) {
      console.log("VV PRODUCT LD:", b[1].trim().slice(0, 600));
    }
  }
}

main().catch(console.error);
