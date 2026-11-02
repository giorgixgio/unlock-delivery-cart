import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  callbackTimeliness, deliverySummary, findGiveUps, findSkips, latestFinalByOrder, median, operatorOutcomes, quickDecisions,
  reasonMix, scoreColor, speedStats, summarizeGiveUps, toCsv,
  type DeliveryRow, type GiveUp, type OutcomeEvent, type SessionLite, type StatsRange,
} from "@/lib/operatorStatsEngine";

export type ContextOrder = { id: string; public_order_number: number | string | null; created_at: string; customer_phone: string | null; total: number };
type Ev = OutcomeEvent & { id: string };
type BaseRow = { name: string; worked: number; resolved: number; confirmed: number; cancelled: number; overturned: number; overturnedIds?: string[] };

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const PREF_KEY = "operator-stats-work-hours";
export function readWorkHours(): { start: number; end: number } {
  try { const v = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); return { start: Number.isFinite(v.start) ? v.start : 10, end: Number.isFinite(v.end) ? v.end : 21 }; } catch { return { start: 10, end: 21 }; }
}
export function saveWorkHours(v: { start: number; end: number }) { try { localStorage.setItem(PREF_KEY, JSON.stringify(v)); } catch { /* ignore */ } }

export interface QualityRow {
  name: string; small: boolean;
  giveUps: GiveUp[]; early: GiveUp[]; giveUpPct: number; avgAttempts: number; medianHours: number; lost: number;
  delivery: ReturnType<typeof deliverySummary>; netPerHour: number;
  viewed: string[]; skipped: string[]; skipPct: number;
  quickCancels: string[]; quickConfirms: string[]; cancels: number; confirms: number;
  reasons: ReturnType<typeof reasonMix>;
  speed: ReturnType<typeof speedStats>;
  callbacks: { total: number; onTime: number; neverIds: string[] };
  conversion: number; overturned: number; overturnedIds: string[];
}

export function useOperatorQuality(args: {
  operators: string[]; rows: BaseRow[]; calls: Ev[]; allOutcomes: Ev[]; sessions: SessionLite[];
  orders: { id: string; created_at: string }[]; firstTouches: SessionLite[]; delivery: DeliveryRow[]; range: StatsRange | null;
  workStart: number; workEnd: number; excluded: Set<string>;
}) {
  const { operators, rows, calls, allOutcomes, sessions, orders, firstTouches, delivery, range, workStart, workEnd, excluded } = args;
  return useMemo(() => {
    if (!range) return null;
    const outcomes = allOutcomes;
    const giveUps = findGiveUps(outcomes, range).filter((g) => !excluded.has(g.operator));
    const cbRows = callbackTimeliness(outcomes, range).filter((r) => !excluded.has(r.event.actor));
    // first touch (earliest session or call) per order with its operator
    const first = new Map<string, { at: number; operator: string }>();
    const touch = (orderId: string, at: string, op: string) => { const t = Date.parse(at); const p = first.get(orderId); if (!p || t < p.at) first.set(orderId, { at: t, operator: op }); };
    for (const s of firstTouches) touch(s.order_id, s.session_started_at, s.operator);
    for (const e of outcomes) touch(e.order_id, e.created_at, e.actor);
    const firstMs = new Map(Array.from(first, ([k, v]) => [k, v.at]));
    const totals = new Map<string, number>(delivery.map((d) => [d.order_id, Number(d.total || 0)]));
    return { giveUps, cbRows, first, firstMs, totals };
  }, [allOutcomes, range, firstTouches, delivery, excluded])
    && useMemo(() => null, []);
}

