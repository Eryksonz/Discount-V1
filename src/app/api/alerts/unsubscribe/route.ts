import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

function htmlPage(title: string, bodyText: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Tape &amp; Tailor</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #FAF8F3; color: #0F1D32; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { max-width: 440px; width: 100%; background: #fff; border: 1px solid #E2DCD0; border-top: 3px solid #B8924A; border-radius: 8px; padding: 28px; }
    h1 { font-family: Georgia, serif; font-size: 24px; margin: 0 0 12px; }
    p { font-size: 14px; line-height: 1.6; color: #3E4C5E; margin: 0 0 20px; }
    a { display: inline-block; background: #0F1D32; color: #FAF8F3; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${bodyText}</p>
    <a href="/">Return to Tape &amp; Tailor</a>
  </div>
</body>
</html>`;
}

/**
 * CAN-SPAM compliant one-click unsubscribe endpoint.
 * Supports both GET (link click) and POST (RFC 8058 List-Unsubscribe-Post).
 */
async function handleUnsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token || !/^[a-f0-9]{32,128}$/i.test(token)) {
    return new NextResponse(
      htmlPage("Invalid Unsubscribe Link", "This unsubscribe link is malformed or expired."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const db = getDb();
  if (!db) {
    return new NextResponse(
      htmlPage("Service Unavailable", "Database is not configured."),
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const updated = await db
    .update(schema.alerts)
    .set({ active: false })
    .where(eq(schema.alerts.unsubscribeToken, token))
    .returning({ id: schema.alerts.id });

  if (updated.length === 0) {
    return new NextResponse(
      htmlPage("Alert Not Found", "This price-drop alert was already removed or does not exist."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new NextResponse(
    htmlPage(
      "Unsubscribed",
      "You have been unsubscribed from this Tape & Tailor price-drop alert immediately. You will receive no further emails for this alert."
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  return handleUnsubscribe(request);
}

export async function POST(request: NextRequest) {
  return handleUnsubscribe(request);
}
