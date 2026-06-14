import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, RefreshCw, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OUTCOME_LABEL, OUTCOME_BADGE_CLS } from "@/components/admin/OrderQuickReviewModal";

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

interface OrderRow {
  id: string;
  public_order_number: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  status: string;
  address_status: string | null;
  operator_viewed_at: string | null;
  operator_viewed_by: string | null;
  call_outcome: string | null;
  call_outcome_updated_at: string | null;
  call_outcome_updated_by: string | null;
  created_at: string;
}

interface EventRow {
  order_id: string;
  actor: string;
  event_type: string;
  payload: any;
  created_at: string;
}

interface SessionRow {
  id: string;
  order_id: string;
  operator: string;
  session_started_at: string;
  session_ended_at: string | null;
  raw_duration_seconds: number | null;
  capped_duration_seconds: number | null;
  active_duration_seconds: number | null;
  had_meaningful_action: boolean;
  was_abandoned: boolean;
  outcome: string | null;
}

interface OperatorMetrics {
  operator: string;
  handled: number;          // sessions with meaningful action
  openedOnly: number;       // sessions without meaningful action
  confirmed: number;
  no_answer: number;
  callback: number;
  cancelled: number;
  wrong_number: number;
  duplicate: number;
  handlingTimes: number[];  // active_duration_seconds for handled sessions
  addedItems: number;
  addedRevenue: number;
  confirmedWithUpsell: number;
  addressCompleted: number;
  totalRevenue: number;
}

/* ---------- Tbilisi timezone helpers (UTC+04:00, no DST since 2005) ---------- */
const TBILISI_OFFSET_MS = 4 * 3600 * 1000;

function tbilisiStartOfDay(d: Date): Date {
  const tbilisiMs = d.getTime() + TBILISI_OFFSET_MS;
  const dayStartUtcMs = Math.floor(tbilisiMs / 86400000) * 86400000;
  return new Date(dayStartUtcMs - TBILISI_OFFSET_MS);
}

function getRange(preset: DatePreset, from?: string, to?: string) {
  const now = new Date();
  const todayStart = tbilisiStartOfDay(now);
  const dayMs = 86400000;
  if (preset === "today") return { from: todayStart, to: now };
  if (preset === "yesterday") {
    return { from: new Date(todayStart.getTime() - dayMs), to: todayStart };
  }
  if (preset === "7d") {
    return { from: new Date(todayStart.getTime() - 6 * dayMs), to: now };
  }
  if (preset === "30d") {
    return { from: new Date(todayStart.getTime() - 29 * dayMs), to: now };
  }
  // custom — interpret picked dates as Tbilisi local days
  const parseTbilisi = (s: string, endOfDay = false) => {
    const [y, m, d] = s.split("-").map(Number);
    const ms = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0) - TBILISI_OFFSET_MS;
    return new Date(endOfDay ? ms + dayMs - 1 : ms);
  };
  return {
    from: from ? parseTbilisi(from) : new Date(todayStart.getTime() - 6 * dayMs),
    to: to ? parseTbilisi(to, true) : now,
  };
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

