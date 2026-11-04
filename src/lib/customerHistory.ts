// Pure rules for the operator customer-history panel (badge + Onway stage + failure reason).
// Data comes from the `operator_customer_history` RPC.

export interface HistFailure { at: string; status: string | null; code: string | null; comment: string | null; ai_reason: string | null }
export interface HistShipment { derived_state: string | null; status: string | null; at: string | null; source: string | null }
export interface HistOrder {
  id: string;
  public_order_number: string;
  created_at: string;
  status: string;
  total: number;
  call_attempt_count: number | null;
  match_type: "phone" | "device";
  onway_sent_at: string | null;
  onway_last_status: string | null;
  order_items?: { title: string; sku: string; quantity: number }[];
  shipment: HistShipment | null;
  failures: HistFailure[];
  /** Free replacement order (linked to the delivered order it replaces). */
  is_replacement?: boolean;
  replacement_for?: string | null;
}

export type Stage =
  | "none" | "created" | "picked_up" | "on_the_way" | "out_for_delivery"
  | "delivered" | "failed_attempt" | "final_failed" | "returned" | "pickup_cancelled";

export const STAGE_LABEL: Record<Stage, string> = {
  none: "",
  created: "გაფორმებული",
  picked_up: "აღებული",
  on_the_way: "გზაშია",
  out_for_delivery: "გატანილი ჩასაბარებლად",
  delivered: "ჩაბარდა",
  failed_attempt: "ვერ ჩაბარდა (ცდა)",
  final_failed: "საბოლოოდ ვერ ჩაბარდა",
  returned: "დაბრუნდა",
  pickup_cancelled: "აღება გაუქმდა",
};

const CREATED = new Set(["ასაღები", "გაფორმებული", "გაფორმებულია"]);
const PICKED = new Set(["აღებული", "აღებულია"]);
const OUT = new Set(["გატანილი ჩასაბარებლად", "ხელმეორედ გატანა"]);

export function stageOf(o: Pick<HistOrder, "shipment" | "onway_sent_at" | "onway_last_status">): Stage {
  const ds = o.shipment?.derived_state ?? null;
  const st = o.shipment?.status ?? o.onway_last_status ?? null;
  if (ds === "DELIVERED") return "delivered";
  if (ds === "FAILED_FINAL") return "final_failed";
  if (ds === "FAILED_ATTEMPT") return "failed_attempt";
  if (ds && ds.startsWith("RETURN")) return "returned";
  if (ds === "CANCELLED_EXCLUDED") return "pickup_cancelled";
  if (st === "უბრუნდება გამგზავნს") return "returned";
  if (st && OUT.has(st)) return "out_for_delivery";
  if (st && PICKED.has(st)) return "picked_up";
  if (st && CREATED.has(st)) return "created";
  if (ds === "IN_PROGRESS" || st) return "on_the_way";
  if (o.onway_sent_at) return "created";
  return "none";
}

export const ACTIVE_STAGES: ReadonlySet<Stage> = new Set(["created", "picked_up", "on_the_way", "out_for_delivery", "failed_attempt"]);

export type ReasonKind = "refused" | "no_answer" | "rescheduled" | "address" | "other" | "unknown";
export const REASON_LABEL: Record<ReasonKind, string> = {
  refused: "უარი ჩაბარებაზე",
  no_answer: "არ პასუხობდა",
  rescheduled: "თარიღი გადაიდო",
  address: "მისამართის პრობლემა",
  other: "სხვა მიზეზი",
  unknown: "მიზეზი უცნობია",
};

/** Onway reason codes, verified against every courier comment received (1 refused, 2 date change, 3 no contact). */
export function reasonOf(f: HistFailure): ReasonKind {
  if (f.code === "1") return "refused";
  if (f.code === "2") return "rescheduled";
  if (f.code === "3") return "no_answer";
  // Without a code, only use the classifier when Onway actually sent a courier comment.
  if (f.comment && f.ai_reason) {
    if (f.ai_reason === "refused") return "refused";
    if (f.ai_reason === "no_answer") return "no_answer";
    if (f.ai_reason === "reschedule") return "rescheduled";
    if (/address/.test(f.ai_reason)) return "address";
    return "other";
  }
  return "unknown";
}

export function refusedAtDoor(o: HistOrder): boolean {
  const s = stageOf(o);
  if (s !== "final_failed" && s !== "returned") return false;
  return o.failures.some((f) => reasonOf(f) === "refused");
}

export type BadgeKind = "refused" | "on_the_way" | "failed_not_refusal" | "delivered";
export interface HistoryBadge { kind: BadgeKind; title: string; hint: string }

const BADGES: Record<BadgeKind, HistoryBadge> = {
  refused: { kind: "refused", title: "🔴 ადრე კარზე უარი თქვა", hint: "რეკომენდაცია: ახალი შეკვეთის გაუქმება" },
  on_the_way: { kind: "on_the_way", title: "🟠 წინა ამანათი ჯერ გზაშია", hint: "უთხარით, რომ ამანათი მოდის; დუბლიკატი გააუქმეთ" },
  failed_not_refusal: { kind: "failed_not_refusal", title: "⚪ წინა მიწოდება ვერ შედგა (არა უარი)", hint: "შეიძლება დადასტურება — გადაამოწმეთ ტელეფონი/მისამართი" },
  delivered: { kind: "delivered", title: "🟢 ადრე ჩაიბარა", hint: "კარგი მომხმარებელი" },
};

/** Suggestion only — priority red > orange > white > green; device-only matches never raise a badge. */
export function historyBadge(orders: HistOrder[]): HistoryBadge | null {
  const strong = orders.filter((o) => o.match_type === "phone");
  if (strong.some(refusedAtDoor)) return BADGES.refused;
  if (strong.some((o) => ACTIVE_STAGES.has(stageOf(o)))) return BADGES.on_the_way;
  if (strong.some((o) => { const s = stageOf(o); return s === "final_failed" || s === "returned"; })) return BADGES.failed_not_refusal;
  if (strong.some((o) => stageOf(o) === "delivered")) return BADGES.delivered;
  return null;
}

export function historyCounts(orders: HistOrder[]): string {
  const delivered = orders.filter((o) => stageOf(o) === "delivered").length;
  const refused = orders.filter(refusedAtDoor).length;
  const onWay = orders.filter((o) => ACTIVE_STAGES.has(stageOf(o))).length;
  const failed = orders.filter((o) => { const s = stageOf(o); return (s === "final_failed" || s === "returned") && !refusedAtDoor(o); }).length;
  const cancelled = orders.filter((o) => o.status === "canceled").length;
  const parts = [`${orders.length} წინა`];
  if (delivered) parts.push(`${delivered} ჩაბარდა`);
  if (refused) parts.push(`${refused} უარი`);
  if (onWay) parts.push(`${onWay} გზაშია`);
  if (failed) parts.push(`${failed} ვერ ჩაბარდა`);
  if (cancelled) parts.push(`${cancelled} გაუქმდა`);
  const dev = orders.filter((o) => o.match_type === "device").length;
  if (dev) parts.push(`${dev} შესაძლო (მოწყობილობა)`);
  return parts.join(" · ");
}
