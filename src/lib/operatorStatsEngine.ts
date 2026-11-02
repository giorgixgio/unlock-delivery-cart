export const WORK_BREAK_MINUTES = 15;

export interface TimedAction {
  operator: string;
  at: string;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Active work is the time between nearby actions, plus two minutes after the last action each day. */
export function workedSeconds(actions: TimedAction[], breakMinutes = WORK_BREAK_MINUTES): number {
  const byDay = new Map<string, number[]>();
  for (const action of actions) {
    const time = new Date(action.at).getTime();
    if (!Number.isFinite(time)) continue;
    const day = new Date(time + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(time);
    byDay.set(day, list);
  }
  let total = 0;
  const breakMs = breakMinutes * 60_000;
  for (const times of byDay.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      const gap = times[i] - times[i - 1];
      if (gap <= breakMs) total += gap / 1000;
    }
    if (times.length) total += 120;
  }
  return total;
}

export function attemptsPerResolved(calls: { orderId: string; outcome: string }[]): number {
  const resolved = new Set(calls.filter((call) => call.outcome === "confirmed" || call.outcome === "cancelled").map((call) => call.orderId));
  if (!resolved.size) return 0;
  return calls.filter((call) => resolved.has(call.orderId)).length / resolved.size;
}

export interface CapacityInput {
  targetLeads: number;
  autoConfirmShare: number;
  minutesPerLeadNeedingOperator: number;
  shiftHours: number;
  targetUtilization: number;
}

export function calculateCapacity(input: CapacityInput) {
  const needingOperator = input.targetLeads * Math.max(0, 1 - input.autoConfirmShare);
  const operatorHours = needingOperator * input.minutesPerLeadNeedingOperator / 60;
  const usableHoursPerOperator = input.shiftHours * Math.max(0.01, input.targetUtilization);
  return {
    leadsNeedingOperator: needingOperator,
    operatorHours,
    operatorsNeeded: Math.ceil(operatorHours / usableHoursPerOperator),
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

// ---------- Range helpers ----------
export const DAY_MS = 86_400_000;
const TBILISI_MS = 4 * 3600 * 1000;
export type StatsPreset = "today" | "yesterday" | "7d" | "30d" | "custom";
export interface StatsRange { from: Date; to: Date }

export function tbilisiDayStart(d: Date): Date {
  const local = d.getTime() + TBILISI_MS;
  return new Date(local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - TBILISI_MS);
}

export function rangeFor(preset: StatsPreset, customFrom: string, customTo: string, now = new Date()): StatsRange {
  const today = tbilisiDayStart(now);
  if (preset === "today") return { from: today, to: now };
  if (preset === "yesterday") return { from: new Date(today.getTime() - DAY_MS), to: new Date(today.getTime() - 1) };
  if (preset === "7d") return { from: new Date(today.getTime() - 6 * DAY_MS), to: now };
  if (preset === "30d") return { from: new Date(today.getTime() - 29 * DAY_MS), to: now };
  const parse = (s: string, end = false) => { const [y, m, d] = s.split("-").map(Number); const ms = Date.UTC(y, (m || 1) - 1, d || 1) - TBILISI_MS; return new Date(ms + (end ? DAY_MS - 1 : 0)); };
  return { from: customFrom ? parse(customFrom) : new Date(today.getTime() - 6 * DAY_MS), to: customTo ? parse(customTo, true) : now };
}

/** Previous period = same window shifted back by whole days (same clock times). */
export function previousRangeFor(preset: StatsPreset, range: StatsRange): StatsRange {
  const fixed: Partial<Record<StatsPreset, number>> = { today: 1, yesterday: 1, "7d": 7, "30d": 30 };
  const days = fixed[preset] ?? Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime() + 1) / DAY_MS));
  const shift = days * DAY_MS;
  return { from: new Date(range.from.getTime() - shift), to: new Date(range.to.getTime() - shift) };
}

