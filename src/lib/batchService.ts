import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─── */
export interface BatchRow {
  id: string;
  created_at: string;
  created_by: string | null;
  status: string;
  packing_list_printed_at: string | null;
  packing_list_printed_by: string | null;
  packing_list_print_count: number;
  packing_slips_printed_at: string | null;
  packing_slips_printed_by: string | null;
  packing_slips_print_count: number;
  released_at: string | null;
  released_by: string | null;
  exported_at: string | null;
  exported_by: string | null;
  export_count: number;
  order_count?: number;
  total_qty?: number;
}

export interface BatchOrderRow {
  id: string;
  batch_id: string;
  order_id: string;
}

export interface SnapshotItem {
  id: string;
  batch_id: string;
  order_id: string;
  sku: string;
  product_name: string;
  qty: number;
}

export interface BatchEvent {
  id: string;
  batch_id: string;
  created_at: string;
  created_by: string | null;
  event_type: string;
  payload: Record<string, unknown>;
}

/* ─── Fetch helpers ─── */

export async function fetchBatches(statusFilter?: string) {
  let q = supabase
    .from("batches")
    .select("*, batch_orders(order_id), batch_order_items_snapshot(qty)")
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data as any[]).map((b) => ({
    ...b,
    order_count: b.batch_orders?.length ?? 0,
    total_qty: (b.batch_order_items_snapshot as any[])?.reduce(
      (s: number, i: any) => s + (i.qty ?? 0),
      0
    ) ?? 0,
  })) as BatchRow[];
}

export async function fetchBatch(id: string) {
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as BatchRow;
}

export async function fetchBatchOrders(batchId: string) {
  const { data, error } = await supabase
    .from("batch_orders")
    .select("*")
    .eq("batch_id", batchId);
  if (error) throw error;

  const orderIds = (data as BatchOrderRow[]).map((bo) => bo.order_id);
  if (orderIds.length === 0) return [];

  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select("id, public_order_number, customer_name, customer_phone, city, address_line1, address_line2, tracking_number, total, notes_customer, normalized_address, normalized_city, released_at")
    .in("id", orderIds);

  if (oErr) throw oErr;
  return orders || [];
}

export async function fetchSnapshot(batchId: string) {
  const { data, error } = await supabase
    .from("batch_order_items_snapshot")
    .select("*")
    .eq("batch_id", batchId);
  if (error) throw error;
  return (data || []) as SnapshotItem[];
}

export async function fetchBatchEvents(batchId: string) {
  const { data, error } = await supabase
    .from("batch_events")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as BatchEvent[];
}

/* ─── Eligibility ─── */

export async function fetchEligibleOrderCount() {
  // Eligible: confirmed, not batched, not released, not canceled/merged
  const { data: eligible, error: eErr } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("is_confirmed", true)
    .is("batch_id", null)
    .is("released_at", null);
  if (eErr) throw eErr;

  // Ineligible reasons
  const reasons: { reason: string; count: number }[] = [];

  const { count: alreadyBatched } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("is_confirmed", true)
    .not("batch_id", "is", null);
  if (alreadyBatched && alreadyBatched > 0)
    reasons.push({ reason: "Already in a batch", count: alreadyBatched });

  const { count: alreadyReleased } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("is_confirmed", true)
    .not("released_at", "is", null);
  if (alreadyReleased && alreadyReleased > 0)
    reasons.push({ reason: "Already released", count: alreadyReleased });

  const { count: notConfirmed } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("is_confirmed", false)
    .is("batch_id", null)
    .is("released_at", null)
    .not("status", "in", '("canceled","merged")');
  if (notConfirmed && notConfirmed > 0)
    reasons.push({ reason: "Not confirmed", count: notConfirmed });

  return {
    eligible: (eligible as any) ?? 0,
    ineligible: reasons,
  };
}

/* ─── Create Batch ─── */

