import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Check, Gift, Truck, X } from "lucide-react";
import { Product } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import { addUpsellItems } from "@/lib/orderService";
import { trackEvent } from "@/lib/analytics";

interface LandingUpsellSheetProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  baseProduct: Product;
  basePrice: number;
  onComplete: (deliveryFee: number, newTotal: number) => void;
  onSkip: () => void;
}

const UPSELL_BUNDLE_PRICE = 19;

const LandingUpsellSheet = ({
  open,
  onClose,
  orderId,
  baseProduct,
  basePrice,
  onComplete,
  onSkip,
}: LandingUpsellSheetProps) => {
  const { data: allProducts = [] } = useProducts();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Available products (exclude base product)
  const upsellProducts = allProducts.filter(
    (p) => p.id !== baseProduct.id && p.available !== false
  );

  useEffect(() => {
    if (open) {
      trackEvent("upsell_viewed", {
        order_id: orderId,
        base_product_id: baseProduct.id,
        available_count: upsellProducts.length,
      });
      setSelectedIds(new Set());
    }
  }, [open]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

  const hasTwoSelected = selectedIds.size === 2;
  const deliveryFee = hasTwoSelected ? 0 : 5;
  const upsellPrice = hasTwoSelected ? UPSELL_BUNDLE_PRICE : 0;
  const totalPrice = basePrice + upsellPrice + deliveryFee;

  const handleAccept = async () => {
    if (selectedIds.size === 0) {
      handleSkip();
      return;
    }
    setSubmitting(true);
    try {
      const items = Array.from(selectedIds).map((id) => {
        const p = upsellProducts.find((prod) => prod.id === id)!;
        return { product: p, quantity: 1 };
      });

      await addUpsellItems(orderId, items, deliveryFee, totalPrice);

      trackEvent("upsell_accepted", {
        order_id: orderId,
        selected_count: items.length,
        upsell_price: upsellPrice,
        delivery_fee: deliveryFee,
        new_total: totalPrice,
        selected_ids: Array.from(selectedIds),
      });

      onComplete(deliveryFee, totalPrice);
    } catch (err) {
      console.error("Upsell failed:", err);
      // On error, skip to address
      onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    trackEvent("upsell_skipped", {
      order_id: orderId,
      base_product_id: baseProduct.id,
    });
    onSkip();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <SheetContent side="bottom" className="max-h-[92vh] rounded-t-2xl overflow-y-auto pb-8">
        <SheetTitle className="sr-only">შეთავაზება</SheetTitle>

        {/* Hero banner */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 mb-4 text-center">
          <Gift className="w-8 h-8 text-primary mx-auto mb-2" />
          <h2 className="text-lg font-extrabold text-foreground leading-tight">
            აირჩიე ნებისმიერი 2 პროდუქტი მხოლოდ {UPSELL_BUNDLE_PRICE}₾-ად და მიიღე უფასო მიწოდება
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            დაამატე ახლა და დაზოგე 5₾ მიწოდებაზე
          </p>
        </div>

        {/* Selection status */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-sm font-semibold text-foreground">
            არჩეული: {selectedIds.size}/2
          </span>
          {hasTwoSelected && (
            <span className="flex items-center gap-1 text-xs font-bold text-success">
              <Truck className="w-3.5 h-3.5" /> უფასო მიწოდება!
            </span>
          )}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4 max-h-[40vh] overflow-y-auto">
          {upsellProducts.slice(0, 20).map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleProduct(p.id)}
                className={`relative rounded-xl border-2 p-2 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border bg-card hover:border-primary/40"
                } ${selectedIds.size >= 2 && !isSelected ? "opacity-40" : ""}`}
              >
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-full aspect-square rounded-lg object-cover mb-1.5"
                />
                <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">
                  {p.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.price} ₾</p>
              </button>
            );
          })}
        </div>

        {/* Price breakdown */}
        <div className="bg-accent/40 rounded-xl p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{baseProduct.title}</span>
            <span className="font-semibold text-foreground">{basePrice.toFixed(2)} ₾</span>
          </div>
          {hasTwoSelected && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">2 პროდუქტი (შეთავაზება)</span>
              <span className="font-semibold text-primary">{UPSELL_BUNDLE_PRICE} ₾</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">მიწოდება</span>
            <span className={`font-semibold ${hasTwoSelected ? "text-success line-through-none" : "text-foreground"}`}>
              {hasTwoSelected ? "უფასო" : "5 ₾"}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-1">
            <span className="font-bold text-foreground">ჯამი</span>
            <span className="font-extrabold text-primary text-lg">{totalPrice.toFixed(2)} ₾</span>
          </div>
        </div>

        {/* CTAs */}
        {hasTwoSelected ? (
          <Button
            onClick={handleAccept}
            disabled={submitting}
            className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground mb-2"
            size="lg"
          >
            დამატება + უფასო მიწოდება
          </Button>
        ) : (
          <Button
            onClick={handleAccept}
            disabled={submitting || selectedIds.size === 0}
            className="w-full h-14 text-lg font-bold rounded-xl mb-2"
            size="lg"
          >
            {selectedIds.size > 0 ? "დამატება" : "აირჩიე 2 პროდუქტი"}
          </Button>
        )}

        <button
          onClick={handleSkip}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
        >
          შეთავაზების გარეშე გაგრძელება →
        </button>
      </SheetContent>
    </Sheet>
  );
};

export default LandingUpsellSheet;
