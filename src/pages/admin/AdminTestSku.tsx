import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TEST_SKU = "999999";
type Mode = "today" | "yesterday" | "7d" | "all";

const tbDay = (offset = 0) => {
  const d = new Date(Date.now() + 4 * 3600000 - offset * 86400000);
  return d.toISOString().slice(0, 10);
};

export default function AdminTestSku() {
  const [mode, setMode] = useState<Mode>("today");
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ spend: number; purchases: number; clicks: number; currency: string } | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { since, until } = useMemo(() => {
    if (mode === "today") return { since: tbDay(0), until: tbDay(0) };
    if (mode === "yesterday") return { since: tbDay(1), until: tbDay(1) };
    if (mode === "7d") return { since: tbDay(6), until: tbDay(0) };
    return { since: "2026-01-01", until: tbDay(0) };
  }, [mode]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const s = new Date(`${since}T00:00:00+04:00`).toISOString();
      const e = new Date(`${until}T23:59:59.999+04:00`).toISOString();
      const { data } = await supabase
        .from("order_items")
        .select("quantity, line_total, orders!inner(id, public_order_number, created_at, status, is_confirmed, is_fulfilled, customer_phone, total)")
        .eq("sku", TEST_SKU)
        .gte("orders.created_at", s)
        .lte("orders.created_at", e)
        .limit(1000);
      setRows((data as any[]) || []);
      setLoading(false);

      setMetaErr(null);
      try {
        const [{ data: fn, error }, { data: map }] = await Promise.all([
          supabase.functions.invoke("meta-ads-insights", { body: { since, until } }),
          supabase.from("meta_ad_product_map").select("ad_id, product_sku"),
        ]);
        if (error) throw error;
        const mapped = new Set((map || []).filter((m: any) => m.product_sku === TEST_SKU).map((m: any) => m.ad_id));
        const ads = (fn?.ads ?? []).filter((a: any) => mapped.has(a.adId) || String(a.adName).includes(TEST_SKU));
        setMeta({
          spend: ads.reduce((t: number, a: any) => t + (a.spend || 0), 0),
          purchases: ads.reduce((t: number, a: any) => t + (a.purchases || 0), 0),
          clicks: ads.reduce((t: number, a: any) => t + (a.clicks || 0), 0),
          currency: fn?.currency ?? "USD",
        });
      } catch (err: any) {
        setMetaErr(err?.message ?? "Meta ვერ ჩაიტვირთა");
        setMeta(null);
      }
    })();
  }, [since, until]);

  const st = useMemo(() => {
    const orders = new Map<string, any>();
    let pcs = 0, rev = 0, revNet = 0;
    for (const r of rows) {
      const o = r.orders;
      if (o.status === "merged") continue;
      const canceled = o.status === "canceled" || o.status === "returned";
      pcs += r.quantity || 0;
      rev += Number(r.line_total || 0);
      if (!canceled) revNet += Number(r.line_total || 0);
      orders.set(o.id, { ...o, qty: (orders.get(o.id)?.qty || 0) + (r.quantity || 0), canceled });
    }
    const list = [...orders.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const confirmed = list.filter((o) => (o.is_confirmed || o.is_fulfilled) && !o.canceled).length;
    const canceled = list.filter((o) => o.canceled).length;
    return { list, pcs, rev, revNet, confirmed, canceled, leads: list.length };
  }, [rows]);

  const cpl = meta && st.leads ? meta.spend / st.leads : null;
  const cpc = meta && st.confirmed ? meta.spend / st.confirmed : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold">სატესტო SKU {TEST_SKU}</h1>
        <p className="text-sm text-muted-foreground">ეს შეკვეთები არ ჩანს Dashboard-ზე და Orders-ში — მხოლოდ აქ.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {([["today", "დღეს"], ["yesterday", "გუშინ"], ["7d", "7 დღე"], ["all", "სულ"]] as [Mode, string][]).map(([m, l]) => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{l}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="ლიდები (შეკვეთები)" value={st.leads} />
        <Kpi label="ცალი" value={st.pcs} />
        <Kpi label="დადასტურებული" value={st.confirmed} sub={st.leads ? `${Math.round((st.confirmed / st.leads) * 100)}%` : undefined} />
        <Kpi label="გაუქმებული" value={st.canceled} />
        <Kpi label="შემოსავალი ₾" value={Math.round(st.rev)} sub={`გაუქმ. გარეშე ${Math.round(st.revNet)}₾`} />
        <Kpi label={`Meta ხარჯი (${meta?.currency ?? "USD"})`} value={meta ? meta.spend.toFixed(2) : "—"} sub={meta ? `${meta.purchases} შენაძენი · ${meta.clicks} კლიკი` : metaErr ?? undefined} />
        <Kpi label="ფასი 1 ლიდზე" value={cpl != null ? cpl.toFixed(2) : "—"} />
        <Kpi label="ფასი 1 დადასტურებულზე" value={cpc != null ? cpc.toFixed(2) : "—"} />
      </div>
      {meta && meta.spend === 0 && (
        <p className="text-xs text-muted-foreground">Meta ხარჯი 0 — მიაბით რეკლამა SKU {TEST_SKU}-ს Dashboard-ის „რეკლამების მიბმა" სიაში, ან ჩაწერეთ 999999 რეკლამის სახელში.</p>
      )}
      <Card><CardContent className="p-0 divide-y">
        {loading ? <p className="p-4 text-sm text-muted-foreground">იტვირთება...</p> :
          st.list.length === 0 ? <p className="p-4 text-sm text-muted-foreground">შეკვეთები ჯერ არ არის.</p> :
          st.list.map((o) => (
            <div key={o.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-semibold">#{o.public_order_number} · {o.qty} ც</div>
                <div className="text-xs text-muted-foreground">{format(new Date(o.created_at), "dd.MM HH:mm")} · {o.customer_phone}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{Number(o.total).toFixed(2)}₾</div>
                <div className="text-xs text-muted-foreground">{o.canceled ? "გაუქმებული" : (o.is_confirmed || o.is_fulfilled) ? "დადასტურებული" : o.status}</div>
              </div>
            </div>
          ))}
      </CardContent></Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <Card><CardContent className="pt-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}
