import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Printer, PackageCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchBatches, createBatch, fetchEligibleOrderCount, type BatchRow } from "@/lib/batchService";
import { toast } from "@/hooks/use-toast";

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Open", value: "OPEN" },
  { label: "Locked", value: "LOCKED" },
  { label: "Released", value: "RELEASED" },
];

const statusColor: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  LOCKED: "bg-amber-100 text-amber-800",
  RELEASED: "bg-emerald-100 text-emerald-800",
};

const AdminBatches = () => {
  const navigate = useNavigate();
  const { user } = useAdminAuth();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Eligibility modal
  const [showEligibility, setShowEligibility] = useState(false);
  const [eligibility, setEligibility] = useState<{ eligible: number; ineligible: { reason: string; count: number }[] } | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  // Also fetch tracking coverage per batch
  const [trackingCoverage, setTrackingCoverage] = useState<Record<string, { has: number; total: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBatches(statusFilter);
      setBatches(data);

      // Fetch tracking coverage for all batches
      const coverage: Record<string, { has: number; total: number }> = {};
      for (const b of data) {
        const { data: bOrders } = await supabase
          .from("batch_orders")
          .select("order_id")
          .eq("batch_id", b.id);
        if (bOrders && bOrders.length > 0) {
          const orderIds = bOrders.map(bo => bo.order_id);
          const { data: orders } = await supabase
            .from("orders")
            .select("id, tracking_number")
            .in("id", orderIds);
          coverage[b.id] = {
            total: orderIds.length,
            has: orders?.filter(o => o.tracking_number).length || 0,
          };
        } else {
          coverage[b.id] = { total: 0, has: 0 };
        }
      }
      setTrackingCoverage(coverage);
    } catch (e: any) {
      toast({ title: "Error loading batches", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleOpenCreateModal = async () => {
    setLoadingEligibility(true);
    setShowEligibility(true);
    try {
      const result = await fetchEligibleOrderCount();
      setEligibility(result);
    } catch (e: any) {
      toast({ title: "Error checking eligibility", description: e.message, variant: "destructive" });
      setShowEligibility(false);
    }
    setLoadingEligibility(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createBatch(user?.email || "admin");
      toast({ title: "Batch created", description: `${result.orderCount} orders batched.` });
      setShowEligibility(false);
      navigate(`/admin/batches/${result.batchId}`);
    } catch (e: any) {
      toast({ title: "Failed to create batch", description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-foreground">Warehouse Batches</h1>
        <Button onClick={handleOpenCreateModal} disabled={creating || loadingEligibility} className="gap-2">
          {loadingEligibility ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Batch
        </Button>
      </div>

      {/* Eligibility modal */}
      {showEligibility && (
        <div className="p-4 border border-border rounded-lg bg-card space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-sm">Batch Eligibility Summary</h3>
          </div>
          {loadingEligibility ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking…
            </div>
          ) : eligibility ? (
            <>
              <div className="text-sm">
                <span className="font-bold text-emerald-600">{eligibility.eligible}</span> eligible orders ready for batching.
              </div>
              {eligibility.ineligible.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {eligibility.ineligible.map((r, i) => (
                    <div key={i}>• {r.reason}: <span className="font-medium">{r.count}</span></div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={creating || eligibility.eligible === 0}
                  className="gap-1"
                >
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                  {eligibility.eligible === 0 ? "No Eligible Orders" : `Create Batch (${eligibility.eligible} orders)`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowEligibility(false)}>Cancel</Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              statusFilter === t.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : batches.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No batches found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Batch</th>
                <th className="text-left px-4 py-3 font-bold">Created</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold">Orders</th>
                <th className="text-left px-4 py-3 font-bold">Items</th>
                <th className="text-left px-4 py-3 font-bold">Packing List</th>
                <th className="text-left px-4 py-3 font-bold">Slips</th>
                <th className="text-left px-4 py-3 font-bold">Released</th>
                <th className="text-left px-4 py-3 font-bold">Exported</th>
                <th className="text-left px-4 py-3 font-bold">Tracking</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const tc = trackingCoverage[b.id];
                return (
                <tr
                  key={b.id}
                  onClick={() => navigate(`/admin/batches/${b.id}`)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-bold text-primary">{b.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(b.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor[b.status] || "bg-muted"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{b.order_count}</td>
                  <td className="px-4 py-3 font-medium">{b.total_qty}</td>
                  <td className="px-4 py-3">
                    {b.packing_list_print_count > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                        <Printer className="w-3 h-3" /> Yes ({b.packing_list_print_count}x)
                      </span>
                    ) : <span className="text-xs text-muted-foreground">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {b.packing_slips_print_count > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                        <PackageCheck className="w-3 h-3" /> Yes ({b.packing_slips_print_count}x)
                      </span>
                    ) : <span className="text-xs text-muted-foreground">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {b.released_at ? (
                      <span className="text-xs font-bold text-emerald-600">✅ Yes</span>
                    ) : <span className="text-xs text-muted-foreground">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {b.export_count > 0 ? (
                      <span className="text-xs font-bold text-emerald-600">✅ {b.export_count}x</span>
                    ) : <span className="text-xs text-muted-foreground">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {tc ? (
                      <span className={`text-xs font-bold ${tc.has === tc.total ? "text-emerald-600" : "text-amber-600"}`}>
                        {tc.has}/{tc.total}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminBatches;
