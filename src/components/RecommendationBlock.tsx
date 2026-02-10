import { memo, useState } from "react";
import { Sparkles, Plus, Eye, Check } from "lucide-react";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import ProductSheet from "@/components/ProductSheet";
import { toast } from "sonner";

interface RecommendationBlockProps {
  products: Product[];
  remaining: number;
}

const MiniProductCard = memo(({ product }: { product: Product }) => {
  const { addItem, isUnlocked } = useCart();
  const { remaining } = useCart();
  const [added, setAdded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
    setAdded(true);
    const newRemaining = Math.max(0, remaining - product.price);
    if (newRemaining > 0) {
      toast(`დამატებულია — კიდევ ${newRemaining.toFixed(1)} ₾`, { duration: 1500 });
    } else {
      toast("მიტანა გახსნილია ✅", { duration: 2000 });
    }
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <>
      <div className="flex-shrink-0 w-[130px] bg-card rounded-lg shadow-card border border-border overflow-hidden">
        <div className="relative w-full h-[100px] bg-muted overflow-hidden">
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            width={130}
            height={100}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSheetOpen(true);
            }}
            className="absolute bottom-1 right-1 bg-card/80 backdrop-blur-sm rounded-full p-1 border border-border"
            aria-label="See details"
          >
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="p-2 space-y-1">
          <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2 min-h-[28px]">
            {product.title}
          </p>
          <p className="text-sm font-bold text-primary">{product.price} ₾</p>
          <Button
            onClick={handleAdd}
            size="sm"
            className={`w-full h-8 text-xs font-bold rounded-md transition-all duration-200 ${
              added ? "bg-success hover:bg-success text-success-foreground" : ""
            }`}
            disabled={added}
          >
            {added ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> დამატებულია
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> დამატება
              </span>
            )}
          </Button>
        </div>
      </div>
      <ProductSheet product={product} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
});
MiniProductCard.displayName = "MiniProductCard";

const RecommendationBlock = memo(({ products, remaining }: RecommendationBlockProps) => {
  const { isUnlocked } = useCart();

  if (products.length === 0) return null;

  // If delivery is unlocked, show brief success then hide
  if (isUnlocked) {
    return (
      <div className="col-span-2 my-2 py-3 px-4 rounded-lg bg-success/10 border border-success/30 text-center transition-all duration-500">
        <p className="text-sm font-bold text-success flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          მიტანა გახსნილია ✅
        </p>
      </div>
    );
  }

  return (
    <div className="col-span-2 my-2 py-3 px-3 rounded-lg bg-accent border border-primary/15">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">რეკომენდაცია მიტანის გასახსნელად</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2.5">
        კიდევ {remaining.toFixed(1)} ₾ დარჩა
      </p>
      <ScrollArea className="w-full">
        <div className="flex gap-2.5 pb-1">
          {products.map((product) => (
            <MiniProductCard key={product.id} product={product} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
});
RecommendationBlock.displayName = "RecommendationBlock";

export default RecommendationBlock;
