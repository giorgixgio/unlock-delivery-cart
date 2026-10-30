// Pure parsing of Onway status callbacks.
export interface OnwayEvent {
  tracking: string; statusId: string; statusName: string; reason: string | null;
  plannedDate: string | null; comment: string | null; image: string | null; eventTime: string | null; dedupeKey: string;
}
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** "02/11/2026" or "2026-11-02" -> "2026-11-02"; null otherwise. */
export function parsePlannedDate(v: unknown): string | null {
  const t = s(v);
  let m = t.match(/^(\d{2})[\/.](\d{2})[\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** "30.10.2026" + "12:53" (+04) -> ISO */
function historyTime(h: any): string | null {
  const m = s(h?.date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const hm = s(h?.hour).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const tz = s(h?.timezone) || "+04";
  return `${m[3]}-${m[2]}-${m[1]}T${(hm?.[1] ?? "00").padStart(2, "0")}:${hm?.[2] ?? "00"}:00${tz.length === 3 ? tz + ":00" : tz}`;
}
export const imageUrl = (p: string | null) => (!p ? null : /^https?:\/\//.test(p) ? p : `https://onway.ge/${p.replace(/^\//, "")}`);

export function parseOnwayEvent(body: any): OnwayEvent | null {
  const o = body?.order_info;
  const tracking = s(o?.trackingnumber || o?.traking);
  const statusId = s(o?.order_status_id);
  if (!tracking || !statusId) return null;
  const hist: any[] = Array.isArray(body?.history) ? body.history : [];
  const latest = hist.map((h) => ({ h, t: historyTime(h) }))
    .filter((x) => s(x.h?.order_status_id) === statusId || !s(x.h?.order_status_id))
    .sort((a, b) => String(b.t).localeCompare(String(a.t)))[0]?.h ?? null;
  const reason = s(o?.reason);
  return {
    tracking, statusId, statusName: s(o?.status),
    reason: reason && reason !== "0" ? reason : null,
    plannedDate: parsePlannedDate(o?.to_date),
    comment: s(latest?.comment) || null,
    image: imageUrl(s(latest?.image) || null),
    eventTime: latest ? historyTime(latest) : null,
    dedupeKey: `${tracking}|${statusId}|${s(latest?.date)}|${s(latest?.hour)}`,
  };
}
