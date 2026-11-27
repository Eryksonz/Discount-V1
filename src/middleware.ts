import { NextResponse, type NextRequest } from "next/server";
import { isSiteIndexingEnabled } from "@config/app";

const PRIVATE_PREFIXES = ["/admin", "/status", "/api/", "/go/"];

/**
 * Enforces X-Robots-Tag headers across all routes when SITE_INDEXING is "off" (default),
 * and keeps private operational/redirect routes noindex even when SITE_INDEXING is "on".
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  if (!isSiteIndexingEnabled()) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  } else if (PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
