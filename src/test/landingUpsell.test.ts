import { describe, it, expect } from "vitest";
import { resolveUpsellEnabled } from "@/hooks/useUpsellsEnabled";

describe("landing upsell gate", () => {
  it("runs no post-phone upsell on the camera presentation (SKU 002)", () => {
    // Camera rows carry no explicit upsell setting, so the block must hold even
    // while the global switch is ON.
    expect(resolveUpsellEnabled(true, null, true)).toBe(false);
    expect(resolveUpsellEnabled(undefined, null, true)).toBe(false);
    // An admin who explicitly turns the camera's upsell on still wins.
    expect(resolveUpsellEnabled(false, true, true)).toBe(true);
  });

  it("keeps the upsell untouched for every other product", () => {
    expect(resolveUpsellEnabled(true, null, false)).toBe(true);
    expect(resolveUpsellEnabled(undefined, null, false)).toBe(true);
    expect(resolveUpsellEnabled(false, null, false)).toBe(false);
    expect(resolveUpsellEnabled(false, true, false)).toBe(true);
  });
});
