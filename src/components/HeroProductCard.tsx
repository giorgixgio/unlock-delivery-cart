import { useState, memo, useSyncExternalStore } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Button } from "@/components/ui/button";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import ProductMicroProof from "@/components/ProductMicroProof";
import ProductBadgeStack from "@/components/ProductBadgeStack";
import { trackHeroAddToCart } from "@/lib/gridTracker";
import { getStockOverrides, subscribeOverrides } from "@/lib/stockOverrideStore";

interface HeroProductCardProps {
  product: Product;
}

const HeroProductCard = memo(({ product }: HeroProductCardProps) => {
  const { updateQuantity, getQuantity } = useCart();
  const { addAndGate } = useCheckoutGate();
  const quantity = getQuantity(product.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFloat, setShowFloat] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addAndGate(product, "hero_card");
    trackHeroAddToCart(product.id);
    setShowFloat(true);
    setTimeout(() => setShowFloat(false), 600);
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
  };

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);

  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);
  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;

  return (
    <>
      <div
        className={`relative bg-accent rounded-xl overflow-hidden cursor-pointer ${
          isOOS
            ? "border-[2px] border-muted-foreground/20 shadow-lg"
            : "border-[3px] border-primary shadow-[0_0_16px_2px_hsl(var(--primary)/0.35)]"
        }`}
        onClick={() => setSheetOpen(true)}
      >
        {showFloat && (
          <div className="absolute top-4 right-4 z-10 text-primary font-extrabold text-2xl animate-float-up pointer-events-none">
            +1
          </div>
        )}

        {/* Discount badge — top left */}
        {discount > 0 && (
          <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-2.5 py-1 rounded-br-lg">
            ↓ {discount}% OFF
          </div>
        )}

        {/* Social proof badges */}
        <ProductBadgeStack product={product} context="hero" />

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={product.image}
            alt={product.title}
            className={`w-full h-full object-cover ${isOOS ? "grayscale-[40%] opacity-80" : ""}`}
            width={400}
            height={400}
          />
          {isOOS && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-xl px-6 py-3 shadow-2xl">
                  <p className="text-white text-lg font-extrabold tracking-wide text-center">JUST SOLD OUT</p>
                  <p className="text-white/70 text-xs text-center mt-0.5">აღმოაჩინე მსგავსი პროდუქტები</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-3 space-y-1.5">
          {/* Title: fixed 2-line area */}
          <h2 className="text-sm font-bold text-foreground leading-tight line-clamp-2 h-[2.5rem]">
            {product.title}
          </h2>

          {/* Pricing row */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-lg font-extrabold text-primary">{product.price} ₾</span>
            <span className="text-xs text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
            <span className="bg-deal text-deal-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
              -{discount}%
            </span>
          </div>

          {/* Micro proof */}
          <ProductMicroProof product={product} maxChars={36} />

          {/* Add to cart */}
          {!isOOS && (
            <>
              <div className="flex items-center justify-between pt-1">
                {quantity === 0 ? (
                  <Button onClick={handleAdd} className="w-full h-10 text-sm font-bold rounded-lg" size="default">
                    <Plus className="w-4 h-4 mr-1" />
                    შეკვეთა
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
              {/* COD helper text */}
              <p className="text-[9px] text-muted-foreground text-center leading-tight">
                გადახდა მიღებისას
              </p>
            </>
          )}
        </div>
      </div>

      <ProductSheet product={product} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
});

HeroProductCard.displayName = "HeroProductCard";
export default HeroProductCard;
