import { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { useProducts } from "@/hooks/useProducts";
import { Product } from "@/lib/constants";
import { Plus, Check, Sparkles, ShoppingCart, X, Loader2, CheckCircle2, Gift, Lock, PartyPopper, Star } from "lucide-react";
import { toast } from "sonner";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import ProductSheet from "@/components/ProductSheet";
import { getRecommendedProducts } from "@/lib/recommendationEngine";
import { cn } from "@/lib/utils";
import MiniMissionBar from "@/components/MiniMissionBar";
import { trackEvent } from "@/lib/analytics";

const PAGE_SIZE = 10;

interface SoftCheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  onProceed: () => void;
  source: string;
}

// ── Fly-to-cart animation helper ──
function flyToCart(imgEl: HTMLImageElement, targetEl: HTMLElement) {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  targetEl.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }],
    { duration: 300, easing: "ease-out" }
  );
  if (prefersReduced) return;
  const imgRect = imgEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const clone = document.createElement("img");
  clone.src = imgEl.src;
  clone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;border-radius:8px;width:${imgRect.width}px;height:${imgRect.height}px;left:${imgRect.left}px;top:${imgRect.top}px;object-fit:cover;`;
  document.body.appendChild(clone);
  const dx = targetRect.left + targetRect.width / 2 - (imgRect.left + imgRect.width / 2);
  const dy = targetRect.top + targetRect.height / 2 - (imgRect.top + imgRect.height / 2);
  clone.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: "1" },
      { transform: `translate(${dx * 0.4}px,${dy * 0.3 - 40}px) scale(0.5) rotate(-15deg)`, opacity: "0.8", offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(0.15) rotate(-30deg)`, opacity: "0" },
    ],
    { duration: 500, easing: "cubic-bezier(0.2,0.8,0.2,1)", fill: "forwards" }
  );
  setTimeout(() => clone.remove(), 550);
}

// ── Product Card ──
const SheetProductCard = memo(({
  product, cartIconRef, onTapProduct, onAdd,
}: {
  product: Product;
  cartIconRef: React.RefObject<HTMLDivElement | null>;
  onTapProduct: (product: Product) => void;
  onAdd?: () => void;
}) => {
  const { addAndGate } = useCheckoutGate();
  const [added, setAdded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addAndGate(product, "popup");
    onAdd?.();
    setAdded(true);
    if (imgRef.current && cartIconRef.current) flyToCart(imgRef.current, cartIconRef.current);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm cursor-pointer active:scale-[0.97] transition-transform" onClick={() => onTapProduct(product)}>
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        <img ref={imgRef} src={product.image} alt={product.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      </div>
      <div className="p-2 space-y-1">
        <p className="text-[11px] font-medium text-foreground leading-[14px] line-clamp-2 h-[28px]">{product.title}</p>
        <p className="text-sm font-bold text-primary">{product.price} ₾</p>
        <Button onClick={handleAdd} size="sm" className={cn("w-full h-7 text-xs font-bold rounded-md transition-all duration-200", added && "bg-success hover:bg-success text-success-foreground")} disabled={added}>
          {added ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> ✓</span> : <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> დამატება</span>}
        </Button>
        <p className="text-[8px] text-muted-foreground text-center leading-tight">გადახდა მიღებისას</p>
      </div>
    </div>
  );
});
SheetProductCard.displayName = "SheetProductCard";

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="space-y-1.5">
        <Skeleton className="w-full aspect-square rounded-lg" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-7 w-full rounded-md" />
      </div>
    ))}
  </div>
);

