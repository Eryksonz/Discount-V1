import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  constantTimeStringEqual,
  isWeakAdminPassword,
  recordAdminLoginFailure,
  validateProductionSecurityConfig,
  verifyAdminPassword,
} from "../auth";

describe("Admin auth constant-time comparison, rate limiting & production password strength", () => {
  const origPwd = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "super-secret-admin-pass-2026!";
    clearAdminLoginFailures("test-ip-1");
  });

  afterEach(() => {
    if (origPwd === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = origPwd;
    clearAdminLoginFailures("test-ip-1");
  });

  it("compares strings in constant time across equal and unequal lengths", () => {
    expect(constantTimeStringEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeStringEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeStringEqual("short", "much-longer-string")).toBe(false);
  });

  it("verifies ADMIN_PASSWORD and fails closed when unset", () => {
    expect(verifyAdminPassword("super-secret-admin-pass-2026!").ok).toBe(true);
    expect(verifyAdminPassword("wrong-pass").ok).toBe(false);

    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminPassword("anything").ok).toBe(false);
  });

  it("rate-limits after 5 failed attempts within 15 minutes and resets on clear", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkAdminLoginRateLimit("test-ip-1", t0 + i * 1000).allowed).toBe(true);
      recordAdminLoginFailure("test-ip-1", t0 + i * 1000);
    }
    const blocked = checkAdminLoginRateLimit("test-ip-1", t0 + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    expect(checkAdminLoginRateLimit("test-ip-1", t0 + 16 * 60_000).allowed).toBe(true);
  });

  it("fails startup loudly in production when ADMIN_PASSWORD is missing or weak", () => {
    expect(() =>
      validateProductionSecurityConfig({ NODE_ENV: "production" })
    ).toThrow(/ADMIN_PASSWORD is missing/);

    expect(() =>
      validateProductionSecurityConfig({ NODE_ENV: "production", ADMIN_PASSWORD: "short" })
    ).toThrow(/at least 16 characters/);

    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: "production",
        ADMIN_PASSWORD: "password12345678",
      })
    ).toThrow(/weak|disallowed/);

    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: "production",
        ADMIN_PASSWORD: "aaaaaaaaaaaaaaaaaaaa",
      })
    ).toThrow(/weak|diversity/);

    expect(isWeakAdminPassword("T&T-Prod-9xK4mQ2vR8pL!")).toBeNull();
    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: "production",
        ADMIN_PASSWORD: "T&T-Prod-9xK4mQ2vR8pL!",
      })
    ).not.toThrow();

    // Skips throwing during next build phase
    expect(() =>
      validateProductionSecurityConfig({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      })
    ).not.toThrow();
  });
});
