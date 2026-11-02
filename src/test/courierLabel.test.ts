import { describe, it, expect } from "vitest";
import { buildZoneMap, zoneForOrder, courierLabelText, canFinalize, sentViaApi, apiBatchName, tbilisiDateIso } from "../../supabase/functions/_shared/courierLabel";

describe("courier label helper", () => {
  const zones = buildZoneMap([{ city_name: " Tbilisi ", zone_id: 7 }, { city_name: "ბათუმი", zone_id: "12" }]);
  it("zone matches normalized city case-insensitively, falls back to raw", () => {
    expect(zoneForOrder({ normalized_city: "TBILISI" }, zones)).toBe("7");
    expect(zoneForOrder({ normalized_city: null, raw_city: "ბათუმი" }, zones)).toBe("12");
    expect(zoneForOrder({ normalized_city: "Kutaisi" }, zones)).toBeNull();
  });
  it("label merges SKUs and uses bins", () => {
    expect(courierLabelText("S-0003", [{ sku: "A1", quantity: 1 }, { sku: "A1", quantity: 2 }, { sku: "B2" }], { A1: "12" })).toBe("[S-0003] 12 - 3, B2 - 1");
  });
  it("tbilisi date rolls over at 20:00 UTC", () => {
    expect(tbilisiDateIso(new Date("2026-11-02T20:30:00Z"))).toBe("2026-11-03");
    expect(apiBatchName(5, new Date("2026-11-02T18:34:00Z"))).toBe("Onway API · 02 Nov 22:34 · 5 orders");
  });
});

describe("idempotency", () => {
  it("never finalizes twice", () => {
    expect(canFinalize({ id: "a", is_fulfilled: false }, "T1", new Set())).toBe(true);
    expect(canFinalize({ id: "a", is_fulfilled: true }, "T1", new Set())).toBe(false);
    expect(canFinalize({ id: "a", is_fulfilled: false }, "T1", new Set(["a"]))).toBe(false);
    expect(canFinalize({ id: "a", is_fulfilled: false }, " ", new Set())).toBe(false);
  });
  it("API-sent or unclear orders are excluded from Excel export", () => {
    expect(sentViaApi({ onway_api_status: "sent" })).toBe(true);
    expect(sentViaApi({ onway_api_status: "unclear" })).toBe(true);
    expect(sentViaApi({ onway_tracking: "X1" })).toBe(true);
    expect(sentViaApi({ onway_api_status: "rejected" })).toBe(false);
    expect(sentViaApi({})).toBe(false);
  });
});
