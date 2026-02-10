import { useState, useRef, useEffect, memo } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";

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
  const { addItem, updateQuantity, getQuantity } = useCart();
  const quantity = getQuantity(product.id);
  const [showFloat, setShowFloat] = useState(false);

  const handleAdd = () => {
    addItem(product);
    setShowFloat(true);
    setTimeout(() => setShowFloat(false), 600);
  };

  return (
    <div className="relative bg-card rounded-lg shadow-card overflow-hidden border border-border">
      {showFloat && (
        <div className="absolute top-2 right-2 z-10 text-primary font-extrabold text-lg animate-float-up pointer-events-none">
          +1
        </div>
      )}

      <LazyImage src={product.image} alt={product.title} />

      <div className="p-3">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.title}
        </p>
        <p className="text-price text-primary mt-1">{product.price} ₾</p>

        <div className="flex items-center justify-between mt-3">
          {quantity === 0 ? (
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
                onClick={() => updateQuantity(product.id, quantity - 1)}
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
  );
});

ProductCard.displayName = "ProductCard";

export default ProductCard;
