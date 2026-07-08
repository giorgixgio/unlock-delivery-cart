import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Package, Scissors, Download, Loader2, CheckSquare, Square,
  MapPin, PlusCircle, RefreshCw, CheckCircle2,
} from "lucide-react";

/**
 * Packing — the single fulfilment tab.
 * Replaces Batches / Packing Waves / Packing List.
 *
 * Flow:
 *   Create session  → freezes confirmed orders into single-SKU + multi-SKU rounds
 *   Download CSV     → one courier file, single block then rounds, [S-###]/[R##-##] tags
 *   Pick a round     → bin-sorted pick-and-pack trip, drop into numbered parcels
 *   Mark packed      → per round
 */

type Item = { sku: string; title: string; quantity: number; product_id: string | null };
type Order = { id: string; public_order_number: string | null; customer_name: string | null; order_items: Item[] };
type WaveOrder = { order_id: string; classification: string; primary_sku: string | null; packing_status: string | null };
type Run = { id: string; run_number: number; slot_count: number; status: string | null };
type Slot = { id: string; run_id: string; slot_number: number; order_id: string; packing_status: string | null };
type Wave = { id: string; wave_number: number | null; status: string | null; created_at: string };

function cmpBin(a: string, b: string) {
  const av = (a || "").trim(), bv = (b || "").trim();
  if (av === "" && bv === "") return 0;
  if (av === "") return 1;
  if (bv === "") return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

export default function AdminPacking() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wave, setWave] = useState<Wave | null>(null);
  const [waveOrders, setWaveOrders] = useState<WaveOrder[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [binBySku, setBinBySku] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>("singles"); // "singles" | run_number as string
  const [roundSize, setRoundSize] = useState(10);
  const [downloading, setDownloading] = useState(false);

  const ordersById = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);

  const loadSessionData = useCallback(async (w: Wave) => {
    const [wo, rn, sl, ords] = await Promise.all([
      (supabase.from("packing_wave_orders") as any).select("order_id, classification, primary_sku, packing_status").eq("wave_id", w.id),
      (supabase.from("packing_runs") as any).select("id, run_number, slot_count, status").eq("wave_id", w.id).order("run_number"),
      (supabase.from("packing_run_slots") as any).select("id, run_id, slot_number, order_id, packing_status").eq("wave_id", w.id).order("slot_number"),
      (supabase.from("orders") as any).select("id, public_order_number, customer_name, order_items(sku, title, quantity, product_id)").eq("packing_wave_id", w.id),
    ]);
    const woData = (wo.data || []) as WaveOrder[];
    const ordData = (ords.data || []) as Order[];
    setWaveOrders(woData);
    setRuns((rn.data || []) as Run[]);
    setSlots((sl.data || []) as Slot[]);
    setOrders(ordData);

    // Bin lookup by SKU (degrades gracefully if column absent).
    const skus = [...new Set(ordData.flatMap((o) => (o.order_items || []).map((i) => String(i.sku || "")).filter(Boolean)))];
    if (skus.length) {
      let prods: any[] | null = null;
      const first = await (supabase.from("products") as any).select("sku, bin_location").in("sku", skus);
      if (first.error) {
        const fb = await (supabase.from("products") as any).select("sku").in("sku", skus);
        prods = fb.data;
      } else prods = first.data;
      const map: Record<string, string> = {};
      for (const p of prods || []) map[String(p.sku)] = String((p as any).bin_location ?? "");
      setBinBySku(map);
    } else setBinBySku({});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("packing_waves") as any)
      .select("id, wave_number, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setWave(data as Wave);
      await loadSessionData(data as Wave);
    } else {
      setWave(null);
    }
    setLoading(false);
  }, [loadSessionData]);

  useEffect(() => { load(); }, [load]);

  const createSession = async () => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-packing-session", {
      body: { round_size: roundSize, actor: "admin" },
    });
    setCreating(false);
    if (error) { toast({ title: "Couldn't create session", description: error.message, variant: "destructive" }); return; }
    if (data?.empty) { toast({ title: "No orders to pack", description: "No eligible confirmed orders right now." }); return; }
    toast({ title: `Session #${data.wave_number} created`, description: `${data.single_count} single · ${data.multi_count} multi · ${data.round_count} rounds` });
    setSelected(data.round_count > 0 ? "1" : "singles");
    await load();
  };

  const completeSession = async () => {
    if (!wave) return;
    await (supabase.from("packing_waves") as any).update({ status: "completed", completed_at: new Date().toISOString(), completed_by: "admin" }).eq("id", wave.id);
    toast({ title: "Session completed" });
    setSelected("singles");
    await load();
  };

  const downloadCsv = async () => {
    if (!wave) return;
    setDownloading(true);
    const { data, error } = await supabase.functions.invoke("export-courier", {
      body: { action: "download", courier: "trackings", wave_id: wave.id, round_size: roundSize },
    });
    setDownloading(false);
    if (error || !data?.rows) { toast({ title: "Export failed", description: error?.message, variant: "destructive" }); return; }
    const aoa = data.includeHeaders ? [data.columns, ...data.rows] : data.rows;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "orders");
    XLSX.writeFile(wb, `courier-session-${wave.wave_number}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    if (data.summary?.cut_guide) toast({ title: "CSV ready", description: data.summary.cut_guide });
  };

  // ── Derived: single-SKU grab list (bin-sorted, aggregated).
  const singleRows = useMemo(() => {
    const singleOrderIds = new Set(waveOrders.filter((w) => w.classification === "single_sku").map((w) => w.order_id));
    const agg: Record<string, { bin: string; sku: string; title: string; qty: number; orders: number }> = {};
    for (const oid of singleOrderIds) {
      const o = ordersById[oid];
      if (!o) continue;
      for (const it of o.order_items || []) {
        const bin = binBySku[String(it.sku)] || "";
        const key = `${bin}|${it.sku}|${it.title}`;
        if (!agg[key]) agg[key] = { bin, sku: String(it.sku), title: it.title, qty: 0, orders: 0 };
        agg[key].qty += Number(it.quantity || 1);
        agg[key].orders += 1;
      }
    }
    return Object.values(agg).sort((a, b) => cmpBin(a.bin, b.bin));
  }, [waveOrders, ordersById, binBySku]);

  const singleCount = useMemo(() => waveOrders.filter((w) => w.classification === "single_sku").length, [waveOrders]);
  const multiCount = useMemo(() => waveOrders.filter((w) => w.classification === "multi_sku").length, [waveOrders]);
  const effRoundSize = useMemo(() => runs.reduce((mx, r) => Math.max(mx, r.slot_count), 0) || roundSize, [runs, roundSize]);

  // ── Derived: pick-and-pack trip for the selected round.
  const runTrip = useMemo(() => {
    if (selected === "singles") return null;
    const run = runs.find((r) => String(r.run_number) === selected);
    if (!run) return null;
    const runSlots = slots.filter((s) => s.run_id === run.id).sort((a, b) => a.slot_number - b.slot_number);
    const agg: Record<string, { bin: string; sku: string; title: string; total: number; breakdown: { slot: number; qty: number }[] }> = {};
    for (const s of runSlots) {
      const o = ordersById[s.order_id];
      if (!o) continue;
      for (const it of o.order_items || []) {
        const bin = binBySku[String(it.sku)] || "";
        const key = `${bin}|${it.sku}|${it.title}`;
        if (!agg[key]) agg[key] = { bin, sku: String(it.sku), title: it.title, total: 0, breakdown: [] };
        agg[key].total += Number(it.quantity || 1);
        agg[key].breakdown.push({ slot: s.slot_number, qty: Number(it.quantity || 1) });
      }
    }
    const rows = Object.values(agg).sort((a, b) => cmpBin(a.bin, b.bin));
    const packed = runSlots.filter((s) => s.packing_status === "packed").length;
    return { run, rows, slots: runSlots, packed, total: runSlots.length };
  }, [selected, runs, slots, ordersById, binBySku]);

  const markRoundPacked = async (run: Run) => {
    const ids = slots.filter((s) => s.run_id === run.id).map((s) => s.id);
    await (supabase.from("packing_run_slots") as any).update({ packing_status: "packed", packed_at: new Date().toISOString(), packed_by: "admin" }).in("id", ids);
    await (supabase.from("packing_runs") as any).update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.id);
    setSlots((prev) => prev.map((s) => (s.run_id === run.id ? { ...s, packing_status: "packed" } : s)));
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "completed" } : r)));
    toast({ title: `Round ${run.run_number} packed` });
  };

  const runPacked = (run: Run) => run.status === "completed" || slots.filter((s) => s.run_id === run.id).every((s) => s.packing_status === "packed");

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>;
  }

  // ── Empty state: no active session.
  if (!wave) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="text-center py-10">
          <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-extrabold">Start a packing session</h1>
          <p className="text-sm text-muted-foreground mt-1">Freezes confirmed orders into single-SKU and multi-SKU rounds.</p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <span className="text-sm text-muted-foreground">Orders per round</span>
            <Input type="number" min={1} value={roundSize} onChange={(e) => setRoundSize(Math.max(1, parseInt(e.target.value || "10", 10) || 10))} className="w-20 h-9" />
          </div>
          <Button className="mt-4" onClick={createSession} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
            Create session
          </Button>
        </div>
      </div>
    );
  }

  const roundCount = runs.length;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
      {/* Session bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span className="font-semibold">Session #{wave.wave_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadCsv} disabled={downloading}>
                {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                Courier CSV
              </Button>
              <Button variant="ghost" size="icon" onClick={load} title="Refresh"><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {singleCount + multiCount} orders · {singleCount} single · {multiCount} multi
          </div>
          {multiCount > 0 && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-2 flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 shrink-0" />
              First {singleCount} slips = singles, then cut every {effRoundSize} for {roundCount} round{roundCount === 1 ? "" : "s"}
            </div>
          )}
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={completeSession}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Complete session
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Round selector */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5 px-1">Match your bundle's tag to a round</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={selected === "singles"} onClick={() => setSelected("singles")}>Singles ({singleCount})</Chip>
          {runs.map((r) => (
            <Chip key={r.id} active={selected === String(r.run_number)} packed={runPacked(r)} onClick={() => setSelected(String(r.run_number))}>
              R{String(r.run_number).padStart(2, "0")}{runPacked(r) ? " ✓" : ""}
            </Chip>
          ))}
        </div>
      </div>

      {/* Singles view */}
      {selected === "singles" && (
        <Card>
          <CardContent className="p-4">
            <div className="font-medium mb-1">Single-SKU grab list</div>
            <div className="text-xs text-muted-foreground mb-3">One loop, bin order. Each unit is a whole order — match to its slip by SKU.</div>
            {singleRows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No single-SKU orders in this session.</div>
            ) : singleRows.map((r, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5 border-t first:border-t-0">
                <BinTag bin={r.bin} />
                <div className="flex-1">
                  <div className="text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">grab {r.qty} · {r.orders} order{r.orders === 1 ? "" : "s"} · {r.sku}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Round view */}
      {runTrip && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Round {runTrip.run.run_number}</div>
              <div className="text-sm text-muted-foreground">{runTrip.packed} / {runTrip.total} packed</div>
            </div>
            <div className="text-xs text-muted-foreground mb-3">Walk the bins in order · drop each grab into the numbered parcels.</div>
            {runTrip.rows.map((r, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5 border-t first:border-t-0">
                <BinTag bin={r.bin} />
                <div className="flex-1">
                  <div className="text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    grab {r.total} → {r.breakdown.map((b) => `slot ${b.slot} ×${b.qty}`).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
            <Button className="w-full mt-3" onClick={() => markRoundPacked(runTrip.run)} disabled={runPacked(runTrip.run)}>
              {runPacked(runTrip.run) ? <><CheckSquare className="w-4 h-4 mr-2" /> Round packed</> : <><Square className="w-4 h-4 mr-2" /> Mark round packed</>}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Chip({ children, active, packed, onClick }: { children: ReactNode; active?: boolean; packed?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
        (active
          ? "bg-blue-50 text-blue-700 border-blue-400 border-2 font-medium"
          : packed
          ? "border-green-200 text-green-700 bg-green-50"
          : "border-border text-muted-foreground hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}

function BinTag({ bin }: { bin: string }) {
  return (
    <span className="font-mono text-xs bg-muted rounded px-2 py-1 whitespace-nowrap flex items-center gap-1">
      <MapPin className="w-3 h-3" /> {bin || "—"}
    </span>
  );
}
