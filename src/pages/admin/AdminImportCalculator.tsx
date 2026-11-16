import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { computeLogistics, logisticsUsd, unitEconomics, batchTotals, type ShipMode, type PackingInput } from "@/lib/importCalculator";

type Num = number | null;
interface Inputs {
  name: string; productId: string | null; productSku: string | null; productImage: string | null;
  buyUsd: Num; qty: Num; sellGel: Num; rate: number;
  packing: PackingInput; landRateCbm: number; landRateKg: number; airRateKg: number; airDivisor: number;
  mode: ShipMode; cpaUsd: number; cancelPct: number; failPct: number; unitsPerOrder: number;
  courierFeeGel: number; failedFeeGel: number; cardFeePct: number; notes: string;
}
const DEFAULTS: Inputs = {
  name: "", productId: null, productSku: null, productImage: null, buyUsd: null, qty: 100, sellGel: null, rate: 2.7,
  packing: {}, landRateCbm: 270, landRateKg: 1, airRateKg: 12, airDivisor: 6000, mode: "land",
  cpaUsd: 1.5, cancelPct: 15, failPct: 22, unitsPerOrder: 1, courierFeeGel: 7, failedFeeGel: 7, cardFeePct: 0, notes: "",
};
const SETTING_KEYS = { rate: "calc_usd_gel_rate", landRateCbm: "calc_land_rate_cbm", landRateKg: "calc_land_rate_kg", airRateKg: "calc_air_rate_kg", airDivisor: "calc_air_divisor" } as const;
const QTYS = [50, 100, 200, 500, 1000];