export async function createBatch(actorEmail: string) {
  // 1. Get eligible orders
  const { data: eligible, error: eErr } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "confirmed")
    .eq("is_confirmed", true)
    .is("batch_id", null)
    .is("released_at", null)
    .neq("status", "merged")
    .neq("status", "canceled");

  if (eErr) throw eErr;
  if (!eligible || eligible.length === 0)
    throw new Error("No eligible orders found for batching.");

  const orderIds = eligible.map((o) => o.id);

  // 2. Create batch
  const { data: batch, error: bErr } = await supabase
    .from("batches")
    .insert({ created_by: actorEmail })
    .select()
    .single();
  if (bErr) throw bErr;

  const batchId = batch.id;

  // 3. Insert batch_orders
  const batchOrders = orderIds.map((oid) => ({
    batch_id: batchId,
    order_id: oid,
  }));
  const { error: boErr } = await supabase
    .from("batch_orders")
    .insert(batchOrders);
  if (boErr) throw boErr;

  // 4. Create snapshot from order_items
  const { data: items, error: iErr } = await supabase
    .from("order_items")
    .select("order_id, sku, title, quantity")
    .in("order_id", orderIds);
  if (iErr) throw iErr;

  if (items && items.length > 0) {
    const snapRows = items.map((i) => ({
      batch_id: batchId,
      order_id: i.order_id,
      sku: i.sku,
      product_name: i.title,
      qty: i.quantity,
    }));
    const { error: sErr } = await supabase
      .from("batch_order_items_snapshot")
      .insert(snapRows);
    if (sErr) throw sErr;
  }

  // 5. Update orders.batch_id
  const { error: uErr } = await supabase
    .from("orders")
    .update({ batch_id: batchId })
    .in("id", orderIds);
  if (uErr) throw uErr;

  // 6. Log event
  await logBatchEvent(batchId, actorEmail, "BATCH_CREATED", {
    order_count: orderIds.length,
  });

  return { batchId, orderCount: orderIds.length };
}

/* ─── Print Logic (NO auto-release) ─── */

export async function printPackingList(batchId: string, actorEmail: string) {
  const batch = await fetchBatch(batchId);

  const newCount = batch.packing_list_print_count + 1;
  const updates: Record<string, unknown> = {
    packing_list_print_count: newCount,
    packing_list_printed_at: new Date().toISOString(),
    packing_list_printed_by: actorEmail,
  };

  // Only transition OPEN → LOCKED on first print
  if (batch.status === "OPEN") updates.status = "LOCKED";

  const { error } = await supabase
    .from("batches")
    .update(updates)
    .eq("id", batchId);
  if (error) throw error;

  await logBatchEvent(batchId, actorEmail, "PACKING_LIST_PRINTED", {
    print_count: newCount,
  });

  await supabase.from("batch_print_jobs").insert({
    batch_id: batchId,
    created_by: actorEmail,
    print_type: "packing_list",
    print_count: newCount,
  });
}

export async function printPackingSlips(batchId: string, actorEmail: string) {
  const batch = await fetchBatch(batchId);

  const newCount = batch.packing_slips_print_count + 1;
  const updates: Record<string, unknown> = {
    packing_slips_print_count: newCount,
    packing_slips_printed_at: new Date().toISOString(),
    packing_slips_printed_by: actorEmail,
  };

  // Only transition OPEN → LOCKED on first print
  if (batch.status === "OPEN") updates.status = "LOCKED";

  const { error } = await supabase
    .from("batches")
    .update(updates)
    .eq("id", batchId);
  if (error) throw error;

  await logBatchEvent(batchId, actorEmail, "PACKING_SLIPS_PRINTED", {
    print_count: newCount,
  });

  await supabase.from("batch_print_jobs").insert({
    batch_id: batchId,
    created_by: actorEmail,
    print_type: "packing_slips",
    print_count: newCount,
  });
}

/* ─── Bulk Release ─── */

