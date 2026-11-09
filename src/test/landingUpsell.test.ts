import { describe, it, expect } from "vitest";
import { resolveUpsellEnabled, isLandingOfferAllowed } from "@/hooks/useUpsellsEnabled";

describe("landing upsell gate", () => {
  it("runs no post-phone upsell on the camera presentation (SKU 002)", () => {
    // Camera rows carry no explicit upsell setting, so the block must hold even
    // while the global switch is ON.
    expect(resolveUpsellEnabled(true, null, true)).toBe(false);
    expect(resolveUpsellEnabled(undefined, null, true)).toBe(false);
    expect(resolveUpsellEnabled(false, true, true)).toBe(false);
  });

  it("disables other-SKU bundles on all /p pages even with explicit overrides", () => {
    expect(resolveUpsellEnabled(true, null, false)).toBe(false);
    expect(resolveUpsellEnabled(undefined, null, false)).toBe(false);
    expect(resolveUpsellEnabled(false, null, false)).toBe(false);
    expect(resolveUpsellEnabled(false, true, false)).toBe(false);
    expect(resolveUpsellEnabled(true, true, false)).toBe(false);
  });

  it("blocks single-product cross-sells such as disc to brow kit", () => {
    expect(isLandingOfferAllowed('disc-product', 'manual-1794256246336-wgmlb')).toBe(false);
    expect(isLandingOfferAllowed('shoe-eraser', 'shoe-deodorant')).toBe(false);
    expect(isLandingOfferAllowed('disc-product', undefined)).toBe(false);
  });

  it("preserves same-product offer eligibility", () => {
    expect(isLandingOfferAllowed('manual-1794256246336-wgmlb', 'manual-1794256246336-wgmlb')).toBe(true);
  });
});
