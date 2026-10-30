// Pure SMS sequence helpers shared by edge functions and the admin preview.
// No Deno/browser APIs here.

export type SeqType = "lead_created" | "call_no_answer" | "order_confirmed" | "out_for_delivery" | "delivery_failed";
export const SEQ_TYPES: SeqType[] = ["lead_created", "call_no_answer", "order_confirmed", "out_for_delivery", "delivery_failed"];

export interface SmsSettings {
  enabled: Record<SeqType, boolean>;
  num1: string;
  num2: string;
}
export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  enabled: { lead_created: true, call_no_answer: true, order_confirmed: true, out_for_delivery: true, delivery_failed: true },
  num1: "", num2: "",
};
export function parseSmsSettings(raw: string | null | undefined): SmsSettings {
  try {
    const j = raw ? JSON.parse(raw) : {};
    return { enabled: { ...DEFAULT_SMS_SETTINGS.enabled, ...(j.enabled || {}) }, num1: String(j.num1 || ""), num2: String(j.num2 || "") };
  } catch { return { ...DEFAULT_SMS_SETTINGS, enabled: { ...DEFAULT_SMS_SETTINGS.enabled } }; }
}

export interface TemplateVars {
  n: string; store: "BIGMART" | "TRENDMART"; num1: string; num2: string;
  product?: string | null; total: number; when?: string;
}

// GSM 03.38 basic set + extension table characters.
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€";
const GSM_SET = new Set([...GSM]);
const GEO: Record<string, string> = {
  "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t", "ი": "i", "კ": "k", "ლ": "l", "მ": "m", "ნ": "n",
  "ო": "o", "პ": "p", "ჟ": "zh", "რ": "r", "ს": "s", "ტ": "t", "უ": "u", "ფ": "p", "ქ": "q", "ღ": "gh", "ყ": "y", "შ": "sh", "ჩ": "ch",
  "ც": "ts", "ძ": "dz", "წ": "ts", "ჭ": "ch", "ხ": "kh", "ჯ": "j", "ჰ": "h",
};
const SUBST: Record<string, string> = { "₾": "GEL", "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "\u00a0": " " };

export const isGsm7 = (text: string) => [...text].every((c) => GSM_SET.has(c));
/** Replace non-GSM-7 characters; returns the cleaned text and whether anything changed. */
export function toGsm7(text: string): { text: string; changed: boolean } {
  let out = "";
  for (const c of text) out += GSM_SET.has(c) ? c : (GEO[c] ?? SUBST[c] ?? "");
  return { text: out, changed: out !== text };
}

export const formatTotal = (v: number) => {
  const n = Math.round(Number(v || 0) * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function templates(type: SeqType, v: TemplateVars, withProduct: boolean): string {
  const total = `${formatTotal(v.total)} GEL`;
  const p = withProduct && v.product ? v.product : null;
  switch (type) {
    case "lead_created": return `Shekveta #${v.n} migebulia! Operatori male dagirekavt ${v.num1} an ${v.num2} nomridan. Gtxovt upasukhot. ${v.store}`;
    case "call_no_answer": return `Shekvetis dasadastureblad dagirekeT, magram ver dagikavshirdit. Gadmogvirekt ${v.num1} an ${v.num2}, rom shekveta ar gauqmdes. ${v.store}`;
    case "order_confirmed": return p
      ? `Shekveta dadasturda! ${p} - ${total}, gadakhda kurierTan. Mitana: ${v.when}. Madloba rom agvirchiet! ${v.store}`
      : `Shekveta dadasturda! Jami ${total}, gadakhda kurierTan. Mitana: ${v.when}. Madloba rom agvirchiet! ${v.store}`;
    case "out_for_delivery": return p
      ? `Dghes kurieri mogitant ${p}-s! Telefoni chartuli gqondet. Gadasakhdeli: ${total}. ${v.store}`
      : `Dghes kurieri mogitant shekvetas! Telefoni chartuli gqondet. Gadasakhdeli: ${total}. ${v.store}`;
    case "delivery_failed": return `Kurierma ver dagikavshirdat. Dagvikavshirdit ${v.num1} an ${v.num2}, rom shekveta xelaxla mogitanot. ${v.store}`;
  }
}

/** Renders a GSM-7-safe text; drops {product} if the message would exceed one SMS. */
export function renderSms(type: SeqType, v: TemplateVars): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let { text, changed } = toGsm7(templates(type, v, true));
  if (changed) warnings.push("non_gsm_replaced");
  if (text.length > 160 && v.product) {
    const r = toGsm7(templates(type, v, false));
    text = r.text; warnings.push("product_dropped");
  }
  return { text, warnings };
}
export const smsSegments = (text: string) => (isGsm7(text) ? (text.length <= 160 ? 1 : Math.ceil(text.length / 153)) : (text.length <= 70 ? 1 : Math.ceil(text.length / 67)));

// ---------- Tbilisi time (fixed UTC+4, no DST) ----------
const TBS_OFFSET_MS = 4 * 3600 * 1000;
const tbs = (d: Date) => new Date(d.getTime() + TBS_OFFSET_MS); // read with getUTC*
const fromTbs = (y: number, m: number, day: number, h: number, min: number) => new Date(Date.UTC(y, m, day, h, min) - TBS_OFFSET_MS);

const WEEKDAYS = ["kvira", "orshabats", "samshabats", "otkhshabats", "khutshabats", "paraskevs", "shabats"];

/** Delivery wording for order_confirmed, based on confirmation time. */
export function deliveryWhen(confirmedAt: Date, isTbilisi: boolean): string {
  if (!isTbilisi) return "1-3 samushao dgeshi";
  const t = tbs(confirmedAt);
  const base = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const DAY = 86400000;
  let need = t.getUTCHours() >= 18 ? 2 : 1, offset = 0;
  while (need > 0) { offset++; if (new Date(base + offset * DAY).getUTCDay() !== 0) need--; } // Sunday off
  return offset === 1 ? "xval" : WEEKDAYS[new Date(base + offset * DAY).getUTCDay()];
}

/** Moves a send time out of 22:00–09:30 Tbilisi quiet hours to the next 09:30. */
export function applyQuietHours(at: Date): Date {
  const t = tbs(at);
  const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (mins >= 22 * 60) return fromTbs(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 9, 30);
  if (mins < 9 * 60 + 30) return fromTbs(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 9, 30);
  return at;
}

export const isTbilisiCity = (city: unknown, flag?: boolean | null) =>
  flag === true || /^(ქ\.?\s*)?თბილისი$|^tbilisi$/i.test(String(city ?? "").trim());
