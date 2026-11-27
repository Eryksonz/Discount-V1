import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Resend } from "resend";
import { DEAL_THRESHOLDS } from "@config/deal-thresholds";
import * as schema from "@/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

export interface AlertCandidate {
  id: number;
  email: string;
  productId: string;
  targetPriceCents: number | null;
  targetDiscountPct: number | null;
  unsubscribeToken: string;
  lastNotifiedPriceCents: number | null;
}

export interface AlertProductSnapshot {
  id: string;
  slug: string;
  name: string;
  brandSlug: string;
  currentPriceCents: number;
  originalPriceCents: number;
  median90dCents: number;
  pctBelowMedian: number;
  historyDays: number;
  inStock: boolean;
}

/**
 * Pure deterministic alert trigger & deduplication check:
 * - Requires product to be in stock.
 * - Matches target price (current <= target) OR target % below 90d median (only with >= 21d history).
 * - Deduplicates per price level: if `lastNotifiedPriceCents` is already <= `currentPriceCents`,
 *   do NOT re-notify for the same (or higher) price level.
 */
export function shouldTriggerAlert(
  alert: AlertCandidate,
  product: AlertProductSnapshot
): { trigger: boolean; reason?: string } {
  if (!product.inStock) {
    return { trigger: false };
  }

  // Deduplicate so user is notified at most once per price level (only re-notify on a strictly lower price)
  if (
    alert.lastNotifiedPriceCents !== null &&
    alert.lastNotifiedPriceCents <= product.currentPriceCents
  ) {
    return { trigger: false };
  }

  if (
    alert.targetPriceCents !== null &&
    product.currentPriceCents <= alert.targetPriceCents
  ) {
    return {
      trigger: true,
      reason: `Price $${(product.currentPriceCents / 100).toFixed(2)} reached your target of $${(alert.targetPriceCents / 100).toFixed(2)}`,
    };
  }

  if (
    alert.targetDiscountPct !== null &&
    product.historyDays >= DEAL_THRESHOLDS.minHistoryDays &&
    product.pctBelowMedian >= alert.targetDiscountPct
  ) {
    return {
      trigger: true,
      reason: `Price is ${Math.round(product.pctBelowMedian)}% below its 90-day median (target: ${alert.targetDiscountPct}%+)`,
    };
  }

  return { trigger: false };
}

export async function runAlertCheck(): Promise<{
  evaluated: number;
  triggered: number;
  sent: number;
}> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required to run alert checks.");

  const client = postgres(dbUrl, { max: 2 });
  const db = drizzle(client, { schema });
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? "alerts@tapeandtailor.example.com";
  const resend = resendKey ? new Resend(resendKey) : null;

  try {
    const rows = await db
      .select({
        alert: schema.alerts,
        product: schema.products,
      })
      .from(schema.alerts)
      .innerJoin(schema.products, eq(schema.alerts.productId, schema.products.id))
      .where(eq(schema.alerts.active, true));

    let triggered = 0;
    let sent = 0;

    for (const { alert, product } of rows) {
      const check = shouldTriggerAlert(
        {
          id: alert.id,
          email: alert.email,
          productId: alert.productId,
          targetPriceCents: alert.targetPriceCents,
          targetDiscountPct: alert.targetDiscountPct,
          unsubscribeToken: alert.unsubscribeToken,
          lastNotifiedPriceCents: alert.lastNotifiedPriceCents,
        },
        {
          id: product.id,
          slug: product.slug,
          name: product.name,
          brandSlug: product.brandSlug,
          currentPriceCents: product.currentPriceCents,
          originalPriceCents: product.originalPriceCents,
          median90dCents: product.median90dCents,
          pctBelowMedian: product.pctBelowMedian,
          historyDays: product.historyDays,
          inStock: product.inStock,
        }
      );

      if (!check.trigger) continue;
      triggered += 1;

      const unsubscribeUrl = `${siteUrl}/api/alerts/unsubscribe?token=${alert.unsubscribeToken}`;
      const detailUrl = `${siteUrl}/p/${product.slug}`;
      const currentPriceStr = `$${(product.currentPriceCents / 100).toFixed(2)}`;
      const medianStr = `$${(product.median90dCents / 100).toFixed(2)}`;

      if (resend) {
        try {
          await resend.emails.send({
            from: fromEmail,
            to: alert.email,
            subject: `[Tape & Tailor] Price alert: ${product.name} is now ${currentPriceStr}`,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            text: [
              `${product.name} is now ${currentPriceStr}.`,
              check.reason ?? "",
              `90-day median: ${medianStr} (${product.historyDays}d tracked history).`,
              "",
              `View price history & retailer link: ${detailUrl}`,
              "",
              "Prices are verified periodically and can change at checkout on the brand's site. Tape & Tailor may earn affiliate commissions on outbound links and is not affiliated with or endorsed by listed brands.",
              "",
              `One-click unsubscribe: ${unsubscribeUrl}`,
            ].join("\n"),
          });

          await db
            .update(schema.alerts)
            .set({
              lastNotifiedPriceCents: product.currentPriceCents,
              lastNotifiedAt: new Date(),
            })
            .where(eq(schema.alerts.id, alert.id));

          sent += 1;
        } catch (err) {
          console.error(`[Alerts] Failed sending alert #${alert.id}:`, err);
        }
      } else {
        console.log(
          `[Alerts DRY] Would notify ${alert.email} for ${product.name} @ ${currentPriceStr} (${check.reason}) — RESEND_API_KEY not configured.`
        );
      }
    }

    return { evaluated: rows.length, triggered, sent };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runAlertCheck()
    .then((res) => {
      console.log(
        `[Tape & Tailor Alerts] evaluated=${res.evaluated} triggered=${res.triggered} sent=${res.sent}`
      );
    })
    .catch((err) => {
      console.error("[Tape & Tailor Alerts] Fatal error:", err);
      process.exit(1);
    });
}
