import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Check, Gift, Truck, X } from "lucide-react";
import { Product } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import { getRelated } from "@/lib/rankingEngine";
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
const MAX_SELECT = 2;

const LandingUpsellSheet = ({
  open,
  onClose: _onClose,
  orderId,
  baseProduct,
  basePrice,
  onComplete,
  onSkip,
}: LandingUpsellSheetProps) => {
  const { data: allProducts = [] } = useProducts();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Use the existing ranking engine for relevant products
  const upsellProducts = useMemo(() => {
    if (!allProducts.length) return [];
    return getRelated(baseProduct, allProducts, 20);
  }, [baseProduct, allProducts]);

  useEffect(() => {
    if (open) {
      trackEvent("upsell_viewed", {
        order_id: orderId,
        base_product_id: baseProduct.id,
        available_count: upsellProducts.length,
        recommended_ids: upsellProducts.slice(0, 10).map((p) => p.id),
      });
      setSelectedIds(new Set());
    }
  }, [open]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        trackEvent("upsell_item_deselected", { order_id: orderId, product_id: id });
      } else if (next.size < MAX_SELECT) {
        next.add(id);
        trackEvent("upsell_item_selected", { order_id: orderId, product_id: id });
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

      if (hasTwoSelected) {
        trackEvent("upsell_bundle_completed", {
          order_id: orderId,
          bundle_price: UPSELL_BUNDLE_PRICE,
          free_shipping: true,
        });
      }

      onComplete(deliveryFee, totalPrice);
    } catch (err) {
      console.error("Upsell failed:", err);
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
      <SheetContent
        side="bottom"
        className="max-h-[95vh] rounded-t-3xl overflow-hidden p-0 flex flex-col [&>button]:hidden"
      >
        <SheetTitle className="sr-only">შეთავაზება</SheetTitle>

        {/* ── STICKY HEADER ── */}
        <div className="relative flex-shrink-0 px-5 pt-5 pb-4 bg-card border-b border-border">
          {/* Close button */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors z-10"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Offer banner */}
          <div className="flex items-start gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-foreground leading-snug">
                აირჩიე ნებისმიერი 2 დამატებითი პროდუქტი მხოლოდ {UPSELL_BUNDLE_PRICE}₾-ად
              </h2>
              <p className="text-sm text-muted-foreground mt-1 leading-snug">
                დაამატე ახლავე და მიიღე უფასო მიწოდება
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`w-8 h-2 rounded-full transition-colors duration-200 ${
                    selectedIds.size > i ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
              <span className="text-xs font-semibold text-muted-foreground ml-1">
                {selectedIds.size}/{MAX_SELECT}
              </span>
            </div>
            {hasTwoSelected && (
              <span className="flex items-center gap-1 text-xs font-bold text-success animate-in fade-in duration-300">
                <Truck className="w-3.5 h-3.5" />
                უფასო მიწოდება გააქტიურდა ✅
              </span>
            )}
          </div>
        </div>

        {/* ── SCROLLABLE PRODUCT GRID ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
          {upsellProducts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              პროდუქტები იტვირთება...
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {upsellProducts.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const isDisabled = selectedIds.size >= MAX_SELECT && !isSelected;
                return (
                  <button
                    key={p.id}
                    onClick={() => !isDisabled && toggleProduct(p.id)}
                    className={`
                      relative rounded-2xl border-2 text-left transition-all duration-200 overflow-hidden
                      ${isSelected
                        ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-primary/30"
                      }
                      ${isDisabled ? "opacity-35 pointer-events-none" : ""}
                    `}
                  >
                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm animate-in zoom-in duration-200">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}

                    {/* Product image */}
                    <div className="aspect-square overflow-hidden bg-muted">
                      <img
                        src={p.image}
                        alt={p.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Product info */}
                    <div className="p-2.5">
                      <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight min-h-[2.25rem]">
                        {p.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{p.price} ₾</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── STICKY BOTTOM: SUMMARY + CTA ── */}
        <div className="flex-shrink-0 bg-card border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Price breakdown */}
          <div className="space-y-1.5 text-sm mb-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground truncate max-w-[60%]">{baseProduct.title}</span>
              <span className="font-semibold text-foreground tabular-nums">{basePrice.toFixed(2)} ₾</span>
            </div>
            {hasTwoSelected && (
              <div className="flex justify-between items-center animate-in slide-in-from-top-2 duration-200">
                <span className="text-muted-foreground">2 პროდუქტი (შეთავაზება)</span>
                <span className="font-semibold text-primary tabular-nums">{UPSELL_BUNDLE_PRICE} ₾</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">მიწოდება</span>
              <span className={`font-semibold tabular-nums ${hasTwoSelected ? "text-success" : "text-foreground"}`}>
                {hasTwoSelected ? "უფასო" : "5 ₾"}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-1.5">
              <span className="font-bold text-foreground">ჯამი</span>
              <span className="font-extrabold text-primary text-lg tabular-nums">{totalPrice.toFixed(2)} ₾</span>
            </div>
          </div>

          {/* CTA */}
          {hasTwoSelected ? (
            <Button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full h-13 text-base font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
            >
              დაამატე 2 პროდუქტი {UPSELL_BUNDLE_PRICE}₾-ად
            </Button>
          ) : (
            <Button
              onClick={() => { if (selectedIds.size > 0) handleAccept(); else handleSkip(); }}
              disabled={submitting}
              className="w-full h-13 text-base font-bold rounded-xl"
              size="lg"
              variant={selectedIds.size > 0 ? "default" : "outline"}
            >
              {selectedIds.size > 0
                ? "დაამატე"
                : "გაფორმება 5₾ მიწოდებით"
              }
            </Button>
          )}

          {/* Helper text */}
          <p className="text-[11px] text-muted-foreground text-center mt-2 leading-snug">
            {hasTwoSelected
              ? ""
              : "თუ არაფერს დაამატებ, შეკვეთა მაინც გაფორმდება და მიწოდება იქნება 5₾"
            }
          </p>

          {/* Skip link */}
          {!hasTwoSelected && selectedIds.size === 0 && (
            <button
              onClick={handleSkip}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors mt-1"
            >
              არა, გაგრძელება დამატების გარეშე →
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LandingUpsellSheet;
