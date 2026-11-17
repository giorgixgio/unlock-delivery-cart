// Pure helpers shared by export-courier and onway-create-shipments so the
// printed label, zone code and fulfilment eligibility never drift apart.

/** city_name -> zone_id, case-insensitive / trimmed (same as the original export logic). */
export function buildZoneMap(rows: { city_name?: unknown; zone_id?: unknown }[] | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const z of rows || []) {
    const key = String(z.city_name || "").trim().toLowerCase();
    if (key) map[key] = String(z.zone_id ?? "");
  }
  return map;
}

/** Zone for an order: normalized city first, then raw city; null when unmatched. */
export function zoneForOrder(order: { normalized_city?: string | null; raw_city?: string | null }, zoneByCity: Record<string, string>): string | null {
  const key = String(order.normalized_city || order.raw_city || "").trim().toLowerCase();
  return key && zoneByCity[key] !== undefined ? zoneByCity[key] : null;
}

/** Gift SKUs printed as "+sku" so packers never forget the free extra. */
export const PLUS_LABEL_SKUS = new Set(["stikeri"]);

type LabelItem = { sku?: unknown; quantity?: unknown; is_gift?: unknown };

/** "BIN - qty, BIN - qty" with duplicate SKU rows merged; falls back to the SKU when no bin.
 *  Qty is the TOTAL units to pack; free promo units (is_gift) add " (+N საჩუქარი)". */
export function skuWithQtyText(items: LabelItem[] | null | undefined, binBySku: Record<string, string>): string {
  const qtyBySku = new Map<string, number>(), giftBySku = new Map<string, number>();
  for (const i of items || []) {
    const sku = String(i.sku ?? ""), q = Number(i.quantity || 1);
    qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + q);
    if (i.is_gift === true) giftBySku.set(sku, (giftBySku.get(sku) || 0) + q);
  }
  return [...qtyBySku.entries()].map(([sku, q]) => {
    const gift = giftBySku.get(sku) || 0, extra = gift > 0 ? ` (+${gift} საჩუქარი)` : "";
    return PLUS_LABEL_SKUS.has(sku) ? `+${sku}${q > 1 ? ` - ${q}` : ""}${extra}` : `${(binBySku[sku] || "").trim() || sku} - ${q}${extra}`;
  }).join(", ");
}

/** Printed label: "[tag] BIN - qty". */
export function courierLabelText(tag: string, items: LabelItem[] | null | undefined, binBySku: Record<string, string>): string {
  return `[${tag}] ${skuWithQtyText(items, binBySku)}`;
}

/** Known per-unit weights (kg). Unknown SKUs count 0 and the parcel minimum applies. */
export const UNIT_WEIGHT_KG: Record<string, number> = {};

/** TOTAL parcel weight: every unit incl. free gift units, never below the courier minimum. */
export function parcelWeightKg(items: LabelItem[] | null | undefined, weightBySku: Record<string, number> = UNIT_WEIGHT_KG, minKg = 1): number {
  let kg = 0;
  for (const i of items || []) kg += (weightBySku[String(i.sku ?? "")] || 0) * Number(i.quantity || 1);
  return Math.max(minKg, Math.round(kg * 100) / 100);
}

/** Item description for Excel/API: "title x3 (+1 საჩუქარი)" per SKU. */
export function itemsDescription(items: (LabelItem & { title?: unknown })[] | null | undefined): string {
  const m = new Map<string, { title: string; q: number; gift: number }>();
  for (const i of items || []) {
    const sku = String(i.sku ?? ""), q = Number(i.quantity || 1);
    const e = m.get(sku) ?? { title: String(i.title ?? sku), q: 0, gift: 0 };
    e.q += q; if (i.is_gift === true) e.gift += q; m.set(sku, e);
  }
  return [...m.values()].map((e) => `${e.title} x${e.q}${e.gift ? ` (+${e.gift} საჩუქარი)` : ""}`).join(", ");
}

/** Calendar date (YYYY-MM-DD) in Tbilisi. */
export function tbilisiDateIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "dd Mon HH:mm" in Tbilisi, e.g. "02 Nov 22:34". */
export function tbilisiStamp(now: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.hour}:${p.minute}`;
}

export const apiBatchName = (n: number, now: Date = new Date()) => `Onway API · ${tbilisiStamp(now)} · ${n} orders`;
export const reviewBatchName = (now: Date = new Date()) => `Onway API review · ${tbilisiDateIso(now)}`;

/** An API-sent order may be fulfilled/batched only once. */
export function canFinalize(order: { id: string; is_fulfilled?: boolean | null }, tracking: string | null | undefined, appliedOrderIds: Set<string>): boolean {
  return !!String(tracking || "").trim() && !order.is_fulfilled && !appliedOrderIds.has(order.id);
}

/** Excel export must never include an order already sent (or possibly sent) via the API. */
export function sentViaApi(order: { onway_api_status?: string | null; onway_tracking?: string | null }): boolean {
  return order.onway_api_status === "sent" || order.onway_api_status === "unclear" || !!String(order.onway_tracking || "").trim();
}

/** Max orders one real-send request may contain (keeps each request well inside the edge time limit). */
export const ONWAY_MAX_SEND_PER_REQUEST = 40;
/** Rewrite the trailing "<n> orders" of an API batch name after more chunks were appended. */
export const renameBatchCount = (name: string, total: number) =>
  /· \d+ orders$/.test(name) ? name.replace(/· \d+ orders$/, `· ${total} orders`) : name;
/** Prefer the tag the client took from the full-selection dry run, so later chunks never renumber. */
export const pickTag = (orderId: string, computed: string, tags?: Record<string, string> | null) => {
  const t = tags?.[orderId];
  return t && /^(S-\d{4}|R\d{2}-\d{2})$/.test(t) ? t : computed;
};
