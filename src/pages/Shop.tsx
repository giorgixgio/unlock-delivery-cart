import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { rankingEngine, getWeightedRandom } from "@/lib/rankingEngine";
import { trackScrollDepth } from "@/lib/gridTracker";
import { Product } from "@/lib/constants";
import { getStockOverrides } from "@/lib/stockOverrideStore";
import ProductCard from "@/components/ProductCard";
import HeroProductCard from "@/components/HeroProductCard";
import MissionHeroStrip from "@/components/MissionHeroStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ChevronDown } from "lucide-react";

const INITIAL_LOAD = 16;
const LOAD_MORE_BATCH = 12;

/** Skeleton grid for loading state */
const GridSkeleton = () => (
  <>
    {/* Top section skeleton */}
    <div className="flex gap-2.5">
      <div className="flex-1 rounded-xl overflow-hidden border border-border">
        <Skeleton className="aspect-square w-full" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={`side-${i}`} className="rounded-lg overflow-hidden border border-border">
            <Skeleton className="aspect-square w-full" />
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
    {/* Below grid skeletons */}
    <div className="grid grid-cols-2 gap-2.5 mt-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg overflow-hidden border border-border">
          <Skeleton className="aspect-square w-full" />
          <div className="p-2 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  </>
);

/** Section label between grid sections */
const SectionLabel = ({ label }: { label: string }) => (
  <div className="col-span-2 py-2 px-1">
    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{label}</h3>
  </div>
);
/** Scroll cue — subtle chevron that auto-hides after first scroll */
const ScrollCue = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 80) setVisible(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex flex-col items-center py-3 animate-bounce-slow">
      <span className="text-[11px] font-semibold text-muted-foreground">იხილე მეტი</span>
      <ChevronDown className="w-4 h-4 text-muted-foreground" />
    </div>
  );
};

const Shop = () => {
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("product_id");
  const { data: allProducts = [], isLoading } = useProducts();
  // Find hero product
  const heroProduct = useMemo(() => {
    if (!productId || allProducts.length === 0) return null;
    return allProducts.find((p) => p.id === productId || p.handle === productId) ?? null;
  }, [productId, allProducts]);

  // Build ranked grid
  const { sections, initialFlat } = useMemo(() => {
    if (allProducts.length === 0) return { sections: [], initialFlat: [] };
    const result = rankingEngine(heroProduct, allProducts);
    // Limit initial load
    const flat = result.flat.slice(0, INITIAL_LOAD);
    return { sections: result.sections, initialFlat: flat };
  }, [heroProduct, allProducts]);

  // Infinite scroll state
  const [extraItems, setExtraItems] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadedIdsRef = useRef<Set<string>>(new Set());

  // Track which IDs are already shown
  useEffect(() => {
    const ids = new Set(initialFlat.map((p) => p.id));
    extraItems.forEach((p) => ids.add(p.id));
    loadedIdsRef.current = ids;
  }, [initialFlat, extraItems]);

  // Reset on product change
  useEffect(() => {
    setExtraItems([]);
    setHasMore(true);
    lastDepthRef.current = 0;
  }, [productId, allProducts]);

  const loadMore = useCallback(() => {
    if (allProducts.length === 0) return;
    const batch = getWeightedRandom(heroProduct, allProducts, loadedIdsRef.current, LOAD_MORE_BATCH);
    if (batch.length === 0) {
      setHasMore(false);
      return;
    }
    setExtraItems((prev) => [...prev, ...batch]);
  }, [allProducts, heroProduct]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Scroll depth tracking (throttled)
  const lastDepthRef = useRef(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const depth = Math.round(
          (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        );
        // Track every 25% milestone
        const milestone = Math.floor(depth / 25) * 25;
        if (milestone > lastDepthRef.current && milestone > 0) {
          lastDepthRef.current = milestone;
          trackScrollDepth(milestone, heroProduct?.id);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [heroProduct?.id]);

  // Number of side-stack products next to hero
  const SIDE_STACK_COUNT = 2;

  /** Build flat ordered product list from sections, capped at INITIAL_LOAD */
  const buildInitialList = () => {
    const list: { product: Product; sectionType: string }[] = [];
    let count = 0;
    for (const section of sections) {
      if (count >= INITIAL_LOAD) break;
      for (const product of section.products) {
        if (count >= INITIAL_LOAD) break;
        list.push({ product, sectionType: section.type });
        count++;
      }
    }
    return list;
  };

  const overrides = getStockOverrides();
  const heroIsOOS = heroProduct && (overrides[heroProduct.id] !== undefined ? !overrides[heroProduct.id] : heroProduct.available === false);
  const sectionLabels: Record<string, string> = {
    related: heroIsOOS ? "აღმოაჩინე მსგავსი" : "მსგავსი პროდუქტები",
    trending: "ტრენდული",
    weighted: "შენთვის",
  };

  return (
    <main className="pb-32">
      <MissionHeroStrip />

      <div className="container max-w-2xl mx-auto px-3 pt-3">
        {/* Fallback message if hero not found */}
        {productId && !isLoading && !heroProduct && allProducts.length > 0 && !allProducts.find(p => p.id === productId || p.handle === productId) && (
          <div className="bg-accent/50 border border-border rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              პროდუქტი ვერ მოიძებნა — გაეცანით ტრენდულ პროდუქტებს
            </p>
          </div>
        )}

        {isLoading ? (
          <GridSkeleton />
        ) : (
          (() => {
            const allInitial = buildInitialList();
            if (allInitial.length === 0) return null;

            const heroItem = allInitial[0];
            const sideItems = allInitial.slice(1, 1 + SIDE_STACK_COUNT);
            const restItems = allInitial.slice(1 + SIDE_STACK_COUNT);

            return (
              <>
                {/* === TOP SECTION: hero left + 2 stacked right === */}
                <div className="flex gap-2.5">
                  {/* Hero — left, takes ~50% */}
                  <div className="flex-1 min-w-0">
                    <HeroProductCard key={heroItem.product.id} product={heroItem.product} />
                  </div>
                  {/* Right column — 2 stacked cards */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    {sideItems.map((item) => (
                      <ProductCard key={item.product.id} product={item.product} />
                    ))}
                  </div>
                </div>

                {/* Scroll cue */}
                {restItems.length > 0 && <ScrollCue />}

                {/* === NORMAL GRID: remaining items === */}
                {restItems.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                    {(() => {
                      const els: React.ReactNode[] = [];
                      let lastType = "";
                      for (const item of restItems) {
                        if (item.sectionType !== lastType && item.sectionType !== "hero" && sectionLabels[item.sectionType]) {
                          els.push(<SectionLabel key={`label-${item.sectionType}`} label={sectionLabels[item.sectionType]} />);
                          lastType = item.sectionType;
                        }
                        els.push(<ProductCard key={item.product.id} product={item.product} />);
                      }
                      // Extra items from infinite scroll
                      if (extraItems.length > 0) {
                        els.push(<SectionLabel key="label-more" label="მეტი პროდუქტი" />);
                        for (const product of extraItems) {
                          els.push(<ProductCard key={product.id} product={product} />);
                        }
                      }
                      return els;
                    })()}
                  </div>
                )}

                {hasMore && (
                  <div ref={loaderRef} className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </main>
  );
};

export default Shop;
