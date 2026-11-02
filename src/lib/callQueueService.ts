/** Call Queue client helpers. Queue selection/locking lives in DB RPCs (call_queue_*). */
import { supabase } from "@/integrations/supabase/client";
import { applyOrderConfirmStock } from "@/lib/stockService";
import { logCallOutcome } from "@/lib/callAttemptService";
import { logSystemEvent } from "@/lib/systemEventService";
import { markAction } from "@/lib/operatorSession";

export interface CallQueueSettings {
  enabled_operators: string[];
  manager_emails: string[];
  retry_gap_minutes: number;
  max_attempts: number;
  work_start: string;
  work_end: string;
  lock_minutes: number;
}

export const DEFAULT_CALL_QUEUE_SETTINGS: CallQueueSettings = {
  enabled_operators: [], manager_emails: ["eto@bigmart.ge"], retry_gap_minutes: 120,
  max_attempts: 3, work_start: "10:00", work_end: "21:00", lock_minutes: 10,
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
  return { ...DEFAULT_CALL_QUEUE_SETTINGS, ...(data || {}) };
}

export async function saveCallQueueSettings(patch: Partial<CallQueueSettings>, actor: string): Promise<boolean> {
  const current = await fetchCallQueueSettings();
  const { error } = await db.from("call_queue_settings").upsert({
    id: true, ...current, ...patch, updated_at: new Date().toISOString(), updated_by: actor,
  });
  return !error;
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const queueNext = (store: string) =>
  rpc<{ order_id: string | null; resumed?: boolean; locked_until?: string }>("call_queue_next", { p_store: store });
export const queueRelease = (orderId: string) => rpc<void>("call_queue_release", { p_order_id: orderId });
export const queueScheduleRetry = (orderId: string) =>
  rpc<{ action: "retry" | "cancel"; next_call_after?: string; attempt_count: number; max_attempts: number }>(
    "call_queue_schedule_retry", { p_order_id: orderId });
export interface QueueStats {
  fresh_waiting: number; callbacks_due: number; retries_due: number;
  retries_later_today: number; retries_tomorrow: number; locked_now: number;
  oldest_fresh_seconds: number | null;
}
export const queueStats = (store: string) => rpc<QueueStats>("call_queue_stats", { p_store: store });
export const queueTeamLocks = () =>
  rpc<{ order_id: string; order_number: string; locked_by: string; locked_until: string }[]>("call_queue_team_locks");
export const queueAssign = (orderId: string, operator: string) =>
  rpc<void>("call_queue_assign", { p_order_id: orderId, p_operator: operator });
export const queueForceRelease = (orderId: string) => rpc<void>("call_queue_force_release", { p_order_id: orderId });
export const queueOverride = (orderId: string) => rpc<void>("call_queue_override", { p_order_id: orderId });
export const queueIsManager = () => rpc<boolean>("call_queue_is_manager");

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
  const { error } = await supabase.from("orders").update(updates as any).eq("id", order.id);
  if (error) return false;
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
