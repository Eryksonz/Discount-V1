export type AlertsMode = "local" | "email";

/**
 * Runtime alert delivery mode:
 * - "local" (default): watchlist & target prices stored in browser localStorage; zero email/Resend dependency.
 * - "email": server-side Postgres alerts + Resend email delivery (requires verified sending domain & RESEND_API_KEY).
 */
export function getAlertsMode(
  env: Record<string, string | undefined> = process.env
): AlertsMode {
  const raw = (env.ALERTS_MODE ?? env.NEXT_PUBLIC_ALERTS_MODE ?? "local").trim().toLowerCase();
  return raw === "email" ? "email" : "local";
}

/**
 * Optional outbound click counting on /go/[id].
 * Default ON (`true`). Stores only product ID, brand slug, target host, and timestamp — zero personal data.
 * Set OUTBOUND_CLICK_LOGGING=false to disable DB writes on outbound redirects.
 */
export function isClickLoggingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = (env.OUTBOUND_CLICK_LOGGING ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}
