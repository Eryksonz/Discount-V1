import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "tt_admin_session";

function getAdminSecret(): string | null {
  const pwd = process.env.ADMIN_PASSWORD?.trim();
  return pwd && pwd.length >= 6 ? pwd : null;
}

function signToken(secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update("tape-and-tailor-admin-v1")
    .digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAdminPassword(candidate: string): { ok: boolean; error?: string } {
  const secret = getAdminSecret();
  if (!secret) {
    return { ok: false, error: "ADMIN_PASSWORD is not configured on the server." };
  }
  if (!constantTimeEqual(candidate, secret)) {
    return { ok: false, error: "Invalid password." };
  }
  return { ok: true };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret) return false;
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return constantTimeEqual(token, signToken(secret));
}

export async function setAdminSessionCookie(): Promise<void> {
  const secret = getAdminSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured.");
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, signToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}
