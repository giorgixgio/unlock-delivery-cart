import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { logSystemEvent } from "@/lib/systemEventService";

interface ItemData {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string;
}

interface EditableItemRowProps {
  item: ItemData;
  orderId: string;
  actor: string;
  canEdit: boolean;
  onUpdated: () => void;
}

const EditableItemRow = ({ item, orderId, actor, canEdit, onUpdated }: EditableItemRowProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.quantity);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (qty < 1) return;
    setSaving(true);
    try {
      const newLineTotal = qty * Number(item.unit_price);
      const { error } = await supabase
        .from("order_items")
        .update({ quantity: qty, line_total: newLineTotal })
        .eq("id", item.id);
      if (error) throw error;

      // Recalculate order totals
      const { data: items } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", orderId);
      const newSubtotal = (items || []).reduce((sum, i) => sum + Number(i.line_total), 0);

      const { data: orderData } = await supabase
        .from("orders")
        .select("shipping_fee, discount_total")
        .eq("id", orderId)
        .single();

      const shipping = Number(orderData?.shipping_fee || 0);
      const discount = Number(orderData?.discount_total || 0);

      await supabase
        .from("orders")
        .update({
          subtotal: newSubtotal,
          total: newSubtotal + shipping - discount,
        })
        .eq("id", orderId);

      await logSystemEvent({
        entityType: "order",
        entityId: orderId,
        eventType: "ORDER_ITEM_UPDATE" as any,
        actorId: actor,
        payload: {
          item_id: item.id,
          sku: item.sku,
          before: { quantity: item.quantity, line_total: item.line_total },
          after: { quantity: qty, line_total: newLineTotal },
        },
      });

      await supabase.from("order_events").insert({
        order_id: orderId,
        actor,
        event_type: "item_quantity_change",
        payload: { item_id: item.id, sku: item.sku, from: item.quantity, to: qty } as any,
      });

      setEditing(false);
      toast({ title: "Item updated" });
      onUpdated();
    } catch (err: any) {
      toast({ title: "Failed to update item", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("order_items").delete().eq("id", item.id);
      if (error) throw error;

      // Recalculate totals
      const { data: items } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", orderId);
      const newSubtotal = (items || []).reduce((sum, i) => sum + Number(i.line_total), 0);

      const { data: orderData } = await supabase
        .from("orders")
        .select("shipping_fee, discount_total")
        .eq("id", orderId)
        .single();

      const shipping = Number(orderData?.shipping_fee || 0);
      const discount = Number(orderData?.discount_total || 0);

      await supabase
        .from("orders")
        .update({
          subtotal: newSubtotal,
          total: newSubtotal + shipping - discount,
        })
        .eq("id", orderId);

      await logSystemEvent({
        entityType: "order",
        entityId: orderId,
        eventType: "ORDER_ITEM_DELETE" as any,
        actorId: actor,
        payload: { item_id: item.id, sku: item.sku, title: item.title, quantity: item.quantity },
      });

      await supabase.from("order_events").insert({
        order_id: orderId,
        actor,
        event_type: "item_removed",
        payload: { item_id: item.id, sku: item.sku, title: item.title } as any,
      });

      toast({ title: "Item removed" });
      onUpdated();
    } catch (err: any) {
      toast({ title: "Failed to remove item", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(Math.max(1, qty - 1))} disabled={saving}>
            <Minus className="w-3 h-3" />
          </Button>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 h-7 text-center text-sm"
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(qty + 1)} disabled={saving}>
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={handleSave} disabled={saving}>
            <Check className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(false); setQty(item.quantity); }} disabled={saving}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="text-sm text-right">
            <p>{item.quantity} × {Number(item.unit_price).toFixed(1)} ₾</p>
            <p className="font-bold">{Number(item.line_total).toFixed(1)} ₾</p>
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EditableItemRow;
