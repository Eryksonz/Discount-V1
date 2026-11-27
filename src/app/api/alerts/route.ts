import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured. Alerts require Postgres." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    productId?: string;
    targetPriceDollars?: number | string | null;
    targetDiscountPct?: number | string | null;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const productId = String(body.productId ?? "").trim();

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  const targetPriceNum =
    body.targetPriceDollars !== null &&
    body.targetPriceDollars !== undefined &&
    String(body.targetPriceDollars).trim() !== ""
      ? Number(body.targetPriceDollars)
      : null;

  const targetDiscountNum =
    body.targetDiscountPct !== null &&
    body.targetDiscountPct !== undefined &&
    String(body.targetDiscountPct).trim() !== ""
      ? Number(body.targetDiscountPct)
      : null;

  const targetPriceCents =
    targetPriceNum !== null && Number.isFinite(targetPriceNum) && targetPriceNum > 0
      ? Math.round(targetPriceNum * 100)
      : null;

  const targetDiscountPct =
    targetDiscountNum !== null &&
    Number.isFinite(targetDiscountNum) &&
    targetDiscountNum >= 5 &&
    targetDiscountNum <= 90
      ? Math.round(targetDiscountNum)
      : null;

  if (targetPriceCents === null && targetDiscountPct === null) {
    return NextResponse.json(
      { error: "Provide either a target price ($) or a target % below 90-day median (5–90%)." },
      { status: 400 }
    );
  }

  // Confirm product exists
  const [prod] = await db
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);

  if (!prod) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const unsubscribeToken = crypto.randomBytes(32).toString("hex");

  const [inserted] = await db
    .insert(schema.alerts)
    .values({
      email,
      productId,
      targetPriceCents,
      targetDiscountPct,
      active: true,
      unsubscribeToken,
    })
    .returning({ id: schema.alerts.id });

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    message: `Alert saved for ${prod.name}. We will notify ${email} once when your target is reached.`,
  });
}