export async function bulkReleaseBatch(batchId: string, actorEmail: string) {
  const batch = await fetchBatch(batchId);
  if (batch.status === "RELEASED") throw new Error("Batch is already released.");

  // Ensure batch has orders
  const { data: batchOrders, error: boErr } = await supabase
    .from("batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);
  if (boErr) throw boErr;
  if (!batchOrders || batchOrders.length === 0)
    throw new Error("Cannot release an empty batch.");

  const now = new Date().toISOString();

  // Update batch status
  const { error } = await supabase
    .from("batches")
    .update({
      status: "RELEASED",
      released_at: now,
      released_by: actorEmail,
    })
    .eq("id", batchId);
  if (error) throw error;

  // Stamp orders.released_at
  const ids = batchOrders.map((bo) => bo.order_id);
  await supabase
    .from("orders")
    .update({ released_at: now })
    .in("id", ids);

  await logBatchEvent(batchId, actorEmail, "BULK_RELEASE", {
    order_count: ids.length,
  });
}

/* ─── Undo Release ─── */

export async function undoReleaseBatch(batchId: string, actorEmail: string, reason: string) {
  const batch = await fetchBatch(batchId);
  if (batch.status !== "RELEASED") throw new Error("Batch is not released.");

  // Revert batch to LOCKED
  const { error } = await supabase
    .from("batches")
    .update({
      status: "LOCKED",
      released_at: null,
      released_by: null,
    })
    .eq("id", batchId);
  if (error) throw error;

  // Clear orders.released_at
  const { data: batchOrders } = await supabase
    .from("batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);

  if (batchOrders && batchOrders.length > 0) {
    const ids = batchOrders.map((bo) => bo.order_id);
    await supabase
      .from("orders")
      .update({ released_at: null })
      .in("id", ids);
  }

  await logBatchEvent(batchId, actorEmail, "UNDO_RELEASE", { reason });
}

/* ─── Events ─── */

async function logBatchEvent(
  batchId: string,
  actorEmail: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await supabase.from("batch_events").insert([{
    batch_id: batchId,
    created_by: actorEmail,
    event_type: eventType,
    payload: payload as any,
  }]);
}

export async function logShippingLabelsGenerated(
  batchId: string,
  actorEmail: string
) {
  await logBatchEvent(batchId, actorEmail, "SHIPPING_LABELS_GENERATED", {});
}

/* ─── Courier CSV Export ─── */

export async function recordCourierExport(batchId: string, actorEmail: string, orderCount: number) {
  const batch = await fetchBatch(batchId);
  const newCount = batch.export_count + 1;

  const { error } = await supabase
    .from("batches")
    .update({
      exported_at: new Date().toISOString(),
      exported_by: actorEmail,
      export_count: newCount,
    })
    .eq("id", batchId);
  if (error) throw error;

  await logBatchEvent(batchId, actorEmail, "COURIER_CSV_DOWNLOADED", {
    order_count: orderCount,
    export_count: newCount,
  });
}

/* ─── Batch-Scoped Tracking Import ─── */

export async function importTrackingForBatch(
  batchId: string,
  actorEmail: string,
  rows: { order_id: string; tracking_number: string }[]
) {
  // Get batch order IDs
  const { data: batchOrders, error: boErr } = await supabase
    .from("batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);
  if (boErr) throw boErr;

  const batchOrderIds = new Set((batchOrders || []).map((bo) => bo.order_id));

  // Validate all rows belong to this batch
  const unknownOrders = rows.filter((r) => !batchOrderIds.has(r.order_id));
  if (unknownOrders.length > 0) {
    throw new Error(`${unknownOrders.length} order(s) not in this batch: ${unknownOrders.map(u => u.order_id.slice(0, 8)).join(", ")}`);
  }

  // Check for conflicts: order already has a different tracking number
  const orderIds = rows.map((r) => r.order_id);
  const { data: existingOrders, error: oErr } = await supabase
    .from("orders")
    .select("id, tracking_number")
    .in("id", orderIds);
  if (oErr) throw oErr;

  const conflicts: { order_id: string; existing: string; incoming: string }[] = [];
  const toUpdate: { order_id: string; tracking_number: string }[] = [];

  for (const row of rows) {
    const existing = existingOrders?.find((o) => o.id === row.order_id);
    if (existing?.tracking_number && existing.tracking_number !== row.tracking_number) {
      conflicts.push({ order_id: row.order_id, existing: existing.tracking_number, incoming: row.tracking_number });
    } else if (!existing?.tracking_number || existing.tracking_number !== row.tracking_number) {
      toUpdate.push(row);
    }
    // same value → skip
  }

  if (conflicts.length > 0) {
    throw new TrackingConflictError(conflicts);
  }

  // Apply updates
  for (const row of toUpdate) {
    await supabase
      .from("orders")
      .update({ tracking_number: row.tracking_number })
      .eq("id", row.order_id);
  }

  await logBatchEvent(batchId, actorEmail, "TRACKING_IMPORTED", {
    updated: toUpdate.length,
    skipped: rows.length - toUpdate.length,
  });

  return { updated: toUpdate.length, skipped: rows.length - toUpdate.length };
}

export class TrackingConflictError extends Error {
  conflicts: { order_id: string; existing: string; incoming: string }[];
  constructor(conflicts: { order_id: string; existing: string; incoming: string }[]) {
    super(`${conflicts.length} tracking conflict(s) found`);
    this.conflicts = conflicts;
  }
}
