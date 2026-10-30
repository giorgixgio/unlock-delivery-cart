import { useMemo, useState } from "react";
import { CategoryId } from "@/lib/constants";
import { useStorefrontProducts as useProducts } from "@/hooks/useProducts";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useLanguage } from "@/contexts/LanguageContext";
import ProductCard from "@/components/ProductCard";
import RecommendationBlock from "@/components/RecommendationBlock";
import HomeHeaderTemuStyle from "@/components/HomeHeaderTemuStyle";
import LiveActivityTicker from "@/components/LiveActivityTicker";
import HomeHero from "@/components/home/HomeHero";
import { Reveal, SectionTitle, TrustStrip, CategoryTiles, PromoBanner, ReviewsSection, WhyTrendmart } from "@/components/home/HomeSections";
import { Loader2 } from "lucide-react";

const INSERTION_INTERVAL = 6;
const TOP_COUNT = 10;

const Index = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const { data: products = [], isLoading } = useProducts();
  const { t } = useLanguage();

  const available = useMemo(() => products.filter((p) => p.available !== false), [products]);
  const top = useMemo(() => available.slice(0, TOP_COUNT), [available]);
  const promo = useMemo(() => available.find((p) => p.isPriorityImpulse) ?? available[0], [available]);

  const filtered = useMemo(
    () =>
      activeCategory === "all"
        ? products
        : products.filter((p) => (p.categories && p.categories.length > 0 ? p.categories : [p.category]).includes(activeCategory)),
    [products, activeCategory]
  );

  const { visibleItems, hasMore, loaderRef } = useInfiniteScroll(filtered, activeCategory);
  const { recommendations, shouldShow, remaining } = useRecommendations(products);

  const renderFeed = () => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < visibleItems.length) {
      const end = Math.min(i + INSERTION_INTERVAL, visibleItems.length);
      for (let k = i; k < end; k++) elements.push(<ProductCard key={visibleItems[k].id} product={visibleItems[k]} />);
      i = end;
      if (shouldShow && recommendations.length > 0 && i < visibleItems.length) {
        elements.push(<RecommendationBlock key={`rec-${i}`} products={recommendations} remaining={remaining} />);
      }
    }
    return elements;
  };

  return (
    <main className="pb-40 bg-surface-warm min-h-screen">
      <HomeHeaderTemuStyle showTrustBars={false} />

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-8 md:max-w-[1280px] md:px-8 md:pt-6 md:space-y-12">
        {isLoading && products.length === 0
          ? <div className="h-[300px] md:h-[400px] rounded-3xl bg-muted animate-pulse" />
          : <HomeHero products={available} />}

        <div className="space-y-4 -mt-2">
          <TrustStrip />
          <LiveActivityTicker />
        </div>

        <Reveal>
          <SectionTitle title="კატეგორიები" />
          <CategoryTiles products={products} active={activeCategory} onChange={setActiveCategory} />
        </Reveal>

        {activeCategory === "all" && top.length > 0 && (
          <Reveal>
            <SectionTitle title="ტოპ გაყიდვადი" subtitle="ყველაზე პოპულარული ნივთები ამ კვირაში" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-5">
              {top.map((p) => <ProductCard key={p.id} product={p} isHero={p.isPriorityImpulse} />)}
            </div>
          </Reveal>
        )}

        {activeCategory === "all" && <Reveal><PromoBanner product={promo} /></Reveal>}

        <section id="products" className="scroll-mt-24">
          <SectionTitle title={activeCategory === "all" ? "ყველა პროდუქტი" : "კატეგორიის პროდუქტები"} subtitle={`${filtered.length} ნივთი`} />
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground font-medium">{t("products_loading")}</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-5">{renderFeed()}</div>
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
        </section>

        {!hasMore && <Reveal><ReviewsSection /></Reveal>}
        {!hasMore && <Reveal><WhyTrendmart /></Reveal>}
      </div>
    </main>
  );
};

export default Index;