// ---------- Outcome rules ----------
export interface OutcomeEvent { id?: string; order_id: string; actor: string; created_at: string; payload: any }
const FINAL_OUTCOMES = new Set(["confirmed", "cancelled"]);

/** Duplicate cleanups (source or reason) never count as operator outcomes. */
export function isDuplicateCancel(e: OutcomeEvent): boolean {
  return e.payload?.source === "duplicate_cleanup" || e.payload?.cancel_reason === "duplicate_order";
}
export function isFinalOutcome(e: OutcomeEvent): boolean {
  return FINAL_OUTCOMES.has(e.payload?.outcome) && !isDuplicateCancel(e);
}

/** Latest final (non-duplicate) outcome per order, by created_at. */
export function latestFinalByOrder(events: OutcomeEvent[]): Map<string, OutcomeEvent> {
  const map = new Map<string, OutcomeEvent>();
  for (const e of events) {
    if (!isFinalOutcome(e)) continue;
    const prev = map.get(e.order_id);
    if (!prev || e.created_at >= prev.created_at) map.set(e.order_id, e);
  }
  return map;
}

/**
 * Per-operator resolution. A cancel counts only if it is still the order's latest final
 * outcome across all operators; if anyone confirmed it later, it is "overturned".
 */
export function operatorOutcomes(operator: string, periodCalls: OutcomeEvent[], allOutcomes: OutcomeEvent[]) {
  const own = latestFinalByOrder(periodCalls.filter((e) => e.actor === operator));
  const latestAll = latestFinalByOrder(allOutcomes);
  const confirmedIds = new Set<string>(), cancelled: OutcomeEvent[] = [], overturnedIds = new Set<string>();
  for (const [orderId, e] of own) {
    if (e.payload?.outcome === "confirmed") { confirmedIds.add(orderId); continue; }
    const latest = latestAll.get(orderId);
    if (latest && latest.payload?.outcome === "confirmed" && latest.created_at > e.created_at) overturnedIds.add(orderId);
    else cancelled.push(e);
  }
  const resolved = confirmedIds.size + cancelled.length;
  return { confirmedIds, cancelled, overturned: overturnedIds.size, overturnedIds: Array.from(overturnedIds), resolved, conversion: resolved ? confirmedIds.size / resolved : 0 };
}

// ---------- Open queue ----------
export interface QueueOrder { id: string; status: string; is_return: boolean | null; call_attempt_count: number | null; next_call_after: string | null }
export function openQueue(orders: QueueOrder[], now = Date.now()) {
  let neverCalled = 0, callbacksDue = 0;
  for (const o of orders) {
    if (!["new", "on_hold", "pending_bump"].includes(o.status) || o.is_return) continue;
    if (!o.call_attempt_count) neverCalled++;
    else if (!o.next_call_after || new Date(o.next_call_after).getTime() <= now) callbacksDue++;
  }
  return { open: neverCalled + callbacksDue, neverCalled, callbacksDue };
}


// ---------- Quality tab ----------
const tbDay = (iso: string) => new Date(new Date(iso).getTime() + TBILISI_MS).toISOString().slice(0, 10);
const tbHour = (iso: string) => new Date(new Date(iso).getTime() + TBILISI_MS).getUTCHours();
const HOUR_MS = 3_600_000;

function byOrder(events: OutcomeEvent[]) {
  const m = new Map<string, OutcomeEvent[]>();
  for (const e of events) { const l = m.get(e.order_id) ?? []; l.push(e); m.set(e.order_id, l); }
  for (const l of m.values()) l.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return m;
}

export interface GiveUp { orderId: string; operator: string; attempts: number; firstAt: string; cancelAt: string; hours: number; early: boolean; reason: string }

/**
 * Give-up: the order's latest final outcome is a non-duplicate cancel inside the range, and nobody
 * reached the customer (no confirmed/callback outcome) before it. Early = <3 no-answers, <24h, or one Tbilisi day.
 */