// ── Main Component ──
const SoftCheckoutSheet = ({ open, onClose, onProceed, source }: SoftCheckoutSheetProps) => {
  const { total, isUnlocked, remaining, itemCount, items, threshold } = useCart();
  const { lastAddedProduct } = useCheckoutGate();
  const { data: products = [], isLoading } = useProducts();
  const { openCart } = useCartOverlay();
  const cartIconRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [cachedRanking, setCachedRanking] = useState<{ similar: Product[]; broader: Product[] } | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const prevCount = useRef(itemCount);
  const addedDuringSession = useRef(0);

  // Track popup_shown once per open
  useEffect(() => {
    if (open) {
      addedDuringSession.current = 0;
      trackEvent("popup_shown", {
        source,
        cart_count: itemCount,
        cart_value: total,
        threshold,
        items_to_threshold: remaining,
        is_unlocked: isUnlocked,
        popup_type: "cart_builder",
        context: isUnlocked ? "post_threshold" : "pre_threshold",
      });
    }
  }, [open]);

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      // pulse handled elsewhere
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  const handleTapProduct = useCallback((product: Product) => setSheetProduct(product), []);

  useEffect(() => {
    if (open && products.length > 0) {
      const result = getRecommendedProducts(null, items, remaining, products);
      setCachedRanking(result);
      setVisibleCount(PAGE_SIZE);
    } else if (!open) {
      setCachedRanking(null);
      setVisibleCount(PAGE_SIZE);
    }
  }, [open, products]);

  const cartIds = useMemo(() => new Set(items.map((i) => i.product.id)), [items]);
  const similarProducts = useMemo(() => cachedRanking ? cachedRanking.similar.filter((p) => !cartIds.has(p.id)) : [], [cachedRanking, cartIds]);
  const allBroader = useMemo(() => cachedRanking ? cachedRanking.broader.filter((p) => !cartIds.has(p.id)) : [], [cachedRanking, cartIds]);
  const visibleBroader = useMemo(() => allBroader.slice(0, visibleCount), [allBroader, visibleCount]);
  const hasMoreBroader = visibleCount < allBroader.length;
  const handleLoadMore = useCallback(() => { setLoadingMore(true); setTimeout(() => { setVisibleCount((prev) => prev + PAGE_SIZE); setLoadingMore(false); }, 300); }, []);

  const handleViewCart = () => { onClose(); openCart(); };
  const handleCloseSheet = useCallback(() => {
    if (addedDuringSession.current === 0) {
      trackEvent("popup_closed", {
        source,
        cart_count: itemCount,
        cart_value: total,
        threshold,
        items_to_threshold: remaining,
        is_unlocked: isUnlocked,
        popup_type: "cart_builder",
        context: isUnlocked ? "post_threshold" : "pre_threshold",
      });
    }
    onClose();
  }, [onClose, source, itemCount, total, threshold, remaining, isUnlocked]);
  const hasContent = similarProducts.length > 0 || allBroader.length > 0;
  const showEmpty = !isLoading && !hasContent;

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && handleCloseSheet()}>
        <DrawerContent className="max-h-[85vh] focus:outline-none flex flex-col">
          <DrawerTitle className="sr-only">რეკომენდაციები</DrawerTitle>

          {/* ── Sticky header ── */}
          <div className="flex-shrink-0 sticky top-0 z-20 bg-card relative pt-2">
            {/* Floating close button */}
            <button onClick={handleCloseSheet} className="absolute top-2 left-2.5 z-30 p-1.5 rounded-full bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted flex-shrink-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            {/* Floating cart icon */}
            <button onClick={handleViewCart} className="absolute top-2 right-2.5 z-30 p-1.5 rounded-full bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted flex-shrink-0">
              <div ref={cartIconRef}><ShoppingCart className="w-4 h-4 text-foreground" /></div>
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{itemCount}</span>
              )}
            </button>

            <div className="px-3 pb-1.5">
              <MiniMissionBar />
            </div>

            {lastAddedProduct && (
              <div className="px-4 py-1.5 flex items-center gap-2 bg-accent/30 border-t border-border/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                <img src={lastAddedProduct.image} alt={lastAddedProduct.title} className="w-7 h-7 rounded object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-success leading-tight">დამატებულია ✓</p>
                  <p className="text-[10px] font-medium text-foreground line-clamp-1">{lastAddedProduct.title}</p>
                </div>
                <span className="text-[11px] font-bold text-primary flex-shrink-0">{lastAddedProduct.price} ₾</span>
              </div>
            )}
          </div>

          {/* ── Scrollable content ── */}
          <div ref={scrollRef} className={cn("flex-1 overflow-y-auto px-4", isUnlocked ? "pb-28" : "pb-6")}>
            {isLoading ? (
              <SkeletonGrid />
            ) : showEmpty ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                რეკომენდაციები ამჟამად არ არის — დაამატეთ კატალოგიდან
              </div>
            ) : (
              <>
                {/* SECTION 1: Most similar products */}
                {similarProducts.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2.5 mt-3">
                      <Star className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">მსგავსი პროდუქტები</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {similarProducts.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} onAdd={() => { addedDuringSession.current += 1; }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* SECTION 2: Broader catalog */}
                {visibleBroader.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">ასევე შეიძლება მოგეწონოს</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visibleBroader.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} onAdd={() => { addedDuringSession.current += 1; }} />
                      ))}
                    </div>
                    <div className="flex justify-center mt-4 mb-2">
                      {hasMoreBroader ? (
                        <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore} className="gap-2 text-xs font-bold">
                          {loadingMore ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> იტვირთება...</> : "მეტის ჩატვირთვა"}
                        </Button>
                      ) : allBroader.length > PAGE_SIZE ? (
                        <span className="text-xs text-muted-foreground">მეტი აღარ არის</span>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Sticky bottom CTA when unlocked ── */}
          {isUnlocked && (
            <div className="flex-shrink-0 sticky bottom-0 z-20 bg-card border-t border-success/30 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-fade-in">
              <p className="text-center text-[11px] font-semibold text-success mb-1.5">
                ✅ შეკვეთა მზადაა
              </p>
              <Button
                onClick={handleViewCart}
                className="w-full h-12 text-base font-bold rounded-xl bg-success text-success-foreground hover:bg-success/90 shadow-lg"
                size="lg"
              >
                კალათაზე გადასვლა
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <ProductSheet product={sheetProduct} open={!!sheetProduct} onClose={() => setSheetProduct(null)} sourceOverride="popup" onAdd={() => { addedDuringSession.current += 1; }} />
    </>
  );
};

export default SoftCheckoutSheet;
