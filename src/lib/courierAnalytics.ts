import type { CourierDataset, Shipment } from "@/hooks/useCourierDataset";
import { unitsFor } from "@/hooks/useCourierDataset";
import { RETURN_IN_TRANSIT_STATUSES } from "@/lib/courierStates";

export type Recovery = "collected" | "on_the_way" | "not_registered";

export const isOutbound = (s: Shipment) => !s.is_return;
export const isDelivered = (s: Shipment) => s.derived_state === "DELIVERED";
export const isFailedFinal = (s: Shipment) =>
  s.derived_state === "FAILED_FINAL" || s.derived_state === "RETURNED_FAILED";
export const isExcluded = (s: Shipment) => s.derived_state === "CANCELLED_EXCLUDED";
export const isInProgress = (s: Shipment) =>
  s.derived_state === "IN_PROGRESS" || s.derived_state === "FAILED_ATTEMPT";

/** All outbound shipments that were actually handed to the courier. */
export const handedToCourier = (list: Shipment[]) =>
  list.filter((s) => isOutbound(s) && !isExcluded(s));

export function rateBlock(list: Shipment[]) {
  const handed = handedToCourier(list);
  const delivered = handed.filter(isDelivered).length;
  const failed = handed.filter(isFailedFinal).length;
  const resolved = delivered + failed;
  const unresolved = handed.length - resolved;
  return {
    handed: handed.length,
    delivered,
    failed,
    resolved,
    unresolved,
    deliveryRate: resolved ? delivered / resolved : 0,
    resolvedShare: handed.length ? resolved / handed.length : 0,
  };
}

/** Physical recovery of a finalized-failed outbound shipment. */
export function recoveryOf(ds: CourierDataset, s: Shipment, byTracking: Map<string, Shipment>): Recovery {
  // Outbound parcel that came back on its own tracking (ფილიალიდან გაცემა, no separate return)
  if (s.derived_state === "RETURNED_FAILED" && !s.linked_return_tracking_number) return "collected";

  const ret = s.linked_return_tracking_number ? byTracking.get(s.linked_return_tracking_number) : undefined;
  if (!ret) return s.derived_state === "RETURNED_FAILED" ? "collected" : "not_registered";

  const status = (ret.current_courier_status || "").trim();
  if (ret.derived_state === "RETURN_CANCELLED") return "not_registered";
  if (status === "ფილიალიდან გაცემა" || status === "ჩაბარებული") return "collected";
  if (RETURN_IN_TRANSIT_STATUSES.includes(status)) return "on_the_way";
  return "on_the_way";
}

export type RecoveryTotals = {
  collectedOrders: number; collectedUnits: number;
  onTheWayOrders: number; onTheWayUnits: number;
  notRegisteredOrders: number; notRegisteredUnits: number;
  failedOrders: number; failedUnits: number;
};

export function emptyRecovery(): RecoveryTotals {
  return {
    collectedOrders: 0, collectedUnits: 0,
    onTheWayOrders: 0, onTheWayUnits: 0,
    notRegisteredOrders: 0, notRegisteredUnits: 0,
    failedOrders: 0, failedUnits: 0,
  };
}

export function addRecovery(t: RecoveryTotals, r: Recovery, units: number) {
  t.failedOrders++; t.failedUnits += units;
  if (r === "collected") { t.collectedOrders++; t.collectedUnits += units; }
  else if (r === "on_the_way") { t.onTheWayOrders++; t.onTheWayUnits += units; }
  else { t.notRegisteredOrders++; t.notRegisteredUnits += units; }
}

export function unitCount(ds: CourierDataset, s: Shipment): number {
  return unitsFor(ds, s).reduce((a, b) => a + b.qty, 0) || 1;
}

export function shipmentDate(s: Shipment): string | null {
  return s.order_date || s.latest_status_date || null;
}

export function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
