import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Trash2, GitMerge, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logSystemEvent } from "@/lib/systemEventService";
import { versionedOrderUpdate } from "@/lib/idempotencyService";

interface BulkActionsBarProps {
  selectedIds: string[];
  orders: { id: string; status: string; is_confirmed: boolean; version: number }[];
  onComplete: () => void;
  onClearSelection: () => void;
  onMergeRequest: () => void;
}

const BulkActionsBar = ({ selectedIds, orders, onComplete, onClearSelection, onMergeRequest }: BulkActionsBarProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"confirm" | "cancel" | "delete" | null>(null);

  const selected = orders.filter(o => selectedIds.includes(o.id));

  const handleBulkConfirm = async () => {
    setLoading(true);
    let success = 0;
    for (const order of selected) {
      try {
        await versionedOrderUpdate(order.id, order.version, {
          is_confirmed: true,
          status: "confirmed",
          review_required: false,
        });
        await supabase.from("order_events").insert({
          order_id: order.id,
          actor: "admin",
          event_type: "bulk_confirm",
          payload: { previous_status: order.status } as any,
        });
        success++;
      } catch { /* skip conflicts */ }
    }
    toast({ title: `${success} order(s) confirmed` });
    setLoading(false);
    setConfirmAction(null);
    onClearSelection();
    onComplete();
  };

  const handleBulkCancel = async () => {
    setLoading(true);
    let success = 0;
    for (const order of selected) {
      try {
        await versionedOrderUpdate(order.id, order.version, {
          status: "canceled",
          review_required: false,
        });
        await supabase.from("order_events").insert({
          order_id: order.id,
          actor: "admin",
          event_type: "bulk_cancel",
          payload: { previous_status: order.status } as any,
        });
        success++;
      } catch { /* skip */ }
    }
    toast({ title: `${success} order(s) canceled` });
    setLoading(false);
    setConfirmAction(null);
    onClearSelection();
    onComplete();
  };

  const handleBulkDelete = async () => {
    setLoading(true);
    // Delete order items first, then orders
    for (const id of selectedIds) {
      await supabase.from("order_items").delete().eq("order_id", id);
      await supabase.from("order_events").delete().eq("order_id", id);
    }
    const { error } = await (supabase.from("orders") as any).delete().in("id", selectedIds);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      await logSystemEvent({
        entityType: "order",
        entityId: selectedIds.join(","),
        eventType: "BULK_DELETE",
        actorId: "admin",
        payload: { count: selectedIds.length, order_ids: selectedIds },
      });
      toast({ title: `${selectedIds.length} order(s) deleted` });
    }
    setLoading(false);
    setConfirmAction(null);
    onClearSelection();
    onComplete();
  };

  const runAction = () => {
    if (confirmAction === "confirm") handleBulkConfirm();
    else if (confirmAction === "cancel") handleBulkCancel();
    else if (confirmAction === "delete") handleBulkDelete();
  };

  const actionLabels = {
    confirm: { title: "Confirm Orders", desc: `Confirm ${selectedIds.length} selected order(s)?` },
    cancel: { title: "Cancel Orders", desc: `Cancel ${selectedIds.length} selected order(s)?` },
    delete: { title: "Delete Orders", desc: `Permanently delete ${selectedIds.length} order(s)? This cannot be undone.` },
  };

  return (
    <>
      <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5">
        <span className="text-sm font-bold text-primary">{selectedIds.length} selected</span>
        <div className="h-5 w-px bg-border mx-1" />
        <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700" onClick={() => setConfirmAction("confirm")} disabled={loading}>
          <CheckCircle className="w-3.5 h-3.5" /> Confirm
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-amber-700" onClick={() => setConfirmAction("cancel")} disabled={loading}>
          <XCircle className="w-3.5 h-3.5" /> Cancel
        </Button>
        {selectedIds.length >= 2 && (
          <Button size="sm" variant="outline" className="gap-1.5 text-blue-700" onClick={onMergeRequest} disabled={loading}>
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5 text-red-700" onClick={() => setConfirmAction("delete")} disabled={loading}>
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection} disabled={loading}>
          Clear
        </Button>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction && actionLabels[confirmAction].title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction && actionLabels[confirmAction].desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runAction} disabled={loading}>
              {loading ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BulkActionsBar;
