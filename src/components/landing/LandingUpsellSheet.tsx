import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

const BUNDLE_PRICE = 19;
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

  const toggle = (id: string) => {
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

  const filled = selectedIds.size;
  const complete = filled >= MAX_SELECT;
  const deliveryFee = complete ? 0 : 5;
  const upsellPrice = complete ? BUNDLE_PRICE : 0;
  const total = basePrice + upsellPrice + deliveryFee;

  const handleAccept = async () => {
    if (!complete) return; // Only allow confirmation with full bundle
    setSubmitting(true);
    try {
      const items = Array.from(selectedIds).map((id) => {
        const p = upsellProducts.find((x) => x.id === id)!;
        return { product: p, quantity: 1 };
      });
      await addUpsellItems(orderId, items, deliveryFee, total);
      trackEvent("upsell_confirmed", {
        order_id: orderId,
        selected_count: items.length,
        upsell_price: upsellPrice,
        delivery_fee: deliveryFee,
        new_total: total,
        selected_ids: Array.from(selectedIds),
      });
      trackEvent("upsell_completed", {
        order_id: orderId,
        bundle_price: BUNDLE_PRICE,
        free_shipping: true,
      });
      onComplete(deliveryFee, total);
    } catch (err) {
      console.error("Upsell failed:", err);
      onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    trackEvent("upsell_skipped", { order_id: orderId, base_product_id: baseProduct.id });
    onSkip();
  };

  const needed = MAX_SELECT - filled;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        <SheetTitle className="sr-only">შეთავაზება</SheetTitle>

        {/* ═══ ZONE 1: FIXED HEADER ═══ */}
        <div className="flex-shrink-0 bg-card border-b border-border">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          <div className="px-4 pb-3">
            {/* Title row */}
            <div className="flex items-start gap-3 pr-8 relative">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Gift className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-extrabold text-foreground leading-snug">
                  აირჩიე 2 პროდუქტი მხოლოდ {BUNDLE_PRICE}₾-ად
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {complete
                    ? "✅ მიტანა უფასოა"
                    : `კიდევ ${needed} — და მიტანა უფასო იქნება`}
                </p>
              </div>
              <button
                onClick={handleSkip}
                className="absolute top-0 right-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 flex gap-1.5">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-[5px] rounded-full transition-colors duration-300 ${
                      filled > i ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] font-bold text-muted-foreground tabular-nums w-7 text-right">
                {filled}/{MAX_SELECT}
              </span>
              {complete && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-success animate-in fade-in duration-300">
                  <Truck className="w-3.5 h-3.5" />
                  უფასო
                </span>
              )}
            </div>

            {/* Deal banner */}
            <div className="mt-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🔥</span>
                <span className="text-xs font-bold text-foreground">ნებისმიერი 2 პროდუქტი</span>
              </div>
              <div className="text-right">
                <span className="text-base font-extrabold text-primary">{BUNDLE_PRICE}₾</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ZONE 2: SCROLLABLE PRODUCT GRID ═══ */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-background relative">
          <div className="px-2.5 py-2">
            {upsellProducts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                პროდუქტები იტვირთება...
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {upsellProducts.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const isMaxed = filled >= MAX_SELECT && !isSelected;
                  return (
                    <UpsellCard
                      key={p.id}
                      product={p}
                      selected={isSelected}
                      disabled={isMaxed}
                      onTap={() => !isMaxed && toggle(p.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
          {/* Scroll fade hint */}
          <div className="sticky bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        {/* ═══ ZONE 3: STICKY BOTTOM CTA ═══ */}
        <div className="flex-shrink-0 bg-card border-t border-border px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Benefit message */}
          {!complete && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 mb-2.5">
              <Truck className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-[11px] font-semibold text-foreground leading-snug">
                აირჩიე 2 პროდუქტი და მიტანა გახდება <span className="text-success font-bold">უფასო</span> — დაზოგე 5₾
              </span>
            </div>
          )}
          {complete && (
            <div className="flex items-center justify-between rounded-lg bg-success/10 border border-success/20 px-3 py-2 mb-2.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-[11px] font-bold text-success">✅ მიტანა უფასოა</span>
              </div>
              <span className="text-xs font-extrabold text-primary tabular-nums">{BUNDLE_PRICE}₾</span>
            </div>
          )}

          {/* CTA */}
          {complete ? (
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-success text-success-foreground font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              დაამატე 2 პროდუქტი {BUNDLE_PRICE}₾-ად
            </button>
          ) : (
            <button
              disabled
              className="w-full h-12 rounded-xl font-bold text-sm bg-muted text-muted-foreground border border-border opacity-60 cursor-not-allowed"
            >
              {filled === 0
                ? "აირჩიე 2 პროდუქტი გასაგრძელებლად"
                : "დაამატე კიდევ 1 პროდუქტი"}
            </button>
          )}

          <button
            onClick={handleSkip}
            className="w-full text-center text-[11px] text-muted-foreground underline underline-offset-2 py-1.5 mt-0.5"
          >
            გაფორმება 5₾ მიწოდებით →
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ── Product Card Sub-component ── */

function UpsellCard({
  product,
  selected,
  disabled,
  onTap,
}: {
  product: Product;
  selected: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={`
        relative rounded-xl border-2 text-left transition-all duration-200 overflow-hidden
        ${selected
          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
          : "border-border bg-card"
        }
        ${disabled ? "opacity-30 pointer-events-none" : "active:scale-[0.97]"}
      `}
    >
      {/* Checkmark badge */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm animate-in zoom-in-75 duration-200">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      {/* Image */}
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="px-2 py-1.5">
        <p className="text-[11px] font-semibold text-foreground line-clamp-3 leading-snug min-h-[3lh]">
          {product.title}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground line-through tabular-nums">
            {product.price}₾
          </span>
          <span className={`text-[10px] font-bold ${selected ? "text-primary" : "text-muted-foreground"}`}>
            {selected ? "✓ არჩეულია" : "აირჩიე"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default LandingUpsellSheet;
