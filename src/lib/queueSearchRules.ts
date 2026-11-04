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
  | { kind: "locked"; by: string }
  | { kind: "readonly" };

/** Open → assign to me; locked by another live lock → refused; closed → read-only summary. */
export function searchOpenDecision(o: SearchOrderLike, me: string, now: Date = new Date()): SearchOpenDecision {
  if (!isQueueOpen(o)) return { kind: "readonly" };
  const by = (o.queue_locked_by || "").trim();
  const until = o.queue_locked_until ? new Date(o.queue_locked_until).getTime() : 0;
  if (by && by.toLowerCase() !== me.toLowerCase() && until > now.getTime()) return { kind: "locked", by };
  return { kind: "assign" };
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
