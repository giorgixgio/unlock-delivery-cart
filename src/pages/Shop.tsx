import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { rankingEngine, getWeightedRandom } from "@/lib/rankingEngine";
import { trackScrollDepth } from "@/lib/gridTracker";
import { Product } from "@/lib/constants";
import { getStockOverrides } from "@/lib/stockOverrideStore";
import ProductCard from "@/components/ProductCard";
import MissionHeroStrip from "@/components/MissionHeroStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const INITIAL_LOAD = 16;
const LOAD_MORE_BATCH = 12;

const GridSkeleton = () => (
  <div className="grid grid-cols-2 gap-2.5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="rounded-lg overflow-hidden border border-border">
        <Skeleton className="aspect-square w-full" />
        <div className="p-2 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

const SectionLabel = ({ label }: { label: string }) => (
  <div className="col-span-2 py-2 px-1">
    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{label}</h3>
  </div>
);

const Shop = () => {
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("product_id");
  const { data: allProducts = [], isLoading } = useProducts();

  const heroProduct = useMemo(() => {
    if (!productId || allProducts.length === 0) return null;
    return allProducts.find((p) => p.id === productId || p.handle === productId) ?? null;
  }, [productId, allProducts]);

  const { sections, initialFlat } = useMemo(() => {
    if (allProducts.length === 0) return { sections: [], initialFlat: [] };
    const result = rankingEngine(heroProduct, allProducts);
    const flat = result.flat.slice(0, INITIAL_LOAD);
    return { sections: result.sections, initialFlat: flat };
  }, [heroProduct, allProducts]);

  const [extraItems, setExtraItems] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(initialFlat.map((p) => p.id));
    extraItems.forEach((p) => ids.add(p.id));
    loadedIdsRef.current = ids;
  }, [initialFlat, extraItems]);

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
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {(() => {
                const allInitial = buildInitialList();
                const els: React.ReactNode[] = [];
                for (let i = 0; i < allInitial.length; i++) {
                  const item = allInitial[i];
                  const isHero = i === 0 && heroProduct?.id === item.product.id;
                  els.push(<ProductCard key={item.product.id} product={item.product} isHero={isHero} />);
                }
                for (const product of extraItems) {
                  els.push(<ProductCard key={product.id} product={product} />);
                }
                return els;
              })()}
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
