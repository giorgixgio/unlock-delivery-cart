/**
 * Courier derived states (new, finer taxonomy).
 * Lives alongside the legacy `derived_status` values in src/lib/courierStatus.ts —
 * nothing there is changed; this is the mapping the Courier section uses.
 */
export type DerivedState =
  | "DELIVERED"
  | "FAILED_FINAL"
  | "FAILED_ATTEMPT"
  | "RETURNED_FAILED"
  | "CANCELLED_EXCLUDED"
  | "RETURN_COLLECTED"
  | "RETURN_FAILED"
  | "RETURN_CANCELLED"
  | "IN_PROGRESS";

export const STATE_LABEL: Record<string, string> = {
  DELIVERED: "ჩაბარდა",
  FAILED_FINAL: "ვერ ჩაბარდა (საბოლოო)",
  FAILED_ATTEMPT: "ვერ ჩაბარდა (ისევ გავა)",
  RETURNED_FAILED: "დაბრუნდა და ავიღეთ",
  CANCELLED_EXCLUDED: "გაუქმდა (არ ითვლება)",
  RETURN_COLLECTED: "დაბრუნება — ავიღეთ",
  RETURN_FAILED: "დაბრუნება — დასრულდა",
  RETURN_CANCELLED: "დაბრუნება — გაუქმდა",
  IN_PROGRESS: "მიმდინარე",
};

export const STATE_BADGE: Record<string, string> = {
  DELIVERED: "bg-green-100 text-green-800 border-green-300",
  FAILED_FINAL: "bg-red-100 text-red-800 border-red-300",
  FAILED_ATTEMPT: "bg-amber-100 text-amber-800 border-amber-300",
  RETURNED_FAILED: "bg-orange-100 text-orange-800 border-orange-300",
  CANCELLED_EXCLUDED: "bg-zinc-100 text-zinc-700 border-zinc-300",
  RETURN_COLLECTED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  RETURN_FAILED: "bg-zinc-100 text-zinc-700 border-zinc-300",
  RETURN_CANCELLED: "bg-zinc-100 text-zinc-700 border-zinc-300",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
};

/** States that count in the delivery-rate denominator (outbound only). */
export const DELIVERED_STATES = ["DELIVERED"];
export const FAILED_STATES = ["FAILED_FINAL", "RETURNED_FAILED"];
export const RESOLVED_STATES = [...DELIVERED_STATES, ...FAILED_STATES];
/** Outbound states that are final but excluded from the rate. */
export const EXCLUDED_STATES = ["CANCELLED_EXCLUDED"];

export const RETURN_IN_TRANSIT_STATUSES = [
  "საწყობში",
  "გაგზავნილი ფილიალში",
  "უბრუნდება გამგზავნს",
];

export type StatusMapRow = {
  courier_status: string;
  label_ka: string | null;
  outbound_state: string;
  outbound_counts_as: string;
  outbound_is_final: boolean;
  return_state: string;
  return_counts_as: string;
  return_is_final: boolean;
  is_return_collected: boolean;
  is_return_in_transit: boolean;
  counts_as_collected_outbound: boolean;
  sort_order: number;
};

export function stateOf(map: Map<string, StatusMapRow>, status: string, isReturn: boolean): string {
  const row = map.get((status || "").trim());
  if (!row) return "IN_PROGRESS";
  return isReturn ? row.return_state : row.outbound_state;
}

export function isFinalState(map: Map<string, StatusMapRow>, status: string, isReturn: boolean): boolean {
  const row = map.get((status || "").trim());
  if (!row) return false;
  return isReturn ? row.return_is_final : row.outbound_is_final;
}

/** True when the sender field indicates a return shipment (customer -> us). */
export function senderIsCustomer(sender: string | null | undefined): boolean {
  const s = (sender || "").trim();
  if (!s) return false;
  if (/^customer[-\s]?\d+/i.test(s)) return true;
  const digits = s.replace(/[^0-9]/g, "");
  return digits.length >= 6 && digits.length >= s.replace(/\s/g, "").length - 3;
}

export type CommentItem = { code: string; qty: number };

/** Parses "[S-0059] 170 - 1, 57 - 2" into [{code:"170",qty:1},{code:"57",qty:2}] */
export function parseCommentItems(comment: string | null | undefined): CommentItem[] {
  const s = (comment || "").trim();
  if (!s) return [];
  const body = s.replace(/\[[^\]]*\]/g, " ");
  const out: CommentItem[] = [];
  for (const part of body.split(/[,;]+/)) {
    const m = part.trim().match(/^([A-Za-z0-9_\-\/.]+)\s*[-–xX*]\s*(\d+)$/);
    if (m) out.push({ code: m[1], qty: parseInt(m[2], 10) || 1 });
    else {
      const only = part.trim().match(/^([A-Za-z0-9_\-\/.]+)$/);
      if (only) out.push({ code: only[1], qty: 1 });
    }
  }
  return out;
}

export function itemsKey(items: CommentItem[]): string {
  return items
    .map((i) => `${i.code}:${i.qty}`)
    .sort()
    .join("|");
}

export function normalizePhone(p: string | null | undefined): string | null {
  const d = (p || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  return d.length > 9 ? d.slice(-9) : d;
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
