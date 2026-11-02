// Finish an Onway API send exactly like Excel export + Mass Fulfill:
// label/zone/date + courier_export event, one import batch with staging rows,
// then the same bulk_fulfill_orders RPC (run as the signed-in admin).
import { buildZoneMap, canFinalize, courierLabelText, tbilisiDateIso, zoneForOrder } from "./courierLabel.ts";

export interface FinalizeEntry {
  order: any; tag: string; tracking: string;
  lane?: string | null; round?: number | null; slot?: number | null;
}
export interface FinalizeResult {
  batch_id: string | null; file_name: string | null;
  fulfilled_ids: string[]; skipped_ids: string[];
  failed: { order_id: string; error: string }[];
}

export async function finalizeOnwaySent(
  supabase: any, userClient: any, entries: FinalizeEntry[], binBySku: Record<string, string>,
  opts: { fileName: string; actor: string; appendToExisting?: boolean },
): Promise<FinalizeResult> {
  const out: FinalizeResult = { batch_id: null, file_name: opts.fileName, fulfilled_ids: [], skipped_ids: [], failed: [] };
  if (!entries.length) return out;
  const ids = entries.map((e) => e.order.id);

  // Idempotency: fresh fulfilment state + already-applied staging rows.
  const { data: fresh } = await supabase.from("orders").select("id, is_fulfilled").in("id", ids);
  const freshMap = new Map((fresh || []).map((o: any) => [o.id, o]));
  const { data: appliedRows } = await supabase.from("import_staging_rows").select("matched_order_id").eq("applied", true).in("matched_order_id", ids);
  const applied = new Set<string>((appliedRows || []).map((r: any) => String(r.matched_order_id)));
  const todo = entries.filter((e) => {
    const ok = canFinalize({ id: e.order.id, is_fulfilled: (freshMap.get(e.order.id) as any)?.is_fulfilled ?? e.order.is_fulfilled }, e.tracking, applied);
    if (!ok) out.skipped_ids.push(e.order.id);
    return ok;
  });
  if (!todo.length) return out;

  // 1) Label text, zone, date + courier_export event (same as export-courier).
  let zoneByCity: Record<string, string> = {};
  try { const { data } = await supabase.from("courier_zone_codes").select("city_name, zone_id"); zoneByCity = buildZoneMap(data); } catch { /* best effort */ }
  const today = tbilisiDateIso();
  for (const e of todo) {
    try {
      await supabase.from("orders").update({
        courier_label_text: courierLabelText(e.tag, e.order.order_items, binBySku),
        courier_zone_id: zoneForOrder(e.order, zoneByCity),
        courier_label_date: today,
      }).eq("id", e.order.id);
    } catch { /* never block */ }
    await supabase.from("order_events").insert({
      order_id: e.order.id, actor: opts.actor, event_type: "courier_export",
      payload: { exported_at: new Date().toISOString(), courier: "onway_api", tag: e.tag, lane: e.lane ?? null, round: e.round ?? null, slot: e.slot ?? null, order_count: todo.length },
    });
  }

  // 2) Batch (new, or append for review decisions).
  let batchId: string | null = null; let startRow = 0;
  if (opts.appendToExisting) {
    const { data: existing } = await supabase.from("import_batches").select("id, total_rows").eq("file_name", opts.fileName).eq("store", "B").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      batchId = existing.id; startRow = Number(existing.total_rows || 0);
      await supabase.from("import_batches").update({ total_rows: startRow + todo.length, matched: startRow + todo.length, status: "applying" }).eq("id", batchId);
    }
  }
  if (!batchId) {
    batchId = crypto.randomUUID();
    const { error } = await supabase.from("import_batches").insert({
      id: batchId, created_by: opts.actor, file_name: opts.fileName, total_rows: todo.length,
      matched: todo.length, unmatched: 0, errors: 0, status: "applying", store: "B",
    });
    if (error) { for (const e of todo) out.failed.push({ order_id: e.order.id, error: `batch: ${error.message}` }); return out; }
  }
  out.batch_id = batchId;
  await supabase.from("import_staging_rows").insert(todo.map((e, i) => ({
    batch_id: batchId, row_number: startRow + i + 1, order_ref: e.order.public_order_number, tracking_number: e.tracking,
    raw_json: { source: "onway_api", tracking: e.tracking, orderRef: e.order.public_order_number },
    match_status: "matched", matched_order_id: e.order.id, matched_order_number: e.order.public_order_number,
  })));

  // 3) Same RPC as Mass Fulfill (needs the admin's own session).
  let errMsg: string | null = null;
  try {
    const { data, error } = await userClient.rpc("bulk_fulfill_orders", {
      p_rows: todo.map((e) => ({ order_id: e.order.id, tracking_number: e.tracking, order_ref: e.order.public_order_number })),
      p_batch_id: batchId, p_source_file: opts.fileName, p_actor: opts.actor,
    });
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    out.fulfilled_ids = (r?.applied_order_ids || []).map(String);
  } catch (e: any) { errMsg = e?.message || String(e); }

  const failedIds = todo.map((e) => e.order.id).filter((id) => !out.fulfilled_ids.includes(id));
  for (const id of failedIds) {
    const msg = `Sent to Onway but not fulfilled — fulfil manually${errMsg ? `: ${errMsg}` : " (order changed)"}`;
    out.failed.push({ order_id: id, error: msg });
    await supabase.from("orders").update({ onway_error_text: msg.slice(0, 2000) }).eq("id", id);
    await supabase.from("import_staging_rows").update({ error_message: msg.slice(0, 500) }).eq("batch_id", batchId).eq("matched_order_id", id);
  }
  const { count: errCount } = await supabase.from("import_staging_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("applied", false);
  await supabase.from("import_batches").update({
    status: (errCount || 0) > 0 ? "partial" : "completed", errors: errCount || 0, applied_at: new Date().toISOString(),
  }).eq("id", batchId);
  return out;
}
