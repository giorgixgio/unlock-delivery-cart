import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Check, X } from "lucide-react";
import { Product } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import { getRelated } from "@/lib/rankingEngine";
import { addUpsellItems } from "@/lib/orderService";
import {
  trackUpsellViewed,
  trackUpsellItemSelected,
  trackUpsellItemDeselected,
  trackUpsellCompleted,
  trackUpsellSkipped,
} from "@/lib/funnelTracking";

interface LandingUpsellSheetProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  baseProduct: Product;
  basePrice: number;
  onComplete: (deliveryFee: number, newTotal: number) => void;
  onSkip: () => void;
}

const BUNDLE_PRICE = 19;
const MAX_SELECT = 2;
// Sticky orange announcement bar height (28px per Fix #1) + safe area
const TOP_SAFE_PADDING = "calc(28px + env(safe-area-inset-top))";

const LandingUpsellSheet = ({
  open,
  onClose: _onClose,
  orderId,
  orderNumber,
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
      trackUpsellViewed({
        orderId,
        originalProductId: baseProduct.id,
        shownUpsellProductIds: upsellProducts.slice(0, 10).map((p) => p.id),
        requiredBundleCount: MAX_SELECT,
        bundlePrice: BUNDLE_PRICE,
      });
      setSelectedIds(new Set());
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        trackUpsellItemDeselected(orderId, id, next.size);
      } else if (next.size < MAX_SELECT) {
        next.add(id);
        trackUpsellItemSelected(orderId, id, next.size);
      }
      return next;
    });
  };

  const filled = selectedIds.size;
  const complete = filled >= MAX_SELECT;

  const selectedItems = useMemo(() => {
    return Array.from(selectedIds).map((id) => {
      const p = upsellProducts.find((x) => x.id === id)!;
      return { product: p, quantity: 1 };
    });
  }, [selectedIds, upsellProducts]);

  const selectedProductsTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [selectedItems]);

  const deliveryFee = complete ? 0 : 5;
  const upsellTotal = complete ? BUNDLE_PRICE : selectedProductsTotal;
  const total = basePrice + upsellTotal + deliveryFee;

  const handleClose = () => {
    trackUpsellSkipped(orderId, filled);
    onSkip();
  };

  const handleContinue = async () => {
    // 0 selected: skip without adding anything
    if (filled === 0) {
      trackUpsellSkipped(orderId, filled);
      onSkip();
      return;
    }

    setSubmitting(true);
    try {
      if (complete) {
        // 2 selected: bundle deal — 19 GEL, free shipping
        await addUpsellItems(orderId, selectedItems, 0, total);
        trackUpsellCompleted({
          orderId,
          selectedUpsellProductIds: Array.from(selectedIds),
          upsellBundleValue: BUNDLE_PRICE,
        });
        onComplete(0, total);
      } else {
        // 1 selected: add at regular price, keep 5 GEL shipping
        const newTotal = basePrice + selectedProductsTotal + 5;
        await addUpsellItems(orderId, selectedItems, 5, newTotal);
        trackUpsellSkipped(orderId, filled);
        onComplete(5, newTotal);
      }
    } catch (err) {
      console.error("Upsell failed:", err);
      onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        <SheetTitle className="sr-only">შეთავაზება</SheetTitle>

        {/* ═══ ZONE 1: FIXED HEADER ═══ */}
        <div
          className="flex-shrink-0 bg-card border-b border-border"
          style={{ paddingTop: TOP_SAFE_PADDING }}
        >
          {/* Top bar: handle + X in its own space */}
          <div className="relative flex items-center justify-center px-4 pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
            <button
              onClick={handleClose}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
              aria-label="დახურვა"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="px-4 pb-2">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                ნაბიჯი 2/2
              </p>
            </div>
            <div className="mb-2 h-[4px] w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                style={{ width: "100%" }}
              />
            </div>

            {/* Compact reassurance line */}
            {orderNumber && (
              <p className="mb-1.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight">
                ✅ შეკვეთა #{orderNumber} დადასტურდა — ეს არის დამატებითი შეთავაზება
              </p>
            )}

            {/* Headline + subline */}
            <div className="text-center">
              <h2 className="text-lg font-extrabold text-foreground leading-tight">
                მიიღე კიდევ 2 პროდუქტი — მხოლოდ{" "}
                <span className="text-[1.3em] font-black text-primary">{BUNDLE_PRICE}₾</span>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                ცალკე ღირს ~40₾ · +{" "}
                <span className="font-bold text-success">მიტანა უფასო</span>{" "}
                (ზოგავ 5₾-ს)
              </p>
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
          <div className="sticky bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        {/* ═══ ZONE 3: STICKY BOTTOM CTA ═══ */}
        <div className="flex-shrink-0 bg-card border-t border-border px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleContinue}
            disabled={submitting}
            className="w-full h-12 rounded-xl bg-success text-success-foreground font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {filled === 0 && "გაგრძელება →"}
            {filled === 1 && "დაამატე 1 პროდუქტი — გაგრძელება →"}
            {filled === 2 && (
              <>
                დაამატე 2 პროდუქტი —{" "}
                <span className="text-base font-black">{BUNDLE_PRICE}₾</span>{" "}
                · <span className="font-black">მიტანა უფასო</span> →
              </>
            )}
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
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm animate-in zoom-in-75 duration-200">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="px-2 py-1.5">
        <p className="text-[11px] font-semibold text-foreground line-clamp-3 leading-snug min-h-[3lh]">
          {product.title}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ცალკე {product.price}₾
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {selected ? "✓ არჩეულია" : "აირჩიე"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default LandingUpsellSheet;
