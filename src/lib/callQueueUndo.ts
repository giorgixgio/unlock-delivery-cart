/** Pure rules for undoing the last Call Queue outcome. The DB RPC call_queue_undo enforces the same rules. */

export const UNDO_WINDOW_MS = 5 * 60 * 1000;
export const UNDO_TOAST_MS = 60 * 1000;

/** Order fields restored by undo (address and items are intentionally not reverted). */
export const UNDO_SNAPSHOT_FIELDS = [
  "status", "is_confirmed", "call_outcome", "call_outcome_updated_at", "call_outcome_updated_by",
  "operator_review_status", "review_required", "call_attempt_count", "last_call_attempt_at", "last_call_attempt_by",
  "call_attempt_history", "next_call_after", "final_cancel_reason", "final_cancel_note", "canceled_after_attempts",
  "queue_extra_attempts", "queue_last_touched_by",
] as const;

/** Event types created by an outcome that undo renames to `<type>_undone`. */
export const UNDOABLE_EVENT_TYPES = ["call_outcome", "call_attempt", "callback_scheduled", "order_canceled"];

export type QueueOutcome = "confirmed" | "no_answer" | "callback" | "cancelled";

export interface UndoAction {
  orderId: string;
  orderNumber: string;
  outcome: QueueOutcome;
  actor: string;
  takenAt: string; // ISO
  snapshot: Record<string, unknown>;
  /** True once the operator has recorded another outcome. */
  superseded?: boolean;
}

export interface UndoOrderState {
  status: string | null;
  is_fulfilled: boolean | null;
  onway_sent_at: string | null;
  onway_tracking: string | null;
  packed_at: string | null;
  packing_wave_id: string | null;
  /** Any order event after the action by a different (non-system) actor. */
  touchedByOther: boolean;
}

export type UndoCheck = { ok: true } | { ok: false; reason: string };

export function buildSnapshot(order: Record<string, unknown>, outcome: QueueOutcome, actor: string, takenAt: string) {
  const snap: Record<string, unknown> = { outcome, actor, taken_at: takenAt };
  for (const f of UNDO_SNAPSHOT_FIELDS) snap[f] = order[f] ?? null;
  return snap;
}

export function canUndo(action: UndoAction | null, me: string, order: UndoOrderState | null, now = Date.now()): UndoCheck {
  if (!action) return { ok: false, reason: "Nothing to undo" };
  if (action.superseded) return { ok: false, reason: "A newer outcome was recorded" };
  if (action.actor.toLowerCase() !== me.toLowerCase()) return { ok: false, reason: "Only the same operator can undo" };
  if (now - new Date(action.takenAt).getTime() > UNDO_WINDOW_MS) return { ok: false, reason: "More than 5 minutes passed" };
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.onway_sent_at || (order.onway_tracking ?? "").trim()) return { ok: false, reason: "Already sent to Onway" };
  if (order.is_fulfilled || order.packed_at || order.packing_wave_id || ["fulfilled", "shipped", "delivered", "packed"].includes(order.status ?? ""))
    return { ok: false, reason: "Already packed or fulfilled" };
  if (order.touchedByOther) return { ok: false, reason: "Changed by someone else" };
  return { ok: true };
}

export const OUTCOME_LABEL: Record<QueueOutcome, string> = {
  confirmed: "დადასტურდა", no_answer: "არ პასუხობს", callback: "გადასარეკია", cancelled: "გაუქმდა",
};
