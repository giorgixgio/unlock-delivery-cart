import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchLogoUrls } from "@/hooks/useSiteBranding";

const CACHE_KEY = "site-logo-urls-v1";
const cached = JSON.stringify({ logo_url_trendmart: "https://cdn.example/current-logo.png" });

beforeEach(() => {
  localStorage.clear();
  mocks.from.mockReset();
  mocks.select.mockReset();
  mocks.in.mockReset();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ in: mocks.in });
});

describe("storefront logo settings", () => {
  it("keeps the last correct logo cached when the settings request fails", async () => {
    localStorage.setItem(CACHE_KEY, cached);
    mocks.in.mockResolvedValue({ data: null, error: { message: "temporarily unavailable" } });

    await expect(fetchLogoUrls()).resolves.toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBe(cached);
  });

  it("keeps the cache when the settings request throws", async () => {
    localStorage.setItem(CACHE_KEY, cached);
    mocks.in.mockRejectedValue(new Error("network offline"));

    await expect(fetchLogoUrls()).resolves.toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBe(cached);
  });

  it("updates the cache after a successful settings response", async () => {
    mocks.in.mockResolvedValue({
      data: [{ key: "logo_url_trendmart", value: "https://cdn.example/new-logo.png" }],
      error: null,
    });

    await expect(fetchLogoUrls()).resolves.toEqual({ logo_url_trendmart: "https://cdn.example/new-logo.png" });
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}")).toEqual({
      logo_url_trendmart: "https://cdn.example/new-logo.png",
    });
  });
});
