import { Product } from "@/lib/constants";
import { shopifyThumb } from "@/hooks/useProducts";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { useMemo } from "react";
import { Star } from "lucide-react";

interface LandingRecommendationsProps {
  currentProduct: Product;
  allProducts: Product[];
  maxItems?: number;
}

const LandingRecommendations = ({ currentProduct, allProducts, maxItems = 6 }: LandingRecommendationsProps) => {
  const recommendations = useMemo(() => {
    if (!allProducts || allProducts.length === 0) return [];

    // Prefer same category, then popular items, exclude current product
    const sameCategory = allProducts.filter(
      (p) => p.id !== currentProduct.id && p.category === currentProduct.category && p.available
    );
    const otherPopular = allProducts.filter(
      (p) => p.id !== currentProduct.id && p.category !== currentProduct.category && p.available
    );

    // Mix: mostly same category + fill with popular
    const pool = [...sameCategory, ...otherPopular];
    return pool.slice(0, maxItems);
  }, [currentProduct, allProducts, maxItems]);

  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-primary fill-primary" />
        <p className="text-sm font-bold text-foreground">პოპულარული პროდუქტები</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {recommendations.map((p) => (
          <RecommendationCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
};

const RecommendationCard = ({ product }: { product: Product }) => {
  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);

  return (
    <a
      href={`/p/${product.handle}`}
      className="bg-card rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        <img
          src={shopifyThumb(product.image, 300)}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {discount > 0 && (
          <span className="absolute top-1.5 left-1.5 bg-deal text-deal-foreground text-[9px] font-extrabold px-1.5 py-0.5 rounded">
            -{discount}%
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
          {product.title}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-extrabold text-primary">{product.price} ₾</span>
          {discount > 0 && (
            <span className="text-[10px] text-muted-foreground line-through">{oldPrice.toFixed(0)} ₾</span>
          )}
        </div>
      </div>
    </a>
  );
};

export default LandingRecommendations;
