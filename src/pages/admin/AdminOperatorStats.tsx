import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface OperatorMetrics {
  operator: string;
  handled: number;
  confirmed: number;
  no_answer: number;
  callback: number;
  cancelled: number;
  wrong_number: number;
  duplicate: number;
  handlingTimes: number[]; // seconds
  addedItems: number;
  addedRevenue: number;
  confirmedWithUpsell: number;
  addressCompleted: number;
  totalRevenue: number;
}

function getRange(preset: DatePreset, from?: string, to?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: today, to: now };
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: y, to: today };
  }
  if (preset === "7d") {
    const d = new Date(today); d.setDate(d.getDate() - 7);
    return { from: d, to: now };
  }
  if (preset === "30d") {
    const d = new Date(today); d.setDate(d.getDate() - 30);
    return { from: d, to: now };
  }
  return {
    from: from ? new Date(from) : new Date(today.getTime() - 7 * 86400000),
    to: to ? new Date(to + "T23:59:59") : now,
  };
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

const HANDLING_CAP_SECONDS = 600; // 10 min

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

type SortKey =
  | "operator" | "handled" | "confirmed" | "confirmRate" | "no_answer"
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
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("confirmed");
  const [sortDesc, setSortDesc] = useState(true);

  const range = useMemo(() => getRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();

      // Orders touched by an operator in the range (outcome set in range)
      const { data: outcomeOrders } = await supabase
        .from("orders")
        .select("id, public_order_number, customer_phone, total, subtotal, status, address_status, operator_viewed_at, operator_viewed_by, call_outcome, call_outcome_updated_at, call_outcome_updated_by, created_at")
        .not("call_outcome_updated_by", "is", null)
        .gte("call_outcome_updated_at", fromIso)
        .lte("call_outcome_updated_at", toIso)
        .limit(5000);

      // Item-added events in the range — for added revenue
      const { data: addEvents } = await supabase
        .from("order_events")
        .select("order_id, actor, event_type, payload, created_at")
        .eq("event_type", "item_added")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(5000);

      if (cancelled) return;
      setOrders((outcomeOrders as OrderRow[]) || []);
      setEvents((addEvents as EventRow[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const operatorList = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.call_outcome_updated_by && s.add(o.call_outcome_updated_by));
    return Array.from(s).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (operatorFilter !== "all" && o.call_outcome_updated_by !== operatorFilter) return false;
      if (outcomeFilter !== "all" && o.call_outcome !== outcomeFilter) return false;
      return true;
    });
  }, [orders, operatorFilter, outcomeFilter]);

  const metrics = useMemo<OperatorMetrics[]>(() => {
    const map = new Map<string, OperatorMetrics>();
    const get = (k: string) => {
      let m = map.get(k);
      if (!m) {
        m = {
          operator: k, handled: 0, confirmed: 0, no_answer: 0, callback: 0,
          cancelled: 0, wrong_number: 0, duplicate: 0, handlingTimes: [],
          addedItems: 0, addedRevenue: 0, confirmedWithUpsell: 0,
          addressCompleted: 0, totalRevenue: 0,
        };
        map.set(k, m);
      }
      return m;
    };

    // Build set of (orderId -> operator with upsell) for upsell rate
    const upsellByOrder = new Map<string, Set<string>>();
    for (const e of events) {
      if (!upsellByOrder.has(e.order_id)) upsellByOrder.set(e.order_id, new Set());
      upsellByOrder.get(e.order_id)!.add(e.actor);
      if (operatorFilter === "all" || e.actor === operatorFilter) {
        const m = get(e.actor);
        const qty = Number(e.payload?.quantity || 1);
        const price = Number(e.payload?.added_revenue ?? e.payload?.unit_price ?? 0) * qty;
        m.addedItems += qty;
        m.addedRevenue += isFinite(price) ? price : 0;
      }
    }

    for (const o of filteredOrders) {
      const op = o.call_outcome_updated_by!;
      const m = get(op);
      m.handled += 1;
      m.totalRevenue += Number(o.total || 0);
      if (o.address_status === "completed") m.addressCompleted += 1;
      const oc = o.call_outcome || "";
      if ((m as any)[oc] !== undefined) (m as any)[oc] += 1;

      // Handling time: from operator_viewed_at → call_outcome_updated_at (same operator)
      if (o.operator_viewed_at && o.call_outcome_updated_at && o.operator_viewed_by === op) {
        const dt = (new Date(o.call_outcome_updated_at).getTime() - new Date(o.operator_viewed_at).getTime()) / 1000;
        if (dt > 0) m.handlingTimes.push(Math.min(dt, HANDLING_CAP_SECONDS));
      }
      if (oc === "confirmed" && upsellByOrder.get(o.id)?.has(op)) m.confirmedWithUpsell += 1;
    }

    return Array.from(map.values());
  }, [filteredOrders, events, operatorFilter]);

  // Summary
  const summary = useMemo(() => {
    const handled = metrics.reduce((s, m) => s + m.handled, 0);
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
      handled, confirmed,
      confirmRate: handled ? confirmed / handled : 0,
      avgTime, medTime, confirmedPerHour,
      noAnswerRate: handled ? noAnswer / handled : 0,
      callbackRate: handled ? callback / handled : 0,
      cancelRate: handled ? cancelled / handled : 0,
      addedRevenue,
      upsellRate: confirmed ? confirmedWithUpsell / confirmed : 0,
    };
  }, [metrics]);

  const sortedMetrics = useMemo(() => {
    const arr = [...metrics];
    const sign = sortDesc ? -1 : 1;
    arr.sort((a, b) => {
      const v = (m: OperatorMetrics): number | string => {
        switch (sortKey) {
          case "operator": return m.operator;
          case "handled": return m.handled;
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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-extrabold">Operator Stats</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                preset === p.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
              }`}>{p.label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex gap-2 items-center">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
          </div>
        )}
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

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Handled" value={summary.handled} />
            <StatCard label="Confirmed" value={summary.confirmed} accent="emerald" />
            <StatCard label="Confirm rate" value={pct(summary.confirmRate)}
              accent={summary.confirmRate >= 0.6 ? "emerald" : summary.confirmRate >= 0.4 ? undefined : "red"} />
            <StatCard label="Avg time" value={fmtTime(summary.avgTime)} />
            <StatCard label="Median time" value={fmtTime(summary.medTime)} />
            <StatCard label="Confirmed / hour" value={summary.confirmedPerHour.toFixed(1)} accent="emerald" />
            <StatCard label="No answer rate" value={pct(summary.noAnswerRate)} accent={summary.noAnswerRate > 0.3 ? "orange" : undefined} />
            <StatCard label="Callback rate" value={pct(summary.callbackRate)} accent={summary.callbackRate > 0.2 ? "blue" : undefined} />
            <StatCard label="Cancel rate" value={pct(summary.cancelRate)} accent={summary.cancelRate > 0.2 ? "red" : undefined} />
            <StatCard label="Added revenue" value={`${summary.addedRevenue.toFixed(1)} ₾`} accent="emerald" />
            <StatCard label="Upsell rate" value={pct(summary.upsellRate)} accent="emerald" />
            <StatCard label="Operators" value={metrics.length} />
          </div>

          {/* Per-operator table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {([
                    ["operator", "Operator"],
                    ["handled", "Handled"],
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
                  <tr><td colSpan={16} className="text-center py-8 text-muted-foreground text-sm">No operator activity in this range</td></tr>
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Outcome breakdown</h3>
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
                  return (
                    <span key={k} className={`px-2 py-0.5 rounded-full border ${OUTCOME_BADGE_CLS[k]}`}>
                      {OUTCOME_LABEL[k]}: <b>{n}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "emerald" | "red" | "orange" | "blue" }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-700",
    red: "text-red-700",
    orange: "text-amber-700",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-lg border border-border p-3 bg-card">
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-xl font-extrabold mt-0.5 ${accent ? colorMap[accent] : ""}`}>{value}</div>
    </div>
  );
}
