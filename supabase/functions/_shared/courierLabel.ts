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

/** "BIN - qty, BIN - qty" with duplicate SKU rows merged; falls back to the SKU when no bin. */
export function skuWithQtyText(items: { sku?: unknown; quantity?: unknown }[] | null | undefined, binBySku: Record<string, string>): string {
  const qtyBySku = new Map<string, number>();
  for (const i of items || []) {
    const sku = String(i.sku ?? "");
    qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + Number(i.quantity || 1));
  }
  return [...qtyBySku.entries()].map(([sku, q]) => `${(binBySku[sku] || "").trim() || sku} - ${q}`).join(", ");
}

/** Printed label: "[tag] BIN - qty". */
export function courierLabelText(tag: string, items: { sku?: unknown; quantity?: unknown }[] | null | undefined, binBySku: Record<string, string>): string {
  return `[${tag}] ${skuWithQtyText(items, binBySku)}`;
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
