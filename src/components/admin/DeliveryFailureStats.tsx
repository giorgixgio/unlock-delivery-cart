import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { REASON_LABELS } from "./DeliveryProblemsPanel";

interface Ev { order_id: string | null; ai_reason: string | null; orders: { normalized_city: string | null; city: string | null; order_items: { title: string | null; unit_price: number | null }[] } | null }

/** Share of courier failure reasons over the last 7 or 30 days, overall, by product and by city. */
export default function DeliveryFailureStats() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Ev[]>([]);
  useEffect(() => {
    supabase.from("onway_status_events")
      .select("order_id, ai_reason, orders(normalized_city, city, order_items(title, unit_price))")
      .not("ai_reason", "is", null).not("order_id", "is", null)
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString()).limit(2000)
      .then(({ data }) => setRows((data as unknown as Ev[]) || []));
  }, [days]);
  const { total, byReason, byProduct, byCity } = useMemo(() => {
    const byReason: Record<string, number> = {};
    const group = (key: (e: Ev) => string) => {
      const m: Record<string, Record<string, number>> = {};
      for (const e of rows) { const k = key(e); m[k] ??= {}; m[k][e.ai_reason!] = (m[k][e.ai_reason!] || 0) + 1; }
      return Object.entries(m).sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, 8);
    };
    for (const e of rows) byReason[e.ai_reason!] = (byReason[e.ai_reason!] || 0) + 1;
    return {
      total: rows.length, byReason,
      byProduct: group((e) => e.orders?.order_items?.find((i) => Number(i.unit_price) > 0)?.title || "—"),
      byCity: group((e) => e.orders?.normalized_city || e.orders?.city || "—"),
    };
  }, [rows]);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "0%");
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${REASON_LABELS[k] || k} ${pct(n, sum(m))}`).join(" · ");
  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-sm">Delivery failure reasons</h3>
        <div className="ml-auto flex gap-1">
          {[7, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded px-2 py-1 text-xs border ${days === d ? "bg-primary text-primary-foreground" : "border-border"}`}>{d} days</button>)}
        </div>
      </div>
      {!total ? <p className="text-sm text-muted-foreground">No classified courier comments yet.</p> : (
        <>
          <ul className="text-sm space-y-1">
            {Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k} className="flex justify-between"><span>{REASON_LABELS[k] || k}</span><span className="font-semibold">{pct(n, total)} ({n})</span></li>
            ))}
          </ul>
          <div><p className="text-xs font-semibold mt-2">By product</p>{byProduct.map(([k, m]) => <p key={k} className="text-xs"><b>{k}</b>: {top(m)}</p>)}</div>
          <div><p className="text-xs font-semibold mt-2">By city</p>{byCity.map(([k, m]) => <p key={k} className="text-xs"><b>{k}</b>: {top(m)}</p>)}</div>
        </>
      )}
    </div>
  );
}
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
