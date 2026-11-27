import type { MetadataRoute } from "next";
import { isSiteIndexingEnabled } from "@config/app";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  if (!isSiteIndexingEnabled()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/status", "/api/", "/go/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