export function findGiveUps(allOutcomes: OutcomeEvent[], range: StatsRange): GiveUp[] {
  const latest = latestFinalByOrder(allOutcomes), grouped = byOrder(allOutcomes), out: GiveUp[] = [];
  const from = range.from.toISOString(), to = range.to.toISOString();
  for (const [orderId, last] of latest) {
    if (last.payload?.outcome !== "cancelled" || last.created_at < from || last.created_at > to) continue;
    const prior = (grouped.get(orderId) ?? []).filter((e) => e.created_at < last.created_at);
    if (prior.some((e) => e.payload?.outcome === "confirmed" || e.payload?.outcome === "callback")) continue;
    const noAnswers = prior.filter((e) => e.payload?.outcome === "no_answer").length;
    const firstAt = prior[0]?.created_at ?? last.created_at;
    const hours = (Date.parse(last.created_at) - Date.parse(firstAt)) / HOUR_MS;
    const sameDay = new Set([...prior, last].map((e) => tbDay(e.created_at))).size === 1;
    out.push({ orderId, operator: last.actor, attempts: noAnswers, firstAt, cancelAt: last.created_at, hours, early: noAnswers < 3 || hours < 24 || sameDay, reason: last.payload?.cancel_reason || "" });
  }
  return out;
}

export function summarizeGiveUps(list: GiveUp[], cancels: number, totals: Map<string, number>) {
  const early = list.filter((g) => g.early);
  return {
    giveUps: list.length, giveUpPct: cancels ? list.length / cancels : 0,
    avgAttempts: list.length ? list.reduce((n, g) => n + g.attempts, 0) / list.length : 0,
    medianHours: median(list.map((g) => g.hours)), early: early.length,
    lost: early.reduce((n, g) => n + (totals.get(g.orderId) ?? 0), 0),
  };
}

export interface SessionLite { order_id: string; operator: string; session_started_at: string; active_duration_seconds: number | null; capped_duration_seconds: number | null; had_meaningful_action: boolean }

/** Orders opened without action and without own call outcome; skipped = another operator later recorded an outcome. */
export function findSkips(operator: string, sessions: SessionLite[], allOutcomes: OutcomeEvent[]) {
  const grouped = byOrder(allOutcomes), firstView = new Map<string, string>();
  for (const s of sessions) {
    if (s.operator !== operator || s.had_meaningful_action) continue;
    const prev = firstView.get(s.order_id);
    if (!prev || s.session_started_at < prev) firstView.set(s.order_id, s.session_started_at);
  }
  const viewed: string[] = [], skipped: string[] = [];
  for (const [orderId, at] of firstView) {
    const evs = grouped.get(orderId) ?? [];
    if (evs.some((e) => e.actor === operator)) continue;
    viewed.push(orderId);
    if (evs.some((e) => e.actor !== operator && e.created_at > at)) skipped.push(orderId);
  }
  return { viewed, skipped };
}

const sessionSeconds = (s: SessionLite) => s.active_duration_seconds ?? s.capped_duration_seconds ?? null;

/** The operator's session on that order that started closest before (or up to 60s after) the decision. */
export function decisionSeconds(e: OutcomeEvent, sessions: SessionLite[]): number | null {
  const t = Date.parse(e.created_at); let best: SessionLite | null = null;
  for (const s of sessions) {
    if (s.order_id !== e.order_id || s.operator !== e.actor) continue;
    const st = Date.parse(s.session_started_at);
    if (st > t + 60_000) continue;
    if (!best || st > Date.parse(best.session_started_at)) best = s;
  }
  return best ? sessionSeconds(best) : null;
}

export function quickDecisions(decisions: OutcomeEvent[], sessions: SessionLite[], cancelLimit = 15, confirmLimit = 20) {
  const quickCancels: string[] = [], quickConfirms: string[] = []; let cancels = 0, confirms = 0;
  for (const e of decisions) {
    if (!isFinalOutcome(e)) continue;
    const sec = decisionSeconds(e, sessions);
    if (e.payload?.outcome === "cancelled") { cancels++; if (sec != null && sec < cancelLimit) quickCancels.push(e.order_id); }
    else { confirms++; if (sec != null && sec < confirmLimit) quickConfirms.push(e.order_id); }
  }
  return { quickCancels, quickConfirms, cancels, confirms };
}

