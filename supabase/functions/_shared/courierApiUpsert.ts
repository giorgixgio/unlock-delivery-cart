// Feeds an Onway API payload (webhook push or pull) into courier_shipments/history through
// the single DB write path courier_upsert_shipment.
import { onwayPayloadToShipment, type StatusMapRow } from "./courierShipment.ts";

export async function loadStatusMap(db: any): Promise<Map<string, StatusMapRow>> {
  const { data } = await db.from("courier_status_map").select("courier_status, outbound_state, outbound_is_final, return_state, return_is_final");
  const m = new Map<string, StatusMapRow>();
  for (const r of (data || []) as StatusMapRow[]) m.set(r.courier_status.trim(), r);
  return m;
}

export async function upsertOnwayShipment(db: any, body: unknown, source: "api" = "api") {
  let statusMap = await loadStatusMap(db);
  let built = onwayPayloadToShipment(body, statusMap);
  if (!built) return { result: "unparsed" };
  if (built.unknownStatuses.length) {
    // Safe default: in progress (excluded from delivery-rate math), flagged for the admin to classify.
    await db.from("courier_status_map").upsert(built.unknownStatuses.map((s) => ({
      courier_status: s, label_ka: s, label_en: s, outbound_state: "IN_PROGRESS", outbound_is_final: false,
      return_state: "IN_PROGRESS", return_is_final: false, needs_review: true, sort_order: 900,
    })), { onConflict: "courier_status", ignoreDuplicates: true });
    statusMap = await loadStatusMap(db);
    built = onwayPayloadToShipment(body, statusMap)!;
  }
  const { data, error } = await db.rpc("courier_upsert_shipment", { p_row: built.row, p_history: built.history, p_source: source });
  if (error) throw new Error(`courier_upsert_shipment: ${error.message}`);
  return data as { result: string; history_added: number };
}
