import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Printer, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { fetchBatches, createBatch, type BatchRow } from "@/lib/batchService";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBatches(statusFilter);
      setBatches(data);
    } catch (e: any) {
      toast({ title: "Error loading batches", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createBatch(user?.email || "admin");
      toast({ title: "Batch created", description: `${result.orderCount} orders batched.` });
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
        <Button onClick={handleCreate} disabled={creating} className="gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Batch
        </Button>
      </div>

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
                <th className="text-left px-4 py-3 font-bold">Items Qty</th>
                <th className="text-left px-4 py-3 font-bold">Packing List</th>
                <th className="text-left px-4 py-3 font-bold">Slips</th>
                <th className="text-left px-4 py-3 font-bold">Released</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
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
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {b.packing_slips_print_count > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                        <PackageCheck className="w-3 h-3" /> Yes ({b.packing_slips_print_count}x)
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {b.released_at ? (
                      <span className="text-xs font-bold text-emerald-600">Yes</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminBatches;