export function reasonMix(cancels: OutcomeEvent[]) {
  const counts: Record<string, number> = {};
  for (const e of cancels) { const r = e.payload?.cancel_reason || "(empty)"; counts[r] = (counts[r] || 0) + 1; }
  const vague = (counts.other || 0) + (counts["(empty)"] || 0);
  return { counts, total: cancels.length, flagged: cancels.length > 0 && vague / cancels.length > 0.2 };
}

/** Share of in-hours leads first touched within 15/60 minutes. firstTouch maps orderId → first touch ms. */
export function speedStats(orders: { id: string; created_at: string }[], firstTouch: Map<string, number>, startHour: number, endHour: number) {
  const leads = orders.filter((o) => { const h = tbHour(o.created_at); return h >= startHour && h < endHour; });
  let in15 = 0, in60 = 0;
  for (const o of leads) {
    const t = firstTouch.get(o.id); if (t == null) continue;
    const d = t - Date.parse(o.created_at);
    if (d <= 15 * 60_000) in15++;
    if (d <= 60 * 60_000) in60++;
  }
  return { leads: leads.length, in15: leads.length ? in15 / leads.length : 0, in60: leads.length ? in60 / leads.length : 0 };
}

/** Callbacks whose next_call_after fell inside the range and has passed: on time = another outcome by ≤ +60 min. */
export function callbackTimeliness(allOutcomes: OutcomeEvent[], range: StatsRange, now = Date.now()) {
  const grouped = byOrder(allOutcomes), rows: { event: OutcomeEvent; onTime: boolean; recalled: boolean }[] = [];
  for (const e of allOutcomes) {
    if (!["no_answer", "callback"].includes(e.payload?.outcome)) continue;
    const nca = Date.parse(e.payload?.next_call_after ?? "");
    if (!Number.isFinite(nca) || nca < range.from.getTime() || nca > range.to.getTime() || nca > now) continue;
    const later = (grouped.get(e.order_id) ?? []).filter((x) => x.created_at > e.created_at);
    rows.push({ event: e, recalled: later.length > 0, onTime: later.some((x) => Date.parse(x.created_at) <= nca + HOUR_MS) });
  }
  return rows;
}

export interface DeliveryRow { order_id: string; operator: string; total: number; status: string; matched: boolean }
export function deliverySummary(rows: DeliveryRow[]) {
  const s = { confirmed: rows.length, matched: 0, delivered: 0, failed: 0, inTransit: 0, cancelledBefore: 0, unmatched: 0, revenue: 0, failedIds: [] as string[] };
  for (const r of rows) {
    if (r.matched) s.matched++;
    if (r.status === "DELIVERED_TO_CUSTOMER") { s.delivered++; s.revenue += Number(r.total || 0); }
    else if (r.status === "RETURNED_TO_SENDER" || r.status === "FINAL_NOT_DELIVERED") { s.failed++; s.failedIds.push(r.order_id); }
    else if (r.status === "IN_TRANSIT") s.inTransit++;
    else if (r.status === "CANCELLED_BEFORE_COURIER") s.cancelledBefore++;
    else s.unmatched++;
  }
  return { ...s, deliveryRate: s.delivered + s.failed ? s.delivered / (s.delivered + s.failed) : 0, coverage: s.confirmed ? s.matched / s.confirmed : 0 };
}

/** green = at least as good as median, amber = up to 20% worse, red = clearly worse. */
export function scoreColor(value: number, teamMedian: number, higherIsBetter: boolean): "green" | "amber" | "red" {
  const worse = higherIsBetter ? teamMedian - value : value - teamMedian;
  if (worse <= 0) return "green";
  const scale = Math.max(Math.abs(teamMedian), 1e-9);
  return worse / scale <= 0.2 ? "amber" : "red";
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
