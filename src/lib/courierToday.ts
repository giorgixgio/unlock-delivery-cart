import { tbilisiDayKey } from "@/lib/tbilisiTime";

export type TodayShipment = {
  tracking_number: string;
  order_number: string | null;
  current_courier_status: string | null;
  derived_state: string | null;
  is_return: boolean;
  customer_name: string | null;
  phone: string | null;
  city: string | null;
  cod_amount: number | null;
  latest_status_date: string | null;
  status_changed_at: string | null;
  final_status_date: string | null;
};

export type Bucket = "delivered" | "failed_final" | "failed_attempt" | "in_progress" | "cancelled" | "other";

export const bucketOf = (s: Pick<TodayShipment, "derived_state">): Bucket => {
  switch (s.derived_state) {
    case "DELIVERED": return "delivered";
    case "FAILED_FINAL":
    case "RETURNED_FAILED": return "failed_final";
    case "FAILED_ATTEMPT": return "failed_attempt";
    case "IN_PROGRESS": return "in_progress";
    case "CANCELLED_EXCLUDED": return "cancelled";
    default: return "other";
  }
};

/** When the parcel last changed status (falls back to the latest status date). */
export const changedAt = (s: TodayShipment) => s.status_changed_at || s.latest_status_date;

/** True when the parcel's status changed on the given Tbilisi day. */
export const changedOnDay = (s: TodayShipment, day: string) => {
  const c = changedAt(s);
  return !!c && tbilisiDayKey(c) === day;
};

export type Tally = { count: number; cod: number };
const add = (t: Tally, s: TodayShipment) => { t.count++; t.cod += Number(s.cod_amount) || 0; };

/**
 * Daily summary: what finished today (delivered / final fail / failed attempt / cancelled)
 * and what is still out right now, grouped by the raw Onway status.
 */
export function summarizeDay(list: TodayShipment[], day: string) {
  const today: Record<Bucket, Tally> = {
    delivered: { count: 0, cod: 0 }, failed_final: { count: 0, cod: 0 }, failed_attempt: { count: 0, cod: 0 },
    in_progress: { count: 0, cod: 0 }, cancelled: { count: 0, cod: 0 }, other: { count: 0, cod: 0 },
  };
  const open: Tally = { count: 0, cod: 0 };
  const byStatus = new Map<string, Tally & { bucket: Bucket }>();
  for (const s of list) {
    if (s.is_return) continue;
    const b = bucketOf(s);
    const isOpen = b === "in_progress" || b === "failed_attempt";
    if (changedOnDay(s, day)) add(today[b], s);
    if (isOpen) {
      add(open, s);
      const k = (s.current_courier_status || "—").trim();
      const row = byStatus.get(k) || { count: 0, cod: 0, bucket: b };
      add(row, s);
      byStatus.set(k, row);
    }
  }
  const decided = today.delivered.count + today.failed_final.count;
  return {
    today, open,
    byStatus: [...byStatus.entries()].map(([status, t]) => ({ status, ...t })).sort((a, b) => b.count - a.count),
    successRate: decided ? today.delivered.count / decided : null,
  };
}
