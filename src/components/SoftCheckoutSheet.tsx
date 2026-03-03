import { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useProducts } from "@/hooks/useProducts";
import { DELIVERY_THRESHOLD, Product } from "@/lib/constants";
import { Plus, Check, Sparkles, ShoppingCart, X, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import AnimatedNumber from "@/components/AnimatedNumber";
import DeliveryMissionBar from "@/components/DeliveryMissionBar";
import ProductSheet from "@/components/ProductSheet";
import { getRecommendedProducts } from "@/lib/recommendationEngine";

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
  clone.style.cssText = `
    position:fixed; z-index:9999; pointer-events:none; border-radius:8px;
    width:${imgRect.width}px; height:${imgRect.height}px;
    left:${imgRect.left}px; top:${imgRect.top}px; object-fit:cover;
  `;
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
  product,
  cartIconRef,
  onTapProduct,
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
    if (imgRef.current && cartIconRef.current) {
      flyToCart(imgRef.current, cartIconRef.current);
    }
    const newRemaining = Math.max(0, remaining - product.price);
    if (newRemaining > 0) {
      toast(`დამატებულია — კიდევ ${newRemaining.toFixed(1)} ₾`, { duration: 1500 });
    }
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div
      className="bg-card rounded-lg border border-border overflow-hidden shadow-sm cursor-pointer active:scale-[0.97] transition-transform"
      onClick={() => onTapProduct(product)}
    >
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        <img ref={imgRef} src={product.image} alt={product.title}
          className="w-full h-full object-cover" loading="lazy" decoding="async" />
      </div>
      <div className="p-2 space-y-1">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-1">{product.title}</p>
        <p className="text-sm font-bold text-primary">{product.price} ₾</p>
        <Button
          onClick={handleAdd} size="sm"
          className={`w-full h-7 text-xs font-bold rounded-md transition-all duration-200 ${
            added ? "bg-success hover:bg-success text-success-foreground" : ""
          }`}
          disabled={added}
        >
          {added ? (
            <span className="flex items-center gap-1"><Check className="w-3 h-3" /> ✓</span>
          ) : (
            <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> დამატება</span>
          )}
        </Button>
      </div>
    </div>
  );
});
SheetProductCard.displayName = "SheetProductCard";

