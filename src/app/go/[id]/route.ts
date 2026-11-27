import { NextRequest, NextResponse } from "next/server";
import { validateAndBuildOutboundUrl } from "@config/brands";
import { findProductForRedirect, recordOutboundClick } from "@/lib/catalog/repository";

const FORBIDDEN_REDIRECT_PARAMS = ["url", "redirect", "next", "target", "to", "dest", "href"];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Reject any attempt to supply an external URL via query parameters (anti open-redirect)
  for (const param of FORBIDDEN_REDIRECT_PARAMS) {
    if (request.nextUrl.searchParams.has(param)) {
      return NextResponse.json(
        { error: "Arbitrary redirect parameters are not permitted." },
        { status: 400 }
      );
    }
  }

  const { id } = await context.params;
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid product identifier" }, { status: 400 });
  }

  let product;
  try {
    product = await findProductForRedirect(id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const validated = validateAndBuildOutboundUrl(product.brandSlug, product.productUrl);
  if (!validated.ok) {
    console.error(`[/go/${id}] Blocked non-allowlisted redirect: ${validated.reason}`);
    return NextResponse.json(
      { error: "Outbound URL failed domain allowlist verification." },
      { status: 403 }
    );
  }

  // Record click for affiliate reporting when backed by Postgres
  if (product.inDatabase) {
    await recordOutboundClick({
      productId: product.id,
      brandSlug: product.brandSlug,
      targetHost: validated.targetHost,
      isAffiliate: validated.isAffiliate,
      referer: request.headers.get("referer"),
    });
  }

  return NextResponse.redirect(validated.url, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer-when-downgrade",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
