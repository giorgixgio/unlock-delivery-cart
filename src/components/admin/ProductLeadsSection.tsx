import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle, ChevronDown, Search } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/admin/DashboardVisuals";
import { tbilisiStartOfDay, tbilisiEndOfDay } from "@/lib/tbilisiTime";
import { filterOrdersForStore } from "@/lib/adminStoreFilter";
import type { AdminStore } from "@/contexts/StoreContext";
import {
  aggregateProductStats, sortProducts, LOW_SAMPLE,
  type PdsOrder, type PdsItem, type PdsAddedEvent, type ProductSort, type ProductStat,
} from "@/lib/productDashboardStats";

type DateMode = "today" | "yesterday" | "custom" | "range" | "all";

interface Props {
  dateMode: DateMode;
  selectedDate: Date;
  range: { from?: Date; to?: Date };
  hideBeforeDate: Date | null;
  activeStore: AdminStore;
  applyToCount: (n: number) => number;
  applyToRevenue: (n: number) => number;
}

const PAGE = 1000;
async function allPages<T>(fn: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fn(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
const chunk = <T,>(a: T[], n = 300) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function periodBounds(p: Props): { cur: [Date, Date] | null; prev: [Date, Date] | null; days: number } {
  if (p.dateMode === "all") return { cur: null, prev: null, days: 0 };
  let s: Date, e: Date;
  if (p.dateMode === "range" && p.range.from) {
    s = tbilisiStartOfDay(p.range.from); e = tbilisiEndOfDay(p.range.to || p.range.from);
  } else {
    const day = p.dateMode === "today" ? new Date() : p.dateMode === "yesterday" ? new Date(Date.now() - 86400000) : p.selectedDate;
    s = tbilisiStartOfDay(day); e = tbilisiEndOfDay(day);
  }
  const len = e.getTime() - s.getTime() + 1;
  return { cur: [s, e], prev: [new Date(s.getTime() - len), new Date(s.getTime() - 1)], days: Math.round(len / 86400000) };
}

async function loadPeriod(bounds: [Date, Date] | null, hideBefore: Date | null, store: AdminStore) {
  const orders = await allPages<PdsOrder>((f, t) => {
    let q = supabase.from("orders").select("id, status, is_confirmed, is_fulfilled, auto_confirmed, is_return, created_at")
      .or("is_return.is.null,is_return.eq.false").neq("status", "merged");
    if (bounds) q = q.gte("created_at", bounds[0].toISOString()).lte("created_at", bounds[1].toISOString());
    if (hideBefore) q = q.gte("created_at", hideBefore.toISOString());
    return q.order("id").range(f, t);
  });
  const scoped = await filterOrdersForStore(orders, store);
  const ids = scoped.map((o) => o.id);
  const itemChunks = await Promise.all(chunk(ids).map((c) => allPages<PdsItem>((f, t) =>
    supabase.from("order_items").select("order_id, product_id, sku, title, image_url, quantity, line_total").in("order_id", c).order("id").range(f, t))));
  const eventChunks = await Promise.all(chunk(ids).map((c) => allPages<PdsAddedEvent>((f, t) =>
    supabase.from("order_events").select("order_id, payload").eq("event_type", "item_added").in("order_id", c).order("id").range(f, t))));
  return aggregateProductStats(scoped, itemChunks.flat(), eventChunks.flat());
}

const Help = ({ text }: { text: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="inline-flex align-middle dg-muted hover:text-slate-200" aria-label="Explain" onClick={(e) => e.stopPropagation()}>
        <HelpCircle className="h-3 w-3" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-64 text-xs" onClick={(e) => e.stopPropagation()}>{text}</PopoverContent>
  </Popover>
);

const pct = (r: number) => `${Math.round(r * 100)}%`;
const gel = (n: number) => `${Math.round(n).toLocaleString()} ₾`;
const ratePill = (r: number) => r >= 0.6 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
  : r >= 0.4 ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40";

const Delta = ({ cur, prev, pp }: { cur: number; prev?: number; pp?: boolean }) => {
  if (prev === undefined) return null;
  if (pp) {
    const d = Math.round((cur - prev) * 100);
    if (d === 0) return <span className="text-[10px] dg-muted">±0pp</span>;
    return <span className={cn("text-[10px]", d > 0 ? "text-emerald-400" : "text-rose-400")}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}pp</span>;
  }
  if (prev === 0) return cur > 0 ? <span className="text-[10px] text-emerald-400">new</span> : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return <span className="text-[10px] dg-muted">±0%</span>;
  return <span className={cn("text-[10px]", d > 0 ? "text-emerald-400" : "text-rose-400")}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}%</span>;
};

export default function ProductLeadsSection(props: Props) {
  const { applyToCount, applyToRevenue } = props;
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPeriod>> | null>(null);
  const [prev, setPrev] = useState<Awaited<ReturnType<typeof loadPeriod>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<ProductSort>("leads");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const bounds = periodBounds(props);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const b = periodBounds(props);
    Promise.all([
      loadPeriod(b.cur, props.hideBeforeDate, props.activeStore),
      b.prev ? loadPeriod(b.prev, props.hideBeforeDate, props.activeStore) : Promise.resolve(null),
    ]).then(([c, p]) => { if (!cancelled) { setData(c); setPrev(p); } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dateMode, props.selectedDate, props.range.from, props.range.to, props.hideBeforeDate, props.activeStore]);

  const prevMap = useMemo(() => new Map((prev?.products ?? []).map((p) => [p.key, p])), [prev]);
  const sorted = useMemo(() => sortProducts((data?.products ?? []).filter((p) => p.leads > 0), sort), [data, sort]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sorted.filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : sorted;
  }, [sorted, search]);
  const visible = showAll || search ? filtered : filtered.slice(0, 10);
  const maxLeads = Math.max(1, ...sorted.map((p) => p.leads));
  const s = data?.summary;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted">Products — Leads & Confirm Rate</h2>
        <div className="dg-chip inline-flex text-[11px]">
          {(["leads", "rate", "revenue"] as ProductSort[]).map((k) => (
            <button key={k} data-active={sort === k} onClick={() => setSort(k)} className="px-2.5 py-1">
              {k === "leads" ? "Leads" : k === "rate" ? "Confirm rate" : "Revenue"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="dg-card p-3 text-xs text-rose-300">{error}</div>}
      {loading && !data && <div className="dg-card p-4 text-xs dg-muted animate-pulse">Loading products…</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <div className="dg-card p-3">
              <div className="text-[10px] dg-muted flex items-center gap-1">Unique leads <Help text="Real orders created in this period (no returns, no merged). Each order counted once — equals Total Real Orders." /></div>
              <div className="text-xl font-bold"><CountUp value={applyToCount(s.uniqueLeads)} /></div>
              {prev && <Delta cur={s.uniqueLeads} prev={prev.summary.uniqueLeads} />}
            </div>
            <div className="dg-card p-3">
              <div className="text-[10px] dg-muted flex items-center gap-1">Confirmed <Help text="Unique orders that are confirmed or fulfilled and not canceled/returned." /></div>
              <div className="text-xl font-bold text-emerald-400"><CountUp value={applyToCount(s.confirmed)} /></div>
            </div>
            <div className="dg-card p-3">
              <div className="text-[10px] dg-muted flex items-center gap-1">Confirm rate <Help text="Confirmed ÷ unique leads. Canceled orders stay in the denominator (same as Lead-to-Confirm)." /></div>
              <div className="text-xl font-bold">{pct(s.confirmRate)}</div>
              {prev && <Delta cur={s.confirmRate} prev={prev.summary.confirmRate} pp />}
            </div>
            <div className="dg-card p-3">
              <div className="text-[10px] dg-muted flex items-center gap-1">Products with leads <Help text="How many different products customers ordered in this period (operator-added items don't count)." /></div>
              <div className="text-xl font-bold"><CountUp value={s.productsWithLeads} /></div>
            </div>
          </div>
          {(s.best || s.worst) && (
            <div className="dg-card p-3 mb-2 text-[11px] space-y-1">
              <div className="dg-muted flex items-center gap-1">Best / worst confirm rate <Help text={`Only products with at least ${LOW_SAMPLE} leads, so tiny samples don't mislead.`} /></div>
              {s.best && <div className="truncate">🏆 <span className="text-emerald-300">{pct(s.best.confirmRate)}</span> · {s.best.title}</div>}
              {s.worst && <div className="truncate">⚠️ <span className="text-rose-300">{pct(s.worst.confirmRate)}</span> · {s.worst.title}</div>}
            </div>
          )}
          <p className="text-[10px] dg-muted mb-2">Orders with multiple products count under each. Items added by operators are excluded from leads (shown as “+N upsold”).</p>

          {sorted.length > 10 && (
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 dg-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU"
                className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400/50" />
            </div>
          )}

          <div className={cn("space-y-2", loading && "opacity-60")}>
            {visible.length === 0 && <div className="dg-card p-4 text-xs dg-muted">No product leads in this period.</div>}
            {visible.map((p) => (
              <ProductRow key={p.key} p={p} prev={prevMap.get(p.key)} hasPrev={!!prev} maxLeads={maxLeads}
                expandable={bounds.days > 1 || props.dateMode === "all"} open={open === p.key}
                onToggle={() => setOpen(open === p.key ? null : p.key)} applyToCount={applyToCount} applyToRevenue={applyToRevenue} />
            ))}
          </div>
          {!search && filtered.length > 10 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 w-full dg-card py-2 text-xs text-sky-300">
              {showAll ? "Show top 10" : `Show all (${filtered.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ProductRow({ p, prev, hasPrev, maxLeads, expandable, open, onToggle, applyToCount, applyToRevenue }: {
  p: ProductStat; prev?: ProductStat; hasPrev: boolean; maxLeads: number; expandable: boolean; open: boolean;
  onToggle: () => void; applyToCount: (n: number) => number; applyToRevenue: (n: number) => number;
}) {
  const low = p.leads < LOW_SAMPLE;
  const w = (p.leads / maxLeads) * 100;
  const seg = (n: number) => `${p.leads ? (n / p.leads) * 100 : 0}%`;
  return (
    <div className={cn("dg-card p-3", low && "opacity-60")} title={low ? `Low sample (< ${LOW_SAMPLE} leads) — rate may be misleading` : undefined}>
      <button type="button" onClick={expandable ? onToggle : undefined} className="w-full text-left">
        <div className="flex items-center gap-2.5">
          {p.image ? <img src={p.image} alt="" loading="lazy" className="h-10 w-10 rounded-md object-cover bg-white/5 shrink-0" />
            : <div className="h-10 w-10 rounded-md bg-white/5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-100 truncate">{p.title}</div>
            <div className="text-[10px] dg-muted truncate">{p.sku}{low && " · low sample"}</div>
          </div>
          {expandable && <ChevronDown className={cn("h-4 w-4 dg-muted transition-transform shrink-0", open && "rotate-180")} />}
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <div className="h-full flex" style={{ width: `${w}%` }}>
            <div className="bg-emerald-500" style={{ width: seg(p.confirmed) }} />
            <div className="bg-amber-400" style={{ width: seg(p.pending) }} />
            <div className="bg-rose-500" style={{ width: seg(p.canceled) }} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm"><b className="text-slate-100">{applyToCount(p.leads)}</b> <span className="text-[10px] dg-muted">leads</span>{" "}
            <Help text="Orders where the customer ordered this product (operator-added items excluded)." />{" "}
            {hasPrev && <Delta cur={p.leads} prev={prev?.leads ?? 0} />}</span>
          <span className="text-sm"><b className="text-emerald-400">{applyToCount(p.confirmed)}</b> <span className="text-[10px] dg-muted">conf.</span>{" "}
            <Help text="Of those orders: confirmed or fulfilled and not canceled/returned." /></span>
          <span className="ml-auto flex items-center gap-1">
            {hasPrev && prev && prev.leads > 0 && <Delta cur={p.confirmRate} prev={prev.confirmRate} pp />}
            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", ratePill(p.confirmRate))}>{pct(p.confirmRate)}</span>
            <Help text="Confirmed ÷ leads. Canceled stay in the denominator. Green ≥60%, amber 40–60%, red <40%." />
          </span>
        </div>
        <div className="mt-1 text-[10px] dg-muted flex items-center gap-1 flex-wrap">
          <span>{gel(applyToRevenue(p.revenue))}</span><Help text="Sum of this product's line totals (customer-ordered lines) on orders that are not canceled/returned." />
          <span>· auto {pct(p.autoShare)}</span><Help text="Share of confirmed orders that were auto-confirmed (no operator needed)." />
          <span>· {applyToCount(p.pending)} pending · {applyToCount(p.canceled)} canceled</span>
          {p.upsold > 0 && <span className="rounded bg-sky-500/15 text-sky-300 px-1.5">+{applyToCount(p.upsold)} upsold</span>}
          {p.upsold > 0 && <Help text="Orders where an operator added this product during the call. Not counted as leads." />}
        </div>
      </button>
      {open && expandable && p.daily.length > 0 && (
        <div className="mt-3 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={p.daily.map((d) => ({ day: d.day.slice(5), leads: applyToCount(d.leads), rate: d.leads ? Math.round((d.confirmed / d.leads) * 100) : 0 }))}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8b90a3" }} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#8b90a3" }} width={24} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "#8b90a3" }} width={28} unit="%" />
              <RTooltip contentStyle={{ background: "#12141c", border: "1px solid rgba(255,255,255,.1)", fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="leads" name="Leads" fill="hsl(213 94% 62%)" radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" dataKey="rate" name="Confirm %" stroke="#34d399" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
