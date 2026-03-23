import { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { useProducts } from "@/hooks/useProducts";
import { Product } from "@/lib/constants";
import { Plus, Check, Sparkles, ShoppingCart, X, Target, Loader2, CheckCircle2, Gift, Lock, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import ProductSheet from "@/components/ProductSheet";
import { getRecommendedProducts } from "@/lib/recommendationEngine";
import { cn } from "@/lib/utils";

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
  product, cartIconRef, onTapProduct,
}: {
  product: Product;
  cartIconRef: React.RefObject<HTMLDivElement | null>;
  onTapProduct: (product: Product) => void;
}) => {
  const { addItem, remaining } = useCart();
  const [added, setAdded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
    setAdded(true);
    if (imgRef.current && cartIconRef.current) flyToCart(imgRef.current, cartIconRef.current);
    const newRemaining = Math.max(0, remaining - 1);
    if (newRemaining > 0) {
      toast(`დამატებულია — კიდევ ${newRemaining} პროდუქტი`, { duration: 1500 });
    }
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm cursor-pointer active:scale-[0.97] transition-transform" onClick={() => onTapProduct(product)}>
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        <img ref={imgRef} src={product.image} alt={product.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      </div>
      <div className="p-2 space-y-1">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-1">{product.title}</p>
        <p className="text-sm font-bold text-primary">{product.price} ₾</p>
        <Button onClick={handleAdd} size="sm" className={cn("w-full h-7 text-xs font-bold rounded-md transition-all duration-200", added && "bg-success hover:bg-success text-success-foreground")} disabled={added}>
          {added ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> ✓</span> : <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> დამატება</span>}
        </Button>
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
  const [cachedRanking, setCachedRanking] = useState<{ gapFillers: Product[]; recommended: Product[] } | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  // Progress pulse animation
  const [pulsing, setPulsing] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 450);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  const handleTapProduct = useCallback((product: Product) => setSheetProduct(product), []);

  useEffect(() => {
    if (open && products.length > 0 && remaining > 0) {
      const result = getRecommendedProducts(null, items, remaining, products);
      setCachedRanking(result);
      setVisibleCount(PAGE_SIZE);
    } else if (!open) {
      setCachedRanking(null);
      setVisibleCount(PAGE_SIZE);
    }
  }, [open, products]);

  // NO auto-close/redirect — user decides when to proceed
  const progress = Math.min(100, (itemCount / threshold) * 100);
  const cartIds = useMemo(() => new Set(items.map((i) => i.product.id)), [items]);
  const gapFillers = useMemo(() => cachedRanking ? cachedRanking.gapFillers.filter((p) => !cartIds.has(p.id)) : [], [cachedRanking, cartIds]);
  const allRecommended = useMemo(() => cachedRanking ? cachedRanking.recommended.filter((p) => !cartIds.has(p.id)) : [], [cachedRanking, cartIds]);
  const visibleRecommended = useMemo(() => allRecommended.slice(0, visibleCount), [allRecommended, visibleCount]);
  const hasMoreRecommended = visibleCount < allRecommended.length;
  const handleLoadMore = useCallback(() => { setLoadingMore(true); setTimeout(() => { setVisibleCount((prev) => prev + PAGE_SIZE); setLoadingMore(false); }, 300); }, []);

  const handleViewCart = () => { onClose(); openCart(); };
  const hasContent = gapFillers.length > 0 || allRecommended.length > 0;
  const showEmpty = !isLoading && !hasContent;

  const StatusIcon = isUnlocked ? PartyPopper : itemCount > 0 ? Gift : Lock;

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[85vh] focus:outline-none flex flex-col">
          <DrawerTitle className="sr-only">რეკომენდაციები</DrawerTitle>

          {/* ── Sticky header with DOMINANT progress ── */}
          <div className="flex-shrink-0 sticky top-0 z-20 bg-card">
            {/* Mission + progress row */}
            <div className="px-4 py-2.5 space-y-2">
              <div className="flex items-center gap-2.5">
                <button onClick={onClose} className="p-1 -ml-1 rounded-md hover:bg-muted flex-shrink-0">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>

                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  isUnlocked ? "bg-success text-success-foreground" : "bg-primary/15 text-primary",
                  pulsing && "scale-125"
                )}>
                  <StatusIcon className="w-3 h-3" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-[13px] font-bold leading-tight truncate",
                    isUnlocked ? "text-success" : "text-foreground"
                  )}>
                    {isUnlocked
                      ? "🎉 შეკვეთა მზადაა"
                      : remaining === 1
                      ? "🔥 კიდევ 1 პროდუქტი დარჩა!"
                      : `კიდევ ${remaining} პროდუქტი — გახსნი შეკვეთას`}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    კალათაში {itemCount} / {threshold} პროდუქტი
                  </p>
                </div>

                <button onClick={handleViewCart} className="relative p-1.5 rounded-md hover:bg-muted flex-shrink-0">
                  <div ref={cartIconRef}><ShoppingCart className="w-5 h-5 text-foreground" /></div>
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{itemCount}</span>
                  )}
                </button>
              </div>

              {/* Thick elastic progress bar */}
              <div className="h-2.5 bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-out",
                    isUnlocked ? "delivery-path-complete progress-glow-success" : "delivery-path-active progress-glow",
                    pulsing && "animate-pulse-fill"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Last added confirmation */}
            {lastAddedProduct && (
              <div className="px-4 py-2 flex items-center gap-2.5 bg-accent/30 border-y border-border/30">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <img src={lastAddedProduct.image} alt={lastAddedProduct.title} className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-success leading-tight">დამატებულია ✓</p>
                  <p className="text-[11px] font-medium text-foreground line-clamp-1">{lastAddedProduct.title}</p>
                </div>
                <span className="text-xs font-bold text-primary flex-shrink-0">{lastAddedProduct.price} ₾</span>
              </div>
            )}

            <div className="h-px bg-border/50" />
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
                {gapFillers.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2.5 mt-3">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">იდეალური გასახსნელად</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {gapFillers.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} />
                      ))}
                    </div>
                  </div>
                )}

                {visibleRecommended.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">ხშირად ამატებენ ასევე</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visibleRecommended.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} />
                      ))}
                    </div>
                    <div className="flex justify-center mt-4 mb-2">
                      {hasMoreRecommended ? (
                        <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore} className="gap-2 text-xs font-bold">
                          {loadingMore ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> იტვირთება...</> : "მეტის ჩატვირთვა"}
                        </Button>
                      ) : allRecommended.length > PAGE_SIZE ? (
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

      <ProductSheet product={sheetProduct} open={!!sheetProduct} onClose={() => setSheetProduct(null)} />
    </>
  );
};

export default SoftCheckoutSheet;
