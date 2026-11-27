import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "tt_admin_session";
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000; // 15 minutes
const MIN_PROD_ADMIN_PASSWORD_LEN = 16;

const WEAK_ADMIN_PASSWORDS: ReadonlySet<string> = new Set([
  "admin",
  "admin123",
  "password",
  "password123",
  "password12345678",
  "changeme",
  "changeme12345678",
  "secret",
  "tapeandtailor",
  "tape-and-tailor",
  "123456",
  "12345678",
  "1234567890123456",
  "qwerty",
  "letmein",
  "demo",
  "test",
]);

const failedAttemptsByIp = new Map<string, number[]>();

export function isWeakAdminPassword(password: string | undefined | null): string | null {
  const trimmed = password?.trim() ?? "";
  if (!trimmed) return "ADMIN_PASSWORD is missing.";
  if (trimmed.length < MIN_PROD_ADMIN_PASSWORD_LEN) {
    return `ADMIN_PASSWORD must be at least ${MIN_PROD_ADMIN_PASSWORD_LEN} characters in production.`;
  }
  const lower = trimmed.toLowerCase();
  if (WEAK_ADMIN_PASSWORDS.has(lower) || /^(.)\1+$/.test(trimmed)) {
    return "ADMIN_PASSWORD is too weak or uses a disallowed default value.";
  }
  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars < 6) {
    return "ADMIN_PASSWORD has insufficient character diversity (need at least 6 unique characters).";
  }
  return null;
}

/**
 * Enforces strong ADMIN_PASSWORD at production server startup (called by `src/instrumentation.ts`).
 * Throws loudly if missing or weak when NODE_ENV === "production" outside the build phase.
 */
export function validateProductionSecurityConfig(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;

  const weakness = isWeakAdminPassword(env.ADMIN_PASSWORD);
  if (weakness) {
    throw new Error(
      `[Tape & Tailor Security] Refusing production startup: ${weakness} Configure a strong random ADMIN_PASSWORD (>= ${MIN_PROD_ADMIN_PASSWORD_LEN} chars) in your deployment environment.`
    );
  }
}

function getAdminSecret(): string | null {
  const pwd = process.env.ADMIN_PASSWORD?.trim();
  if (!pwd) return null;
  if (process.env.NODE_ENV === "production") {
    if (isWeakAdminPassword(pwd)) return null;
    return pwd;
  }
  return pwd.length >= 6 ? pwd : null;
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
    return {
      ok: false,
      error:
        process.env.NODE_ENV === "production"
          ? "ADMIN_PASSWORD is missing or does not meet production strength requirements."
          : "ADMIN_PASSWORD is not configured on the server.",
    };
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
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured or is too weak.");
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
