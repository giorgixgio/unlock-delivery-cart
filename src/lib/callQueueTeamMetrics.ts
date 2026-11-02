/** Pure Team-tab metrics for the Call Queue. Outcome rules come from operatorStatsEngine. */
import {
  operatorOutcomes, isDuplicateCancel, EXCLUDED_OPERATORS, upsellDelta, DAY_MS,
  type OutcomeEvent, type SessionLite,
} from "@/lib/operatorStatsEngine";
import { TBILISI_OFFSET_MS } from "@/lib/tbilisiTime";

export interface ShiftRow { operator: string; started_at: string; ended_at: string | null; paused: boolean; updated_at?: string | null; auto_ended?: boolean | null }
export interface LiteEvent { order_id: string; actor: string; created_at: string; event_type: string; payload: any }
export interface LockRow { order_id: string; order_number: string; locked_by: string; locked_until: string }

export interface TeamInput {
  now: number;
  todayStart: number;
  /** call_outcome events for the last 7 days + today. */
  outcomes: OutcomeEvent[];
  /** item_added / item_quantity_change / landing_qty_discount / outcome_undone events today. */
  extraEvents: LiteEvent[];
  sessions: SessionLite[];
  shifts: ShiftRow[];
  orderTotals: Map<string, number>;
  locks: LockRow[];
  /** Lock acquisition time is lock_minutes before locked_until. */
  lockMinutes: number;
}

export interface TeamRow {
  operator: string;
  status: "on_shift" | "paused" | "off";
  shiftSeconds: number;
  /** Latest shift was closed automatically (forgotten). */
  autoEnded: boolean;
  currentOrder: { number: string; openSeconds: number } | null;
  calls: number; confirmed: number; cancelled: number; noAnswer: number; conversion: number;
  confirmedRevenue: number; upsell: number;
  avgOrderSeconds: number | null; ordersPerHour: number | null;
  idleSeconds: number | null;
  undos: number;
  week: { confirmedPerDay: number; conversion: number };
  hourly: number[]; // 24 Tbilisi hours, calls
}

const lc = (s: string | null | undefined) => (s || "").toLowerCase();

export function tbilisiHour(iso: string): number {
  return new Date(new Date(iso).getTime() + TBILISI_OFFSET_MS).getUTCHours();
}

export function idleLevel(seconds: number | null): "ok" | "amber" | "red" {
  if (seconds == null) return "ok";
  if (seconds > 600) return "red";
  if (seconds > 300) return "amber";
  return "ok";
}

export function shiftSecondsToday(shifts: ShiftRow[], todayStart: number, now: number): number {
  let s = 0;
  for (const r of shifts) {
    const a = Math.max(new Date(r.started_at).getTime(), todayStart);
    const b = r.ended_at ? new Date(r.ended_at).getTime() : now;
    if (b > a) s += (b - a) / 1000;
  }
  return Math.round(s);
}

export function buildTeamRows(input: TeamInput): TeamRow[] {
  const { now, todayStart } = input;
  const excluded = new Set(EXCLUDED_OPERATORS.map(lc));
  const today = input.outcomes.filter((e) => new Date(e.created_at).getTime() >= todayStart);
  const week = input.outcomes.filter((e) => { const t = new Date(e.created_at).getTime(); return t < todayStart && t >= todayStart - 7 * DAY_MS; });
  const todayShifts = input.shifts.filter((s) => !s.ended_at || new Date(s.ended_at).getTime() >= todayStart);

  const names = new Set<string>();
  for (const s of todayShifts) names.add(lc(s.operator));
  for (const e of today) names.add(lc(e.actor));
  for (const e of input.extraEvents) if (e.event_type === "outcome_undone") names.add(lc(e.actor));

  const rows: TeamRow[] = [];
  for (const name of names) {
    if (!name || excluded.has(name)) continue;
    const mine = (e: { actor: string }) => lc(e.actor) === name;
    const calls = today.filter(mine).map((e) => ({ ...e, actor: name }));
    const all = input.outcomes.map((e) => ({ ...e, actor: lc(e.actor) }));
    const oc = operatorOutcomes(name, calls, all);
    const noAnswer = calls.filter((e) => e.payload?.outcome === "no_answer").length;
    const confirmedRevenue = [...oc.confirmedIds].reduce((s, id) => s + (input.orderTotals.get(id) || 0), 0);
    const upsell = input.extraEvents.filter(mine).reduce((s, e) => s + Math.max(0, upsellDelta(e)), 0);
    const undos = input.extraEvents.filter((e) => mine(e) && e.event_type === "outcome_undone").length;

    const sess = input.sessions.filter((s) => lc(s.operator) === name && new Date(s.session_started_at).getTime() >= todayStart);
    const durs = sess.map((s) => s.active_duration_seconds ?? s.capped_duration_seconds ?? 0).filter((d) => d > 0);
    const avgOrderSeconds = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

    const myShifts = todayShifts.filter((s) => lc(s.operator) === name).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const latest = myShifts[0];
    const status: TeamRow["status"] = !latest || latest.ended_at ? "off" : latest.paused ? "paused" : "on_shift";
    const shiftSeconds = shiftSecondsToday(myShifts, todayStart, now);
    const handled = new Set(calls.map((e) => e.order_id)).size;
    const ordersPerHour = shiftSeconds >= 60 ? handled / (shiftSeconds / 3600) : null;

    let idleSeconds: number | null = null;
    if (status === "on_shift" && latest) {
      const lastOutcome = calls.reduce((m, e) => Math.max(m, new Date(e.created_at).getTime()), 0);
      const from = Math.max(lastOutcome, new Date(latest.started_at).getTime());
      idleSeconds = Math.max(0, Math.round((now - from) / 1000));
    }

    const lock = input.locks.find((l) => lc(l.locked_by) === name);
    const currentOrder = lock
      ? { number: lock.order_number, openSeconds: Math.max(0, Math.round((now - (new Date(lock.locked_until).getTime() - input.lockMinutes * 60000)) / 1000)) }
      : null;

    const wk = operatorOutcomes(name, week.filter(mine).map((e) => ({ ...e, actor: name })), all);
    const hourly = new Array(24).fill(0);
    for (const e of calls) hourly[tbilisiHour(e.created_at)]++;

    rows.push({
      operator: name, status, shiftSeconds, autoEnded: !!latest?.auto_ended && !!latest?.ended_at, currentOrder,
      calls: calls.length, confirmed: oc.confirmedIds.size, cancelled: oc.cancelled.length, noAnswer,
      conversion: oc.conversion, confirmedRevenue, upsell, avgOrderSeconds, ordersPerHour, idleSeconds, undos,
      week: { confirmedPerDay: wk.confirmedIds.size / 7, conversion: wk.conversion },
      hourly,
    });
  }
  const rank = { on_shift: 0, paused: 1, off: 2 } as const;
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || b.calls - a.calls);
}

export { isDuplicateCancel };
