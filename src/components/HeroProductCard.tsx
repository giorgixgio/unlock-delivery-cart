import { useState, memo } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import { trackHeroAddToCart } from "@/lib/gridTracker";

interface HeroProductCardProps {
  product: Product;
}

const HeroProductCard = memo(({ product }: HeroProductCardProps) => {
  const { addItem, updateQuantity, getQuantity } = useCart();
  const quantity = getQuantity(product.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFloat, setShowFloat] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
    trackHeroAddToCart(product.id);
    setShowFloat(true);
    setTimeout(() => setShowFloat(false), 600);
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
  };

  const badges = getDemoBadges(product.id);
  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);

  return (
    <>
      <div
        className="relative bg-accent rounded-xl overflow-hidden border-[3px] border-primary cursor-pointer shadow-[0_0_16px_2px_hsl(var(--primary)/0.35)]"
        onClick={() => setSheetOpen(true)}
      >
        {showFloat && (
          <div className="absolute top-4 right-4 z-10 text-primary font-extrabold text-2xl animate-float-up pointer-events-none">
            +1
          </div>
        )}

        {/* Discount badge — top left like Temu */}
        {discount > 0 && (
          <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-2.5 py-1 rounded-br-lg">
            ↓ {discount}% OFF
          </div>
        )}

        {/* Badge overlays */}
        {badges.length > 0 && (
          <div className="absolute top-8 left-2 z-10 flex flex-col gap-1">
            {badges.map((b) => (
              <span key={b} className="bg-badge text-badge-foreground text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                {b}
              </span>
            ))}
          </div>
        )}

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
            width={400}
            height={400}
          />
        </div>

        <div className="p-3 space-y-1.5">
          <h2 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
            {product.title}
          </h2>

          {/* Pricing row */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-lg font-extrabold text-primary">{product.price} ₾</span>
            <span className="text-xs text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
          </div>

          {/* Add to cart */}
          <div className="flex items-center justify-between pt-1">
            {quantity === 0 ? (
              <Button onClick={handleAdd} className="w-full h-10 text-sm font-bold rounded-lg" size="default">
                <Plus className="w-4 h-4 mr-1" />
                კალათაში
              </Button>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between">
                <Button onClick={handleMinus} variant="outline" size="icon" className="h-10 w-10 rounded-lg border-2">
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-lg font-bold text-foreground min-w-[1.5rem] text-center">{quantity}</span>
                <Button onClick={handleAdd} size="icon" className="h-10 w-10 rounded-lg">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProductSheet product={product} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
});

HeroProductCard.displayName = "HeroProductCard";
export default HeroProductCard;
