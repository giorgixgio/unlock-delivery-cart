import { describe, it, expect } from "vitest";
import { senderIsCustomer, parseCommentItems, itemsKey, normalizePhone } from "@/lib/courierStates";
import { recoveryOf } from "@/lib/courierAnalytics";
import type { CourierDataset, Shipment } from "@/hooks/useCourierDataset";

const base: Shipment = {
  id: "1", tracking_number: "T1", order_number: "BM-1", original_order_id: null,
  current_courier_status: "არ ჩაბარდა/დასრულებული", derived_state: "FAILED_FINAL", is_return: false,
  phone: "599112233", phone_normalized: "599112233", customer_name: "x", city: "თბილისი",
  cod_amount: 29, order_date: "2026-09-01T00:00:00Z", latest_status_date: "2026-09-05T00:00:00Z",
  status_changed_at: null, final_status_date: null, comment_items: [{ code: "170", qty: 1 }],
  linked_original_tracking_number: null, linked_return_tracking_number: null,
};

const ds = { shipments: [], orders: new Map(), itemsByOrder: new Map(), statusMap: new Map() } as unknown as CourierDataset;

describe("courier helpers", () => {
  it("detects return senders", () => {
    expect(senderIsCustomer("ბიგმარტი")).toBe(false);
    expect(senderIsCustomer("599112233")).toBe(true);
    expect(senderIsCustomer("Customer-1234")).toBe(true);
  });

  it("parses courier comment item lists", () => {
    expect(parseCommentItems("[S-0059] 170 - 1, 57 - 2")).toEqual([
      { code: "170", qty: 1 }, { code: "57", qty: 2 },
    ]);
    expect(itemsKey(parseCommentItems("170 - 1, 57 - 2")))
      .toBe(itemsKey(parseCommentItems("57 - 2, 170 - 1")));
  });

  it("normalizes phones to 9 digits", () => {
    expect(normalizePhone("+995 599 11 22 33")).toBe("599112233");
  });
});

describe("physical recovery", () => {
  const byTracking = new Map<string, Shipment>();

  it("counts an outbound ფილიალიდან გაცემა with no return as collected", () => {
    const s = { ...base, derived_state: "RETURNED_FAILED", current_courier_status: "ფილიალიდან გაცემა" };
    expect(recoveryOf(ds, s, byTracking)).toBe("collected");
  });

  it("counts a linked collected return as collected", () => {
    const ret: Shipment = { ...base, tracking_number: "R1", is_return: true, derived_state: "RETURN_COLLECTED", current_courier_status: "ფილიალიდან გაცემა" };
    byTracking.set("R1", ret);
    expect(recoveryOf(ds, { ...base, linked_return_tracking_number: "R1" }, byTracking)).toBe("collected");
  });

  it("counts a return in warehouse as on the way", () => {
    byTracking.set("R2", { ...base, tracking_number: "R2", is_return: true, derived_state: "IN_PROGRESS", current_courier_status: "საწყობში" });
    expect(recoveryOf(ds, { ...base, linked_return_tracking_number: "R2" }, byTracking)).toBe("on_the_way");
  });

  it("ignores a cancelled return", () => {
    byTracking.set("R3", { ...base, tracking_number: "R3", is_return: true, derived_state: "RETURN_CANCELLED", current_courier_status: "შეკვეთის გაუქმება" });
    expect(recoveryOf(ds, { ...base, linked_return_tracking_number: "R3" }, byTracking)).toBe("not_registered");
  });

  it("marks failed orders with no return as not registered", () => {
    expect(recoveryOf(ds, base, byTracking)).toBe("not_registered");
  });
});
