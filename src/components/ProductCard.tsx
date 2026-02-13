import { useState, useRef, useEffect, memo } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import { MicroBenefitRotating } from "@/components/MicroBenefits";
import { getStockOverrides } from "@/lib/stockOverrideStore";

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

const CardBadges = ({ productId }: { productId: string }) => {
  const badges = getDemoBadges(productId);
  if (badges.length === 0) return null;
  return (
    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
      {badges.map((b) => (
        <span
          key={b}
          className="bg-badge text-badge-foreground text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm"
        >
          {b}
        </span>
      ))}
    </div>
  );
};

const ProductCard = memo(({ product }: ProductCardProps) => {
  const overrides = getStockOverrides();
  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;
  const { addItem, updateQuantity, getQuantity } = useCart();
  const quantity = getQuantity(product.id);
  const [showFloat, setShowFloat] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
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

        <CardBadges productId={product.id} />

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

        <div className="p-3">
          <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">
            {product.title}
          </p>
          {/* Temu-style pricing */}
          {(() => {
            const oldPrice = getFakeOldPrice(product.id, product.price);
            const discount = getDiscountPercent(product.price, oldPrice);
            return (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-price text-primary">{product.price} ₾</span>
                <span className="text-sm text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
                <span className="bg-deal text-deal-foreground text-[11px] font-extrabold px-1.5 py-0.5 rounded">
                  -{discount}%
                </span>
              </div>
            );
          })()}

          {/* Micro-benefits */}
          <MicroBenefitRotating />

          <div className="flex items-center justify-between mt-2">
            {isOOS ? (
              <Button disabled className="w-full h-12 text-base font-bold rounded-lg opacity-50" size="lg">
                Sold Out
              </Button>
            ) : quantity === 0 ? (
              <Button
                onClick={handleAdd}
                className="w-full h-12 text-base font-bold rounded-lg"
                size="lg"
              >
                <Plus className="w-5 h-5 mr-1" />
                დამატება
              </Button>
            ) : (
              <div className="flex items-center gap-3 w-full justify-between">
                <Button
                  onClick={handleMinus}
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-lg border-2"
                >
                  <Minus className="w-5 h-5" />
                </Button>
                <span className="text-xl font-bold text-foreground min-w-[2rem] text-center">
                  {quantity}
                </span>
                <Button
                  onClick={handleAdd}
                  size="icon"
                  className="h-12 w-12 rounded-lg"
                >
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

ProductCard.displayName = "ProductCard";

export default ProductCard;
