// Shared courier-shipment parsing and mapping, used by BOTH import-courier (Excel) and
// onway-webhook / onway-status-pull (API). One place builds a courier_shipments row.

export type Item = { code: string; qty: number };
export type StatusMapRow = {
  courier_status: string;
  outbound_state: string; outbound_is_final: boolean;
  return_state: string; return_is_final: boolean;
};

/** Courier placeholder number used for the store itself — never a customer phone. */
export const PLACEHOLDER_PHONE = "555555555";

export const FINAL_STATES = new Set([
  "DELIVERED", "FAILED_FINAL", "RETURNED_FAILED", "CANCELLED_EXCLUDED",
  "RETURN_COLLECTED", "RETURN_FAILED", "RETURN_CANCELLED",
]);

export function senderIsCustomer(sender: string | null): boolean {
  const s = (sender || "").trim();
  if (!s) return false;
  if (/^customer[-\s]?\d+/i.test(s)) return true;
  const digits = s.replace(/[^0-9]/g, "");
  return digits.length >= 6 && digits.length >= s.replace(/\s/g, "").length - 3;
}

export function parseCommentItems(comment: string | null): Item[] {
  const s = (comment || "").trim();
  if (!s) return [];
  const body = s.replace(/\[[^\]]*\]/g, " ");
  const out: Item[] = [];
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

export const itemsKey = (items: Item[]) => items.map((i) => `${i.code}:${i.qty}`).sort().join("|");

export function normPhone(p: string | null): string | null {
  const d = (p || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  const n = d.length > 9 ? d.slice(-9) : d;
  return n === PLACEHOLDER_PHONE ? null : n;
}

/** Customer phone. On returns the receiver is the store (placeholder) and the customer is the sender. */
export function pickCustomerPhone(opts: {
  isReturn: boolean; receiverPhone: string | null; senderPhone: string | null; senderName: string | null;
}): string | null {
  const clean = (v: string | null) => (normPhone(v) ? v!.toString().trim() : null);
  if (opts.isReturn) return clean(opts.senderPhone) || clean(opts.senderName) || clean(opts.receiverPhone);
  return clean(opts.receiverPhone) || clean(opts.senderPhone);
}

export function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Excel dates (kept exactly as before: wall time stored as UTC). */
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, mm, yy, hh, mi, ss] = m;
    let year = parseInt(yy); if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, parseInt(mm) - 1, parseInt(dd), parseInt(hh || "0"), parseInt(mi || "0"), parseInt(ss || "0")));
    return isNaN(+d) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString();
}