/** Builds per-operator + team quality rows. Pure apart from memoisation in the caller. */
export function buildQuality(args: {
  operators: string[]; rows: BaseRow[]; calls: Ev[]; allOutcomes: Ev[]; sessions: SessionLite[];
  orders: { id: string; created_at: string }[]; firstTouches: SessionLite[]; delivery: DeliveryRow[]; range: StatsRange;
  workStart: number; workEnd: number; excluded: Set<string>; totals: Map<string, number>;
}): { rows: QualityRow[]; team: QualityRow } {
  const { operators, rows, calls, allOutcomes, sessions, orders, firstTouches, delivery, range, workStart, workEnd, excluded, totals } = args;
  const giveUps = findGiveUps(allOutcomes, range).filter((g) => !excluded.has(g.operator));
  const cbRows = callbackTimeliness(allOutcomes, range).filter((r) => !excluded.has(r.event.actor));
  const first = new Map<string, { at: number; operator: string }>();
  const touch = (orderId: string, at: string, op: string) => { const t = Date.parse(at); const p = first.get(orderId); if (!p || t < p.at) first.set(orderId, { at: t, operator: op }); };
  for (const s of firstTouches) touch(s.order_id, s.session_started_at, s.operator);
  for (const e of allOutcomes) touch(e.order_id, e.created_at, e.actor);
  const firstMs = new Map(Array.from(first, ([k, v]) => [k, v.at]));

  const build = (name: string, filter: (op: string) => boolean): QualityRow => {
    const opNames = operators.filter(filter);
    const base = rows.filter((r) => filter(r.name));
    const gu = giveUps.filter((g) => filter(g.operator));
    const ownCalls = calls.filter((e) => filter(e.actor));
    let cancelledEvents: OutcomeEvent[] = [], decisions: OutcomeEvent[] = [], viewed: string[] = [], skipped: string[] = [], overturnedIds: string[] = [];
    for (const op of opNames) {
      const oc = operatorOutcomes(op, calls, allOutcomes);
      cancelledEvents = cancelledEvents.concat(oc.cancelled);
      decisions = decisions.concat(Array.from(latestFinalByOrder(calls.filter((e) => e.actor === op)).values()));
      const sk = findSkips(op, sessions, allOutcomes); viewed = viewed.concat(sk.viewed); skipped = skipped.concat(sk.skipped);
      overturnedIds = overturnedIds.concat(base.find((b) => b.name === op)?.overturnedIds ?? []);
    }
    const cancels = base.reduce((n, r) => n + r.cancelled, 0), resolved = base.reduce((n, r) => n + r.resolved, 0), confirmed = base.reduce((n, r) => n + r.confirmed, 0);
    const worked = base.reduce((n, r) => n + r.worked, 0);
    const sum = summarizeGiveUps(gu, cancels, totals);
    const del = deliverySummary(delivery.filter((d) => filter(d.operator)));
    const q = quickDecisions(decisions, sessions);
    const leads = orders.filter((o) => { const f = first.get(o.id); return f ? filter(f.operator) : name === "Team"; });
    const cb = cbRows.filter((r) => filter(r.event.actor));
    return {
      name, small: resolved < 20, giveUps: gu, early: gu.filter((g) => g.early), giveUpPct: sum.giveUpPct, avgAttempts: sum.avgAttempts, medianHours: sum.medianHours, lost: sum.lost,
      delivery: del, netPerHour: worked ? del.delivered / (worked / 3600) : 0,
      viewed, skipped, skipPct: resolved + skipped.length ? skipped.length / (resolved + skipped.length) : 0,
      quickCancels: q.quickCancels, quickConfirms: q.quickConfirms, cancels: q.cancels, confirms: q.confirms,
      reasons: reasonMix(cancelledEvents), speed: speedStats(leads, firstMs, workStart, workEnd),
      callbacks: { total: cb.length, onTime: cb.filter((r) => r.onTime).length, neverIds: cb.filter((r) => !r.recalled).map((r) => r.event.order_id) },
      conversion: resolved ? confirmed / resolved : 0, overturned: overturnedIds.length, overturnedIds,
    };
  };
  const set = new Set(operators);
  return { rows: operators.map((op) => build(op, (x) => x === op)), team: build("Team", (x) => set.has(x)) };
}

// ---------- UI ----------
type Drill = { title: string; ids: string[] } | null;

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

