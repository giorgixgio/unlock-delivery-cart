import { Zap } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface BoosterRowProps {
  products: Product[];
}

const BoosterRow = ({ products }: BoosterRowProps) => {
  const { isUnlocked, remaining, addItem } = useCart();

  if (isUnlocked) return null;

  // Show cheap items that could help reach threshold
  const boosterItems = products
    .filter((p) => p.price <= 5 && p.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  if (boosterItems.length === 0) return null;

  return (
    <div className="bg-accent border border-primary/20 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-primary" />
        <h3 className="text-base font-bold text-foreground">
          სწრაფად დაამატე — გჭირდება კიდევ {remaining.toFixed(1)} ₾
        </h3>
      </div>
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-2">
          {boosterItems.map((product) => (
            <div
              key={product.id}
              className="flex-shrink-0 w-32 bg-card rounded-lg shadow-card border border-border overflow-hidden"
            >
              <img
                src={product.image}
                alt={product.title}
                className="w-full h-24 object-cover"
                loading="lazy"
              />
              <div className="p-2">
                <p className="text-xs font-medium text-foreground line-clamp-1">{product.title}</p>
                <p className="text-sm font-bold text-primary">{product.price} ₾</p>
                <Button
                  onClick={() => addItem(product)}
                  size="sm"
                  className="w-full mt-1.5 h-9 text-sm font-bold rounded-md"
                >
                  + დამატება
                </Button>
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default BoosterRow;
