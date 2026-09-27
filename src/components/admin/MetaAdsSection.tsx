import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, RefreshCw, AlertTriangle } from "lucide-react";
import { tbilisiStartOfDay, tbilisiEndOfDay } from "@/lib/tbilisiTime";

type DateMode = "today" | "yesterday" | "custom" | "range" | "all";

interface Props {
  dateMode: DateMode;
  selectedDate: Date;
  range: { from?: Date; to?: Date };
}

interface MetaSkuRow {
  skuCode: string;
  spend: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ads: number;
  cpa: number | null;
}

interface MetaAd {
  adId: string;
  adName: string;
  autoCode: string | null;
  spend: number;
  purchases: number;
  clicks: number;
  impressions: number;
}

interface ProductLite {
  sku: string | null;
  title: string | null;
}

const fmtGel = (n: number) => `${n.toFixed(2)} ₾`;
const CUR_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GEL: "₾" };
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
const roasColor = (r: number | null) => (r == null ? undefined : r >= 3 ? "#4ade80" : r >= 2 ? "#fbbf24" : "#f87171");

export default function MetaAdsSection({ dateMode, selectedDate, range }: Props) {
  const [ads, setAds] = useState<MetaAd[] | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [showMap, setShowMap] = useState(false);
  const [mapFilter, setMapFilter] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState<number>(() => Number(localStorage.getItem("meta_usd_gel_rate")) || 2.7);
  const [revenue, setRevenue] = useState<Map<string, { gross: number; net: number }>>(new Map());
  const fmtSpend = (n: number) => (currency === "GEL" ? fmtGel(n) : `${CUR_SYMBOL[currency] ?? currency + " "}${n.toFixed(2)}`);
  const toGel = (n: number) => (currency === "GEL" ? n : n * rate);

  // Resolve the dashboard date selection into Tbilisi-day since/until.
  const { since, until } = useMemo(() => {
    const day =
      dateMode === "today"
        ? new Date()
        : dateMode === "yesterday"
          ? new Date(Date.now() - 86400000)
          : dateMode === "custom"
            ? selectedDate
            : null;
    if (day) {
      return {
        since: format(tbilisiStartOfDay(day), "yyyy-MM-dd"),
        until: format(tbilisiEndOfDay(day), "yyyy-MM-dd"),
      };
    }
    if (dateMode === "range" && range.from) {
      return {
        since: format(tbilisiStartOfDay(range.from), "yyyy-MM-dd"),
        until: format(tbilisiEndOfDay(range.to || range.from), "yyyy-MM-dd"),
      };
    }
    // "all" — Meta keeps ~37 months; use a wide window.
    return { since: "2024-01-01", until: format(new Date(), "yyyy-MM-dd") };
  }, [dateMode, selectedDate, range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, { data: mp }] = await Promise.all([
        supabase.from("products").select("sku, title").eq("warehouse", "B").limit(1000),
        supabase.from("meta_ad_product_map").select("ad_id, product_sku"),
      ]);
      if (cancelled) return;
      setProducts(data ?? []);
      setManual(Object.fromEntries((mp ?? []).map((r: any) => [r.ad_id, r.product_sku])));
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("სესია ამოიწურა — გაიარეთ ავტორიზაცია თავიდან");
      const { data, error: fnErr } = await supabase.functions.invoke("meta-ads-insights", {
        body: { since, until },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (fnErr) {
        const ctx = (fnErr as any)?.context;
        let msg = fnErr.message;
        try {
          const body = ctx ? await ctx.json() : null;
          if (body?.message) msg = `${body.message}${body?.details?.stage ? ` (${body.details.stage})` : ""}`;
        } catch { /* keep original message */ }
        throw new Error(msg);
      }
      setAds(data?.ads ?? []);
      setCurrency(data?.currency ?? "USD");
    } catch (e: any) {
      setError(e?.message ?? "ჩატვირთვა ვერ მოხერხდა");
      setAds(null);
    } finally {
      setLoading(false);
    }
  };

  // Our own revenue per SKU for orders created in the same Tbilisi days (for ROAS).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s0 = new Date(`${since}T00:00:00+04:00`).toISOString();
        const e0 = new Date(`${until}T23:59:59.999+04:00`).toISOString();
        const orders = await allPages<{ id: string; status: string }>((f, t) =>
          supabase.from("orders").select("id, status").gte("created_at", s0).lte("created_at", e0)
            .or("is_return.is.null,is_return.eq.false").neq("status", "merged").order("id").range(f, t));
        const canceled = new Set(orders.filter((o) => o.status === "canceled" || o.status === "cancelled" || o.status === "returned").map((o) => o.id));
        const ids = orders.map((o) => o.id);
        const chunks = Array.from({ length: Math.ceil(ids.length / 300) }, (_, i) => ids.slice(i * 300, i * 300 + 300));
        const items = (await Promise.all(chunks.map((c) => allPages<{ order_id: string; sku: string | null; line_total: number | null }>((f, t) =>
          supabase.from("order_items").select("order_id, sku, line_total").in("order_id", c).order("id").range(f, t))))).flat();
        const m = new Map<string, { gross: number; net: number }>();
        for (const it of items) {
          const k = (it.sku ?? "").toLowerCase().trim();
          if (!k) continue;
          const cur = m.get(k) ?? { gross: 0, net: 0 };
          const v = Number(it.line_total) || 0;
          cur.gross += v;
          if (!canceled.has(it.order_id)) cur.net += v;
          m.set(k, cur);
        }
        if (!cancelled) setRevenue(m);
      } catch (e) { console.error("[MetaAdsSection] revenue load failed", e); }
    })();
    return () => { cancelled = true; };
  }, [since, until]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [since, until]);

  // Exact trailing code ("0012", "0012_2", "0012_4") -> product, so variants never collide.
  const productByCode = useMemo(() => {
    const map = new Map<string, ProductLite>();
    for (const p of products) {
      const sku = (p.sku ?? "").toLowerCase().trim();
      const m = sku.match(/(\d{3,4}(?:_\d+)?)$/);
      if (m && !map.has(m[1])) map.set(m[1], p);
    }
    return map;
  }, [products]);
  const productBySku = useMemo(() => new Map(products.map((p) => [(p.sku ?? "").toLowerCase(), p])), [products]);

  const resolve = (a: MetaAd): { key: string; product: ProductLite | null; manual: boolean } | null => {
    const m = manual[a.adId];
    if (m) return { key: m.toLowerCase(), product: productBySku.get(m.toLowerCase()) ?? { sku: m, title: null }, manual: true };
    if (!a.autoCode) return null;
    const p = productByCode.get(a.autoCode.toLowerCase()) ?? null;
    return { key: (p?.sku ?? a.autoCode).toLowerCase(), product: p, manual: false };
  };

  const { rows, unmatched, productOf } = useMemo(() => {
    if (!ads) return { rows: null as (MetaSkuRow & { product: ProductLite | null })[] | null, unmatched: null, productOf: new Map<string, ProductLite | null>() };
    const by = new Map<string, MetaSkuRow & { product: ProductLite | null }>();
    const productOf = new Map<string, ProductLite | null>();
    let uAds = 0, uSpend = 0;
    for (const a of ads) {
      const r = resolve(a);
      if (!r) { uAds++; uSpend += a.spend; continue; }
      const cur = by.get(r.key) ?? { skuCode: r.key, spend: 0, purchases: 0, clicks: 0, impressions: 0, ads: 0, cpa: null, product: r.product };
      cur.spend += a.spend; cur.purchases += a.purchases; cur.clicks += a.clicks; cur.impressions += a.impressions; cur.ads++;
      by.set(r.key, cur);
    }
    const rows = [...by.values()].map((x) => ({ ...x, cpa: x.purchases > 0 ? x.spend / x.purchases : null })).sort((a, b) => b.spend - a.spend);
    return { rows, unmatched: { ads: uAds, spend: uSpend }, productOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads, manual, productByCode, productBySku]);
  void productOf;

  const saveMap = async (a: MetaAd, sku: string) => {
    if (!sku) {
      await supabase.from("meta_ad_product_map").delete().eq("ad_id", a.adId);
      setManual((m) => { const n = { ...m }; delete n[a.adId]; return n; });
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("meta_ad_product_map").upsert({ ad_id: a.adId, ad_name: a.adName, product_sku: sku, updated_by: u.user?.email ?? null, updated_at: new Date().toISOString() });
    if (e) { setError(`მიბმა ვერ შეინახა: ${e.message}`); return; }
    setManual((m) => ({ ...m, [a.adId]: sku }));
  };

  const totals = useMemo(() => {
    if (!rows) return null;
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const purchases = rows.reduce((s, r) => s + r.purchases, 0);
    let gross = 0, net = 0;
    for (const r of rows) { const v = revenue.get(r.skuCode); if (v) { gross += v.gross; net += v.net; } }
    const sg = toGel(spend);
    return { spend, purchases, cpa: purchases > 0 ? spend / purchases : null, gross, net, roas: sg > 0 ? gross / sg : null, roasNet: sg > 0 ? net / sg : null };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, revenue, rate, currency]);

  return (
    <div className="dg-card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 className="dg-muted" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 15, fontWeight: 700 }}>
          <Megaphone size={16} /> Meta Ads — CPA პროდუქტებით
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="dg-muted"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> განახლება
        </button>
      </div>
      <p className="dg-muted" style={{ fontSize: 11, margin: "6px 0 12px" }}>
        ხარჯი ({currency}) და შენაძენი Meta-დან · {since} → {until} · CPA = ხარჯი ÷ შენაძენი · ROAS = ჩვენი შემოსავალი (₾) ÷ ხარჯი (₾-ში)
      </p>
      {currency !== "GEL" && (
        <div className="dg-muted" style={{ fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          კურსი: 1 {currency} =
          <input type="number" step="0.01" value={rate}
            onChange={(e) => { const v = Number(e.target.value); if (v > 0) { setRate(v); localStorage.setItem("meta_usd_gel_rate", String(v)); } }}
            style={{ width: 80, fontSize: 16, padding: "2px 6px", borderRadius: 6, background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,0.15)" }} />
          ₾
        </div>
      )}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f87171", fontSize: 13, padding: "10px 0" }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!error && rows && totals && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
            <span>სულ ხარჯი: <b>{fmtSpend(totals.spend)}</b> <span className="dg-muted">(≈{fmtGel(toGel(totals.spend))})</span></span>
            <span>შენაძენი: <b>{totals.purchases}</b></span>
            <span>საშ. CPA: <b>{totals.cpa != null ? fmtSpend(totals.cpa) : "—"}</b></span>
            <span title="ყველა ლიდის შემოსავალი ÷ ხარჯი">ROAS: <b style={{ color: roasColor(totals.roas) }}>{totals.roas != null ? totals.roas.toFixed(2) + "x" : "—"}</b></span>
            <span title="გაუქმებული/დაბრუნებული შეკვეთები გამოკლებულია">ROAS გაუქმ. გარეშე: <b style={{ color: roasColor(totals.roasNet) }}>{totals.roasNet != null ? totals.roasNet.toFixed(2) + "x" : "—"}</b></span>
          </div>

          {rows.length === 0 && <p className="dg-muted" style={{ fontSize: 13 }}>ამ პერიოდში ხარჯი არ არის.</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {rows.map((r) => {
              const p = r.product;
              const rev = revenue.get(r.skuCode);
              const sg = toGel(r.spend);
              const roas = rev && sg > 0 ? rev.gross / sg : null;
              const roasNet = rev && sg > 0 ? rev.net / sg : null;
              const cpaGel = r.cpa != null ? toGel(r.cpa) : null;
              return (
                <div key={r.skuCode} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, display: "flex", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p?.title ?? `SKU ${r.skuCode}`}
                    </div>
                    <div className="dg-muted" style={{ fontSize: 10 }}>{p?.sku ?? r.skuCode} · {r.ads} რეკლამა</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                      <span>ხარჯი <b>{fmtSpend(r.spend)}</b></span>
                      <span>შენ. <b>{r.purchases}</b></span>
                      <span>
                        CPA{" "}
                        <b style={{ color: cpaGel == null ? undefined : cpaGel <= 5 ? "#4ade80" : cpaGel <= 10 ? "#fbbf24" : "#f87171" }}>
                          {r.cpa != null ? fmtSpend(r.cpa) : "—"}
                        </b>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, flexWrap: "wrap" }}>
                      <span>ROAS <b style={{ color: roasColor(roas) }}>{roas != null ? roas.toFixed(2) + "x" : "—"}</b></span>
                      <span>გაუქმ. გარეშე <b style={{ color: roasColor(roasNet) }}>{roasNet != null ? roasNet.toFixed(2) + "x" : "—"}</b></span>
                      <span className="dg-muted">{rev ? fmtGel(rev.net) : "0 ₾"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {unmatched && unmatched.ads > 0 && (
            <p className="dg-muted" style={{ fontSize: 11, marginTop: 10 }}>
              {unmatched.ads} რეკლამა ({fmtGel(unmatched.spend)}) ვერ დაერთა პროდუქტს — მიაბით ხელით ქვემოთ.
            </p>
          )}

          <button onClick={() => setShowMap((v) => !v)} className="dg-muted"
            style={{ marginTop: 10, fontSize: 12, fontWeight: 600, background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
            {showMap ? "დამალვა" : "რეკლამების მიბმა პროდუქტზე (ხელით)"}
          </button>

          {showMap && ads && (
            <div style={{ marginTop: 10 }}>
              <input value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} placeholder="ძებნა რეკლამის სახელით…"
                style={{ width: "100%", fontSize: 16, padding: 8, borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "inherit", marginBottom: 8 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...ads]
                  .filter((a) => a.adName.toLowerCase().includes(mapFilter.toLowerCase()))
                  .sort((a, b) => Number(!!resolve(a)) - Number(!!resolve(b)) || b.spend - a.spend)
                  .map((a) => {
                    const r = resolve(a);
                    return (
                      <div key={a.adId} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                        <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: 12 }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r ? undefined : "#fbbf24" }}>{a.adName}</div>
                          <div className="dg-muted" style={{ fontSize: 10 }}>{fmtGel(a.spend)} · {r ? (r.manual ? "ხელით" : "ავტომატური") : "არ არის მიბმული"}</div>
                        </div>
                        <select value={manual[a.adId] ?? ""} onChange={(e) => saveMap(a, e.target.value)}
                          style={{ flex: "1 1 160px", fontSize: 16, padding: 6, borderRadius: 8, background: "#111", color: "inherit", border: "1px solid rgba(255,255,255,0.15)" }}>
                          <option value="">{r && !r.manual ? `ავტო: ${r.product?.sku ?? r.key}` : "— აირჩიე პროდუქტი —"}</option>
                          {products.filter((p) => p.sku).sort((x, y) => (x.sku ?? "").localeCompare(y.sku ?? "")).map((p) => (
                            <option key={p.sku!} value={p.sku!}>{p.sku} — {(p.title ?? "").slice(0, 40)}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      {!error && !rows && !loading && <p className="dg-muted" style={{ fontSize: 13 }}>იტვირთება…</p>}
    </div>
  );
}