function Tip({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger asChild><button aria-label="formula" className="text-muted-foreground"><HelpCircle className="h-3 w-3" /></button></TooltipTrigger><TooltipContent className="max-w-72 text-xs">{text}</TooltipContent></Tooltip>;
}
function Count({ ids, onOpen, title, label }: { ids: string[]; onOpen: (d: Drill) => void; title: string; label?: string }) {
  return <button className="font-semibold text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={!ids.length} onClick={(e) => { e.stopPropagation(); onOpen({ title, ids: Array.from(new Set(ids)) }); }}>{label ?? ids.length}</button>;
}

type Metric = { key: string; label: string; higher: boolean; get: (r: QualityRow) => number; fmt: (n: number) => string };
export const SCORE_METRICS: Metric[] = [
  { key: "net", label: "Net delivered/hour", higher: true, get: (r) => r.netPerHour, fmt: (n) => n.toFixed(2) },
  { key: "dr", label: "Delivery rate", higher: true, get: (r) => r.delivery.deliveryRate, fmt: pct },
  { key: "conv", label: "Conversion", higher: true, get: (r) => r.conversion, fmt: pct },
  { key: "early", label: "Early give-ups", higher: false, get: (r) => r.early.length, fmt: (n) => String(n) },
  { key: "skip", label: "Skip %", higher: false, get: (r) => r.skipPct, fmt: pct },
  { key: "qc", label: "Quick cancels %", higher: false, get: (r) => (r.cancels ? r.quickCancels.length / r.cancels : 0), fmt: pct },
  { key: "ot", label: "Overturned", higher: false, get: (r) => r.overturned, fmt: (n) => String(n) },
];
const COLOR_CLASS = { green: "text-emerald-700", amber: "text-amber-600", red: "text-red-700" } as const;

export function Scorecard({ row, all }: { row: QualityRow; all: QualityRow[] }) {
  return <div className="rounded-md border bg-card p-3 space-y-1">
    <div className="font-bold text-sm truncate">{row.name}{row.small && <span className="ml-1 text-amber-600" title="Small sample (< 20 resolved)">!</span>}</div>
    {SCORE_METRICS.map((m) => {
      const v = m.get(row), med = median(all.map(m.get)), c = scoreColor(v, med, m.higher);
      return <div key={m.key} className="flex justify-between text-xs"><span className="text-muted-foreground">{m.label}</span><b className={COLOR_CLASS[c]}>{m.fmt(v)}</b></div>;
    })}
  </div>;
}

export function DrillSheet({ drill, onClose, orders, outcomes, sessions }: { drill: Drill; onClose: () => void; orders: Map<string, ContextOrder>; outcomes: Ev[]; sessions: SessionLite[] }) {
  const list = useMemo(() => {
    if (!drill) return [];
    return drill.ids.map((id) => {
      const o = orders.get(id), evs = outcomes.filter((e) => e.order_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const ops = new Set([...evs.map((e) => e.actor), ...sessions.filter((s) => s.order_id === id).map((s) => s.operator)]);
      const cancel = [...evs].reverse().find((e) => e.payload?.outcome === "cancelled");
      return { id, number: o?.public_order_number ?? "", created: o?.created_at ?? "", phone: o?.customer_phone ?? "", total: Number(o?.total ?? 0), attempts: evs.map((e) => `${e.payload?.outcome} ${new Date(e.created_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })} (${e.actor})`), reason: cancel?.payload?.cancel_reason ?? "", operators: Array.from(ops).filter(Boolean).join(", ") };
    });
  }, [drill, orders, outcomes, sessions]);
  const exportCsv = () => {
    const csv = toCsv(list.map((r) => ({ order: String(r.number), created: r.created, phone: r.phone, total: r.total, attempts: r.attempts.length, attempt_log: r.attempts.join(" | "), cancel_reason: r.reason, operators: r.operators })));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${(drill?.title || "orders").replace(/\W+/g, "_")}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <Sheet open={!!drill} onOpenChange={(o) => !o && onClose()}><SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
    <SheetHeader><SheetTitle>{drill?.title} ({list.length})</SheetTitle></SheetHeader>
    <div className="my-3"><Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button></div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/60"><tr>{["Order", "Created", "Phone", "Total", "Attempts", "Cancel reason", "Operators"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
      <tbody>{list.map((r) => <tr key={r.id} className="border-t align-top"><td className="p-2"><Link className="text-primary underline" to={`/admin/orders/${r.id}`}>#{r.number || r.id.slice(0, 8)}</Link></td><td className="p-2 whitespace-nowrap">{r.created ? new Date(r.created).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" }) : "—"}</td><td className="p-2">{r.phone}</td><td className="p-2">{r.total.toFixed(0)} ₾</td><td className="p-2"><b>{r.attempts.length}</b>{r.attempts.map((a, i) => <div key={i} className="text-muted-foreground whitespace-nowrap">{a}</div>)}</td><td className="p-2">{r.reason}</td><td className="p-2">{r.operators}</td></tr>)}</tbody></table></div>
  </SheetContent></Sheet>;
}

export default function OperatorQualityTab({ quality, freshAt, workStart, workEnd, onWorkHours, orders, outcomes, sessions }: {
  quality: { rows: QualityRow[]; team: QualityRow }; freshAt: string | null; workStart: number; workEnd: number; onWorkHours: (s: number, e: number) => void;
  orders: Map<string, ContextOrder>; outcomes: Ev[]; sessions: SessionLite[];
}) {
  const [drill, setDrill] = useState<Drill>(null);
  const all = [...quality.rows, quality.team];
  const stale = !freshAt || Date.now() - Date.parse(freshAt) > 3 * 86400000;
  const reasonKeys = Array.from(new Set(quality.rows.flatMap((r) => Object.keys(r.reasons.counts)))).sort();
  const th = "p-2 whitespace-nowrap text-left";
  return <div className="space-y-4">
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{quality.rows.map((r) => <Scorecard key={r.name} row={r} all={quality.rows} />)}</div>

    <section className="space-y-2"><h2 className="flex items-center gap-1 font-bold">Give-ups <Tip text="Latest final outcome is this operator's non-duplicate cancel and no one reached the customer (no confirmed or callback outcome) before it. Early = fewer than 3 no-answers, under 24h from first attempt, or all attempts on one Tbilisi day. Lost ₾ = totals of early give-ups." /></h2>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-xs"><thead className="bg-muted/60"><tr>{["Operator", "Give-ups", "% of cancels", "Avg attempts", "Median h to cancel", "Early give-ups", "Lost ₾"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{all.map((r) => <tr key={r.name} className={`border-t ${r.name === "Team" ? "bg-muted/30 font-bold" : ""}`}><td className="p-2">{r.name}</td><td className="p-2"><Count ids={r.giveUps.map((g) => g.orderId)} title={`Give-ups · ${r.name}`} onOpen={setDrill} /></td><td className="p-2">{pct(r.giveUpPct)}</td><td className="p-2">{r.avgAttempts.toFixed(1)}</td><td className="p-2">{r.medianHours.toFixed(1)}</td><td className="p-2"><Count ids={r.early.map((g) => g.orderId)} title={`Early give-ups · ${r.name}`} onOpen={setDrill} /></td><td className="p-2">{r.lost.toFixed(0)} ₾</td></tr>)}</tbody></table></div>
    </section>

    <section className="space-y-2"><h2 className="flex items-center gap-1 font-bold">Delivery quality <Tip text="Orders confirmed by the operator in this period, matched to their outbound courier shipment. Delivery rate = delivered ÷ (delivered + failed). Confirms from the last ~5 days are mostly still in transit, so use 30 days or a custom range ending a week ago to judge delivery rate." /></h2>
      <div className={`rounded-md border p-2 text-xs ${stale ? "border-destructive/40 bg-destructive/10 text-destructive" : "text-muted-foreground"}`}>{stale && <AlertTriangle className="inline h-4 w-4 mr-1" />}Courier data last updated: {freshAt ? new Date(freshAt).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" }) : "never"}{stale && " — Upload the latest Onway export in Courier → Import to see delivery results"}</div>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted/60"><tr>{["Operator", "Confirmed", "Coverage", "Delivered", "Failed", "In transit", "Cancelled pre-courier", "Unmatched", "Delivery rate", "Delivered ₾", "Net delivered/hour"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{all.map((r) => { const d = r.delivery; return <tr key={r.name} className={`border-t ${r.name === "Team" ? "bg-muted/30 font-bold" : ""}`}><td className="p-2">{r.name}</td><td className="p-2">{d.confirmed}</td><td className="p-2">{pct(d.coverage)}</td><td className="p-2">{d.delivered}</td><td className="p-2"><Count ids={d.failedIds} title={`Failed deliveries · ${r.name}`} onOpen={setDrill} /></td><td className="p-2">{d.inTransit}</td><td className="p-2">{d.cancelledBefore}</td><td className="p-2">{d.unmatched}</td><td className="p-2">{pct(d.deliveryRate)}</td><td className="p-2">{d.revenue.toFixed(0)} ₾</td><td className="p-2">{r.netPerHour.toFixed(2)}</td></tr>; })}</tbody></table></div>
    </section>

    <section className="space-y-2"><h2 className="flex items-center gap-1 font-bold">Skips & quick decisions <Tip text="Viewed, no action = orders opened with no meaningful action and no own call outcome. Skipped = of those, another operator later recorded an outcome. Skip % = skipped ÷ (resolved + skipped). Quick cancel < 15s, quick confirm < 20s session time." /></h2>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[820px] text-xs"><thead className="bg-muted/60"><tr>{["Operator", "Viewed, no action", "Skipped → done by other", "Skip %", "Overturned", "Quick cancels", "% of cancels", "Quick confirms", "% of confirms"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{all.map((r) => <tr key={r.name} className={`border-t ${r.name === "Team" ? "bg-muted/30 font-bold" : ""}`}><td className="p-2">{r.name}</td><td className="p-2">{r.viewed.length}</td><td className="p-2"><Count ids={r.skipped} title={`Skipped · ${r.name}`} onOpen={setDrill} /></td><td className="p-2">{pct(r.skipPct)}</td><td className="p-2"><Count ids={r.overturnedIds} title={`Overturned · ${r.name}`} onOpen={setDrill} /></td><td className="p-2"><Count ids={r.quickCancels} title={`Quick cancels · ${r.name}`} onOpen={setDrill} /></td><td className="p-2">{pct(r.cancels ? r.quickCancels.length / r.cancels : 0)}</td><td className="p-2">{r.quickConfirms.length}</td><td className="p-2">{pct(r.confirms ? r.quickConfirms.length / r.confirms : 0)}</td></tr>)}</tbody></table></div>
    </section>

    <section className="space-y-2"><h2 className="flex items-center gap-1 font-bold">Cancel reason mix <Tip text="Non-duplicate, non-overturned cancels. Amber = 'other' or empty reason above 20%." /></h2>
      <div className="space-y-2 rounded-md border p-3">{quality.rows.filter((r) => r.reasons.total).map((r) => <div key={r.name} className="flex items-center gap-2 text-xs">
        <span className={`w-40 truncate font-semibold ${r.reasons.flagged ? "text-amber-600" : ""}`}>{r.name}{r.reasons.flagged && <Tooltip><TooltipTrigger asChild><AlertTriangle className="inline ml-1 h-3 w-3" /></TooltipTrigger><TooltipContent>Reasons are not being recorded properly</TooltipContent></Tooltip>}</span>
        <div className="flex h-5 flex-1 overflow-hidden rounded">{reasonKeys.map((k, i) => { const n = r.reasons.counts[k] || 0; return n ? <div key={k} title={`${k}: ${n} (${pct(n / r.reasons.total)})`} style={{ width: `${(n / r.reasons.total) * 100}%`, background: COLORS[i % COLORS.length] }} /> : null; })}</div>
        <span className="w-10 text-right">{r.reasons.total}</span></div>)}
        <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">{reasonKeys.map((k, i) => <span key={k} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{k}</span>)}</div></div>
    </section>

    <section className="space-y-2"><h2 className="flex items-center gap-1 font-bold">Speed <Tip text="Share of leads created inside working hours (Tbilisi) whose first touch came within 15 / 60 minutes; per operator by who touched first. Callbacks on time = due callbacks in the period that got another call outcome within 60 minutes after next_call_after." /></h2>
      <div className="flex items-end gap-2 text-xs"><label>Work from<Input type="number" min={0} max={23} value={workStart} onChange={(e) => onWorkHours(Number(e.target.value), workEnd)} className="w-20" /></label><label>to<Input type="number" min={1} max={24} value={workEnd} onChange={(e) => onWorkHours(workStart, Number(e.target.value))} className="w-20" /></label></div>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[640px] text-xs"><thead className="bg-muted/60"><tr>{["Operator", "In-hours leads", "≤ 15 min", "≤ 60 min", "Callbacks due", "On time", "Never re-called"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{all.map((r) => <tr key={r.name} className={`border-t ${r.name === "Team" ? "bg-muted/30 font-bold" : ""}`}><td className="p-2">{r.name}</td><td className="p-2">{r.speed.leads}</td><td className="p-2">{pct(r.speed.in15)}</td><td className="p-2">{pct(r.speed.in60)}</td><td className="p-2">{r.callbacks.total}</td><td className="p-2">{pct(r.callbacks.total ? r.callbacks.onTime / r.callbacks.total : 0)}</td><td className="p-2"><Count ids={r.callbacks.neverIds} title={`Never re-called · ${r.name}`} onOpen={setDrill} /></td></tr>)}</tbody></table></div>
    </section>

    <DrillSheet drill={drill} onClose={() => setDrill(null)} orders={orders} outcomes={outcomes} sessions={sessions} />
  </div>;
}
