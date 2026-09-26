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

interface ProductLite {
  sku: string | null;
  title: string | null;
}

const fmtGel = (n: number) => `${n.toFixed(2)} ₾`;

export default function MetaAdsSection({ dateMode, selectedDate, range }: Props) {
  const [rows, setRows] = useState<MetaSkuRow[] | null>(null);
  const [unmatched, setUnmatched] = useState<{ ads: number; spend: number } | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { data } = await supabase.from("products").select("sku, title").limit(1000);
      if (!cancelled) setProducts(data ?? []);
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
      setRows(data?.items ?? []);
      setUnmatched(data?.unmatched ?? null);
    } catch (e: any) {
      setError(e?.message ?? "ჩატვირთვა ვერ მოხერხდა");
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [since, until]);

  const productByCode = useMemo(() => {
    const map = new Map<string, ProductLite>();
    for (const p of products) {
      const sku = (p.sku ?? "").toLowerCase();
      const m = sku.match(/(\d{3,4})(?:_\d+)?$/);
      if (m) map.set(m[1], p);
    }
    return map;
  }, [products]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const purchases = rows.reduce((s, r) => s + r.purchases, 0);
    return { spend, purchases, cpa: purchases > 0 ? spend / purchases : null };
  }, [rows]);

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
        ხარჯი და შენაძენი (Purchase) Meta-დან · {since} → {until} · CPA = ხარჯი ÷ შენაძენი
      </p>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f87171", fontSize: 13, padding: "10px 0" }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!error && rows && totals && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
            <span>სულ ხარჯი: <b>{fmtGel(totals.spend)}</b></span>
            <span>შენაძენი: <b>{totals.purchases}</b></span>
            <span>საშ. CPA: <b>{totals.cpa != null ? fmtGel(totals.cpa) : "—"}</b></span>
          </div>

          {rows.length === 0 && <p className="dg-muted" style={{ fontSize: 13 }}>ამ პერიოდში ხარჯი არ არის.</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {rows.map((r) => {
              const p = productByCode.get(r.skuCode);
              return (
                <div key={r.skuCode} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, display: "flex", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p?.title ?? `SKU ${r.skuCode}`}
                    </div>
                    <div className="dg-muted" style={{ fontSize: 10 }}>{p?.sku ?? r.skuCode} · {r.ads} რეკლამა</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
                      <span>ხარჯი <b>{fmtGel(r.spend)}</b></span>
                      <span>შენ. <b>{r.purchases}</b></span>
                      <span>
                        CPA{" "}
                        <b style={{ color: r.cpa == null ? undefined : r.cpa <= 5 ? "#4ade80" : r.cpa <= 10 ? "#fbbf24" : "#f87171" }}>
                          {r.cpa != null ? fmtGel(r.cpa) : "—"}
                        </b>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {unmatched && unmatched.ads > 0 && (
            <p className="dg-muted" style={{ fontSize: 11, marginTop: 10 }}>
              {unmatched.ads} რეკლამა ({fmtGel(unmatched.spend)}) ვერ დაერთა პროდუქტს — სახელში SKU კოდი არ არის.
            </p>
          )}
        </>
      )}

      {!error && !rows && !loading && <p className="dg-muted" style={{ fontSize: 13 }}>იტვირთება…</p>}
    </div>
  );
}
