import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Wand2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { classifyCity, loadCityRef, CityRef, CityResult } from "@/lib/cityQa";

interface OrderRow {
  id: string;
  public_order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  city: string | null;
  raw_city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  tracking_number: string | null;
  created_at: string;
}

interface Row {
  order: OrderRow;
  result: CityResult;
  /** operator override for needs_review / unresolvable rows */
  override: string;
  remember: boolean;
  done: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const AdminCityQA = () => {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [unexportedOnly, setUnexportedOnly] = useState(true);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ref, setRef] = useState<CityRef | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const cityRef = await loadCityRef();
      setRef(cityRef);
      let q = (supabase.from("orders") as any)
        .select("id, public_order_number, customer_name, customer_phone, city, raw_city, address_line1, address_line2, tracking_number, created_at")
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (unexportedOnly) q = q.is("tracking_number", null);
      const { data, error } = await q;
      if (error) throw error;
      const list: Row[] = (data || []).map((o: OrderRow) => ({
        order: o,
        result: classifyCity(o.city || o.raw_city || "", cityRef),
        override: "",
        remember: false,
        done: false,
      }));
      setRows(list);
    } catch (e: any) {
      toast({ title: "Scan failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const persistFix = async (row: Row, newCity: string, leftover: string | null) => {
    const o = row.order;
    const patch: Record<string, any> = { city: newCity };
    if (!o.raw_city || !o.raw_city.trim()) patch.raw_city = o.city || "";
    patch.normalized_city = newCity;
    if (leftover) {
      const addr = `${o.address_line1 || ""} ${o.address_line2 || ""}`.toLowerCase();
      if (!addr.includes(leftover.toLowerCase())) {
        patch.address_line2 = [o.address_line2, leftover].filter(Boolean).join(", ");
      }
    }
    const { error } = await (supabase.from("orders") as any).update(patch).eq("id", o.id);
    if (error) throw error;
  };

  const applyAllAutoFixes = async () => {
    if (!rows) return;
    const targets = rows.filter((r) => r.result.status === "auto_fix" && !r.done);
    if (!targets.length) return;
    setApplying(true);
    let ok = 0;
    for (const r of targets) {
      try {
        await persistFix(r, r.result.city!, r.result.leftover);
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    setRows((prev) => prev!.map((r) => (targets.includes(r) ? { ...r, done: true } : r)));
    setApplying(false);
    toast({ title: `Applied ${ok} of ${targets.length} fixes` });
  };

  const resolveRow = async (row: Row, value: string) => {
    const city = value.trim();
    if (!city) return;
    try {
      await persistFix(row, city, row.result.leftover);
      if (row.remember && ref) {
        const alias = (row.result.cleaned || row.order.city || "").toLowerCase();
        const zoneId = ref.zones.find((z) => z.city.trim().toLowerCase() === city.toLowerCase())?.zoneId ?? null;
        if (alias) {
          await (supabase.from("city_aliases") as any)
            .upsert(
              { alias_normalized: alias, canonical_city: city, zone_id: zoneId, source: "operator_confirmed" },
              { onConflict: "alias_normalized" },
            );
        }
      }
      setRows((prev) => prev!.map((r) => (r === row ? { ...r, done: true } : r)));
      toast({ title: `Order ${row.order.public_order_number || ""} set to ${city}` });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const group = (s: CityResult["status"]) => (rows || []).filter((r) => r.result.status === s);
  const valid = group("valid");
  const autoFix = group("auto_fix");
  const review = group("needs_review");
  const bad = group("unresolvable");

  const label = (r: Row) =>
    `${r.order.public_order_number || r.order.id.slice(0, 8)} · ${r.order.customer_name || "—"} · ${r.order.customer_phone || "—"}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">City QA</h1>
        <p className="text-sm text-muted-foreground">Find and fix bad city names before sending orders to the courier.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-lg p-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-background" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-background" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unexportedOnly} onChange={(e) => setUnexportedOnly(e.target.checked)} />
          Not sent to courier yet
        </label>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Scan
        </Button>
        {autoFix.length > 0 && (
          <Button variant="secondary" onClick={applyAllAutoFixes} disabled={applying}>
            {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Apply all {autoFix.filter((r) => !r.done).length} auto-fixes
          </Button>
        )}
      </div>

      {rows && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { n: valid.length, t: "Valid", c: "text-emerald-600" },
            { n: autoFix.length, t: "Auto-fixable", c: "text-blue-600" },
            { n: review.length, t: "Needs review", c: "text-amber-600" },
            { n: bad.length, t: "Unresolvable", c: "text-destructive" },
          ].map((s) => (
            <div key={s.t} className="bg-card border border-border rounded-lg p-4">
              <div className={`text-2xl font-bold ${s.c}`}>{s.n}</div>
              <div className="text-xs text-muted-foreground">{s.t}</div>
            </div>
          ))}
        </div>
      )}

      {autoFix.length > 0 && (
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <h2 className="p-3 font-bold text-sm flex items-center gap-2 border-b border-border">
            <Wand2 className="w-4 h-4 text-blue-600" /> Auto-fixable ({autoFix.length})
          </h2>
          <div className="divide-y divide-border max-h-[420px] overflow-auto">
            {autoFix.map((r) => (
              <div key={r.order.id} className="p-3 text-sm flex flex-wrap gap-x-3 gap-y-1 items-center">
                <span className="font-mono text-xs">{label(r)}</span>
                <span className="text-amber-600">{r.order.city}</span>
                <span>→</span>
                <span className="font-semibold text-emerald-700">{r.result.city}</span>
                <span className="text-xs text-muted-foreground">{r.result.reason}</span>
                {r.result.leftover && <span className="text-xs text-muted-foreground">(moves “{r.result.leftover}” to address)</span>}
                {r.done && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {review.length > 0 && (
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <h2 className="p-3 font-bold text-sm flex items-center gap-2 border-b border-border">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Needs review ({review.length})
          </h2>
          <div className="divide-y divide-border max-h-[520px] overflow-auto">
            {review.map((r) => (
              <ReviewRow key={r.order.id} row={r} label={label(r)} onChange={(patch) => setRows((prev) => prev!.map((x) => (x === r ? { ...x, ...patch } : x)))} onResolve={(v) => resolveRow(r, v)} />
            ))}
          </div>
        </section>
      )}

      {bad.length > 0 && (
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <h2 className="p-3 font-bold text-sm flex items-center gap-2 border-b border-border">
            <XCircle className="w-4 h-4 text-destructive" /> Unresolvable ({bad.length})
          </h2>
          <div className="divide-y divide-border max-h-[420px] overflow-auto">
            {bad.map((r) => (
              <ReviewRow key={r.order.id} row={r} label={label(r)} onChange={(patch) => setRows((prev) => prev!.map((x) => (x === r ? { ...x, ...patch } : x)))} onResolve={(v) => resolveRow(r, v)} />
            ))}
          </div>
        </section>
      )}

      {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">No orders in this range.</p>}
    </div>
  );
};

const ReviewRow = ({
  row,
  label,
  onChange,
  onResolve,
}: {
  row: Row;
  label: string;
  onChange: (patch: Partial<Row>) => void;
  onResolve: (value: string) => void;
}) => {
  const [choice, setChoice] = useState<string>(row.result.candidates[0]?.city || "");
  const value = row.override.trim() || choice;
  return (
    <div className="p-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-mono text-xs">{label}</span>
        <span className="text-amber-600">“{row.order.city}”</span>
        <span className="text-xs text-muted-foreground">{row.result.reason}</span>
        {row.done && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-background">
          <option value="">Keep original</option>
          {row.result.candidates.map((c) => (
            <option key={c.city} value={c.city}>{c.city}</option>
          ))}
        </select>
        <input
          placeholder="or type the correct city"
          value={row.override}
          onChange={(e) => onChange({ override: e.target.value })}
          className="border border-border rounded px-2 py-1 text-sm bg-background w-56"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={row.remember} onChange={(e) => onChange({ remember: e.target.checked })} />
          Remember this fix
        </label>
        <Button size="sm" disabled={!value || row.done} onClick={() => onResolve(value)}>Save</Button>
      </div>
    </div>
  );
};

export default AdminCityQA;
