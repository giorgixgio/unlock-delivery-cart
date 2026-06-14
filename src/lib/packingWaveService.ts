import { supabase } from "@/integrations/supabase/client";

export type WaveStatus =
  | "draft"
  | "exported"
  | "tracking_imported"
  | "packing"
  | "completed"
  | "issue";

export type Classification = "single_sku" | "multi_sku";
export type PackingStatus = "not_packed" | "packing" | "packed" | "issue";

export interface PackingWave {
  id: string;
  wave_number: number;
  name: string | null;
  status: WaveStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  exported_at: string | null;
  exported_by: string | null;
  exported_order_count: number;
  export_filename: string | null;
  tracking_imported_at: string | null;
  tracking_imported_by: string | null;
  stickers_printed_at: string | null;
  stickers_printed_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export interface WaveOrderRow {
  id: string;
  wave_id: string;
  order_id: string;
  classification: Classification;
  primary_sku: string | null;
  sku_count: number;
  total_qty: number;
  packing_status: PackingStatus;
  packed_at: string | null;
  packed_by: string | null;
  issue_type: string | null;
  issue_note: string | null;
}

export interface PackingRun {
  id: string;
  wave_id: string;
  run_number: number;
  slot_count: number;
  status: string;
  created_at: string;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface RunSlot {
  id: string;
  run_id: string;
  wave_id: string;
  slot_number: number;
  order_id: string;
  tracking_number_snapshot: string | null;
  packing_status: PackingStatus;
  packed_at: string | null;
  packed_by: string | null;
  issue_type: string | null;
  issue_note: string | null;
}

const sb = supabase as any;

export async function fetchWaves(): Promise<PackingWave[]> {
  const { data, error } = await sb.from("packing_waves").select("*").order("wave_number", { ascending: false });
  if (error) throw error;
  return (data || []) as PackingWave[];
}

export async function fetchWave(id: string): Promise<PackingWave> {
  const { data, error } = await sb.from("packing_waves").select("*").eq("id", id).single();
  if (error) throw error;
  return data as PackingWave;
}

export async function fetchWaveOrders(waveId: string): Promise<WaveOrderRow[]> {
  const { data, error } = await sb.from("packing_wave_orders").select("*").eq("wave_id", waveId);
  if (error) throw error;
  return (data || []) as WaveOrderRow[];
}

export async function fetchEligibleOrderCount(): Promise<number> {
  const { count, error } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("is_confirmed", true)
    .eq("is_fulfilled", false)
    .eq("status", "confirmed")
    .is("packing_wave_id", null);
  if (error) throw error;
  return count || 0;
}

export async function createWave(actor: string): Promise<{
  wave_id: string;
  wave_number: number;
  total: number;
  single_sku: number;
  multi_sku: number;
}> {
  const { data, error } = await sb.rpc("create_packing_wave", { actor });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

export async function markStickersPrinted(waveId: string, actor: string) {
  const { error } = await sb
    .from("packing_waves")
    .update({ stickers_printed_at: new Date().toISOString(), stickers_printed_by: actor })
    .eq("id", waveId);
  if (error) throw error;
}

export async function markWaveExported(waveId: string, actor: string, orderCount: number, fileName?: string) {
  const { error } = await sb
    .from("packing_waves")
    .update({
      status: "exported",
      exported_at: new Date().toISOString(),
      exported_by: actor,
      exported_order_count: orderCount,
      export_filename: fileName || null,
    })
    .eq("id", waveId);
  if (error) throw error;
}

export async function completeWave(waveId: string, force: boolean, actor: string) {
  const { data, error } = await sb.rpc("complete_packing_wave", { p_wave_id: waveId, p_force: force, actor });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { completed: boolean; unpacked: number };
}

export async function fetchRuns(waveId: string): Promise<PackingRun[]> {
  const { data, error } = await sb.from("packing_runs").select("*").eq("wave_id", waveId).order("run_number");
  if (error) throw error;
  return (data || []) as PackingRun[];
}

export async function fetchRun(runId: string): Promise<PackingRun> {
  const { data, error } = await sb.from("packing_runs").select("*").eq("id", runId).single();
  if (error) throw error;
  return data as PackingRun;
}

export async function fetchRunSlots(runId: string): Promise<RunSlot[]> {
  const { data, error } = await sb.from("packing_run_slots").select("*").eq("run_id", runId).order("slot_number");
  if (error) throw error;
  return (data || []) as RunSlot[];
}

export async function fetchWaveRunSlots(waveId: string): Promise<RunSlot[]> {
  const { data, error } = await sb.from("packing_run_slots").select("*").eq("wave_id", waveId);
  if (error) throw error;
  return (data || []) as RunSlot[];
}

export async function markRunPacked(runId: string, actor: string) {
  const now = new Date().toISOString();
  const { data: slots } = await sb.from("packing_run_slots").select("id, order_id, wave_id").eq("run_id", runId);
  const orderIds = ((slots || []) as any[]).map((s) => s.order_id);
  const waveId = ((slots || []) as any[])[0]?.wave_id;
  await sb.from("packing_run_slots")
    .update({ packing_status: "packed", packed_at: now, packed_by: actor })
    .eq("run_id", runId).neq("packing_status", "packed");
  if (orderIds.length) {
    await sb.from("packing_wave_orders")
      .update({ packing_status: "packed", packed_at: now, packed_by: actor })
      .eq("wave_id", waveId).in("order_id", orderIds).neq("packing_status", "packed");
    await sb.from("orders")
      .update({ packing_status: "packed", packed_at: now, packed_by: actor })
      .in("id", orderIds).neq("packing_status", "packed");
  }
  await sb.from("packing_runs")
    .update({ status: "packed", completed_at: now, completed_by: actor })
    .eq("id", runId);
}

export async function createRun(waveId: string, slotCount: number, actor: string) {
  const { data, error } = await sb.rpc("assign_packing_run_slots", {
    p_wave_id: waveId,
    p_slot_count: slotCount,
    actor,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { run_id: string; run_number: number; assigned: number };
}

export async function markSlotPacked(slotId: string, actor: string) {
  const { data: slot, error: sErr } = await sb.from("packing_run_slots").select("order_id, wave_id").eq("id", slotId).single();
  if (sErr) throw sErr;
  const now = new Date().toISOString();
  await sb.from("packing_run_slots").update({ packing_status: "packed", packed_at: now, packed_by: actor }).eq("id", slotId);
  await sb.from("packing_wave_orders").update({ packing_status: "packed", packed_at: now, packed_by: actor })
    .eq("wave_id", (slot as any).wave_id).eq("order_id", (slot as any).order_id);
  await sb.from("orders").update({ packing_status: "packed", packed_at: now, packed_by: actor }).eq("id", (slot as any).order_id);
}

export async function markSlotIssue(slotId: string, issueType: string, note: string, actor: string) {
  const { data: slot, error: sErr } = await sb.from("packing_run_slots").select("order_id, wave_id").eq("id", slotId).single();
  if (sErr) throw sErr;
  await sb.from("packing_run_slots").update({
    packing_status: "issue", issue_type: issueType, issue_note: note, packed_by: actor,
  }).eq("id", slotId);
  await sb.from("packing_wave_orders").update({
    packing_status: "issue", issue_type: issueType, issue_note: note,
  }).eq("wave_id", (slot as any).wave_id).eq("order_id", (slot as any).order_id);
}

export async function markSingleSkuPacked(waveId: string, orderId: string, actor: string) {
  const now = new Date().toISOString();
  await sb.from("packing_wave_orders").update({ packing_status: "packed", packed_at: now, packed_by: actor })
    .eq("wave_id", waveId).eq("order_id", orderId);
  await sb.from("orders").update({ packing_status: "packed", packed_at: now, packed_by: actor }).eq("id", orderId);
}

export interface ImportTrackingResult {
  updated: number;
  skippedEmpty: number;
  missingInDb: string[];
  belongsToOtherWave: string[];
  inThisWave: number;
}

export async function importTrackingForWave(
  waveId: string,
  rows: { order_id: string; tracking_number: string }[],
  actor: string
): Promise<ImportTrackingResult> {
  const skippedEmpty = rows.filter((r) => !r.tracking_number || !r.tracking_number.trim()).length;
  const cleanRows = rows.filter((r) => r.order_id && r.tracking_number?.trim());

  const orderIds = Array.from(new Set(cleanRows.map((r) => r.order_id)));
  const { data: existing } = await sb.from("orders").select("id, packing_wave_id").in("id", orderIds);
  const map = new Map<string, string | null>((existing || []).map((o: any) => [o.id, o.packing_wave_id]));

  const missingInDb: string[] = [];
  const belongsToOtherWave: string[] = [];
  const inWaveRows: { order_id: string; tracking_number: string }[] = [];
  const dedup = new Map<string, string>();
  for (const r of cleanRows) dedup.set(r.order_id, r.tracking_number.trim());

  for (const [oid, tn] of dedup) {
    if (!map.has(oid)) { missingInDb.push(oid); continue; }
    const w = map.get(oid);
    if (w && w !== waveId) { belongsToOtherWave.push(oid); continue; }
    if (w === waveId) inWaveRows.push({ order_id: oid, tracking_number: tn });
  }

  const CHUNK = 500;
  for (let i = 0; i < inWaveRows.length; i += CHUNK) {
    const chunk = inWaveRows.slice(i, i + CHUNK);
    const { error } = await sb.rpc("bulk_update_tracking", { rows: chunk as any });
    if (error) throw error;
  }

  if (inWaveRows.length > 0) {
    await sb.from("packing_waves").update({
      status: "tracking_imported",
      tracking_imported_at: new Date().toISOString(),
      tracking_imported_by: actor,
    }).eq("id", waveId);
  }

  return {
    updated: inWaveRows.length,
    skippedEmpty,
    missingInDb,
    belongsToOtherWave,
    inThisWave: inWaveRows.length,
  };
}
