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

  // Fetch full order details for each order_id
  const orderIds = (data as BatchOrderRow[]).map((bo) => bo.order_id);
  if (orderIds.length === 0) return [];

  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select("id, public_order_number, customer_name, customer_phone, city, address_line1, tracking_number")
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

/* ─── Create Batch ─── */

export async function createBatch(actorEmail: string) {
  // 1. Get orders that are not batched and not released
  const { data: eligible, error: eErr } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "confirmed")
    .eq("is_confirmed", true)
    .eq("is_fulfilled", false)
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

/* ─── Print Logic ─── */

export async function printPackingList(batchId: string, actorEmail: string) {
  const batch = await fetchBatch(batchId);

  // Increment print count
  const newCount = batch.packing_list_print_count + 1;
  const updates: Record<string, unknown> = {
    packing_list_print_count: newCount,
    packing_list_printed_at: new Date().toISOString(),
    packing_list_printed_by: actorEmail,
  };

  // Status transitions
  if (batch.status === "OPEN") updates.status = "LOCKED";
  if (batch.packing_slips_print_count > 0 && batch.status !== "RELEASED") {
    updates.status = "RELEASED";
    updates.released_at = new Date().toISOString();
    updates.released_by = actorEmail;
  }

  const { error } = await supabase
    .from("batches")
    .update(updates)
    .eq("id", batchId);
  if (error) throw error;

  await logBatchEvent(batchId, actorEmail, "PACKING_LIST_PRINTED", {
    print_count: newCount,
  });

  // Insert print job
  await supabase.from("batch_print_jobs").insert({
    batch_id: batchId,
    created_by: actorEmail,
    print_type: "packing_list",
    print_count: newCount,
  });

  // If became RELEASED, stamp orders
  if (updates.status === "RELEASED") {
    await releaseOrders(batchId, actorEmail);
  }
}

export async function printPackingSlips(batchId: string, actorEmail: string) {
  const batch = await fetchBatch(batchId);

  const newCount = batch.packing_slips_print_count + 1;
  const updates: Record<string, unknown> = {
    packing_slips_print_count: newCount,
    packing_slips_printed_at: new Date().toISOString(),
    packing_slips_printed_by: actorEmail,
  };

  if (batch.packing_list_print_count > 0 && batch.status !== "RELEASED") {
    updates.status = "RELEASED";
    updates.released_at = new Date().toISOString();
    updates.released_by = actorEmail;
  }

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

  if (updates.status === "RELEASED") {
    await releaseOrders(batchId, actorEmail);
  }
}

async function releaseOrders(batchId: string, actorEmail: string) {
  const batchOrders = await supabase
    .from("batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);

  if (batchOrders.data) {
    const ids = batchOrders.data.map((bo) => bo.order_id);
    await supabase
      .from("orders")
      .update({ released_at: new Date().toISOString() })
      .in("id", ids);
  }

  await logBatchEvent(batchId, actorEmail, "BATCH_RELEASED", {});
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
