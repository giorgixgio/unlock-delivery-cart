import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tag, Loader2 } from "lucide-react";
import { getQtyDiscountPct, getDiscountedTotal } from "@/lib/landingDiscounts";
import { logSystemEvent } from "@/lib/systemEventService";

interface Item {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Props {
  orderId: string;
  items: Item[];
  actor: string;
  disabled?: boolean;
  onApplied: () => void;
}

/**
 * One-click operator buttons that apply the /p/ landing quantity discount
 * (1=0%, 2=20%, 3=35%) to a single-product order. Uses the current item's
 * unit_price at qty=1 as the base. For qty>1 it rewrites unit_price so
 * line_total matches the landing-page discounted total.
 */
const LandingQtyDiscountActions = ({ orderId, items, actor, disabled, onApplied }: Props) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  if (items.length !== 1) return null;
  const item = items[0];

  // Infer base unit price: if a discount was previously applied, back it out.
  const currentPct = getQtyDiscountPct(item.quantity);
  const basePrice =
    currentPct > 0
      ? Math.round((Number(item.unit_price) / (1 - currentPct / 100)) * 100) / 100
      : Number(item.unit_price);

  const apply = async (qty: 1 | 2 | 3) => {
    setBusy(qty);
    try {
      const newLineTotal = getDiscountedTotal(basePrice, qty);
      const newUnitPrice = Math.round((newLineTotal / qty) * 100) / 100;

      const { error: itemErr } = await supabase
        .from("order_items")
        .update({ quantity: qty, unit_price: newUnitPrice, line_total: newLineTotal })
        .eq("id", item.id);
      if (itemErr) throw itemErr;

      // Recalculate order totals
      const { data: allItems } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", orderId);
      const newSubtotal = (allItems || []).reduce((s, i) => s + Number(i.line_total), 0);

      const { data: orderRow } = await supabase
        .from("orders")
        .select("shipping_fee, discount_total")
        .eq("id", orderId)
        .single();
      const shipping = Number(orderRow?.shipping_fee || 0);
      const discount = Number(orderRow?.discount_total || 0);

      const { error: ordErr } = await supabase
        .from("orders")
        .update({ subtotal: newSubtotal, total: newSubtotal + shipping - discount })
        .eq("id", orderId);
      if (ordErr) throw ordErr;

      await logSystemEvent({
        entityType: "order",
        entityId: orderId,
        eventType: "ORDER_ITEM_UPDATE" as any,
        actorId: actor,
        payload: {
          item_id: item.id,
          sku: item.sku,
          action: "landing_qty_discount_applied",
          qty,
          discount_pct: getQtyDiscountPct(qty),
          base_price: basePrice,
          new_unit_price: newUnitPrice,
          new_line_total: newLineTotal,
        },
      });

      await supabase.from("order_events").insert({
        order_id: orderId,
        actor,
        event_type: "landing_qty_discount",
        payload: { qty, discount_pct: getQtyDiscountPct(qty), sku: item.sku } as any,
      });

      toast({ title: `${qty} ცალის ფასდაკლება გამოყენებულია`, description: `სულ: ${newLineTotal.toFixed(2)} ₾` });
      onApplied();
    } catch (e: any) {
      toast({ title: "ვერ მოხერხდა", description: e.message, variant: "destructive" });
    }
    setBusy(null);
  };

  const options: Array<{ qty: 1 | 2 | 3; label: string }> = [
    { qty: 1, label: "1 ცალი (საბაზო)" },
    { qty: 2, label: "2 ცალი −20%" },
    { qty: 3, label: "3 ცალი −35%" },
  ];

  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Tag className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">Landing ფასდაკლების სწრაფი გამოყენება</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isActive = item.quantity === o.qty;
          const total = getDiscountedTotal(basePrice, o.qty);
          return (
            <Button
              key={o.qty}
              size="sm"
              variant={isActive ? "default" : "outline"}
              disabled={disabled || busy !== null || isActive}
              onClick={() => apply(o.qty)}
              className="h-8 text-xs"
            >
              {busy === o.qty ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {o.label} · {total.toFixed(2)} ₾
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        საბაზო ფასი: {basePrice.toFixed(2)} ₾ · ცვლის რაოდენობას და ერთეულის ფასს ისე, რომ ჯამი ემთხვეოდეს landing-ს.
      </p>
    </div>
  );
};

export default LandingQtyDiscountActions;
