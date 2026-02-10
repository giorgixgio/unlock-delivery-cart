import { useState } from "react";
import { CATEGORIES, CategoryId } from "@/lib/constants";
import { useProducts } from "@/hooks/useProducts";
import ProductCard from "@/components/ProductCard";
import BoosterRow from "@/components/BoosterRow";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Package, Loader2 } from "lucide-react";

const Index = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const { data: products = [], isLoading } = useProducts();

  const filtered =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category === activeCategory);

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
        {/* Booster row */}
        <BoosterRow products={products} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground font-medium">პროდუქტები იტვირთება...</span>
          </div>
        ) : (
          <>
            {/* Product grid */}
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

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
