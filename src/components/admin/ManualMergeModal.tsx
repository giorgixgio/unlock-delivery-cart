import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GitMerge, Loader2, X, AlertTriangle } from "lucide-react";
import { logSystemEvent } from "@/lib/systemEventService";

interface MergeOrder {
  id: string;
  public_order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: string;
  is_fulfilled: boolean;
  version: number;
  order_items: { id: string; sku: string; title: string; quantity: number; unit_price: number; line_total: number; image_url: string }[];
}

interface ManualMergeModalProps {
  open: boolean;
  orderIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

const ManualMergeModal = ({ open, orderIds, onClose, onComplete }: ManualMergeModalProps) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<MergeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [primaryId, setPrimaryId] = useState<string>("");

  useEffect(() => {
    if (!open || orderIds.length < 2) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select("id, public_order_number, created_at, customer_name, customer_phone, total, status, is_fulfilled, version, order_items(id, sku, title, quantity, unit_price, line_total, image_url)")
        .in("id", orderIds)
        .order("created_at", { ascending: true });
      const fetched = (data as unknown as MergeOrder[]) || [];
      setOrders(fetched);
      // Default primary = earliest
      if (fetched.length > 0) setPrimaryId(fetched[0].id);
      setLoading(false);
    })();
  }, [open, orderIds]);

  if (!open) return null;

  const blockedOrders = orders.filter(o => o.is_fulfilled || ["shipped", "delivered"].includes(o.status));
  const canMerge = blockedOrders.length === 0 && orders.length >= 2;

  // Smart dedupe preview: union of unique SKUs, latest order's qty wins for duplicates
  const getMergedItems = () => {
    const primary = orders.find(o => o.id === primaryId);
    const secondaries = orders.filter(o => o.id !== primaryId);
    if (!primary) return [];

    // Build SKU map: start with primary items, then overlay with secondary items (latest wins)
    const skuMap = new Map<string, { sku: string; title: string; quantity: number; unit_price: number; image_url: string; fromOrder: string }>();

    // Process in chronological order so latest overwrites
    const allOrders = [primary, ...secondaries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (const order of allOrders) {
      for (const item of order.order_items) {
        skuMap.set(item.sku, {
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          image_url: item.image_url,
          fromOrder: order.public_order_number,
        });
      }
    }

    return Array.from(skuMap.values());
  };

  const mergedItems = !loading ? getMergedItems() : [];
  const mergedTotal = mergedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const handleMerge = async () => {
    if (!canMerge) return;
    setMerging(true);

    const primary = orders.find(o => o.id === primaryId)!;
    const secondaryOrders = orders.filter(o => o.id !== primaryId);
    const secondaryIds = secondaryOrders.map(o => o.id);

    try {
      // 1. Delete existing items from primary order
      await supabase.from("order_items").delete().eq("order_id", primaryId);

      // 2. Insert merged items into primary
      const newItems = mergedItems.map(item => ({
        order_id: primaryId,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.unit_price * item.quantity,
        image_url: item.image_url,
        product_id: item.sku,
      }));
      await supabase.from("order_items").insert(newItems);

      // 3. Update primary order
      const shippingFee = Number((primary as any).shipping_fee || 0);
      await (supabase.from("orders") as any).update({
        subtotal: mergedTotal,
        total: mergedTotal + shippingFee,
        merged_child_order_ids: secondaryIds,
        tags: [...new Set([...(primary as any).tags || [], "manual_merged"])],
        internal_note: `${(primary as any).internal_note || ""}\nManual merge: absorbed orders ${secondaryOrders.map(o => `#${o.public_order_number}`).join(", ")}`.trim(),
        status: "new",
        review_required: true,
        is_confirmed: false,
        version: primary.version + 1,
      }).eq("id", primaryId).eq("version", primary.version);

      // 4. Mark secondary orders as merged
      for (const sec of secondaryOrders) {
        await (supabase.from("orders") as any).update({
          status: "merged",
          merged_into_order_id: primaryId,
          review_required: false,
          version: sec.version + 1,
        }).eq("id", sec.id).eq("version", sec.version);

        await supabase.from("order_events").insert({
          order_id: sec.id,
          actor: "admin",
          event_type: "manual_merge_child",
          payload: { merged_into: primaryId, primary_order_number: primary.public_order_number } as any,
        });
      }

      // 5. Log event on primary
      await supabase.from("order_events").insert({
        order_id: primaryId,
        actor: "admin",
        event_type: "manual_merge",
        payload: {
          absorbed_orders: secondaryIds,
          absorbed_order_numbers: secondaryOrders.map(o => o.public_order_number),
          merged_items: mergedItems.map(i => ({ sku: i.sku, qty: i.quantity })),
          strategy: "smart_dedupe",
        } as any,
      });

      await logSystemEvent({
        entityType: "order",
        entityId: primaryId,
        eventType: "MANUAL_MERGE",
        actorId: "admin",
        payload: {
          primary_id: primaryId,
          secondary_ids: secondaryIds,
          item_count: mergedItems.length,
          new_total: mergedTotal,
        },
      });

      toast({ title: "Orders merged successfully ✓" });
      onComplete();
      onClose();
    } catch (err: any) {
      toast({ title: "Merge failed", description: err?.message || String(err), variant: "destructive" });
    }
    setMerging(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <GitMerge className="w-5 h-5" /> Manual Merge Orders
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {blockedOrders.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  Cannot merge: {blockedOrders.map(o => `#${o.public_order_number}`).join(", ")} is fulfilled/shipped
                </div>
              )}

              {/* Select primary */}
              <div>
                <label className="text-sm font-bold mb-2 block">Primary order (keeps the order number)</label>
                <div className="space-y-1.5">
                  {orders.map(o => (
                    <label key={o.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${primaryId === o.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                      <input type="radio" name="primary" value={o.id} checked={primaryId === o.id} onChange={() => setPrimaryId(o.id)} className="accent-primary" />
                      <div className="flex-1">
                        <span className="font-bold text-primary">#{o.public_order_number}</span>
                        <span className="text-sm text-muted-foreground ml-2">{o.customer_name} • {o.customer_phone}</span>
                        <span className="text-sm font-medium ml-2">{Number(o.total).toFixed(1)} ₾</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.order_items.map(i => `${i.title} ×${i.quantity}`).join(", ")}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview merged items */}
              <div>
                <h3 className="text-sm font-bold mb-2">Merged result (smart dedupe — latest qty wins)</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">Item</th>
                        <th className="text-left px-3 py-2 font-bold">SKU</th>
                        <th className="text-center px-3 py-2 font-bold">Qty</th>
                        <th className="text-right px-3 py-2 font-bold">Price</th>
                        <th className="text-right px-3 py-2 font-bold">From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergedItems.map(item => (
                        <tr key={item.sku} className="border-t border-border">
                          <td className="px-3 py-2 flex items-center gap-2">
                            <div className="w-7 h-7 rounded border border-border overflow-hidden flex-shrink-0">
                              <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                            </div>
                            <span className="truncate max-w-[200px]">{item.title}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{item.sku}</td>
                          <td className="px-3 py-2 text-center font-bold">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{(item.unit_price * item.quantity).toFixed(1)} ₾</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">#{item.fromOrder}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30">
                        <td colSpan={3} className="px-3 py-2 font-bold">Total</td>
                        <td className="px-3 py-2 text-right font-bold">{mergedTotal.toFixed(1)} ₾</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={merging}>Cancel</Button>
          <Button onClick={handleMerge} disabled={!canMerge || merging} className="gap-2">
            {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            Merge {orders.length} Orders
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ManualMergeModal;
