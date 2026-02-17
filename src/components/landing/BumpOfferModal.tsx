import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Gift, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/constants";
import { BumpConfig } from "@/hooks/useLandingConfig";

interface BumpOfferModalProps {
  open: boolean;
  orderId: string;
  product: Product;
  bumpConfig: BumpConfig;
  originalQty: number;
  originalDiscount: number;
  onDone: (accepted: boolean) => void;
}

const BumpOfferModal = ({
  open,
  orderId,
  product,
  bumpConfig,
  originalQty,
  originalDiscount,
  onDone,
}: BumpOfferModalProps) => {
  const [loading, setLoading] = useState(false);

  const bumpUnitPrice = product.price * (1 - bumpConfig.discount_pct / 100);
  const bumpTotal = bumpUnitPrice * bumpConfig.bump_qty;

  const handleAccept = async () => {
    setLoading(true);
    try {
      // Add bump item to order
      await supabase.from("order_items").insert({
        order_id: orderId,
        product_id: product.id,
        sku: product.sku || product.id,
        title: `${product.title} (ბამპ)`,
        quantity: bumpConfig.bump_qty,
        unit_price: bumpUnitPrice,
        line_total: bumpTotal,
        image_url: product.image || "",
        tags: ["is_bump"],
      });

      // Update order total and status
      const { data: order } = await supabase
        .from("orders")
        .select("total, subtotal")
        .eq("id", orderId)
        .single();

      if (order) {
        const newTotal = Number(order.total) + bumpTotal;
        const newSubtotal = Number(order.subtotal) + bumpTotal;
        await supabase
          .from("orders")
          .update({
            total: newTotal,
            subtotal: newSubtotal,
            status: "new",
            tags: (await supabase.from("orders").select("tags").eq("id", orderId).single())
              .data?.tags?.concat(["bump_accepted"]) || ["bump_accepted"],
          } as any)
          .eq("id", orderId);
      }

      // Log event
      await supabase.from("order_events").insert({
        order_id: orderId,
        actor: "system",
        event_type: "bump_accepted",
        payload: {
          bump_qty: bumpConfig.bump_qty,
          bump_discount_pct: bumpConfig.discount_pct,
          bump_unit_price: bumpUnitPrice,
          bump_total: bumpTotal,
        },
      });

      onDone(true);
    } catch (err) {
      console.error("Bump accept failed:", err);
      // Still finalize the order
      await finalizeOrder(orderId);
      onDone(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    try {
      await finalizeOrder(orderId);
      onDone(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={() => {}}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl overflow-y-auto pb-8">
        <SheetTitle className="sr-only">ბამპ შეთავაზება</SheetTitle>

        <div className="text-center space-y-4 pt-2">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-deal/10 flex items-center justify-center mx-auto">
            <Gift className="w-8 h-8 text-deal" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-xl font-extrabold text-foreground">
              {bumpConfig.title || "დაამატე კიდევ ერთი 50%-იანი ფასდაკლებით?"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {bumpConfig.subtitle || "უმეტესობა ამატებს — იგივე მიტანა."}
            </p>
          </div>

          {/* Product preview */}
          <div className="bg-accent/40 rounded-xl p-3 flex items-center gap-3 text-left">
            <img src={product.image} alt={product.title} className="w-16 h-16 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{product.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground line-through">
                  {(product.price * bumpConfig.bump_qty).toFixed(2)} ₾
                </span>
                <span className="text-base font-extrabold text-primary">{bumpTotal.toFixed(2)} ₾</span>
                <span className="bg-deal text-deal-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                  -{bumpConfig.discount_pct}%
                </span>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={handleAccept}
              disabled={loading}
              className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                `✅ დამატება ${bumpTotal.toFixed(2)} ₾-ად`
              )}
            </Button>
            <button
              onClick={handleDecline}
              disabled={loading}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ❌ არა, მადლობა
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

async function finalizeOrder(orderId: string) {
  try {
    await supabase
      .from("orders")
      .update({ status: "new" } as any)
      .eq("id", orderId);

    await supabase.from("order_events").insert({
      order_id: orderId,
      actor: "system",
      event_type: "bump_declined",
      payload: { bump_shown: true, bump_accepted: false },
    });
  } catch (err) {
    console.error("Finalize order failed:", err);
  }
}

export default BumpOfferModal;
