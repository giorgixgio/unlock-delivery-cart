// Pure rules for the "Make Replacement" flow (free replacement for a delivered order; no pickup, no restock).
import { type HistOrder, stageOf } from "@/lib/customerHistory";

export const REPLACEMENT_REASONS = [
  { key: "broken", label: "დაზიანებული" },
  { key: "wrong_item", label: "არასწორი ნივთი" },
  { key: "missing_item", label: "აკლია ნივთი" },
  { key: "other", label: "სხვა" },
] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number]["key"];

/** Mirrors DB `order_is_delivered`: our status, Onway's last status, or the courier shipment state. */
export function isDeliveredOrder(o: Pick<HistOrder, "status" | "shipment" | "onway_sent_at" | "onway_last_status"> & { is_replacement?: boolean }): boolean {
  if (o.is_replacement) return false;
  return o.status === "delivered" || o.onway_last_status === "ჩაბარდა" || stageOf(o) === "delivered";
}

/** Delivered orders of the same phone, newest first (device-only matches are never offered). */
export function replacementCandidates(history: (HistOrder & { is_replacement?: boolean })[]): HistOrder[] {
  return history
    .filter((o) => o.match_type === "phone" && isDeliveredOrder(o))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Only one candidate → preselect it. */
export function preselectCandidate(c: { id: string }[]): string | null {
  return c.length === 1 ? c[0].id : null;
}
