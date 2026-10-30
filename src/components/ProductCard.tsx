import { useState, useRef, useEffect, memo, useSyncExternalStore } from "react";
import { Plus, Minus, Heart, Check } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Button } from "@/components/ui/button";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import ProductSheet from "@/components/ProductSheet";
import { getStockOverrides, subscribeOverrides } from "@/lib/stockOverrideStore";

interface ProductCardProps {
  product: Product;
  isHero?: boolean;
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


const ProductCard = memo(({ product, isHero = false }: ProductCardProps) => {
  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);
  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;
  const { updateQuantity, getQuantity } = useCart();
  const { addAndGate } = useCheckoutGate();
  const quantity = getQuantity(product.id);
  const [showFloat, setShowFloat] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [liked, setLiked] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addAndGate(product, "grid_card");
    setShowFloat(true);
    setTimeout(() => setShowFloat(false), 1200);
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
  };

  const handleCardClick = () => {
    setSheetOpen(true);
  };

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badge = isHero || product.isPriorityImpulse ? "TOP გაყიდვადი" : product.tags?.some((t) => /new|ახალ/i.test(t)) ? "ტრენდული" : null;

  return (
    <>
      <div
        className={`group relative bg-card rounded-[20px] overflow-hidden border cursor-pointer transition-all duration-200 shadow-soft hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_hsl(20_40%_20%/0.35)] flex flex-col ${
          isHero ? "border-primary/60 ring-2 ring-primary/15" : "border-border/60"
        } ${pressed ? "scale-[0.98]" : ""}`}
        onClick={handleCardClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
      >
        <div className="relative p-1.5">
          <div className="relative rounded-2xl overflow-hidden [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-105">
            <LazyImage src={product.image} alt={product.title} />
            {isOOS && (
              <div className="absolute inset-0 bg-foreground/40 flex items-center justify-center">
                <span className="bg-foreground/70 backdrop-blur-sm text-background text-xs font-bold px-3 py-1 rounded-full">მარაგი ამოიწურა</span>
              </div>
            )}
          </div>
          <span className={`absolute top-3 left-3 text-[10px] font-extrabold px-2 py-1 rounded-full shadow-sm ${badge ? "bg-foreground text-background" : "bg-gradient-brand text-primary-foreground"}`}>
            {badge ?? `-${discount}%`}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }}
            aria-label={liked ? "სურვილებიდან წაშლა" : "სურვილებში დამატება"}
            aria-pressed={liked}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <Heart className={`w-4 h-4 transition-colors ${liked ? "fill-destructive text-destructive" : "text-muted-foreground"}`} />
          </button>
          {showFloat && (
            <div className="absolute bottom-3 right-3 z-10 bg-success text-success-foreground text-xs font-bold rounded-full px-2.5 py-1 flex items-center gap-1 animate-float-up pointer-events-none">
              <Check className="w-3.5 h-3.5" /> დაემატა
            </div>
          )}
        </div>

        <div className="px-3 pb-3 pt-1 flex flex-col flex-1">
          <p className="text-[13px] md:text-sm font-medium text-foreground leading-snug line-clamp-2 min-h-[2.4rem]">{product.title}</p>

          <div className="flex items-baseline gap-1.5 mt-1.5 flex-wrap">
            <span className="text-xl md:text-2xl font-extrabold tracking-tight text-brand">{product.price} ₾</span>
            <span className="text-xs text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
            {badge && <span className="text-[10px] font-extrabold text-brand bg-accent rounded-full px-1.5 py-0.5">-{discount}%</span>}
          </div>

          <p className="text-[11px] text-muted-foreground mt-0.5">გადახდა მიღებისას</p>

          <div className="mt-auto pt-2.5">
            {isOOS ? (
              <Button disabled className="w-full h-10 text-sm font-bold rounded-xl opacity-50">მარაგი ამოიწურა</Button>
            ) : quantity === 0 ? (
              <button
                onClick={handleAdd}
                className={`w-full h-10 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5 shadow-brand active:scale-95 transition-transform ${showFloat ? "tm-pop" : ""}`}
              >
                <Plus className="w-4 h-4" /> შეკვეთა
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between bg-accent rounded-xl p-1">
                <button onClick={handleMinus} aria-label="შემცირება" className="h-8 w-8 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-foreground min-w-[1.5rem] text-center">{quantity}</span>
                <button onClick={handleAdd} aria-label="დამატება" className={`h-8 w-8 rounded-lg bg-gradient-brand text-primary-foreground flex items-center justify-center active:scale-90 transition-transform ${showFloat ? "tm-pop" : ""}`}>
                  <Plus className="w-4 h-4" />
                </button>
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