const f2 = (n: number) => (isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const f0 = (n: number) => (isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
const pn = (s: string): Num => (s.trim() === "" ? null : Number(s));
const tone = (n: number) => (n >= 0 ? "text-success" : "text-destructive");

function NumField({ label, value, onChange, step = "any", suffix }: { label: string; value: Num | undefined; onChange: (v: Num) => void; step?: string; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}{suffix ? ` (${suffix})` : ""}</Label>
      <Input type="number" inputMode="decimal" step={step} className="text-base" value={value ?? ""} onChange={(e) => onChange(pn(e.target.value))} />
    </div>
  );
}
function SliderField({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-1">
          <Input type="number" inputMode="decimal" step={step} className="h-9 w-24 text-base" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      <Slider min={min} max={max} step={step} value={[Math.min(max, Math.max(min, value))]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${className}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

interface Saved { id: string; name: string; product_id: string | null; product_sku: string | null; inputs: any; results: any; created_at: string }
interface Prod { id: string; title: string; sku: string; price: number; image: string }

export default function AdminImportCalculator() {
  const { user, role } = useAdminAuth();
  const [i, setI] = useState<Inputs>(DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Prod[]>([]);
  const [relinkId, setRelinkId] = useState<string | null>(null);
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setI((p) => ({ ...p, [k]: v }));
  const setP = (k: keyof PackingInput, v: Num) => setI((p) => ({ ...p, packing: { ...p.packing, [k]: v } }));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_settings").select("key,value").in("key", Object.values(SETTING_KEYS));
      const m = Object.fromEntries((data || []).map((r: any) => [r.key, Number(r.value)]));
      setI((p) => {
        const n = { ...p };
        (Object.keys(SETTING_KEYS) as (keyof typeof SETTING_KEYS)[]).forEach((k) => { const v = m[SETTING_KEYS[k]]; if (v > 0) (n as any)[k] = v; });
        return n;
      });
    })();
    loadSaved();
  }, []);

  const loadSaved = async () => {
    const { data } = await supabase.from("import_calculations").select("*").order("created_at", { ascending: false }).limit(200);
    setSaved((data as Saved[]) || []);
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim();
      if (s.length < 2) return setResults([]);
      const { data } = await supabase.from("products").select("id,title,sku,price,image").or(`title.ilike.%${s.replace(/[,()]/g, " ")}%,sku.ilike.%${s.replace(/[,()]/g, " ")}%`).limit(10);
      setResults((data as Prod[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pickProduct = async (p: Prod) => {
    setQ(""); setResults([]);
    if (relinkId) {
      const { error } = await supabase.from("import_calculations").update({ product_id: p.id, product_sku: p.sku, updated_at: new Date().toISOString() }).eq("id", relinkId);
      setRelinkId(null);
      if (error) toast.error(error.message); else { toast.success(`Linked to ${p.sku}`); loadSaved(); }
      return;
    }
    setI((x) => ({ ...x, productId: p.id, productSku: p.sku, productImage: p.image, name: p.title, sellGel: Number(p.price) }));
  };

  const qty = Math.max(0, Math.floor(i.qty || 0));
  const rates = { landRateCbm: i.landRateCbm, landRateKg: i.landRateKg, airRateKg: i.airRateKg, airDivisor: i.airDivisor };
  const funnel = { cpaUsd: i.cpaUsd, cancelPct: i.cancelPct, failPct: i.failPct, unitsPerOrder: i.unitsPerOrder, courierFeeGel: i.courierFeeGel, failedFeeGel: i.failedFeeGel, cardFeePct: i.cardFeePct };

  const calc = useMemo(() => {
    const at = (n: number) => {
      const log = computeLogistics(n, i.packing, rates);
      const goodsUsd = (i.buyUsd || 0) * n;
      const logUsd = logisticsUsd(log, i.mode);
      const landedGel = n > 0 ? ((goodsUsd + logUsd) * i.rate) / n : 0;
      return { log, goodsUsd, logUsd, landedGel, cashOutGel: (goodsUsd + logUsd) * i.rate };
    };
    const main = at(qty);
    const u = unitEconomics(main.landedGel, i.sellGel || 0, i.rate, funnel);
    const b = batchTotals(qty, main.goodsUsd * i.rate, main.logUsd * i.rate, u, funnel);
    const table = [...new Set([...QTYS, qty])].filter((n) => n > 0).sort((a, b) => a - b).map((n) => ({ n, ...at(n) }));
    return { ...main, u, b, table };
  }, [i, qty]);

  const { log, u, b } = calc;
  const cheaper: ShipMode | null = log.hasData ? (log.land.cost <= log.air.cost ? "land" : "air") : null;

  const saveDefaults = async () => {
    const rows = (Object.keys(SETTING_KEYS) as (keyof typeof SETTING_KEYS)[]).map((k) => ({ key: SETTING_KEYS[k], value: String(i[k]), updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) toast.error(error.message); else toast.success("Saved as default");
  };

  const save = async (requireProduct: boolean, asNew = false) => {
    if (requireProduct && !i.productId) return toast.error("Pick a catalog product first");
    const name = i.name.trim() || window.prompt("Calculation name") || "";
    if (!name) return;
    const payload = {
      name, product_id: i.productId, product_sku: i.productSku, notes: i.notes || null, created_by: user?.email ?? null,
      inputs: { ...i, name } as any,
      results: { qty, landedPerUnitGel: calc.landedGel, profitPerOrder: u.profit, batchProfit: b.profit, breakEvenCpaUsd: u.breakEvenCpaUsd, cashInflow: b.revenue, logisticsUsd: calc.logUsd, mode: i.mode },
      updated_at: new Date().toISOString(),
    };
    const res = editingId && !asNew
      ? await supabase.from("import_calculations").update(payload).eq("id", editingId).select("id").single()
      : await supabase.from("import_calculations").insert(payload).select("id").single();
    if (res.error) return toast.error(res.error.message);
    setEditingId(res.data.id); set("name", name); toast.success("Saved"); loadSaved();
  };

  const openSaved = (s: Saved) => { setI({ ...DEFAULTS, ...s.inputs, productId: s.product_id, productSku: s.product_sku }); setEditingId(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const duplicate = async (s: Saved) => {
    const { id, created_at, ...rest } = s as any;
    const { error } = await supabase.from("import_calculations").insert({ ...rest, name: `${s.name} (copy)`, created_by: user?.email ?? null });
    if (error) toast.error(error.message); else loadSaved();
  };
  const remove = async (s: Saved) => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    const { error } = await supabase.from("import_calculations").delete().eq("id", s.id);
    if (error) toast.error(error.message); else { if (editingId === s.id) setEditingId(null); loadSaved(); }
  };

  if (role && role !== "admin") return <div className="p-6 text-muted-foreground">Admins only.</div>;

  const pk = i.packing;
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Import & Profit Calculator</h1>
        {editingId && <Button variant="outline" size="sm" onClick={() => { setI({ ...DEFAULTS, rate: i.rate, landRateCbm: i.landRateCbm, landRateKg: i.landRateKg, airRateKg: i.airRateKg, airDivisor: i.airDivisor }); setEditingId(null); }}>New calculation</Button>}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Profit per order" value={`${f2(u.profit)}₾`} sub={`${f0(u.margin * 100)}% margin`} className={tone(u.profit)} />
        <Stat label="Batch profit" value={`${f0(b.profit)}₾`} sub={`ROI ${f0(b.roi * 100)}%`} className={tone(b.profit)} />
        <Stat label="Break-even CPA" value={`$${f2(u.breakEvenCpaUsd)}`} sub="max you can pay per lead" className="text-primary" />
        <Stat label="Cash inflow" value={`${f0(b.revenue)}₾`} sub={`${f0(b.deliveredOrders)} delivered orders`} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">1. Product & purchase</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="relative space-y-1">
            <Label className="text-xs text-muted-foreground">{relinkId ? "Pick product to link the saved calculation" : "Link catalog product (search title / SKU)"}</Label>
            <Input className="text-base" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg">
                {results.map((p) => (
                  <button key={p.id} className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent" onClick={() => pickProduct(p)}>
                    {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />}
                    <span className="flex-1 truncate text-sm">{p.title}</span>
                    <span className="text-xs text-muted-foreground">{p.sku} · {p.price}₾</span>
                  </button>
                ))}
              </div>
            )}
            {relinkId && <Button size="sm" variant="ghost" onClick={() => setRelinkId(null)}>Cancel re-link</Button>}
          </div>
          {i.productId && (
            <div className="flex items-center gap-2 rounded-md border p-2">
              {i.productImage && <img src={i.productImage} alt="" className="h-10 w-10 rounded object-cover" />}
              <span className="flex-1 text-sm">Linked: <b>{i.productSku}</b></span>
              <Button size="sm" variant="ghost" onClick={() => setI((x) => ({ ...x, productId: null, productSku: null, productImage: null }))}>Unlink</Button>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Product name</Label>
            <Input className="text-base" value={i.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Purchase price / unit" suffix="USD" value={i.buyUsd} onChange={(v) => set("buyUsd", v)} />
            <NumField label="Selling price / unit" suffix="GEL" value={i.sellGel} onChange={(v) => set("sellGel", v)} />
            <NumField label="Quantity" suffix="units" step="1" value={i.qty} onChange={(v) => set("qty", v)} />
            <NumField label="USD → GEL rate" value={i.rate} onChange={(v) => set("rate", v || 0)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {QTYS.map((n) => <Button key={n} size="sm" variant={qty === n ? "default" : "outline"} onClick={() => set("qty", n)}>{n}</Button>)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">2. Packing & logistics</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">Carton</div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
              <NumField label="L" suffix="cm" value={pk.cartonL} onChange={(v) => setP("cartonL", v)} />
              <NumField label="W" suffix="cm" value={pk.cartonW} onChange={(v) => setP("cartonW", v)} />
              <NumField label="H" suffix="cm" value={pk.cartonH} onChange={(v) => setP("cartonH", v)} />
              <NumField label="Units / carton" step="1" value={pk.unitsPerCarton} onChange={(v) => setP("unitsPerCarton", v)} />
              <NumField label="Gross kg / carton" value={pk.cartonKg} onChange={(v) => setP("cartonKg", v)} />
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">…or per unit (used when no carton info)</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumField label="Unit kg" value={pk.unitKg} onChange={(v) => setP("unitKg", v)} />
              <NumField label="Unit L" suffix="cm" value={pk.unitL} onChange={(v) => setP("unitL", v)} />
              <NumField label="Unit W" suffix="cm" value={pk.unitW} onChange={(v) => setP("unitW", v)} />
              <NumField label="Unit H" suffix="cm" value={pk.unitH} onChange={(v) => setP("unitH", v)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <NumField label="Total CBM override" value={pk.totalCbmOverride} onChange={(v) => setP("totalCbmOverride", v)} />
            <NumField label="Total kg override" value={pk.totalKgOverride} onChange={(v) => setP("totalKgOverride", v)} />
            {!log.hasData && <NumField label="Manual logistics / unit" suffix="USD" value={pk.manualLogisticsPerUnitUsd} onChange={(v) => setP("manualLogisticsPerUnitUsd", v)} />}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Land USD / CBM" value={i.landRateCbm} onChange={(v) => set("landRateCbm", v || 0)} />
            <NumField label="Land USD / kg" value={i.landRateKg} onChange={(v) => set("landRateKg", v || 0)} />
            <NumField label="Air USD / kg" value={i.airRateKg} onChange={(v) => set("airRateKg", v || 0)} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Air divisor</Label>
              <div className="flex gap-2">{[5000, 6000].map((d) => <Button key={d} size="sm" className="flex-1" variant={i.airDivisor === d ? "default" : "outline"} onClick={() => set("airDivisor", d)}>{d}</Button>)}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={saveDefaults}>Save rates & exchange rate as default</Button>

          {log.hasData ? (
            <>
              <div className="text-sm text-muted-foreground">
                {log.cartons > 0 && <>Cartons: <b>{log.cartons}</b> · </>}Total CBM: <b>{log.totalCbm.toFixed(3)}</b> · Total kg: <b>{f2(log.totalKg)}</b>
                {log.density !== null && <> · Density: <b>{f0(log.density)} kg/CBM</b> (break-even {f0(log.breakEvenDensity)}: above → weight, below → volume)</>}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["land", "air"] as ShipMode[]).map((m) => (
                  <button key={m} onClick={() => set("mode", m)} className={`rounded-lg border-2 p-3 text-left transition ${i.mode === m ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{m === "land" ? "🚚 Land" : "✈️ Air"}{i.mode === m && " · used"}</span>
                      {cheaper === m && <Badge>cheaper</Badge>}
                    </div>
                    {m === "land" ? (
                      <div className="mt-1 space-y-0.5 text-sm">
                        <div>By volume: ${f2(log.land.byVolume)} · By weight: ${f2(log.land.byWeight)}</div>
                        <div className="text-2xl font-bold">${f2(log.land.cost)}</div>
                        <div className="text-xs font-semibold text-primary">Charged by {log.land.chargedBy}</div>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-0.5 text-sm">
                        <div>Volumetric {f2(log.air.volumetricKgPerCarton)} kg vs actual {f2(log.air.actualKgPerCarton)} kg{log.cartons > 0 ? " per carton" : ""} → chargeable {f2(log.air.chargeableKg)} kg</div>
                        <div className="text-2xl font-bold">${f2(log.air.cost)}</div>
                        <div className="text-xs font-semibold text-primary">Charged by {log.air.chargedBy} weight</div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{log.manual ? "Using manual logistics per unit." : "No weight/dimensions entered — logistics counted as 0 unless you add a manual cost per unit."}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">3. Cost & cash</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Goods" value={`$${f2(calc.goodsUsd)}`} sub={`${f2(calc.goodsUsd * i.rate)}₾`} />
            <Stat label={`Logistics (${log.manual ? "manual" : i.mode})`} value={`$${f2(calc.logUsd)}`} sub={`${f2(calc.logUsd * i.rate)}₾`} />
            <Stat label="Landed / unit" value={`${f2(calc.landedGel)}₾`} />
            <Stat label="Total cash out" value={`${f0(calc.cashOutGel)}₾`} />
            <Stat label="Logistics % of goods" value={calc.goodsUsd > 0 ? `${f0((calc.logUsd / calc.goodsUsd) * 100)}%` : "—"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Qty</th><th>Landed / unit</th><th>Total cash out</th></tr></thead>
              <tbody>{calc.table.map((r) => (
                <tr key={r.n} className={`border-b ${r.n === qty ? "font-bold" : ""}`}><td className="py-1">{r.n}{r.n === qty ? " (selected)" : ""}</td><td>{f2(r.landedGel)}₾</td><td>{f0(r.cashOutGel)}₾</td></tr>
              ))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">4. Unit economics (COD funnel)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SliderField label="Meta CPA per lead" suffix="USD" value={i.cpaUsd} onChange={(v) => set("cpaUsd", v)} min={0.2} max={10} step={0.05} />
          <SliderField label="Lead cancel rate" suffix="%" value={i.cancelPct} onChange={(v) => set("cancelPct", v)} min={0} max={60} step={1} />
          <SliderField label="Delivery fail rate" suffix="%" value={i.failPct} onChange={(v) => set("failPct", v)} min={0} max={60} step={1} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Units per order" step="1" value={i.unitsPerOrder} onChange={(v) => set("unitsPerOrder", v || 1)} />
            <NumField label="Courier fee / delivered" suffix="GEL" value={i.courierFeeGel} onChange={(v) => set("courierFeeGel", v || 0)} />
            <NumField label="Cost / failed delivery" suffix="GEL" value={i.failedFeeGel} onChange={(v) => set("failedFeeGel", v || 0)} />
            <NumField label="Card fee" suffix="% revenue" value={i.cardFeePct} onChange={(v) => set("cardFeePct", v || 0)} />
          </div>
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-3 text-center">
            <div className="text-sm">You can pay up to</div>
            <div className="text-3xl font-bold text-primary">${f2(u.breakEvenCpaUsd)} per lead</div>
            <div className="text-xs text-muted-foreground">{u.maxFailPct !== null ? `At current CPA, delivery fail rate can go up to ${f0(u.maxFailPct)}% before losing money` : "Losing money even with 0% delivery fails at this CPA"}</div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Delivered per lead", `${f0(u.deliveredRate * 100)}% (${f2(u.leadsPerDelivered)} leads per delivered order)`],
                ["Revenue per order", `${f2(u.revenue)}₾`],
                ["Product (landed)", `−${f2(u.productCost)}₾`],
                ["Courier fee", `−${f2(i.courierFeeGel)}₾`],
                ["Ad cost per delivered order", `−${f2(u.adCost)}₾`],
                ["Failed deliveries", `−${f2(u.failedCost)}₾`],
                ["Card fee", `−${f2(u.cardFee)}₾`],
              ].map(([a, v]) => <tr key={a} className="border-b"><td className="py-1 text-muted-foreground">{a}</td><td className="text-right">{v}</td></tr>)}
              <tr><td className="py-2 font-bold">Real profit per delivered order</td><td className={`text-right text-lg font-bold ${tone(u.profit)}`}>{f2(u.profit)}₾ ({f0(u.margin * 100)}%)</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">5. Batch totals ({qty} units)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Delivered orders" value={f0(b.deliveredOrders)} />
            <Stat label="Leads needed" value={f0(b.leads)} />
            <Stat label="Confirmed orders" value={f0(b.confirmed)} />
            <Stat label="Failed deliveries" value={f0(b.failed)} />
            <Stat label="Ad spend" value={`${f0(b.adSpend)}₾`} />
            <Stat label="Courier fees" value={`${f0(b.courierFees)}₾`} />
            <Stat label="Failed delivery costs" value={`${f0(b.failedCosts)}₾`} />
            <Stat label="Revenue (COD inflow)" value={`${f0(b.revenue)}₾`} />
            <Stat label="Batch profit" value={`${f0(b.profit)}₾`} className={tone(b.profit)} />
            <Stat label="ROI" value={`${f0(b.roi * 100)}%`} className={tone(b.roi)} />
            <Stat label="Peak cash needed" value={`${f0(b.peakCash)}₾`} sub="goods + logistics + ads" />
            <Stat label="Total cash out" value={`${f0(b.totalCashOut)}₾`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">6. Save</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea placeholder="Notes" value={i.notes} onChange={(e) => set("notes", e.target.value)} className="text-base" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(false)}>{editingId ? "Save changes" : "Save calculation"}</Button>
            <Button variant="secondary" onClick={() => save(true)}>Save & link to product</Button>
            {editingId && <Button variant="outline" onClick={() => save(false, true)}>Save as new</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Saved calculations</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {saved.length === 0 ? <div className="text-sm text-muted-foreground">Nothing saved yet.</div> : (
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Name</th><th>Product</th><th>Qty</th><th>Landed/unit</th><th>Profit/order</th><th>Batch profit</th><th>Date</th><th /></tr></thead>
              <tbody>{saved.map((s) => (
                <tr key={s.id} className={`border-b ${editingId === s.id ? "bg-primary/5" : ""}`}>
                  <td className="py-1 font-medium">{s.name}</td>
                  <td>{s.product_sku || "—"}</td>
                  <td>{s.results?.qty ?? "—"}</td>
                  <td>{f2(Number(s.results?.landedPerUnitGel))}₾</td>
                  <td className={tone(Number(s.results?.profitPerOrder))}>{f2(Number(s.results?.profitPerOrder))}₾</td>
                  <td className={tone(Number(s.results?.batchProfit))}>{f0(Number(s.results?.batchProfit))}₾</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => openSaved(s)}>Open</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRelinkId(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); toast("Search a product above to link"); }}>Link</Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicate(s)}>Duplicate</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s)}>Delete</Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
