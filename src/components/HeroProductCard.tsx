import { useState, memo } from "react";
import { Plus, Minus, Truck } from "lucide-react";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import { Progress } from "@/components/ui/progress";
import { trackHeroAddToCart } from "@/lib/gridTracker";

interface HeroProductCardProps {
  product: Product;
}

const HeroProductCard = memo(({ product }: HeroProductCardProps) => {
  const { addItem, updateQuantity, getQuantity, total } = useCart();
  const quantity = getQuantity(product.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFloat, setShowFloat] = useState(false);

  const remaining = Math.max(0, DELIVERY_THRESHOLD - total);
  const progress = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);

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
        className="col-span-2 relative bg-card rounded-xl shadow-card overflow-hidden border-2 border-primary/30 cursor-pointer"
        onClick={() => setSheetOpen(true)}
      >
        {showFloat && (
          <div className="absolute top-4 right-4 z-10 text-primary font-extrabold text-2xl animate-float-up pointer-events-none">
            +1
          </div>
        )}

        {/* Badge overlays */}
        {badges.length > 0 && (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
            {badges.map((b) => (
              <span key={b} className="bg-badge text-badge-foreground text-xs font-bold px-2 py-1 rounded shadow-sm">
                {b}
              </span>
            ))}
          </div>
        )}

        {/* Social proof badge */}
        <div className="absolute top-3 right-3 z-10 bg-primary/90 text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
          🔥 ტრენდული
        </div>

        {/* Image — larger */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
            width={600}
            height={450}
          />
        </div>

        <div className="p-4 space-y-3">
          <h2 className="text-base font-extrabold text-foreground leading-tight line-clamp-2">
            {product.title}
          </h2>

          {/* Pricing */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-extrabold text-primary">{product.price} ₾</span>
            <span className="text-sm text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
            <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">
              -{discount}%
            </span>
          </div>

          {/* Free shipping progress */}
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-success flex-shrink-0" />
            <div className="flex-1 space-y-1">
              {remaining > 0 ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">
                    კიდევ <span className="text-primary font-bold">{remaining.toFixed(1)} ₾</span> უფასო მიტანამდე
                  </p>
                  <Progress value={progress} className="h-1.5" />
                </>
              ) : (
                <p className="text-xs font-bold text-success">✓ უფასო მიტანა გახსნილია!</p>
              )}
            </div>
          </div>

          {/* Add to cart */}
          <div className="flex items-center justify-between">
            {quantity === 0 ? (
              <Button onClick={handleAdd} className="w-full h-12 text-base font-bold rounded-lg" size="lg">
                <Plus className="w-5 h-5 mr-1" />
                კალათაში დამატება
              </Button>
            ) : (
              <div className="flex items-center gap-3 w-full justify-between">
                <Button onClick={handleMinus} variant="outline" size="icon" className="h-12 w-12 rounded-lg border-2">
                  <Minus className="w-5 h-5" />
                </Button>
                <span className="text-xl font-bold text-foreground min-w-[2rem] text-center">{quantity}</span>
                <Button onClick={handleAdd} size="icon" className="h-12 w-12 rounded-lg">
                  <Plus className="w-5 h-5" />
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
