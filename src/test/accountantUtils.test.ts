import { describe, it, expect } from "vitest";
import {
  expectedOnwayPayoutDate,
  attributeRevenue,
  buildCsv,
  getQuickRange,
} from "@/lib/accountantUtils";
import { canAccessPath, roleHomePath } from "@/lib/adminPermissions";

describe("expectedOnwayPayoutDate (Tue/Fri strictly after delivery)", () => {
  it("maps every weekday to the next Tue or Fri strictly after delivery", () => {
    // 2026-11-23 is Monday
    expect(expectedOnwayPayoutDate("2026-11-23")).toBe("2026-11-24"); // Mon -> Tue
    expect(expectedOnwayPayoutDate("2026-11-24")).toBe("2026-11-27"); // Tue -> Fri (NOT same Tue)
    expect(expectedOnwayPayoutDate("2026-11-25")).toBe("2026-11-27"); // Wed -> Fri
    expect(expectedOnwayPayoutDate("2026-11-26")).toBe("2026-11-27"); // Thu -> Fri
    expect(expectedOnwayPayoutDate("2026-11-27")).toBe("2026-12-01"); // Fri -> Tue (NOT same Fri)
    expect(expectedOnwayPayoutDate("2026-11-28")).toBe("2026-12-01"); // Sat -> Tue
    expect(expectedOnwayPayoutDate("2026-11-29")).toBe("2026-12-01"); // Sun -> Tue
  });
});

describe("attributeRevenue (proportional split, exact sum)", () => {
  it("splits proportionally to price * qty and puts rounding remainder on largest line", () => {
    const res = attributeRevenue(100, [
      { qty: 1, unitPrice: 10 },
      { qty: 1, unitPrice: 10 },
      { qty: 1, unitPrice: 10 },
    ]);
    expect(res).toEqual([33.34, 33.33, 33.33]);
    expect(Number(res.reduce((a, b) => a + b, 0).toFixed(2))).toBe(100);
  });

  it("puts rounding remainder on the largest weighted line when weights differ", () => {
    const res = attributeRevenue(43.4, [
      { qty: 1, unitPrice: 10 },
      { qty: 2, unitPrice: 25 }, // weight 50 (largest)
      { qty: 1, unitPrice: 15 },
    ]);
    expect(Number(res.reduce((a, b) => a + b, 0).toFixed(2))).toBe(43.4);
    expect(res[1]).toBeGreaterThan(res[2]!);
    expect(res[2]).toBeGreaterThan(res[0]!);
  });

  it("falls back to equal split by qty when catalog prices are missing", () => {
    const res = attributeRevenue(50, [
      { qty: 1, unitPrice: 0 },
      { qty: 3, unitPrice: 0 },
    ]);
    expect(res).toEqual([12.5, 37.5]);
  });
});

describe("buildCsv (UTF-8 BOM, plain numbers, Georgian text)", () => {
  it("prepends UTF-8 BOM, formats numbers to 2 decimals without symbols, and preserves Georgian", () => {
    const csv = buildCsv(
      ["Date", "Title", "Amount"],
      [["2026-11-25", "მინი კამერა, 2ც", 43.4]],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('2026-11-25,"მინი კამერა, 2ც",43.40');
  });
});

describe("getQuickRange", () => {
  it("computes Mon-Sun weeks and Tbilisi month boundaries", () => {
    // 2026-11-25 12:00 UTC = 16:00 Tbilisi (Wednesday)
    const now = new Date("2026-11-25T12:00:00Z");
    expect(getQuickRange("this_week", now)).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(getQuickRange("last_week", now)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(getQuickRange("this_month", now)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(getQuickRange("this_quarter", now)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
});

describe("accountant route permissions", () => {
  it("locks accountant strictly to /accountant/*", () => {
    expect(roleHomePath("accountant")).toBe("/accountant");
    expect(canAccessPath("accountant", "/accountant")).toBe(true);
    expect(canAccessPath("accountant", "/accountant/summary")).toBe(true);
    expect(canAccessPath("accountant", "/admin/orders")).toBe(false);
    expect(canAccessPath("accountant", "/admin/dashboard")).toBe(false);
    expect(canAccessPath("accountant", "/admin/settings")).toBe(false);
  });
});