function fmtTime(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function median(arr: number[]) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtTbilisi(d: Date) {
  return d.toLocaleString("ka-GE", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

type SortKey =
  | "operator" | "handled" | "openedOnly" | "confirmed" | "confirmRate" | "no_answer"
  | "callback" | "cancelled" | "wrong_number" | "duplicate"
  | "avgTime" | "medTime" | "perHour" | "addedItems"
  | "addedRevenue" | "upsellRate" | "addressRate";

export default function AdminOperatorStats() {
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("confirmed");
  const [sortDesc, setSortDesc] = useState(true);

  const range = useMemo(() => getRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();

      const [outcomeOrdersRes, addEventsRes, sessionsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, public_order_number, customer_phone, total, subtotal, status, address_status, operator_viewed_at, operator_viewed_by, call_outcome, call_outcome_updated_at, call_outcome_updated_by, created_at")
          .not("call_outcome_updated_by", "is", null)
          .gte("call_outcome_updated_at", fromIso)
          .lte("call_outcome_updated_at", toIso)
          .limit(5000),
        supabase
          .from("order_events")
          .select("order_id, actor, event_type, payload, created_at")
          .eq("event_type", "item_added")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(5000),
        supabase
          .from("operator_order_sessions" as any)
          .select("id, order_id, operator, session_started_at, session_ended_at, raw_duration_seconds, capped_duration_seconds, active_duration_seconds, had_meaningful_action, was_abandoned, outcome")
          .gte("session_started_at", fromIso)
          .lte("session_started_at", toIso)
          .limit(10000),
      ]);

      if (cancelled) return;
      setOrders((outcomeOrdersRes.data as OrderRow[]) || []);
      setEvents((addEventsRes.data as EventRow[]) || []);
      setSessions((sessionsRes.data as unknown as SessionRow[]) || []);
      setLastLoadedAt(new Date());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const operatorList = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.call_outcome_updated_by && s.add(o.call_outcome_updated_by));
    sessions.forEach((sn) => sn.operator && s.add(sn.operator));
    return Array.from(s).sort();
  }, [orders, sessions]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (operatorFilter !== "all" && o.call_outcome_updated_by !== operatorFilter) return false;
      if (outcomeFilter !== "all" && o.call_outcome !== outcomeFilter) return false;
      return true;
    });
  }, [orders, operatorFilter, outcomeFilter]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (operatorFilter !== "all" && s.operator !== operatorFilter) return false;
      return true;
    });
  }, [sessions, operatorFilter]);

  const metrics = useMemo<OperatorMetrics[]>(() => {
    const map = new Map<string, OperatorMetrics>();
    const get = (k: string) => {
      let m = map.get(k);
      if (!m) {
        m = {
          operator: k, handled: 0, openedOnly: 0, confirmed: 0, no_answer: 0, callback: 0,
          cancelled: 0, wrong_number: 0, duplicate: 0, handlingTimes: [],
          addedItems: 0, addedRevenue: 0, confirmedWithUpsell: 0,
          addressCompleted: 0, totalRevenue: 0,
        };
        map.set(k, m);
      }
      return m;
    };

    // Sessions → handled/opened-only/active handling times
    for (const s of filteredSessions) {
      // ignore sessions without an end (in-flight) for stats
      if (!s.session_ended_at) continue;
      const m = get(s.operator);
      if (s.had_meaningful_action) {
        m.handled += 1;
        const dur = s.active_duration_seconds ?? s.capped_duration_seconds ?? 0;
        if (dur > 0) m.handlingTimes.push(dur);
      } else {
        m.openedOnly += 1;
      }
    }

    // Item-added events for upsell / added revenue
    const upsellByOrder = new Map<string, Set<string>>();
    for (const e of events) {
      if (operatorFilter !== "all" && e.actor !== operatorFilter) continue;
      if (!upsellByOrder.has(e.order_id)) upsellByOrder.set(e.order_id, new Set());
      upsellByOrder.get(e.order_id)!.add(e.actor);
      const m = get(e.actor);
      const qty = Number(e.payload?.quantity || 1);
      const price = Number(e.payload?.added_revenue ?? e.payload?.unit_price ?? 0) * qty;
      m.addedItems += qty;
      m.addedRevenue += isFinite(price) ? price : 0;
    }

    // Orders → outcome counts, address completion, totals (per operator who set outcome)
    for (const o of filteredOrders) {
      const op = o.call_outcome_updated_by!;
      const m = get(op);
      m.totalRevenue += Number(o.total || 0);
      if (o.address_status === "completed") m.addressCompleted += 1;
      const oc = o.call_outcome || "";
      if ((m as any)[oc] !== undefined) (m as any)[oc] += 1;
      if (oc === "confirmed" && upsellByOrder.get(o.id)?.has(op)) m.confirmedWithUpsell += 1;
    }

    return Array.from(map.values()).filter((m) => m.handled > 0 || m.openedOnly > 0 || m.confirmed > 0 || m.addedItems > 0);
  }, [filteredSessions, filteredOrders, events, operatorFilter]);

  const summary = useMemo(() => {
    const handled = metrics.reduce((s, m) => s + m.handled, 0);
    const openedOnly = metrics.reduce((s, m) => s + m.openedOnly, 0);
    const confirmed = metrics.reduce((s, m) => s + m.confirmed, 0);
    const allTimes = metrics.flatMap((m) => m.handlingTimes);
    const avgTime = allTimes.length ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;
    const medTime = median(allTimes);
    const activeHours = allTimes.reduce((a, b) => a + b, 0) / 3600;
    const confirmedPerHour = activeHours > 0 ? confirmed / activeHours : 0;
    const noAnswer = metrics.reduce((s, m) => s + m.no_answer, 0);
    const callback = metrics.reduce((s, m) => s + m.callback, 0);
    const cancelled = metrics.reduce((s, m) => s + m.cancelled, 0);
    const addedRevenue = metrics.reduce((s, m) => s + m.addedRevenue, 0);
    const confirmedWithUpsell = metrics.reduce((s, m) => s + m.confirmedWithUpsell, 0);
    return {
      handled, openedOnly, confirmed,
      confirmRate: handled ? confirmed / handled : 0,
      avgTime, medTime, confirmedPerHour,
      noAnswerRate: handled ? noAnswer / handled : 0,
      callbackRate: handled ? callback / handled : 0,
      cancelRate: handled ? cancelled / handled : 0,
      addedRevenue,
      upsellRate: confirmed ? confirmedWithUpsell / confirmed : 0,
      operators: metrics.length,
    };
  }, [metrics]);

  const lowSample = summary.handled > 0 && summary.handled < 20;

  const sortedMetrics = useMemo(() => {
    const arr = [...metrics];
    const sign = sortDesc ? -1 : 1;
    arr.sort((a, b) => {
      const v = (m: OperatorMetrics): number | string => {
        switch (sortKey) {
          case "operator": return m.operator;
          case "handled": return m.handled;
          case "openedOnly": return m.openedOnly;
          case "confirmed": return m.confirmed;
          case "confirmRate": return m.handled ? m.confirmed / m.handled : 0;
          case "no_answer": return m.no_answer;
          case "callback": return m.callback;
          case "cancelled": return m.cancelled;
          case "wrong_number": return m.wrong_number;
          case "duplicate": return m.duplicate;
          case "avgTime": return m.handlingTimes.length ? m.handlingTimes.reduce((x, y) => x + y, 0) / m.handlingTimes.length : 0;
          case "medTime": return median(m.handlingTimes);
          case "perHour": {
            const hrs = m.handlingTimes.reduce((x, y) => x + y, 0) / 3600;
            return hrs > 0 ? m.confirmed / hrs : 0;
          }
          case "addedItems": return m.addedItems;
          case "addedRevenue": return m.addedRevenue;
          case "upsellRate": return m.confirmed ? m.confirmedWithUpsell / m.confirmed : 0;
          case "addressRate": return m.handled ? m.addressCompleted / m.handled : 0;
        }
      };
      const av = v(a), bv = v(b);
      if (typeof av === "string" && typeof bv === "string") return sign * av.localeCompare(bv);
      return sign * ((av as number) - (bv as number));
    });
    return arr;
  }, [metrics, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc((d) => !d);
    else { setSortKey(k); setSortDesc(true); }
  };

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-extrabold">Operator Stats</h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-muted">Timezone: Tbilisi</span>
            {lastLoadedAt && <span>Updated {fmtTbilisi(lastLoadedAt)}</span>}
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Filters: horizontal scroll chips on mobile */}
        <div className="space-y-2">
          <div className="-mx-3 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex gap-1.5 px-3 sm:px-0 w-max">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all ${
                    preset === p.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {preset === "custom" && (
            <div className="flex gap-2 items-center">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
              <span className="text-xs text-muted-foreground">→</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block">Operator</label>
              <select value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="all">All</option>
                {operatorList.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block">Outcome</label>
              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="all">All</option>
                {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {lowSample && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Small sample size ({summary.handled} handled). Rates may not be reliable yet.
              </div>
            )}

            {/* Primary metrics — order per Part 13 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Handled" value={summary.handled}
                tip="Orders where the operator did something meaningful (set outcome, saved edits, added/removed items, edited address or note)." />
              <StatCard label="Confirmed" value={summary.confirmed} accent="emerald"
                tip="Orders the operator marked as confirmed." />
              <StatCard label="Confirm rate" value={pct(summary.confirmRate)}
                accent={summary.confirmRate >= 0.6 ? "emerald" : summary.confirmRate >= 0.4 ? undefined : "red"}
                tip="confirmed ÷ handled" />
              <StatCard label="Avg handling time" value={fmtTime(summary.avgTime)}
                tip="Average active time from opening the order modal to saving / setting an outcome. Capped at 10 minutes. Not the actual phone call duration." />
              <StatCard label="No answer rate" value={pct(summary.noAnswerRate)} accent={summary.noAnswerRate > 0.3 ? "orange" : undefined}
                tip="no_answer ÷ handled" />
              <StatCard label="Callback rate" value={pct(summary.callbackRate)} accent={summary.callbackRate > 0.2 ? "blue" : undefined}
                tip="callback ÷ handled" />
              <StatCard label="Cancel rate" value={pct(summary.cancelRate)} accent={summary.cancelRate > 0.2 ? "red" : undefined}
                tip="cancelled ÷ handled" />
              <StatCard label="Added revenue" value={`${summary.addedRevenue.toFixed(1)} ₾`} accent="emerald"
                tip="Extra revenue from items manually added by the operator inside the order modal." />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Opened only" value={summary.openedOnly} accent={summary.openedOnly > summary.handled ? "orange" : undefined}
                tip="Orders opened but closed without any meaningful action. Useful for spotting curiosity clicks or accidental opens." />
              <StatCard label="Median time" value={fmtTime(summary.medTime)}
                tip="Middle handling time across all handled orders. Often more realistic than the average when a few sessions are very long." />
              <StatCard label="Confirmed / hour" value={summary.confirmedPerHour.toFixed(1)}
                tip="confirmed ÷ total active handling hours" />
              <StatCard label="Upsell rate" value={pct(summary.upsellRate)} accent="emerald"
                tip="Confirmed orders where the operator added at least one item ÷ all confirmed orders." />
              <StatCard label="Operators" value={summary.operators} tip="Distinct operators with activity in this period." />
            </div>

            {/* Per-operator table */}
            <div className="-mx-3 sm:mx-0 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-muted/50">
                  <tr>
                    {([
                      ["operator", "Operator"],
                      ["handled", "Handled"],
                      ["openedOnly", "Opened only"],
                      ["confirmed", "Confirmed"],
                      ["confirmRate", "Confirm %"],
                      ["no_answer", "No ans."],
                      ["callback", "Callback"],
                      ["cancelled", "Cancel"],
                      ["wrong_number", "Wrong#"],
                      ["duplicate", "Dup"],
                      ["avgTime", "Avg time"],
                      ["medTime", "Med time"],
                      ["perHour", "Conf/hr"],
                      ["addedItems", "+Items"],
                      ["addedRevenue", "+₾"],
                      ["upsellRate", "Upsell %"],
                      ["addressRate", "Addr %"],
                    ] as [SortKey, string][]).map(([k, label]) => (
                      <th key={k}
                        onClick={() => toggleSort(k)}
                        className="text-left px-3 py-2.5 font-bold cursor-pointer hover:bg-muted whitespace-nowrap text-xs">
                        {label}{sortKey === k && <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedMetrics.length === 0 ? (
                    <tr><td colSpan={17} className="text-center py-8 text-muted-foreground text-sm">No operator activity in this range</td></tr>
                  ) : sortedMetrics.map((m) => {
                    const confirmRate = m.handled ? m.confirmed / m.handled : 0;
                    const cancelRate = m.handled ? m.cancelled / m.handled : 0;
                    const noAnsRate = m.handled ? m.no_answer / m.handled : 0;
                    const cbRate = m.handled ? m.callback / m.handled : 0;
                    const avg = m.handlingTimes.length ? m.handlingTimes.reduce((a, b) => a + b, 0) / m.handlingTimes.length : 0;
                    const med = median(m.handlingTimes);
                    const hrs = m.handlingTimes.reduce((a, b) => a + b, 0) / 3600;
                    const perHour = hrs > 0 ? m.confirmed / hrs : 0;
                    const upsell = m.confirmed ? m.confirmedWithUpsell / m.confirmed : 0;
                    const addr = m.handled ? m.addressCompleted / m.handled : 0;
                    return (
                      <tr key={m.operator} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium truncate max-w-[200px]">{m.operator}</td>
                        <td className="px-3 py-2">{m.handled}</td>
                        <td className={`px-3 py-2 ${m.openedOnly > m.handled ? "text-amber-700 font-bold" : ""}`}>{m.openedOnly || "—"}</td>
                        <td className="px-3 py-2 font-bold text-emerald-700">{m.confirmed}</td>
                        <td className={`px-3 py-2 font-bold ${confirmRate >= 0.6 ? "text-emerald-700" : confirmRate < 0.3 ? "text-red-700" : ""}`}>{pct(confirmRate)}</td>
                        <td className={`px-3 py-2 ${noAnsRate > 0.3 ? "text-amber-700 font-bold" : ""}`}>{m.no_answer}</td>
                        <td className={`px-3 py-2 ${cbRate > 0.2 ? "text-blue-700 font-bold" : ""}`}>{m.callback}</td>
                        <td className={`px-3 py-2 ${cancelRate > 0.2 ? "text-red-700 font-bold" : ""}`}>{m.cancelled}</td>
                        <td className="px-3 py-2">{m.wrong_number}</td>
                        <td className="px-3 py-2">{m.duplicate}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtTime(avg)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtTime(med)}</td>
                        <td className="px-3 py-2 font-bold">{perHour.toFixed(1)}</td>
                        <td className="px-3 py-2">{m.addedItems || "—"}</td>
                        <td className={`px-3 py-2 font-bold ${m.addedRevenue > 0 ? "text-emerald-700" : ""}`}>{m.addedRevenue > 0 ? `${m.addedRevenue.toFixed(1)} ₾` : "—"}</td>
                        <td className="px-3 py-2">{pct(upsell)}</td>
                        <td className="px-3 py-2">{pct(addr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Outcome breakdown bar (overall) */}
            {summary.handled > 0 && (
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Outcome breakdown · {summary.handled} handled
                </h3>
                <div className="flex w-full h-3 rounded-full overflow-hidden border border-border">
                  {(["confirmed", "no_answer", "callback", "cancelled", "wrong_number", "duplicate"] as const).map((k) => {
                    const n = metrics.reduce((s, m) => s + (m as any)[k], 0);
                    const pctW = (n / summary.handled) * 100;
                    if (pctW <= 0) return null;
                    const colorMap: Record<string, string> = {
                      confirmed: "#10b981", no_answer: "#f59e0b", callback: "#3b82f6",
                      cancelled: "#ef4444", wrong_number: "#9f1239", duplicate: "#9333ea",
                    };
                    return <div key={k} style={{ width: `${pctW}%`, background: colorMap[k] }} title={`${OUTCOME_LABEL[k]}: ${n}`} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {(["confirmed", "no_answer", "callback", "cancelled", "wrong_number", "duplicate"] as const).map((k) => {
                    const n = metrics.reduce((s, m) => s + (m as any)[k], 0);
                    const p = summary.handled ? (n / summary.handled) * 100 : 0;
                    return (
                      <span key={k} className={`px-2 py-0.5 rounded-full border ${OUTCOME_BADGE_CLS[k]}`}>
                        {OUTCOME_LABEL[k]}: <b>{n}</b> <span className="opacity-70">/ {summary.handled} — {p.toFixed(1)}%</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function StatCard({
  label, value, accent, tip,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "red" | "orange" | "blue";
  tip?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-700",
    red: "text-red-700",
    orange: "text-amber-700",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-lg border border-border p-2.5 sm:p-3 bg-card">
      <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
        <span className="truncate">{label}</span>
        {tip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="More info" className="text-muted-foreground/70 hover:text-foreground">
                <HelpCircle className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">{tip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={`text-lg sm:text-xl font-extrabold mt-0.5 ${accent ? colorMap[accent] : ""}`}>{value}</div>
    </div>
  );
}