/** Onway history stamp: "30.10.2026" + "12:53" + "+04" -> real UTC ISO. */
export function parseOnwayStamp(date: string | null | undefined, hour?: string | null, tz?: string | null): string | null {
  const m = String(date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const h = String(hour || "00:00").match(/^(\d{1,2}):(\d{2})/);
  const z = String(tz || "+04").match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  const offMin = z ? (z[1] === "-" ? -1 : 1) * (parseInt(z[2]) * 60 + parseInt(z[3] || "0")) : 240;
  const ms = Date.UTC(+m[3], +m[2] - 1, +m[1], h ? +h[1] : 0, h ? +h[2] : 0) - offMin * 60000;
  return isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Plain date "2026-10-30" or "30/10/2026" -> ISO (midnight UTC). */
function parsePlainDate(v: string | null | undefined): string | null {
  const s = String(v || "").trim();
  if (!s || s.startsWith("0000")) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])).toISOString();
  return parseDate(s.replace(/\//g, "."));
}

export function stateFor(statusMap: Map<string, StatusMapRow>, status: string, isReturn: boolean) {
  const sm = statusMap.get(status.trim());
  return {
    known: !!sm,
    state: sm ? (isReturn ? sm.return_state : sm.outbound_state) : "IN_PROGRESS",
    isFinal: sm ? (isReturn ? sm.return_is_final : sm.outbound_is_final) : false,
  };
}

/** Legacy derived_status kept in sync so old pages keep working. */
export function legacyOf(state: string, isReturn: boolean): { derived: string; type: string } {
  const type = isReturn ? "RETURN_TO_SENDER" : "CUSTOMER_DELIVERY";
  switch (state) {
    case "DELIVERED": return { derived: "DELIVERED_TO_CUSTOMER", type };
    case "FAILED_FINAL": return { derived: "FINAL_NOT_DELIVERED", type };
    case "FAILED_ATTEMPT": return { derived: "IN_TRANSIT", type };
    case "RETURNED_FAILED": return { derived: "RETURNED_TO_SENDER", type };
    case "CANCELLED_EXCLUDED": return { derived: "CANCELLED_BEFORE_COURIER", type };
    case "RETURN_COLLECTED":
    case "RETURN_FAILED": return { derived: "RETURNED_TO_SENDER", type };
    case "RETURN_CANCELLED": return { derived: "CANCELLED_BEFORE_COURIER", type };
    default: return { derived: "IN_TRANSIT", type };
  }
}

// ---------- Onway API payload -> shipment row ----------
export type OnwayHistoryRow = { courier_status: string; status_date: string | null; comment: string | null; status_id: string | null };
export type ShipmentUpsert = { row: Record<string, unknown>; history: OnwayHistoryRow[]; unknownStatuses: string[] };

const PICKUP_STATUSES = new Set(["აღებული", "აღებულია", "საწყობშია", "გზაშია"]);

export function onwayPayloadToShipment(body: any, statusMap: Map<string, StatusMapRow>): ShipmentUpsert | null {
  const oi = body?.order_info;
  const tracking = String(oi?.trackingnumber ?? oi?.traking ?? "").trim();
  if (!tracking) return null;
  const str = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s || null; };

  const history: OnwayHistoryRow[] = (Array.isArray(body?.history) ? body.history : [])
    .map((h: any) => ({
      courier_status: String(h?.status ?? "").trim(),
      status_date: parseOnwayStamp(h?.date, h?.hour, h?.timezone),
      comment: str(h?.comment), status_id: str(h?.order_status_id),
    }))
    .filter((h: OnwayHistoryRow) => h.courier_status);
  history.sort((a, b) => (a.status_date || "").localeCompare(b.status_date || ""));
  const newest = history[history.length - 1];

  const status = str(oi?.status) || newest?.courier_status || "";
  const parent = str(oi?.parent_trackingnumber);
  const senderName = str(oi?.from_name);
  const isReturn = !!parent || senderIsCustomer(senderName);
  const { state, isFinal } = stateFor(statusMap, status, isReturn);
  const legacy = legacyOf(state, isReturn);
  const phone = pickCustomerPhone({ isReturn, receiverPhone: str(oi?.to_phone), senderPhone: str(oi?.from_phone), senderName });
  const comment = str(oi?.order_detail);
  const statusAt = newest?.status_date ?? null;
  const pickup = history.find((h) => PICKUP_STATUSES.has(h.courier_status));
  const finalEntry = isFinal ? [...history].reverse().find((h) => h.courier_status === status) : undefined;
  const unknownStatuses = [...new Set(history.map((h) => h.courier_status).concat(status ? [status] : []))]
    .filter((s) => !statusMap.has(s));

  return {
    row: {
      tracking_number: tracking,
      order_number: isReturn ? null : str(oi?.order_number),
      phone,
      customer_name: isReturn ? senderName : str(oi?.to_name),
      city: isReturn ? str(oi?.from_city) : str(oi?.to_city),
      address: isReturn ? str(oi?.from_address) : str(oi?.to_address),
      cod_amount: parseNum(oi?.cash_amount),
      company_receives: parseNum(oi?.cash_amount),
      current_courier_status: status,
      derived_state: state,
      derived_status: legacy.derived,
      shipment_type: legacy.type,
      is_return: isReturn,
      sender_name: senderName,
      receiver_name: str(oi?.to_name),
      order_date: parsePlainDate(oi?.from_date),
      pickup_date: pickup?.status_date ?? null,
      final_status_date: isFinal ? (finalEntry?.status_date ?? statusAt) : null,
      comment_raw: comment,
      comment_items: parseCommentItems(comment),
      latest_status_date: statusAt,
      source_status_at: statusAt,
      onway_parent_tracking: parent,
    },
    history,
    unknownStatuses,
  };
}
