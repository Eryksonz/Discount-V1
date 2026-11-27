import type { MetadataRoute } from "next";
import { isSiteIndexingEnabled } from "@config/app";
import { FEED_PENDING_BRAND_SLUGS } from "@config/brands";
import { getSqlClient } from "@/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isSiteIndexingEnabled()) {
    return [];
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/kits`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/calendar`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/students`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  const sql = getSqlClient();
  if (!sql) return staticPages;

  try {
    const pendingSlugs = Array.from(FEED_PENDING_BRAND_SLUGS);
    const productRows = await sql`
      SELECT slug, last_checked_at
      FROM products
      WHERE classification_status IN ('classified', 'manual')
        AND NOT (brand_slug = ANY(${pendingSlugs}::text[]))
      ORDER BY deal_score DESC, last_checked_at DESC
      LIMIT 10000
    `;

    const productEntries: MetadataRoute.Sitemap = productRows.map((r) => ({
      url: `${siteUrl}/p/${String(r.slug)}`,
      lastModified: r.last_checked_at ? new Date(String(r.last_checked_at)) : now,
      changeFrequency: "daily",
      priority: 0.6,
    }));

    return [...staticPages, ...productEntries];
  } catch {
    return staticPages;
  }
}
