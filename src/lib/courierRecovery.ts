import type { CourierDataset, Shipment } from "@/hooks/useCourierDataset";
import { unitsFor } from "@/hooks/useCourierDataset";
import { isOutbound, isFailedFinal, isInProgress, recoveryOf, shipmentDate } from "@/lib/courierAnalytics";

/**
 * ONE shared per-SKU recovery aggregation.
 * Used by the Courier > Restock page and by the admin Products table so both
 * always show identical numbers. It only wraps the existing recoveryOf()
 * classification — no second calculation.
 */

export type RecoveryBucket = "collected" | "in_transit" | "not_registered" | "in_progress";

export type RecoveryDetail = {
  bucket: RecoveryBucket;
  orderNumber: string | null;
  tracking: string;
  status: string | null;
  units: number;
};

export type SkuRecovery = {
  sku: string;
  title: string;
  collectedUnits: number;
  inTransitUnits: number;
  notRegisteredUnits: number;
  inProgressUnits: number;
  collectedOrders: number;
  inTransitOrders: number;
  notRegisteredOrders: number;
  inProgressOrders: number;
  details: RecoveryDetail[];
};

export type RecoveryGrandTotals = {
  collectedUnits: number;
  inTransitUnits: number;
  notRegisteredUnits: number;
  inProgressUnits: number;
};

export function buildTrackingIndex(ds: CourierDataset | undefined): Map<string, Shipment> {
  const m = new Map<string, Shipment>();
  for (const s of ds?.shipments || []) m.set(s.tracking_number, s);
  return m;
}

function emptySku(sku: string, title: string): SkuRecovery {
  return {
    sku, title,
    collectedUnits: 0, inTransitUnits: 0, notRegisteredUnits: 0, inProgressUnits: 0,
    collectedOrders: 0, inTransitOrders: 0, notRegisteredOrders: 0, inProgressOrders: 0,
    details: [],
  };
}

function inRange(s: Shipment, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const d = shipmentDate(s);
  if (!d) return false;
  if (from && d < new Date(from).toISOString()) return false;
  if (to && d > new Date(to + "T23:59:59").toISOString()) return false;
  return true;
}

/** Per-SKU recovery map, computed from failed ORIGINAL outbound shipments. */
export function recoveryBySku(
  ds: CourierDataset | undefined,
  opts: { from?: string; to?: string; byTracking?: Map<string, Shipment> } = {},
): Map<string, SkuRecovery> {
  const out = new Map<string, SkuRecovery>();
  if (!ds) return out;
  const byTracking = opts.byTracking || buildTrackingIndex(ds);

  const ensure = (sku: string, title: string) => {
    const r = out.get(sku) || emptySku(sku, title);
    out.set(sku, r);
    return r;
  };

  for (const s of ds.shipments) {
    if (!isOutbound(s)) continue;
    if (!inRange(s, opts.from, opts.to)) continue;

    const orderNumber = s.order_number || ds.orders.get(s.original_order_id || "")?.public_order_number || null;

    if (isFailedFinal(s)) {
      const rec = recoveryOf(ds, s, byTracking);
      const bucket: RecoveryBucket =
        rec === "collected" ? "collected" : rec === "on_the_way" ? "in_transit" : "not_registered";
      for (const u of unitsFor(ds, s)) {
        const r = ensure(u.sku, u.title);
        if (bucket === "collected") { r.collectedUnits += u.qty; r.collectedOrders++; }
        else if (bucket === "in_transit") { r.inTransitUnits += u.qty; r.inTransitOrders++; }
        else { r.notRegisteredUnits += u.qty; r.notRegisteredOrders++; }
        r.details.push({ bucket, orderNumber, tracking: s.tracking_number, status: s.current_courier_status, units: u.qty });
      }
    } else if (isInProgress(s)) {
      for (const u of unitsFor(ds, s)) {
        const r = ensure(u.sku, u.title);
        r.inProgressUnits += u.qty;
        r.inProgressOrders++;
        r.details.push({ bucket: "in_progress", orderNumber, tracking: s.tracking_number, status: s.current_courier_status, units: u.qty });
      }
    }
  }

  return out;
}

export function recoveryTotals(map: Map<string, SkuRecovery>): RecoveryGrandTotals {
  const t: RecoveryGrandTotals = { collectedUnits: 0, inTransitUnits: 0, notRegisteredUnits: 0, inProgressUnits: 0 };
  for (const r of map.values()) {
    t.collectedUnits += r.collectedUnits;
    t.inTransitUnits += r.inTransitUnits;
    t.notRegisteredUnits += r.notRegisteredUnits;
    t.inProgressUnits += r.inProgressUnits;
  }
  return t;
}
