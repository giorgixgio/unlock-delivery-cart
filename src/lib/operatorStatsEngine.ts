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
  return { confirmedIds, cancelled, overturned: overturnedIds.size, resolved, conversion: resolved ? confirmedIds.size / resolved : 0 };
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
