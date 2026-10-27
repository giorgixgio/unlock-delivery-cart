import { describe, it, expect } from "vitest";
import { toTelHref, shouldReactToCall, CALL_SYNC_MAX_AGE_MS } from "@/lib/callSync";

describe("toTelHref", () => {
  it("normalizes Georgian mobile without country code to +995", () => {
    expect(toTelHref("591 23 45 67")).toBe("tel:+995591234567");
  });

  it("keeps already-prefixed +995 numbers", () => {
    expect(toTelHref("+995 591 23 45 67")).toBe("tel:+995591234567");
  });

  it("handles 05-prefixed numbers", () => {
    expect(toTelHref("0591234567")).toBe("tel:+995591234567");
  });

  it("handles 995-prefixed numbers without plus", () => {
    expect(toTelHref("995591234567")).toBe("tel:+995591234567");
  });
});

describe("shouldReactToCall", () => {
  const now = Date.now();
  const fresh = new Date(now - 5_000).toISOString();

  it("ignores records created on the same device", () => {
    expect(shouldReactToCall({ device_id: "dev-1", created_at: fresh }, "dev-1", now)).toBe(false);
  });

  it("reacts to fresh records from another device", () => {
    expect(shouldReactToCall({ device_id: "dev-2", created_at: fresh }, "dev-1", now)).toBe(true);
  });

  it("ignores records older than the 30s window", () => {
    const old = new Date(now - CALL_SYNC_MAX_AGE_MS - 1).toISOString();
    expect(shouldReactToCall({ device_id: "dev-2", created_at: old }, "dev-1", now)).toBe(false);
  });

  it("accepts a record exactly at the window edge", () => {
    const edge = new Date(now - CALL_SYNC_MAX_AGE_MS).toISOString();
    expect(shouldReactToCall({ device_id: "dev-2", created_at: edge }, "dev-1", now)).toBe(true);
  });
});
