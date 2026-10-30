// Pure SMS sequence helpers shared by edge functions and the admin preview.
// No Deno/browser APIs here.

export type SeqType = "lead_created" | "order_auto_confirmed" | "call_no_answer" | "order_confirmed" | "out_for_delivery" | "delivery_failed" | "address_problem";
export const SEQ_TYPES: SeqType[] = ["lead_created", "order_auto_confirmed", "call_no_answer", "order_confirmed", "out_for_delivery", "delivery_failed", "address_problem"];

export interface SmsSettings {
  enabled: Record<SeqType, boolean>;
  num1: string;
  num2: string;
}
export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  enabled: { lead_created: true, order_auto_confirmed: true, call_no_answer: true, order_confirmed: true, out_for_delivery: true, delivery_failed: true, address_problem: true },
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
  /** "trendmart.ge/t/Ab3x9K" — appended to lead/confirmed/out-for-delivery texts. */
  link?: string | null;
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

/** Types that are useless without an operator number to call back. */
export const NEEDS_NUMBER: SeqType[] = ["call_no_answer", "delivery_failed", "address_problem"];

export const LINK_TYPES: SeqType[] = ["lead_created", "order_auto_confirmed", "order_confirmed", "out_for_delivery"];
export const trackingLink = (store: "BIGMART" | "TRENDMART", token: string | null | undefined) =>
  token ? `${store === "BIGMART" ? "bigmart.ge" : "trendmart.ge"}/t/${token}` : null;

function templates(type: SeqType, v: TemplateVars, withProduct: boolean, withLink = true): string | null {
  const body = baseTemplate(type, v, withProduct);
  if (body == null) return null;
  return withLink && v.link && LINK_TYPES.includes(type) ? `${body} Tvali adevnet: ${v.link}` : body;
}

function baseTemplate(type: SeqType, v: TemplateVars, withProduct: boolean): string | null {
  const total = `${formatTotal(v.total)} GEL`;
  const p = withProduct && v.product ? v.product : null;
  const nums = [v.num1, v.num2].map((x) => String(x || "").trim()).filter(Boolean);
  const numsText = nums.join(" an ");
  if (NEEDS_NUMBER.includes(type) && !nums.length) return null;
  switch (type) {
    case "lead_created": return nums.length
      ? `Shekveta #${v.n} migebulia! Operatori male dagirekavt ${numsText} nomridan. Gtxovt upasukhot. ${v.store}`
      : `Shekveta #${v.n} migebulia! Operatori male dagirekavt, gtxovt upasukhot. ${v.store}`;
    case "order_auto_confirmed": return p
      ? `Shekveta #${v.n} dadasturda! ${p} - ${total}, gadakhda kurierTan. Mitana: ${v.when}. ${v.store}`
      : `Shekveta #${v.n} dadasturda! Jami ${total}, gadakhda kurierTan. Mitana: ${v.when}. ${v.store}`;
    case "call_no_answer": return `Shekvetis dasadastureblad dagirekeT, magram ver dagikavshirdit. Gadmogvirekt ${numsText}, rom shekveta ar gauqmdes. ${v.store}`;
    case "order_confirmed": return p
      ? `Shekveta dadasturda! ${p} - ${total}, gadakhda kurierTan. Mitana: ${v.when}. ${v.store}`
      : `Shekveta dadasturda! Jami ${total}, gadakhda kurierTan. Mitana: ${v.when}. ${v.store}`;
    case "out_for_delivery": return p
      ? `Dghes kurieri mogitant ${p}-s! Telefoni chartuli gqondet. Gadasakhdeli: ${total}. ${v.store}`
      : `Dghes kurieri mogitant shekvetas! Telefoni chartuli gqondet. Gadasakhdeli: ${total}. ${v.store}`;
    case "delivery_failed": return `Kurierma ver dagikavshirdat. Dagvikavshirdit ${numsText}, rom shekveta xelaxla mogitanot. ${v.store}`;
    case "address_problem": return `Misamarti ver vipovet. Dagvikavshirdit ${numsText} misamartis dasazusteblad. ${v.store}`;
  }
}

/** Last line of defence: true when a rendered text still has an empty or raw placeholder. */
export function isTemplateIncomplete(text: string): boolean {
  return !text.trim() || /  /.test(text) || / an  /.test(text) || /[{}]/.test(text)
    || /\b(undefined|null|NaN)\b/.test(text) || /\/t\/(\s|$)/.test(text) || /\ban\s+(an|nomridan)\b/.test(text) || /#\s/.test(text)
    || /:\s*\./.test(text) || /\s[.,]/.test(text);
}

/** Renders a GSM-7-safe text; drops {product} if over one SMS. skip is set when nothing must be sent. */
export function renderSms(type: SeqType, v: TemplateVars): { text: string; warnings: string[]; skip?: "no_operator_numbers" | "template_incomplete" } {
  const warnings: string[] = [];
  const raw = templates(type, v, true);
  if (raw == null) return { text: "", warnings, skip: "no_operator_numbers" };
  let { text, changed } = toGsm7(raw);
  if (changed) warnings.push("non_gsm_replaced");
  if (text.length > 160 && v.product) {
    text = toGsm7(templates(type, v, false)!).text; warnings.push("product_dropped");
  }
  if (text.length > 160 && v.link) {
    text = toGsm7(templates(type, v, false, false)!).text; warnings.push("link_dropped");
  }
  if (text.length > 160) return { text, warnings, skip: "template_incomplete" }; // never 2 segments
  if (isTemplateIncomplete(text)) return { text, warnings, skip: "template_incomplete" };
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

const WEEKDAYS_KA = ["კვირას", "ორშაბათს", "სამშაბათს", "ოთხშაბათს", "ხუთშაბათს", "პარასკევს", "შაბათს"];
/** Same rule as deliveryWhen, in Georgian for the tracking page. */
export function deliveryWhenKa(confirmedAt: Date, isTbilisi: boolean): string {
  const lat = deliveryWhen(confirmedAt, isTbilisi);
  if (lat === "1-3 samushao dgeshi") return "1-3 სამუშაო დღეში";
  if (lat === "xval") return "ხვალ";
  return WEEKDAYS_KA[WEEKDAYS.indexOf(lat)];
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
