import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Waves } from "lucide-react";
import {
  fetchWaves,
  fetchEligibleOrderCount,
  createWave,
  type PackingWave,
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

interface WaveAgg {
  total: number;
  single: number;
  multi: number;
  tracking: number;
  packed: number;
}

const AdminPackingWaves = () => {
  const { user } = useAdminAuth();
  const [waves, setWaves] = useState<PackingWave[]>([]);
  const [eligible, setEligible] = useState(0);
  const [agg, setAgg] = useState<Record<string, WaveAgg>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, c] = await Promise.all([fetchWaves(), fetchEligibleOrderCount()]);
      setWaves(w);
      setEligible(c);
      // Aggregate per wave
      const ids = w.map((x) => x.id);
      if (ids.length) {
        const { data: rows } = await (supabase as any)
          .from("packing_wave_orders")
          .select("wave_id, classification, packing_status, order_id, orders!inner(tracking_number)")
          .in("wave_id", ids);
        const map: Record<string, WaveAgg> = {};
        for (const r of (rows || []) as any[]) {
          const k = r.wave_id;
          if (!map[k]) map[k] = { total: 0, single: 0, multi: 0, tracking: 0, packed: 0 };
          map[k].total++;
          if (r.classification === "single_sku") map[k].single++; else map[k].multi++;
          if (r.packing_status === "packed") map[k].packed++;
          if (r.orders?.tracking_number) map[k].tracking++;
        }
        setAgg(map);
      } else {
        setAgg({});
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load waves");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (eligible === 0) {
      toast.info("No eligible orders to wave.");
      return;
    }
    setCreating(true);
    try {
      const res = await createWave(user?.email || "admin");
      toast.success(`Wave #${res.wave_number} created — ${res.total} orders (${res.single_sku} single / ${res.multi_sku} multi)`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to create wave");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Waves className="w-6 h-6" /> Packing Waves</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ready for next wave: <span className="font-bold text-foreground">{eligible}</span> orders
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating || eligible === 0} size="lg">
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Create Packing Wave
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wave</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Single</TableHead>
              <TableHead className="text-right">Multi</TableHead>
              <TableHead className="text-right">Tracking</TableHead>
              <TableHead className="text-right">Packed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
            )}
            {!loading && waves.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No waves yet.</TableCell></TableRow>
            )}
            {waves.map((w) => {
              const a = agg[w.id] || { total: 0, single: 0, multi: 0, tracking: 0, packed: 0 };
              return (
                <TableRow key={w.id}>
                  <TableCell className="font-bold">#{w.wave_number}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{new Date(w.created_at).toLocaleString("ka-GE")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{w.created_by || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{a.total}</TableCell>
                  <TableCell className="text-right">{a.single}</TableCell>
                  <TableCell className="text-right">{a.multi}</TableCell>
                  <TableCell className="text-right text-sm">{a.tracking}/{a.total}</TableCell>
                  <TableCell className="text-right text-sm">{a.packed}/{a.total}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor[w.status] || "bg-muted"}`}>
                      {w.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link to={`/admin/packing-waves/${w.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminPackingWaves;
