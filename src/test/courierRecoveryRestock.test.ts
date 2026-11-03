import { describe, it, expect } from "vitest";
import { recoveryBySku, recoveryTotals } from "@/lib/courierRecovery";
import type { CourierDataset, Shipment } from "@/hooks/useCourierDataset";

const base: Shipment = {
  id: "x", tracking_number: "", order_number: null, original_order_id: null, current_courier_status: null,
  derived_state: null, is_return: false, phone: null, phone_normalized: null, customer_name: null, city: null,
  cod_amount: null, order_date: "2026-11-01", pickup_date: null, latest_status_date: null, status_changed_at: null,
  final_status_date: null, comment_items: [{ code: "002", qty: 2 }], linked_original_tracking_number: null, linked_return_tracking_number: null,
};
const ds = (shipments: Shipment[]): CourierDataset => ({ shipments, orders: new Map(), itemsByOrder: new Map(), statusMap: new Map() });

describe("ready to restock (read-only)", () => {
  it("counts units whose linked return reached ფილიალიდან გაცემა", () => {
    const out = { ...base, id: "1", tracking_number: "A", derived_state: "FAILED_FINAL", linked_return_tracking_number: "R" };
    const ret = { ...base, id: "2", tracking_number: "R", is_return: true, current_courier_status: "ფილიალიდან გაცემა", linked_original_tracking_number: "A" };
    const r = recoveryBySku(ds([out, ret])).get("002")!;
    expect(r.collectedUnits).toBe(2);
    expect(r.readyToRestockUnits).toBe(2);
    expect(recoveryTotals(recoveryBySku(ds([out, ret]))).readyToRestockUnits).toBe(2);
  });
  it("does not count returns still on the way", () => {
    const out = { ...base, id: "1", tracking_number: "A", derived_state: "FAILED_FINAL", linked_return_tracking_number: "R" };
    const ret = { ...base, id: "2", tracking_number: "R", is_return: true, current_courier_status: "გზაშია", linked_original_tracking_number: "A" };
    expect(recoveryBySku(ds([out, ret])).get("002")!.readyToRestockUnits).toBe(0);
  });
});
