import { useState } from "react";
import { CATEGORIES, CategoryId } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useRecommendations } from "@/hooks/useRecommendations";
import ProductCard from "@/components/ProductCard";
import BoosterRow from "@/components/BoosterRow";
import RecommendationBlock from "@/components/RecommendationBlock";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Package, Loader2 } from "lucide-react";

const INSERTION_INTERVAL = 6; // Insert recommendation block every 6 products (3 rows of 2)

const Index = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const { data: products = [], isLoading } = useProducts();

  const filtered =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category === activeCategory);

  const { visibleItems, hasMore, loaderRef } = useInfiniteScroll(filtered);
  const { recommendations, shouldShow, remaining } = useRecommendations(products);

  // Build feed with interleaved recommendation blocks
  const renderFeed = () => {
    if (visibleItems.length === 0) return null;

    const elements: React.ReactNode[] = [];
    let productIndex = 0;

    while (productIndex < visibleItems.length) {
      // Render a batch of products
      const batchEnd = Math.min(productIndex + INSERTION_INTERVAL, visibleItems.length);
      for (let i = productIndex; i < batchEnd; i++) {
        elements.push(
          <ProductCard key={visibleItems[i].id} product={visibleItems[i]} />
        );
      }
      productIndex = batchEnd;

      // Insert recommendation block after each batch (if conditions met)
      if (
        shouldShow &&
        recommendations.length > 0 &&
        productIndex < visibleItems.length // don't add after last batch
      ) {
        elements.push(
          <RecommendationBlock
            key={`rec-${productIndex}`}
            products={recommendations}
            remaining={remaining}
          />
        );
      }
    }

    return elements;
  };

  return (
    <main className="pb-52">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="container max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Package className="w-7 h-7" />
          <h1 className="text-xl font-extrabold tracking-tight">მაღაზია</h1>
        </div>
      </header>

      {/* Category chips */}
      <div className="sticky top-[60px] z-30 bg-background border-b border-border">
        <ScrollArea className="w-full">
          <div className="flex gap-2 px-4 py-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all duration-150 border-2 ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div className="container max-w-2xl mx-auto px-4 pt-4">
        <BoosterRow products={products} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground font-medium">პროდუქტები იტვირთება...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {renderFeed()}
            </div>

            {hasMore && (
              <div ref={loaderRef} className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg font-medium">ამ კატეგორიაში პროდუქტი არ მოიძებნა</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default Index;
