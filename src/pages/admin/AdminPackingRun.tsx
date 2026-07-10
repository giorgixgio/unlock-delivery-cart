import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  fetchRun, fetchRunSlots, markSlotPacked, markSlotIssue,
  type PackingRun, type RunSlot,
} from "@/lib/packingWaveService";
import { supabase } from "@/integrations/supabase/client";

interface OrderInfo {
  id: string;
  public_order_number: string | null;
  total: number;
  normalized_city: string | null;
  raw_city: string | null;
  city: string | null;
  tracking_number: string | null;
}
interface ItemRow { order_id: string; sku: string; title: string; quantity: number; }

const AdminPackingRun = () => {
  const { waveId, runId } = useParams<{ waveId: string; runId: string }>();
  const { user } = useAdminAuth();
  const [run, setRun] = useState<PackingRun | null>(null);
  const [slots, setSlots] = useState<RunSlot[]>([]);
  const [orders, setOrders] = useState<Record<string, OrderInfo>>({});
  const [items, setItems] = useState<Record<string, ItemRow[]>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const r = await fetchRun(runId);
      const s = await fetchRunSlots(runId);
      setRun(r); setSlots(s);
      const oids = s.map((x) => x.order_id);
      if (oids.length) {
        const [{ data: ords }, { data: its }] = await Promise.all([
          (supabase as any).from("orders")
            .select("id, public_order_number, total, normalized_city, raw_city, city, tracking_number")
            .in("id", oids),
          (supabase as any).from("order_items")
            .select("order_id, sku, title, quantity").in("order_id", oids),
        ]);
        const om: Record<string, OrderInfo> = {};
        for (const o of (ords || []) as any[]) om[o.id] = o;
        setOrders(om);
        const im: Record<string, ItemRow[]> = {};
        for (const it of (its || []) as any[]) (im[it.order_id] ||= []).push(it);
        setItems(im);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [runId]);

  const packedCount = slots.filter((s) => s.packing_status === "packed").length;

  const pack = async (slotId: string) => {
    try { await markSlotPacked(slotId, user?.email || "admin"); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const flag = async (slotId: string) => {
    const note = prompt("Issue note (optional):") || "";
    try { await markSlotIssue(slotId, "other", note, user?.email || "admin"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  // Print sheets — open print window
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const printSheet = (which: "slot-setup" | "pick-to-slot" | "final-check") => {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    const styles = `<style>
      body{font-family:Arial, sans-serif; padding:16px; color:#000;}
      h1{font-size:18px; margin:0 0 12px;}
      table{width:100%; border-collapse:collapse; font-size:12px;}
      th,td{border:1px solid #333; padding:6px 8px; text-align:left; vertical-align:top;}
      th{background:#eee;}
      .slot{font-size:14px; font-weight:bold;}
      .ck{width:18px; height:18px; border:1.5px solid #000; display:inline-block;}
    </style>`;
    let body = "";
    if (which === "slot-setup") {
      body = `<h1>Slot Setup Sheet — Run #${esc(run?.run_number)}</h1>
        <table><thead><tr><th>Slot</th><th>Order #</th><th>Tracking</th><th>Items</th><th>COD</th><th>City</th></tr></thead><tbody>${
        slots.map((s) => {
          const o = orders[s.order_id]; const its = items[s.order_id] || [];
          const cnt = its.reduce((a, b) => a + (b.quantity || 0), 0);
          const city = o?.normalized_city || o?.raw_city || o?.city || "";
          return `<tr><td class="slot">${esc(s.slot_number)}</td><td>${esc(o?.public_order_number || s.order_id.slice(0,8))}</td><td>${esc(s.tracking_number_snapshot || o?.tracking_number || "")}</td><td>${esc(cnt)}</td><td>${esc(o?.total ?? "")} ₾</td><td>${esc(city)}</td></tr>`;
        }).join("")
      }</tbody></table>`;
    } else if (which === "pick-to-slot") {
      const map = new Map<string, { title: string; slots: Map<number, number> }>();
      for (const s of slots) {
        for (const it of items[s.order_id] || []) {
          const k = it.sku || "";
          if (!map.has(k)) map.set(k, { title: it.title || "", slots: new Map() });
          const e = map.get(k)!;
          e.slots.set(s.slot_number, (e.slots.get(s.slot_number) || 0) + (it.quantity || 0));
        }
      }
      const groups = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
      body = `<h1>Pick-to-Slot Sheet — Run #${esc(run?.run_number)}</h1>
        <table><thead><tr><th>SKU</th><th>Product</th><th>Total</th><th>Slot instructions</th></tr></thead><tbody>${
        groups.map(([sku, v]) => {
          const total = Array.from(v.slots.values()).reduce((a, b) => a + b, 0);
          const inst = Array.from(v.slots.entries()).sort((a, b) => a[0] - b[0])
            .map(([slot, q]) => q > 1 ? `Slot ${slot} ×${q}` : `Slot ${slot}`).join(", ");
          return `<tr><td><b>${esc(sku)}</b></td><td>${esc(v.title)}</td><td>${esc(total)}</td><td>${esc(inst)}</td></tr>`;
        }).join("")
      }</tbody></table>`;
    } else {
      body = `<h1>Final Check Sheet — Run #${esc(run?.run_number)}</h1>
        <table><thead><tr><th>Slot</th><th>Order #</th><th>Tracking</th><th>Expected items</th><th>Count</th><th>Packed</th></tr></thead><tbody>${
        slots.map((s) => {
          const o = orders[s.order_id]; const its = items[s.order_id] || [];
          const cnt = its.reduce((a, b) => a + (b.quantity || 0), 0);
          const ex = its.map((i) => `${esc(i.sku)} × ${esc(i.quantity)}`).join("<br/>");
          return `<tr><td class="slot">${esc(s.slot_number)}</td><td>${esc(o?.public_order_number || "")}</td><td>${esc(s.tracking_number_snapshot || o?.tracking_number || "")}</td><td>${ex}</td><td>${esc(cnt)}</td><td><span class="ck"></span></td></tr>`;
        }).join("")
      }</tbody></table>`;
    }
    win.document.write(`<!doctype html><html><head><title>Sheet</title>${styles}</head><body>${body}<script>setTimeout(()=>window.print(),300)</script></body></html>`);
    win.document.close();
  };

  if (loading || !run) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to={`/admin/packing-waves/${waveId}`}><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-xl font-bold">Run #{run.run_number}</h1>
          <p className="text-xs text-muted-foreground">{run.slot_count} slots · {packedCount}/{slots.length} packed</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={() => printSheet("slot-setup")}><Printer className="w-4 h-4 mr-2" />Slot Setup Sheet</Button>
        <Button variant="outline" onClick={() => printSheet("pick-to-slot")}><Printer className="w-4 h-4 mr-2" />Pick-to-Slot Sheet</Button>
        <Button variant="outline" onClick={() => printSheet("final-check")}><Printer className="w-4 h-4 mr-2" />Final Check Sheet</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slots.map((s) => {
          const o = orders[s.order_id];
          const its = items[s.order_id] || [];
          const isPacked = s.packing_status === "packed";
          const isIssue = s.packing_status === "issue";
          return (
            <div key={s.id} className={`border-2 rounded-lg p-3 ${isPacked ? "border-emerald-400 bg-emerald-50" : isIssue ? "border-rose-400 bg-rose-50" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-3xl font-bold leading-none">#{s.slot_number}</div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Order</div>
                  <div className="font-semibold text-sm">{o?.public_order_number || s.order_id.slice(0, 8)}</div>
                </div>
              </div>
              <div className="mt-2 text-xs">
                <div className="text-muted-foreground">Tracking</div>
                <div className="font-mono">{s.tracking_number_snapshot || o?.tracking_number || "—"}</div>
              </div>
              <ul className="mt-2 text-sm space-y-0.5">
                {its.map((i, idx) => (
                  <li key={idx}><span className="font-mono">{i.sku}</span> × {i.quantity} <span className="text-muted-foreground">{i.title}</span></li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => pack(s.id)} disabled={isPacked}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isPacked ? "Packed" : "Mark Packed"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => flag(s.id)}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPackingRun;
