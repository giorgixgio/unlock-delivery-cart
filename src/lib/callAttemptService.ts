import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MAX_CALL_ATTEMPTS, type CancelReason } from "@/lib/cancelReasons";

export interface CallAttemptEntry {
  at: string;
  by: string;
  outcome: "no_answer" | "callback" | "confirmed" | "canceled";
  note?: string;
}

/** Record a "no answer" attempt. Does NOT change order status. */
export async function recordNoAnswerAttempt(
  orderId: string,
  actor: string,
): Promise<{ count: number } | null> {
  const { data: row, error: fetchErr } = await supabase
    .from("orders")
    .select("call_attempt_count, call_attempt_history")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchErr || !row) return null;

  const prevCount = Number(row.call_attempt_count || 0);
  const nextCount = prevCount + 1;
  const history = Array.isArray(row.call_attempt_history)
    ? (row.call_attempt_history as unknown as CallAttemptEntry[])
    : [];
  const entry: CallAttemptEntry = {
    at: new Date().toISOString(),
    by: actor,
    outcome: "no_answer",
  };
  const nextHistory = [...history, entry];

  const nowIso = entry.at;
  const { error } = await supabase
    .from("orders")
    .update({
      call_attempt_count: nextCount,
      last_call_attempt_at: nowIso,
      last_call_attempt_by: actor,
      call_attempt_history: nextHistory as any,
      // Keep status; just flag review state for the queue
      operator_review_status: "no_answer",
      call_outcome: "no_answer",
    } as any)
    .eq("id", orderId);
  if (error) return null;

  await supabase.from("order_events").insert({
    order_id: orderId,
    actor,
    event_type: "call_attempt",
    payload: { attempt_number: nextCount, outcome: "no_answer" } as any,
  });

  return { count: nextCount };
}

/** Finalize cancellation with a required reason. */
export async function cancelOrderWithReason(
  orderId: string,
  actor: string,
  reason: CancelReason,
  note: string | null,
  attemptCount: number,
  maxAttempts: number = DEFAULT_MAX_CALL_ATTEMPTS,
): Promise<boolean> {
  const canceledAfterAttempts =
    reason === "no_answer_after_attempts" && attemptCount >= maxAttempts;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "canceled",
      is_confirmed: false,
      final_cancel_reason: reason,
      final_cancel_note: note,
      canceled_after_attempts: canceledAfterAttempts,
      call_outcome: "cancelled",
      operator_review_status: "cancelled",
      call_outcome_updated_at: new Date().toISOString(),
      call_outcome_updated_by: actor,
    } as any)
    .eq("id", orderId);
  if (error) return false;

  await supabase.from("order_events").insert({
    order_id: orderId,
    actor,
    event_type: "order_canceled",
    payload: { reason, note, attempt_count: attemptCount } as any,
  });
  return true;
}

/** Schedule a callback. Sets status='on_hold', stores next_call_after. */
export async function scheduleCallback(
  orderId: string,
  actor: string,
  whenIso: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "on_hold",
      next_call_after: whenIso,
      call_outcome: "callback",
      operator_review_status: "callback",
      call_outcome_updated_at: new Date().toISOString(),
      call_outcome_updated_by: actor,
    } as any)
    .eq("id", orderId);
  if (error) return false;
  await supabase.from("order_events").insert({
    order_id: orderId,
    actor,
    event_type: "callback_scheduled",
    payload: { next_call_after: whenIso } as any,
  });
  return true;
}

export function callbackQuickOption(opt: "later_today" | "tomorrow" | "in_2h"): string {
  const d = new Date();
  if (opt === "in_2h") {
    d.setHours(d.getHours() + 2);
  } else if (opt === "later_today") {
    // 4 hours later, capped at 21:00
    d.setHours(Math.min(21, d.getHours() + 4), 0, 0, 0);
  } else if (opt === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
  }
  return d.toISOString();
}
