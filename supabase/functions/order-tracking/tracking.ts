// Pure helpers for the public order-tracking page. Never expose phone, full address or notes.

/** Street name only: drops every token from the first one containing a digit (house, flat, block). */
export function streetOnly(address: unknown): string | null {
  const parts = String(address ?? "").replace(/[,;]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/\d/.test(p) || /^(ბ\.?|ბინა|კორპ\.?|კორპუსი|სად\.?|სადარბაზო|სართ\.?|bina|korp\.?|apt\.?|flat)$/i.test(p)) break;
    out.push(p);
  }
  const s = out.join(" ").replace(/[-–.]+$/, "").trim();
  return s ? s.slice(0, 40) : null;
}

export const firstName = (name: unknown) => { const f = String(name ?? "").trim().split(/\s+/)[0] || ""; return f && !/\d/.test(f) ? f.slice(0, 30) : null; };

export const isHandedToCourier = (o: any) =>
  !!o.onway_sent_at || !!o.onway_tracking || !!o.tracking_number || o.is_fulfilled === true || ["shipped", "delivered", "returned"].includes(String(o.status));

export const isClosed = (o: any) => ["canceled", "cancelled", "returned", "merged", "archived"].includes(String(o.status));

export type StageKey = "created" | "confirmed" | "packed" | "handed" | "out_for_delivery" | "delivered";
export interface Stage { key: StageKey; label: string; done: boolean; at: string | null }

export const STAGE_LABELS: Record<StageKey, string> = {
  created: "მიღებულია", confirmed: "დადასტურებულია", packed: "შეფუთულია",
  handed: "გადაეცა კურიერს", out_for_delivery: "კურიერი დღეს მოგიტანთ", delivered: "ჩაბარებულია",
};

/** Real stages only: a stage is done when its own data exists (or a later stage is done). */
export function buildStages(o: any, t: { confirmedAt: string | null; outForDeliveryAt: string | null; deliveredAt: string | null }): Stage[] {
  const delivered = o.status === "delivered";
  const raw: [StageKey, boolean, string | null][] = [
    ["created", true, o.created_at ?? null],
    ["confirmed", o.is_confirmed === true || o.auto_confirmed === true || ["confirmed", "shipped", "delivered"].includes(String(o.status)), t.confirmedAt],
    ["packed", !!o.packed_at, o.packed_at ?? null],
    ["handed", isHandedToCourier(o), o.onway_sent_at ?? null],
    ["out_for_delivery", !!t.outForDeliveryAt, t.outForDeliveryAt],
    ["delivered", delivered, t.deliveredAt],
  ];
  // A later real stage implies the earlier ones happened (e.g. packed without a confirm timestamp).
  let lastDone = -1;
  raw.forEach(([, d], i) => { if (d) lastDone = i; });
  return raw.map(([key, d, at], i) => ({ key, label: STAGE_LABELS[key], done: d || i <= lastDone, at: d ? at : null }));
}

const MONTHS_KA = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];
const DAYS_KA = ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
/** "2026-11-02" -> "ორშაბათი, 2 ნოემბერი" */
export function plannedDateKa(d: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS_KA[dt.getUTCDay()]}, ${+m[3]} ${MONTHS_KA[+m[2] - 1]}`;
}

export const CANCEL_REASONS_KA: Record<string, string> = {
  cant_afford: "ვეღარ ვიყიდი", too_expensive: "ძვირია", bought_elsewhere: "სხვაგან ვიყიდე", accidental: "შემთხვევით შევუკვეთე", other: "სხვა",
};

/** Order still lacks a usable delivery address (skipped or never entered at checkout). */
export const needsAddress = (o: any) =>
  !isClosed(o) && !isHandedToCourier(o) &&
  (o.address_status === "missing" || o.skipped_address === true || !String(o.normalized_city || o.city || "").trim());
