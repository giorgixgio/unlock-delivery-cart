import { useState } from "react";
import { CATEGORIES, CategoryId } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useLanguage } from "@/contexts/LanguageContext";
import ProductCard from "@/components/ProductCard";
import BoosterRow from "@/components/BoosterRow";
import RecommendationBlock from "@/components/RecommendationBlock";
import HomeHeaderTemuStyle from "@/components/HomeHeaderTemuStyle";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

const INSERTION_INTERVAL = 6;

const catLabelKeys: Record<string, string> = {
  "all": "cat_all",
  "სამზარეულო": "cat_kitchen",
  "სახლი-ინტერიერი": "cat_home",
  "თავის-მოვლა-სილამაზე": "cat_beauty",
  "ხელსაწყოები": "cat_tools",
  "ავტომობილი": "cat_auto",
  "ბავშვები": "cat_kids",
  "სპორტი-აქტიური-ცხოვრება": "cat_sport",
  "აბაზანა-სანტექნიკა": "cat_bath",
  "განათება": "cat_lighting",
  "ბაღი-ეზო": "cat_garden",
  "ელექტრონიკა-გაჯეტები": "cat_electronics",
  "აქსესუარები": "cat_accessories",
  "uncategorized": "cat_other",
};

const Index = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const { data: products = [], isLoading } = useProducts();
  const { t } = useLanguage();

  const filtered =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category === activeCategory);

  const { visibleItems, hasMore, loaderRef } = useInfiniteScroll(filtered);
  const { recommendations, shouldShow, remaining } = useRecommendations(products);

  const renderFeed = () => {
    if (visibleItems.length === 0) return null;
    const elements: React.ReactNode[] = [];
    let productIndex = 0;
    while (productIndex < visibleItems.length) {
      const batchEnd = Math.min(productIndex + INSERTION_INTERVAL, visibleItems.length);
      for (let i = productIndex; i < batchEnd; i++) {
        elements.push(<ProductCard key={visibleItems[i].id} product={visibleItems[i]} />);
      }
      productIndex = batchEnd;
      if (shouldShow && recommendations.length > 0 && productIndex < visibleItems.length) {
        elements.push(<RecommendationBlock key={`rec-${productIndex}`} products={recommendations} remaining={remaining} />);
      }
    }
    return elements;
  };

  return (
    <main className="pb-52">
      <HomeHeaderTemuStyle />
      <div className="bg-background border-b border-border">
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
                {t(catLabelKeys[cat.id] || cat.id)}
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
            <span className="ml-3 text-muted-foreground font-medium">{t("products_loading")}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">{renderFeed()}</div>
            {hasMore && (
              <div ref={loaderRef} className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg font-medium">{t("no_products_in_category")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default Index;
