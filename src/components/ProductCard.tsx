import { useState, useRef, useEffect, memo, useSyncExternalStore } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Button } from "@/components/ui/button";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import ProductMicroProof from "@/components/ProductMicroProof";
import ProductBadgeStack from "@/components/ProductBadgeStack";
import { getStockOverrides, subscribeOverrides } from "@/lib/stockOverrideStore";

interface ProductCardProps {
  product: Product;
}

const LazyImage = ({ src, alt }: { src: string; alt: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = imgRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="relative aspect-square overflow-hidden bg-muted">
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          decoding="async"
          width={300}
          height={300}
        />
      )}
      {(!inView || !loaded) && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
};


const ProductCard = memo(({ product }: ProductCardProps) => {
  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);
  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;
  const { updateQuantity, getQuantity } = useCart();
  const { addAndGate } = useCheckoutGate();
  const quantity = getQuantity(product.id);
  const [showFloat, setShowFloat] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addAndGate(product, "grid_card");
    setShowFloat(true);
    setTimeout(() => setShowFloat(false), 600);
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
  };

  const handleCardClick = () => {
    setSheetOpen(true);
  };

  return (
    <>
      <div
        className={`relative bg-card rounded-lg shadow-card overflow-hidden border border-border cursor-pointer transition-transform duration-150 ${
          pressed ? "scale-[0.98] shadow-lg" : ""
        }`}
        onClick={handleCardClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
      >
        {showFloat && (
          <div className="absolute top-2 right-2 z-10 text-primary font-extrabold text-lg animate-float-up pointer-events-none">
            +1
          </div>
        )}

        <ProductBadgeStack product={product} context="grid" />

        <div className="relative">
          <LazyImage src={product.image} alt={product.title} />
          {isOOS && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full">
                Sold Out
              </span>
            </div>
          )}
        </div>

        <div className="p-2">
          {/* Title: fixed 2-line area */}
          <p className="text-[13px] font-medium text-foreground leading-tight line-clamp-2 h-[2.25rem]">
            {product.title}
          </p>

          {/* Price row */}
          {(() => {
            const oldPrice = getFakeOldPrice(product.id, product.price);
            const discount = getDiscountPercent(product.price, oldPrice);
            return (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-price text-primary">{product.price} ₾</span>
                <span className="text-xs text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
              </div>
            );
          })()}

          {/* Discount badge — dedicated line with reserved height */}
          {(() => {
            const oldPrice = getFakeOldPrice(product.id, product.price);
            const discount = getDiscountPercent(product.price, oldPrice);
            return (
              <div className="h-[18px] mt-0.5">
                <span className="bg-deal text-deal-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                  -{discount}%
                </span>
              </div>
            );
          })()}

          {/* Urgency/info: single line */}
          <ProductMicroProof product={product} maxChars={40} lines={1} />

          {/* CTA */}
          <div className="mt-1.5">
            {isOOS ? (
              <Button disabled className="w-full h-10 text-sm font-bold rounded-lg opacity-50" size="default">
                Sold Out
              </Button>
            ) : quantity === 0 ? (
              <Button
                onClick={handleAdd}
                className="w-full h-10 text-sm font-bold rounded-lg"
                size="default"
              >
                <Plus className="w-4 h-4 mr-1" />
                შეკვეთა
              </Button>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between">
                <Button
                  onClick={handleMinus}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg border-2"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-lg font-bold text-foreground min-w-[1.5rem] text-center">
                  {quantity}
                </span>
                <Button
                  onClick={handleAdd}
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* COD helper text */}
          {!isOOS && (
            <p className="text-[9px] text-muted-foreground text-center mt-1 leading-tight h-[14px]">
              გადახდა მიღებისას
            </p>
          )}
        </div>
      </div>

      <ProductSheet product={product} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
});

ProductCard.displayName = "ProductCard";

export default ProductCard;
