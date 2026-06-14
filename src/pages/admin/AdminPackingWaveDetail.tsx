import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Sticker, Upload, CheckCircle2, Plus } from "lucide-react";
import * as XLSX from "xlsx";
import {
  fetchWave, fetchWaveOrders, fetchRuns, fetchWaveRunSlots,
  markStickersPrinted, markWaveExported, completeWave,
  createRun, importTrackingForWave, markRunPacked,
  type PackingWave, type WaveOrderRow, type PackingRun, type RunSlot,
} from "@/lib/packingWaveService";
import { supabase } from "@/integrations/supabase/client";

const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  exported: "bg-blue-100 text-blue-700",
  tracking_imported: "bg-indigo-100 text-indigo-700",
  packing: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  issue: "bg-rose-100 text-rose-700",
};

const ONWAY_HEADERS: Record<string, string> = {
  A: "Shipping First Name", B: "Shipping Address 1 & 2", C: "Shipping City",
  D: "დამატებით ლოკაცია", E: "Shipping Address Phone", F: "წონა",
  G: "Order Item Quantity", H: "Order Number", I: "SKU", J: "დამატებიტი სერვისი",
  K: "Total Price Presentment Amount", L: "დამატებით სერვისებს და შიპინგს იხდის მიმღები",
  M: "ტერმინალი", N: "SPO", O: "Note", P: "გამგზავნის სახელი", Q: "გამგზავნის მისამართი",
  R: "გამგზავნის ქალაქი", S: "გამგზავნის ტელეფონი", T: "გამგზავნი კომპანია",
  U: "მომსახურების დონე", V: "თიფი",
};

const AdminPackingWaveDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAdminAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wave, setWave] = useState<PackingWave | null>(null);
  const [orders, setOrders] = useState<WaveOrderRow[]>([]);
  const [runs, setRuns] = useState<PackingRun[]>([]);
  const [skuSummary, setSkuSummary] = useState<{ sku: string; title: string; parcels: number; qty: number }[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [slotCount, setSlotCount] = useState(24);
  const [courier, setCourier] = useState<"onway" | "trackings">("onway");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [w, wo, r] = await Promise.all([fetchWave(id), fetchWaveOrders(id), fetchRuns(id)]);
      setWave(w);
      setOrders(wo);
      setRuns(r);
      // Load order_items for SKU summary
      const orderIds = wo.map((o) => o.order_id);
      if (orderIds.length) {
        const { data: items } = await (supabase as any)
          .from("order_items").select("order_id, sku, title, quantity").in("order_id", orderIds);
        const byOrder: Record<string, any[]> = {};
        const skuMap = new Map<string, { title: string; parcels: Set<string>; qty: number }>();
        for (const it of (items || []) as any[]) {
          (byOrder[it.order_id] ||= []).push(it);
        }
        // Build single-SKU summary
        for (const o of wo) {
          if (o.classification !== "single_sku") continue;
          const its = byOrder[o.order_id] || [];
          if (!its.length) continue;
          const sku = its[0].sku || "";
          const title = its[0].title || "";
          const qty = its.reduce((s, x) => s + (x.quantity || 0), 0);
          if (!skuMap.has(sku)) skuMap.set(sku, { title, parcels: new Set(), qty: 0 });
          const e = skuMap.get(sku)!;
          e.parcels.add(o.order_id);
          e.qty += qty;
        }
        setOrderItems(byOrder);
        setSkuSummary(
          Array.from(skuMap.entries())
            .map(([sku, v]) => ({ sku, title: v.title, parcels: v.parcels.size, qty: v.qty }))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
        );
      } else {
        setSkuSummary([]);
        setOrderItems({});
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const totals = {
    total: orders.length,
    single: orders.filter((o) => o.classification === "single_sku").length,
    multi: orders.filter((o) => o.classification === "multi_sku").length,
    packed: orders.filter((o) => o.packing_status === "packed").length,
  };
  const remaining = totals.total - totals.packed;

  const downloadExport = async () => {
    if (!wave) return;
    setBusy(true);
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${url}/functions/v1/export-courier?action=download&courier=${courier}&wave_id=${wave.id}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const { rows, includeHeaders, columns } = data;
      const sheet: string[][] = [];
      if (includeHeaders) {
        if (courier === "onway") sheet.push(columns.map((c: string) => ONWAY_HEADERS[c] || c));
        else sheet.push(columns);
      }
      sheet.push(...rows);
      const ws = XLSX.utils.aoa_to_sheet(sheet);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Wave");
      const fileName = `wave_${wave.wave_number}_${courier}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      await markWaveExported(wave.id, user?.email || "admin", rows.length, fileName);
      toast.success(`Exported ${rows.length} orders`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleTrackingFile = async (file: File) => {
    if (!wave) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      // Try to find order_id and tracking_number columns by common header names
      const rows: { order_id: string; tracking_number: string }[] = [];
      for (const r of json) {
        const keys = Object.keys(r);
        const oidKey = keys.find((k) => /order[_\s]?id|შეკვეთის|order/i.test(k));
        const tnKey = keys.find((k) => /tracking|ტრექინგი|накл/i.test(k));
        const oid = oidKey ? String(r[oidKey]).trim() : "";
        const tn = tnKey ? String(r[tnKey]).trim() : "";
        if (oid) rows.push({ order_id: oid, tracking_number: tn });
      }
      const result = await importTrackingForWave(wave.id, rows, user?.email || "admin");
      toast.success(
        `Updated ${result.updated}/${totals.total} · missing ${result.missingInDb.length} · other wave ${result.belongsToOtherWave.length}`
      );
      load();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStickers = async () => {
    if (!wave) return;
    setBusy(true);
    try {
      await markStickersPrinted(wave.id, user?.email || "admin");
      toast.success("Stickers marked as printed");
      load();
    } finally { setBusy(false); }
  };

  const handleComplete = async () => {
    if (!wave) return;
    setBusy(true);
    try {
      let res = await completeWave(wave.id, false, user?.email || "admin");
      if (!res.completed) {
        if (!confirm(`${res.unpacked} order(s) are still unpacked. Complete anyway?`)) { setBusy(false); return; }
        res = await completeWave(wave.id, true, user?.email || "admin");
      }
      toast.success("Wave completed");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleCreateRun = async () => {
    if (!wave) return;
    setBusy(true);
    try {
      const res = await createRun(wave.id, slotCount, user?.email || "admin");
      if (res.assigned === 0) {
        toast.info("No multi-SKU orders left to assign");
      } else {
        toast.success(`Run #${res.run_number} created — ${res.assigned} slots`);
        navigate(`/admin/packing-waves/${wave.id}/runs/${res.run_id}`);
      }
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  if (loading || !wave) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/admin/packing-waves"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">Wave #{wave.wave_number}</h1>
            <p className="text-xs text-muted-foreground">
              Created {new Date(wave.created_at).toLocaleString("ka-GE")} by {wave.created_by || "—"}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[wave.status] || "bg-muted"}`}>
          {wave.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { l: "Total", v: totals.total },
          { l: "Single-SKU", v: totals.single },
          { l: "Multi-SKU", v: totals.multi },
          { l: "Tracking", v: wave.tracking_imported_at ? "✓" : "—" },
          { l: "Packed", v: totals.packed },
          { l: "Remaining", v: remaining },
          { l: "Stickers", v: wave.stickers_printed_at ? "✓" : "—" },
        ].map((c) => (
          <div key={c.l} className="bg-card border rounded-lg p-3">
            <div className="text-[11px] uppercase font-semibold text-muted-foreground">{c.l}</div>
            <div className="text-xl font-bold">{c.v}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <select value={courier} onChange={(e) => setCourier(e.target.value as any)} className="h-9 px-2 border rounded text-sm">
            <option value="onway">ONWAY</option>
            <option value="trackings">TRACKINGS.GE</option>
          </select>
          <Button onClick={downloadExport} disabled={busy}><Download className="w-4 h-4 mr-2" />Download Courier Export</Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <Upload className="w-4 h-4 mr-2" />Import Tracking
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                 onChange={(e) => e.target.files?.[0] && handleTrackingFile(e.target.files[0])} />
          <Button variant="outline" onClick={handleStickers} disabled={busy}>
            <Sticker className="w-4 h-4 mr-2" />Mark Stickers Printed
          </Button>
          <Button variant="outline" onClick={handleComplete} disabled={busy}>
            <CheckCircle2 className="w-4 h-4 mr-2" />Mark Wave Completed
          </Button>
        </div>
      </div>

      {/* Single-SKU summary */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-3 border-b font-semibold">Single-SKU summary (info)</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr><th className="text-left p-2">SKU</th><th className="text-left p-2">Product</th><th className="text-right p-2">Parcels</th><th className="text-right p-2">Units</th></tr>
          </thead>
          <tbody>
            {skuSummary.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">None.</td></tr>}
            {skuSummary.map((s) => (
              <tr key={s.sku} className="border-t">
                <td className="p-2 font-mono">{s.sku}</td>
                <td className="p-2 text-muted-foreground">{s.title}</td>
                <td className="p-2 text-right">{s.parcels}</td>
                <td className="p-2 text-right">{s.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Multi-SKU runs */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold">Multi-SKU Packing</div>
          <div className="flex items-center gap-2">
            <select value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value))} className="h-9 px-2 border rounded text-sm">
              {[12, 24, 30].map((n) => <option key={n} value={n}>{n} slots</option>)}
            </select>
            <input type="number" min={1} max={200} value={slotCount} onChange={(e) => setSlotCount(Math.max(1, Number(e.target.value)))}
                   className="h-9 w-20 px-2 border rounded text-sm" />
            <Button onClick={handleCreateRun} disabled={busy || totals.multi === 0} size="sm">
              <Plus className="w-4 h-4 mr-1" />Create Pack Run
            </Button>
          </div>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {runs.map((r) => (
              <Link key={r.id} to={`/admin/packing-waves/${wave.id}/runs/${r.id}`}
                    className="border rounded-lg p-3 hover:bg-muted/30 transition">
                <div className="font-bold">Run #{r.run_number}</div>
                <div className="text-xs text-muted-foreground">
                  {r.slot_count} slots · {new Date(r.created_at).toLocaleString("ka-GE")}
                </div>
                <div className="text-xs mt-1">Status: <span className="font-semibold">{r.status}</span></div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPackingWaveDetail;
