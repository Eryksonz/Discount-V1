import { describe, expect, it } from "vitest";
import { getAlertsMode, isClickLoggingEnabled } from "@config/app";
import { validateAndBuildOutboundUrl } from "@config/brands";
import { evaluateLocalPriceTarget } from "@/lib/watchlist";

describe("Non-commercial config, direct redirects, and local watchlist price targets", () => {
  it("defaults ALERTS_MODE to 'local' and only enables 'email' when explicitly set", () => {
    expect(getAlertsMode({})).toBe("local");
    expect(getAlertsMode({ ALERTS_MODE: "local" })).toBe("local");
    expect(getAlertsMode({ ALERTS_MODE: "invalid" })).toBe("local");
    expect(getAlertsMode({ ALERTS_MODE: "email" })).toBe("email");
    expect(getAlertsMode({ NEXT_PUBLIC_ALERTS_MODE: "email" })).toBe("email");
  });

  it("defaults OUTBOUND_CLICK_LOGGING to on and allows disabling via flag", () => {
    expect(isClickLoggingEnabled({})).toBe(true);
    expect(isClickLoggingEnabled({ OUTBOUND_CLICK_LOGGING: "true" })).toBe(true);
    expect(isClickLoggingEnabled({ OUTBOUND_CLICK_LOGGING: "false" })).toBe(false);
    expect(isClickLoggingEnabled({ OUTBOUND_CLICK_LOGGING: "0" })).toBe(false);
  });

  it("redirects directly to allowlisted brand URLs with zero affiliate wrapping", () => {
    const res = validateAndBuildOutboundUrl(
      "bonobos",
      "https://bonobos.com/products/washed-chinos"
    );
    expect(res).toEqual({
      ok: true,
      url: "https://bonobos.com/products/washed-chinos",
      targetHost: "bonobos.com",
      isAffiliate: false,
    });

    // Still blocks spoofed hosts & non-HTTPS
    expect(
      validateAndBuildOutboundUrl("bonobos", "https://bonobos.com.evil.example/products/x").ok
    ).toBe(false);
    expect(
      validateAndBuildOutboundUrl("bonobos", "http://bonobos.com/products/washed-chinos").ok
    ).toBe(false);
  });

  it("evaluates local browser watchlist targets accurately", () => {
    expect(evaluateLocalPriceTarget(8500, true, 9000)).toEqual({
      met: true,
      belowTargetCents: 500,
    });
    expect(evaluateLocalPriceTarget(9000, true, 9000)).toEqual({
      met: true,
      belowTargetCents: 0,
    });
    expect(evaluateLocalPriceTarget(9500, true, 9000)).toEqual({
      met: false,
      belowTargetCents: 0,
    });
    // Out-of-stock item never triggers price dropped badge
    expect(evaluateLocalPriceTarget(8000, false, 9000)).toEqual({
      met: false,
      belowTargetCents: 0,
    });
    expect(evaluateLocalPriceTarget(8000, true, null)).toEqual({
      met: false,
      belowTargetCents: 0,
    });
  });
});
