import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
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
      {/* Float animation */}
      {showFloat && (
        <div className="absolute top-2 right-2 z-10 text-primary font-extrabold text-lg animate-float-up pointer-events-none">
          +1
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.title}
        </p>
        <p className="text-price text-primary mt-1">{product.price} ₾</p>

        {/* Controls */}
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
};

export default ProductCard;
