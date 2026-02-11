import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { rankingEngine, getWeightedRandom } from "@/lib/rankingEngine";
import { trackGridPositionClicked, trackScrollDepth, trackRandomAddToCart } from "@/lib/gridTracker";
import { Product } from "@/lib/constants";
import ProductCard from "@/components/ProductCard";
import HeroProductCard from "@/components/HeroProductCard";
import HomeHeaderTemuStyle from "@/components/HomeHeaderTemuStyle";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const INITIAL_LOAD = 16;
const LOAD_MORE_BATCH = 12;

/** Skeleton grid for loading state */
const GridSkeleton = () => (
  <div className="grid grid-cols-2 gap-3">
    {/* Hero skeleton — full width */}
    <div className="col-span-2 rounded-xl overflow-hidden border border-border">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="rounded-lg overflow-hidden border border-border">
        <Skeleton className="aspect-square w-full" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

/** Section label between grid sections */
const SectionLabel = ({ label }: { label: string }) => (
  <div className="col-span-2 py-2 px-1">
    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{label}</h3>
  </div>
);

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

  const renderGrid = () => {
    const elements: React.ReactNode[] = [];
    const sectionLabels: Record<string, string> = {
      related: "მსგავსი პროდუქტები",
      trending: "ტრენდული",
      weighted: "შენთვის",
    };

    let rendered = 0;

    for (const section of sections) {
      if (rendered >= INITIAL_LOAD) break;

      // Section label (skip for hero)
      if (section.type !== "hero" && section.products.length > 0 && sectionLabels[section.type]) {
        elements.push(<SectionLabel key={`label-${section.type}`} label={sectionLabels[section.type]} />);
      }

      for (const product of section.products) {
        if (rendered >= INITIAL_LOAD) break;

        if (rendered === 0) {
          elements.push(<HeroProductCard key={product.id} product={product} />);
        } else {
          elements.push(<ProductCard key={product.id} product={product} />);
        }
        rendered++;
      }
    }

    // Extra items from infinite scroll
    if (extraItems.length > 0) {
      elements.push(<SectionLabel key="label-more" label="მეტი პროდუქტი" />);
      for (const product of extraItems) {
        elements.push(<ProductCard key={product.id} product={product} />);
      }
    }

    return elements;
  };

  return (
    <main className="pb-52">
      <HomeHeaderTemuStyle />

      <div className="container max-w-2xl mx-auto px-4 pt-4">
        {/* Fallback message if hero not found */}
        {productId && !isLoading && !heroProduct && allProducts.length > 0 && (
          <div className="bg-accent/50 border border-border rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              პროდუქტი ვერ მოიძებნა — გაეცანით ტრენდულ პროდუქტებს
            </p>
          </div>
        )}

        {isLoading ? (
          <GridSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {renderGrid()}
            </div>

            {hasMore && (
              <div ref={loaderRef} className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default Shop;
