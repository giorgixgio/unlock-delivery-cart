import { describe, it, expect } from "vitest";
import { isChunkError, isRefreshableError, canReload, decideOnUpdate } from "@/lib/deployGuard";

describe("deployGuard", () => {
  it("detects chunk-load errors from all browsers", () => {
    for (const m of ["Failed to fetch dynamically imported module: /assets/x.js", "Importing a module script failed.", "ChunkLoadError: Loading chunk 3 failed", "error loading dynamically imported module"])
      expect(isChunkError(new Error(m))).toBe(true);
    expect(isChunkError(new Error("duplicate key value"))).toBe(false);
  });
  it("network errors are refreshable, business errors are not", () => {
    expect(isRefreshableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRefreshableError(new Error("operator is not on shift"))).toBe(false);
  });
  it("reloads at most once per 30 s", () => {
    expect(canReload(null, 1000)).toBe(true);
    expect(canReload(1000, 20_000)).toBe(false);
    expect(canReload(1000, 31_001)).toBe(true);
  });
  it("waits while an order or bulk send is open", () => {
    expect(decideOnUpdate({ busyOrder: false, hardBusy: false })).toBe("reload");
    expect(decideOnUpdate({ busyOrder: true, hardBusy: false })).toBe("wait");
    expect(decideOnUpdate({ busyOrder: false, hardBusy: true })).toBe("wait");
  });
});
