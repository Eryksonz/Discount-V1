import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "tt_admin_session";
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000; // 15 minutes

const failedAttemptsByIp = new Map<string, number[]>();

function getAdminSecret(): string | null {
  const pwd = process.env.ADMIN_PASSWORD?.trim();
  return pwd && pwd.length >= 6 ? pwd : null;
}

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison via equal-length SHA-256 digests so neither content nor length leaks via timing.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function signToken(secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update("tape-and-tailor-admin-v1")
    .digest("hex");
}

export function checkAdminLoginRateLimit(
  clientKey: string,
  now = Date.now()
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (failedAttemptsByIp.get(clientKey) ?? []).filter((ts) => ts > cutoff);
  failedAttemptsByIp.set(clientKey, recent);

  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: RATE_LIMIT_MAX_ATTEMPTS - recent.length,
  };
}

export function recordAdminLoginFailure(clientKey: string, now = Date.now()): void {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (failedAttemptsByIp.get(clientKey) ?? []).filter((ts) => ts > cutoff);
  recent.push(now);
  failedAttemptsByIp.set(clientKey, recent);
}

export function clearAdminLoginFailures(clientKey: string): void {
  failedAttemptsByIp.delete(clientKey);
}

export function verifyAdminPassword(candidate: string): { ok: boolean; error?: string } {
  const secret = getAdminSecret();
  if (!secret) {
    return { ok: false, error: "ADMIN_PASSWORD is not configured on the server." };
  }
  if (!constantTimeStringEqual(candidate, secret)) {
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
  return constantTimeStringEqual(token, signToken(secret));
}

export async function setAdminSessionCookie(): Promise<void> {
  const secret = getAdminSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured.");
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, signToken(secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}