// ── Skeleton Grid ──
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
  const { total, isUnlocked, remaining, itemCount, items, isFreeDelivery } = useCart();
  const { data: products = [], isLoading } = useProducts();
  const prevUnlocked = useRef(isUnlocked);
  const { openCart } = useCartOverlay();
  const cartIconRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastScrollTop = useRef(0);

  // ProductSheet state
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);

  // ── Cached ranked list (computed once on open, stable during session) ──
  const [cachedRanking, setCachedRanking] = useState<{ gapFillers: Product[]; recommended: Product[] } | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleTapProduct = useCallback((product: Product) => {
    setSheetProduct(product);
  }, []);

  // Compute and cache ranking when sheet opens
  useEffect(() => {
    if (open && products.length > 0 && remaining > 0) {
      const result = getRecommendedProducts(null, items, remaining, products);
      setCachedRanking(result);
      setVisibleCount(PAGE_SIZE);
    } else if (!open) {
      setCachedRanking(null);
      setVisibleCount(PAGE_SIZE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products]);

  // Reset state when sheet opens
  useEffect(() => {
    if (open) {
      prevUnlocked.current = false;
      setHeaderCollapsed(false);
      lastScrollTop.current = 0;
    }
  }, [open]);

  // Auto-close and proceed when threshold is reached
  useEffect(() => {
    if (open && isUnlocked) {
      const timer = setTimeout(() => {
        onClose();
        onProceed();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isUnlocked, open, onClose, onProceed]);

  // Scroll direction detection
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const st = el.scrollTop;
    const delta = st - lastScrollTop.current;
    if (delta > 15 && st > 60) setHeaderCollapsed(true);
    else if (delta < -12) setHeaderCollapsed(false);
    lastScrollTop.current = st;
  }, []);

  const progress = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);
  const gap = remaining;
  const almostThere = gap > 0 && gap < 5;

  // ── Filter out cart items from cached ranking on render ──
  const cartIds = useMemo(() => new Set(items.map((i) => i.product.id)), [items]);

  const gapFillers = useMemo(() => {
    if (!cachedRanking) return [];
    return cachedRanking.gapFillers.filter((p) => !cartIds.has(p.id));
  }, [cachedRanking, cartIds]);

  const allRecommended = useMemo(() => {
    if (!cachedRanking) return [];
    return cachedRanking.recommended.filter((p) => !cartIds.has(p.id));
  }, [cachedRanking, cartIds]);

  const visibleRecommended = useMemo(
    () => allRecommended.slice(0, visibleCount),
    [allRecommended, visibleCount]
  );

  const hasMoreRecommended = visibleCount < allRecommended.length;

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setLoadingMore(false);
    }, 300);
  }, []);

  const handleViewCart = () => {
    onClose();
    openCart();
  };

  const hasContent = gapFillers.length > 0 || allRecommended.length > 0;
  const showEmpty = !isLoading && !hasContent;

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[88vh] focus:outline-none flex flex-col">
          <DrawerTitle className="sr-only">მინიმალური შეკვეთა</DrawerTitle>

          {/* ── Sticky Header (progress section) ── */}
          <div className="flex-shrink-0 sticky top-0 z-20 bg-card border-b border-border/50 shadow-sm">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <button onClick={onClose} className="p-1 -ml-1 rounded-md hover:bg-muted">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
              <span className="text-xs font-bold text-muted-foreground">
                <AnimatedNumber value={total} /> / {DELIVERY_THRESHOLD} ₾
              </span>
              <button onClick={handleViewCart} className="relative p-1.5 rounded-md hover:bg-muted">
                <div ref={cartIconRef}>
                  <ShoppingCart className="w-5 h-5 text-foreground" />
                </div>
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>

            <div className="px-4 pb-2 space-y-2">
              <div className="text-center space-y-0.5">
                <h2 className={`text-base font-extrabold text-foreground ${almostThere ? "almost-there-text" : ""}`}>
                  {almostThere
                    ? "თითქმის მოხერხდა! 🔥"
                    : `მინ. შეკვეთა ${DELIVERY_THRESHOLD}₾ — აკლია ${gap.toFixed(1)}₾`}
                </h2>
                <p className="text-xs text-muted-foreground">
                  დაამატე 1–2 პროდუქტი შეკვეთის გასააქტიურებლად
                </p>
              </div>
              <DeliveryMissionBar />
            </div>
          </div>

          {/* ── Scrollable content ── */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 pb-6">
            {isLoading ? (
              <SkeletonGrid />
            ) : showEmpty ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                რეკომენდაციები ამჟამად არ არის — დაამატეთ კატალოგიდან
              </div>
            ) : (
              <>
                {/* Section 1: Perfect to unlock */}
                {gapFillers.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3 mt-3">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">იდეალური გასახსნელად</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {gapFillers.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 2: Recommended for you (paginated) */}
                {visibleRecommended.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">რეკომენდაცია შენთვის</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {visibleRecommended.map((product) => (
                        <SheetProductCard key={product.id} product={product} cartIconRef={cartIconRef} onTapProduct={handleTapProduct} />
                      ))}
                    </div>

                    {/* Load more / exhausted */}
                    <div className="flex justify-center mt-4 mb-2">
                      {hasMoreRecommended ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="gap-2 text-xs font-bold"
                        >
                          {loadingMore ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              იტვირთება...
                            </>
                          ) : (
                            "მეტის ჩატვირთვა"
                          )}
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

          {/* Unlocked state overlay */}
          {isUnlocked && (
            <div className="absolute inset-0 bg-card/90 flex items-center justify-center z-10 rounded-t-[10px]">
              <div className="text-center space-y-2 animate-success-reveal">
                <p className="text-2xl font-extrabold text-success">🎉 შეკვეთა მზადაა — მიტანა უფასო!</p>
                <p className="text-sm text-muted-foreground">გადამისამართება...</p>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* ProductSheet opened from within Unlock Sheet */}
      <ProductSheet
        product={sheetProduct}
        open={!!sheetProduct}
        onClose={() => setSheetProduct(null)}
      />
    </>
  );
};

export default SoftCheckoutSheet;
