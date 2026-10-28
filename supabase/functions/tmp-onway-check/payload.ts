// Pure helpers for Onway API shipment payloads (no I/O).

// Sender / payment values confirmed by the owner for TrendMart (store B).
export const TRENDMART_SENDER = {
  from_city: "თბილისი",
  from_name: "ტრენდმარტი",
  from_phone: "555555555",
  from_address: "3 კახეთის გზატკეცილი",
} as const;

// Invoice + customer COD: delivery fee invoiced to us, customer pays order total only.
export const PAYMENT_SETUP = { payment: 3, payer: 3, receiver_shipprice_pay: 0, brittle: 0 } as const;

export const MASKED_KEY = "***";

export interface PayloadOrder {
  id: string;
  public_order_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  normalized_city?: string | null;
  raw_city?: string | null;
  city?: string | null;
  normalized_address?: string | null;
  raw_address?: string | null;
  address_line1?: string | null;
  total?: number | string | null;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

export function buildOnwayPayload(
  order: PayloadOrder,
  orderDetail: string,
  creds: { username: string; key: string },
) {
  return {
    username: creds.username,
    key: creds.key,
    ...TRENDMART_SENDER,
    to_city: s(order.normalized_city) || s(order.raw_city) || s(order.city),
    to_name: s(order.customer_name),
    to_phone: s(order.customer_phone),
    to_address: s(order.normalized_address) || s(order.raw_address) || s(order.address_line1),
    payment: PAYMENT_SETUP.payment,
    payer: PAYMENT_SETUP.payer,
    order_price: Number(order.total || 0),
    weight: 1,
    quantity: 1,
    service_level: 1,
    order_number: s(order.public_order_number),
    order_detail: orderDetail,
    brittle: PAYMENT_SETUP.brittle,
    receiver_shipprice_pay: PAYMENT_SETUP.receiver_shipprice_pay,
  };
}

export type OnwayPayload = ReturnType<typeof buildOnwayPayload>;

export function maskPayload<T extends { key?: unknown }>(p: T): T {
  return { ...p, key: MASKED_KEY };
}

export function missingFields(p: OnwayPayload): string[] {
  const out: string[] = [];
  if (!p.to_name) out.push("to_name");
  if (!p.to_phone) out.push("to_phone");
  if (!p.to_city) out.push("to_city");
  if (!p.to_address) out.push("to_address");
  if (!p.order_number) out.push("order_number");
  if (!(p.order_price > 0)) out.push("order_price");
  return out;
}

/** An order may be sent only if it has never been sent or locked. */
export function alreadySent(o: { onway_sent_at?: string | null; onway_tracking?: string | null }): boolean {
  return !!(o.onway_sent_at || (o.onway_tracking && String(o.onway_tracking).trim()));
}

/** Return a tracking number only when a response field clearly names one. */
export function parseTracking(raw: string): string | null {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return null; }
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(tracking(_?(number|code|no))?|track(ing)?_?id|barcode|waybill)$/i.test(k)
        && (typeof val === "string" || typeof val === "number") && String(val).trim()) {
        return String(val).trim();
      }
    }
    for (const val of Object.values(v as Record<string, unknown>)) {
      const r = walk(val);
      if (r) return r;
    }
    return null;
  };
  return walk(json);
}

/** Heuristic success: 2xx and no explicit error flag in the body. */
export function looksSuccessful(status: number, raw: string): boolean {
  if (status < 200 || status >= 300) return false;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      if (j.error || j.errors) return false;
      if (j.success === false || j.status === false || j.status === "error") return false;
    }
  } catch { /* non-JSON 2xx: treat as unknown-success, raw kept */ }
  return true;
}
