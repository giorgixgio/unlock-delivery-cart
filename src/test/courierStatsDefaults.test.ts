import { describe, it, expect } from "vitest";
import { defaultStatsFromDate } from "@/lib/courierAnalytics";

describe("courier statistics default starting date", () => {
  it("opens on the current Tbilisi day", () => {
    expect(defaultStatsFromDate(new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-03");
  });

  it("still counts as the same day just before Tbilisi midnight", () => {
    // 19:59 UTC = 23:59 Tbilisi.
    expect(defaultStatsFromDate(new Date("2026-11-03T19:59:00Z"))).toBe("2026-11-03");
  });

  it("moves to the next day once Tbilisi has passed midnight", () => {
    // 21:00 UTC = 01:00 Tbilisi the following day.
    expect(defaultStatsFromDate(new Date("2026-11-03T21:00:00Z"))).toBe("2026-11-04");
  });
});
