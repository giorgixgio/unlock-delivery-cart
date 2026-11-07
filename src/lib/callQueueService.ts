/** Call Queue client helpers. Queue selection/locking lives in DB RPCs (call_queue_*). */
import { supabase } from "@/integrations/supabase/client";
import { applyOrderConfirmStock } from "@/lib/stockService";
import { logCallOutcome } from "@/lib/callAttemptService";
import { logSystemEvent } from "@/lib/systemEventService";
import { markAction } from "@/lib/operatorSession";
import { logConfirmBlocked } from "@/lib/orderEventLog";
import { classifyConfirmError } from "@/lib/queueSearchRules";

export interface CallQueueSettings {
  enabled_operators: string[];
  manager_emails: string[];
  retry_gap_minutes: number;
  max_attempts: number;
  work_start: string;
  work_end: string;
  lock_minutes: number;
  operators_use_queue: boolean;
  night_from: string;
  night_to: string;
  night_first_call_after: string;
  night_retry_slot: string;
  morning_block_until: string;
  retry_every_n: number;
  backlog_mix: 2 | 3;
}

export const DEFAULT_CALL_QUEUE_SETTINGS: CallQueueSettings = {
  enabled_operators: [], manager_emails: ["eto@bigmart.ge"], retry_gap_minutes: 120,
  max_attempts: 3, work_start: "10:00", work_end: "21:00", lock_minutes: 10,
  operators_use_queue: false, night_from: "00:00", night_to: "07:00", night_first_call_after: "12:00", night_retry_slot: "18:00",
  morning_block_until: "12:00", retry_every_n: 4, backlog_mix: 2,
};

const TEST_KEY = "callQueueTestMode";
export const TEST_MODE_EVENT = "call-queue-test-mode";

export function getCallQueueTestMode(): boolean {
  try { return localStorage.getItem(TEST_KEY) === "1"; } catch { return false; }
}
export function setCallQueueTestMode(on: boolean) {
  try { if (on) localStorage.setItem(TEST_KEY, "1"); else localStorage.removeItem(TEST_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(TEST_MODE_EVENT)); } catch { /* ignore */ }
}

const db = supabase as any;

export async function fetchCallQueueSettings(): Promise<CallQueueSettings> {
  const { data } = await db.from("call_queue_settings").select("*").eq("id", true).maybeSingle();
  const s = { ...DEFAULT_CALL_QUEUE_SETTINGS, ...(data || {}) };
  settingsCache = { at: Date.now(), value: s };
  return s;
}

export const SETTINGS_CACHE_MS = 60_000;
let settingsCache: { at: number; value: CallQueueSettings } | null = null;
/** Settings with a short cache so routing changes apply without a redeploy (max 60 s stale). */
export async function fetchCallQueueSettingsCached(maxAgeMs = SETTINGS_CACHE_MS): Promise<CallQueueSettings> {
  if (settingsCache && Date.now() - settingsCache.at < maxAgeMs) return settingsCache.value;
  return fetchCallQueueSettings();
}

