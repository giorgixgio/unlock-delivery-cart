import { describe, it, expect } from "vitest";
import { buildZoneMap, zoneForOrder, courierLabelText, canFinalize, sentViaApi, apiBatchName, tbilisiDateIso } from "../../supabase/functions/_shared/courierLabel";
import {
  buildRecipientText,
  expandOrdersToLabels,
  formatLabelDate,
  formatQtyLine,
  formatTrackingLine,
  type BaseLabelOrderInput,
  type OnwayLabelDataRow,
} from "@/lib/onwayLabelView";

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

describe("OnWay label view mapping", () => {
  const sampleOrder: BaseLabelOrderInput = {
    id: "ord-125081",
    tracking_number: "106163719",
    courier_zone_id: 1,
    courier_label_text: "[S-0007] 002 - 1",
    courier_label_date: "2026-11-04",
    customer_phone: "593404593",
    address: "საბურთალო, ვაჟა ფშაველას 49, კომაროვის სკოლა.",
    city: "თბილისი",
  };

  it("uses to_branch_id and line_id from onway_label_data when present", () => {
    const rows: OnwayLabelDataRow[] = [
      {
        order_id: sampleOrder.id,
        tracking: "106163719",
        box_index: 1,
        box_count: 1,
        payload: { to_branch_id: 1, line_id: "116", weight: 1.5, quantity: 1 },
      },
    ];
    const [label] = expandOrdersToLabels([sampleOrder], new Map([[sampleOrder.id, rows]]));
    expect(label.zone).toBe("1");
    expect(label.dateText).toBe("04/11/2026");
    expect(label.sender).toBe("TrendMart");
    expect(label.recipientText).toBe("593404593, საბურთალო, ვაჟა ფშაველას 49, კომაროვის სკოლა., თბილისი, 593404593");
    expect(label.qrValue).toBe("106163719");
    expect(label.qtyText).toBe("1");
    expect(label.weightText).toBe("1.5");
    expect(label.trackingLine).toBe("116 #106163719");
    expect(label.tagLine).toBe("[S-0007] 002 - 1");
  });

  it("omits district prefix when captured row has no line_id", () => {
    const rows: OnwayLabelDataRow[] = [
      {
        order_id: sampleOrder.id,
        tracking: "106163719",
        box_index: 1,
        box_count: 1,
        payload: { to_branch_id: 4, weight: 1.2, quantity: 1 },
      },
    ];
    const [label] = expandOrdersToLabels([sampleOrder], new Map([[sampleOrder.id, rows]]));
    expect(label.zone).toBe("4");
    expect(label.trackingLine).toBe("#106163719");
  });

  it("omits district prefix when no onway_label_data exists", () => {
    const [label] = expandOrdersToLabels([sampleOrder], new Map());
    expect(label.zone).toBe("1");
    expect(label.dateText).toBe("04/11/2026");
    expect(label.trackingLine).toBe("#106163719");
    expect(label.qrValue).toBe("106163719");
    expect(label.weightText).toBe("1.0");
    expect(label.hasOnwayData).toBe(false);
  });

  it("expands multi-box orders in box_index order with ყუთი i/n in qty line", () => {
    const rows: OnwayLabelDataRow[] = [
      { order_id: sampleOrder.id, tracking: "106163719-2", box_index: 2, box_count: 2, payload: { to_branch_id: 4, line_id: "205" } },
      { order_id: sampleOrder.id, tracking: "106163719-1", box_index: 1, box_count: 2, payload: { to_branch_id: 4, line_id: "205" } },
    ];
    const labels = expandOrdersToLabels([sampleOrder], new Map([[sampleOrder.id, rows]]));
    expect(labels).toHaveLength(2);
    expect(labels[0].qtyText).toBe("1 (ყუთი 1/2)");
    expect(labels[0].qrValue).toBe("106163719-1");
    expect(labels[0].trackingLine).toBe("205 #106163719-1");
    expect(labels[1].qtyText).toBe("1 (ყუთი 2/2)");
    expect(labels[1].qrValue).toBe("106163719-2");
  });

  it("formats dates, recipient, qty, and tracking lines cleanly", () => {
    expect(formatLabelDate("2026-11-04")).toBe("04/11/2026");
    expect(buildRecipientText("593404593", "ვაჟა 49", "თბილისი")).toBe("593404593, ვაჟა 49, თბილისი, 593404593");
    expect(formatTrackingLine("106163719", "116")).toBe("116 #106163719");
    expect(formatTrackingLine("106163719", null)).toBe("#106163719");
    expect(formatQtyLine(1, 1, 2)).toBe("1 (ყუთი 1/2)");
    expect(formatQtyLine(1, 1, 1)).toBe("1");
  });
});
