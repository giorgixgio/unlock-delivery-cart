/**
 * Pure rules for (1) opening a searched order from the Call Queue and
 * (2) guarding direct status changes outside the queue.
 */
import { splitDistrict } from "@/lib/tbilisiDistricts";
import { validateConfirmAddress, type ConfirmAddressResult } from "@/lib/confirmAddressValidation";

export interface SearchOrderLike {
  status: string;
  is_return?: boolean | null;
  auto_confirmed?: boolean | null;
  is_confirmed?: boolean | null;
  is_fulfilled?: boolean | null;
  tags?: string[] | null;
  queue_locked_by?: string | null;
  queue_locked_until?: string | null;
}

/** Mirror of DB `call_queue_is_open(orders)` — keep in sync. */
export function isQueueOpen(o: SearchOrderLike): boolean {
  return ["new", "on_hold", "pending_bump", "pending_details"].includes(o.status)
    && !o.is_return && !o.auto_confirmed && !o.is_confirmed && !o.is_fulfilled
    && !(o.tags || []).includes("test_sku");
}

export type SearchOpenDecision =
  | { kind: "assign" }
  | { kind: "locked"; by: string };

/**
 * Any searched order (any status) opens in the regular queue card, assigned to me.
 * Only a live lock held by another operator refuses it.
 */
export function searchOpenDecision(o: SearchOrderLike, me: string, now: Date = new Date()): SearchOpenDecision {
  const by = (o.queue_locked_by || "").trim();
  const until = o.queue_locked_until ? new Date(o.queue_locked_until).getTime() : 0;
  if (by && by.toLowerCase() !== me.toLowerCase() && until > now.getTime()) return { kind: "locked", by };
  return { kind: "assign" };
}

/** Last 9 phone digits, same rule as the customer history panel (`orders.phone_last9`); null if too short. */
export function phoneLast9(term: string): string | null {
  const d = (term || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

export interface OrderStageLike extends SearchOrderLike {
  onway_sent_at?: string | null;
  onway_tracking?: string | null;
  packed_at?: string | null;
  packing_wave_id?: string | null;
  merged_into_order_id?: string | null;
  tracking_number?: string | null;
}

/** Already handed to the warehouse or courier: the call stage is over. */
export function isPastCallStage(o: OrderStageLike): boolean {
  return !!(o.is_fulfilled || o.onway_sent_at || (o.onway_tracking || "").trim() || (o.tracking_number || "").trim()
    || o.packed_at || o.packing_wave_id
    || ["fulfilled", "shipped", "delivered", "packed", "returned"].includes(o.status));
}

export type OutcomeKey = "confirm" | "no_answer" | "callback" | "cancel";
export interface OrderActions {
  enabled: Record<OutcomeKey, boolean>;
  /** Address / items may be edited. */
  canEdit: boolean;
  /** Shown above the outcome buttons when some are disabled. */
  note: string | null;
  /** A cancelled order: confirm / callback reopen it first. */
  reopens: boolean;
}

const all = (v: boolean): Record<OutcomeKey, boolean> => ({ confirm: v, no_answer: v, callback: v, cancel: v });

/** Which outcome buttons make sense for an order opened in the queue card (search or queue). */
export function orderActions(o: OrderStageLike): OrderActions {
  if (o.is_return || o.status === "return_review")
    return { enabled: all(false), canEdit: false, note: "დაბრუნების შეკვეთაა / return order", reopens: false };
  if (o.merged_into_order_id || o.status === "merged")
    return { enabled: all(false), canEdit: false, note: "სხვა შეკვეთასთან შერწყმულია / merged into another order", reopens: false };
  if (isPastCallStage(o))
    return { enabled: all(false), canEdit: false, note: "უკვე გადაეცა კურიერს / already sent to courier", reopens: false };
  if (o.status === "canceled" || o.status === "cancelled")
    return {
      enabled: { confirm: true, no_answer: false, callback: true, cancel: false }, canEdit: true, reopens: true,
      note: "გაუქმებულია — დადასტურება ან გადარეკვა ხელახლა გახსნის / cancelled — confirm or callback reopens it",
    };
  if (o.is_confirmed || o.auto_confirmed || o.status === "confirmed")
    return {
      enabled: { confirm: false, no_answer: false, callback: false, cancel: true }, canEdit: true, reopens: false,
      note: "უკვე დადასტურებულია / already confirmed",
    };
  return { enabled: all(true), canEdit: true, note: null, reopens: false };
}

export type BadgeTone = "blue" | "orange" | "amber" | "sky" | "green" | "red" | "purple" | "gray";
/** Our status as a short colored badge (call outcome shown for open orders). */
export function statusBadge(o: OrderStageLike & { call_outcome?: string | null; call_attempt_count?: number | null }): { label: string; tone: BadgeTone } {
  if (o.is_return || o.status === "return_review") return { label: "დაბრუნება", tone: "gray" };
  if (o.status === "merged" || o.merged_into_order_id) return { label: "შერწყმული", tone: "gray" };
  if (o.status === "canceled" || o.status === "cancelled") return { label: "გაუქმებული", tone: "red" };
  if (o.status === "delivered") return { label: "ჩაბარებული", tone: "green" };
  if (isPastCallStage(o)) return { label: "გაგზავნილი", tone: "purple" };
  if (o.is_confirmed || o.auto_confirmed || o.status === "confirmed") return { label: "დადასტურებული", tone: "green" };
  if (o.call_outcome === "callback") return { label: "გადასარეკი", tone: "sky" };
  const n = Number(o.call_attempt_count || 0);
  if (n > 0) return { label: `არ პასუხობს ×${n}`, tone: "amber" };
  if (o.status === "on_hold") return { label: "მოლოდინში", tone: "orange" };
  if (o.status === "pending_details" || o.status === "pending_address") return { label: "მხოლოდ ტელეფონი", tone: "blue" };
  return { label: "ახალი", tone: "blue" };
}

/** Friendly operator name from an email ("mariam@x.ge" → "Mariam"). */
export function operatorName(emailOrName: string): string {
  const base = (emailOrName || "").split("@")[0].split(/[._-]/)[0] || emailOrName;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Another operator";
}

/** Statuses only the Call Queue may set while the outcome lock is on. */
export const QUEUE_ONLY_STATUSES = ["confirmed", "canceled", "on_hold"];

/** Returns a refusal reason, or null when the direct status change is allowed. */
export function directStatusChangeBlocked(
  lock: { locked: boolean; reason: string | null },
  from: string,
  to: string,
): string | null {
  if (!lock.locked || from === to) return null;
  return QUEUE_ONLY_STATUSES.includes(to) ? lock.reason || "Calls are made from the Call Queue" : null;
}

/** Validate a stored order's address before a single-order confirm. */
export function validateOrderAddressForConfirm(o: {
  city?: string | null; normalized_city?: string | null;
  address_line1?: string | null; normalized_address?: string | null;
}): ConfirmAddressResult {
  const parts = splitDistrict(o.normalized_address || o.address_line1 || "");
  return validateConfirmAddress(o.normalized_city || o.city || "", parts.district, parts.rest);
}

export type ConfirmBlockedReason = "address_missing" | "db_error" | "network";

export function classifyConfirmError(message: string | null | undefined): ConfirmBlockedReason {
  return /fetch|network|timeout|load failed|aborted/i.test(message || "") ? "network" : "db_error";
}