export async function saveCallQueueSettings(patch: Partial<CallQueueSettings>, actor: string): Promise<boolean> {
  const current = await fetchCallQueueSettings();
  const { error } = await db.from("call_queue_settings").upsert({
    id: true, ...current, ...patch, updated_at: new Date().toISOString(), updated_by: actor,
  });
  settingsCache = null;
  return !error;
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const queueNext = (store: string) =>
  rpc<{ order_id: string | null; resumed?: boolean; locked_until?: string; error?: "not_on_shift" | "paused" }>("call_queue_next", { p_store: store });
export const queueShiftStart = () => rpc<{ id: string; resumed: boolean }>("call_queue_shift_start");
export const queueAutoEndShifts = () => rpc<number>("call_queue_autoend_shifts");
export const queueRelease = (orderId: string) => rpc<void>("call_queue_release", { p_order_id: orderId });
export const queueScheduleRetry = (orderId: string) =>
  rpc<{ action: "retry" | "cancel"; next_call_after?: string; attempt_count: number; max_attempts: number }>(
    "call_queue_schedule_retry", { p_order_id: orderId });
export interface QueueStats {
  fresh_waiting: number; callbacks_due: number; retries_due: number;
  retries_later_today: number; retries_tomorrow: number; locked_now: number;
  oldest_fresh_seconds: number | null;
  night_waiting?: number;
  retries_overdue?: number;
  oldest_retry_overdue_seconds?: number | null;
}
export const queueStats = (store: string) => rpc<QueueStats>("call_queue_stats", { p_store: store });
export const queueTeamLocks = () =>
  rpc<{ order_id: string; order_number: string; locked_by: string; locked_until: string }[]>("call_queue_team_locks");
export const queueAssign = (orderId: string, operator: string) =>
  rpc<void>("call_queue_assign", { p_order_id: orderId, p_operator: operator });
/** Drop a lock taken only to look at a searched order; queue position is not touched. */
export const queueReleaseView = (orderId: string) => rpc<void>("call_queue_release_view", { p_order_id: orderId });
/** Reopen a cancelled order (stock bookkeeping + `order_reopened` event) before a new outcome. */
export const queueReopen = (orderId: string) =>
  rpc<{ reopened: boolean; event_id?: string }>("call_queue_reopen", { p_order_id: orderId });
export const queueForceRelease = (orderId: string) => rpc<void>("call_queue_force_release", { p_order_id: orderId });
export const queueOverride = (orderId: string) => rpc<void>("call_queue_override", { p_order_id: orderId });
export const queueIsManager = () => rpc<boolean>("call_queue_is_manager");
export const queueUndo = (orderId: string, snapshot: Record<string, unknown>, eventIds: string[]) =>
  rpc<{ ok: boolean; sms_already_sent: boolean }>("call_queue_undo", { p_order_id: orderId, p_snapshot: snapshot, p_event_ids: eventIds });

const UNDO_STATE_SELECT = "status, is_fulfilled, onway_sent_at, onway_tracking, packed_at, packing_wave_id";
const SNAPSHOT_SELECT =
  "status, is_confirmed, call_outcome, call_outcome_updated_at, call_outcome_updated_by, operator_review_status, review_required, call_attempt_count, last_call_attempt_at, last_call_attempt_by, call_attempt_history, next_call_after, final_cancel_reason, final_cancel_note, canceled_after_attempts, queue_extra_attempts, queue_last_touched_by";

/** Fresh copy of the fields undo restores, read right before an outcome. */
export async function fetchUndoSnapshotSource(orderId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("orders").select(SNAPSHOT_SELECT).eq("id", orderId).maybeSingle();
  if (error) return null;
  return data;
}

/** Current blocking state for undo plus whether anyone else touched the order since `sinceIso`. */
export async function fetchUndoState(orderId: string, me: string, sinceIso: string) {
  const [{ data: o }, { data: ev }] = await Promise.all([
    db.from("orders").select(UNDO_STATE_SELECT).eq("id", orderId).maybeSingle(),
    db.from("order_events").select("actor").eq("order_id", orderId).gte("created_at", sinceIso).limit(200),
  ]);
  if (!o) return null;
  const touchedByOther = ((ev as any[]) || []).some((r) => {
    const a = (r.actor || "").toLowerCase();
    return a && a !== "system" && a !== me.toLowerCase();
  });
  return { ...o, touchedByOther };
}

/** Ids of this operator's undoable events on the order since the action started. */
export async function fetchActionEventIds(orderId: string, actor: string, sinceIso: string, types: string[]): Promise<string[]> {
  const { data } = await db.from("order_events").select("id").eq("order_id", orderId).eq("actor", actor)
    .gte("created_at", sinceIso).in("event_type", types).limit(50);
  return ((data as any[]) || []).map((r) => r.id);
}

/**
 * Confirm exactly like OrderQuickReviewModal's "confirmed" outcome:
 * same order fields, manual_edit event, stock deduction, call_outcome event, system event.
 */
export async function confirmOrderFromQueue(
  order: { id: string; call_attempt_count: number | null },
  actor: string,
  sessionId: string | null,
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    call_outcome: "confirmed",
    call_outcome_updated_at: new Date().toISOString(),
    call_outcome_updated_by: actor,
    operator_review_status: "confirmed",
    status: "confirmed",
    is_confirmed: true,
    review_required: false,
  };
  let error: { message: string } | null = null;
  try {
    ({ error } = await supabase.from("orders").update(updates as any).eq("id", order.id));
  } catch (e) {
    error = { message: (e as Error)?.message || String(e) };
  }
  if (error) {
    await logConfirmBlocked(order.id, actor, { reason: classifyConfirmError(error.message), error_message: error.message, source: "call_queue" });
    return false;
  }
  await supabase.from("order_events").insert({
    order_id: order.id, actor, event_type: "manual_edit",
    payload: { section: "quick_review", changed: Object.keys(updates) } as any,
  });
  markAction("manual_edit");
  await applyOrderConfirmStock(order.id);
  await logCallOutcome(order.id, actor, "confirmed", {
    attempt_number: Number(order.call_attempt_count || 0) + 1,
    source: "call_queue",
    session_id: sessionId,
  });
  markAction("outcome");
  await logSystemEvent({
    entityType: "order", entityId: order.id,
    eventType: "ORDER_CALL_OUTCOME" as any, actorId: actor,
    payload: { outcome: "confirmed", mapped_status: "confirmed" },
  });
  return true;
}
