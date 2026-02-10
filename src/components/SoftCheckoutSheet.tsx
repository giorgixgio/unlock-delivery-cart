import { memo, useState, useEffect, useMemo, useRef } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useProducts } from "@/hooks/useProducts";
import { useRecommendations } from "@/hooks/useRecommendations";
import { DELIVERY_THRESHOLD, Product } from "@/lib/constants";
import { Plus, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface SoftCheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  onProceed: () => void;
  source: string;
}

const SheetProductCard = memo(({ product }: { product: Product }) => {
  const { addItem, remaining } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    const newRemaining = Math.max(0, remaining - product.price);
    if (newRemaining > 0) {
      toast(`დამატებულია — კიდევ ${newRemaining.toFixed(1)} ₾`, { duration: 1500 });
    }
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 min-h-[32px]">
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
  );
});
SheetProductCard.displayName = "SheetProductCard";

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 gap-2.5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="w-full aspect-square rounded-lg" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    ))}
  </div>
);

const SoftCheckoutSheet = ({ open, onClose, onProceed, source }: SoftCheckoutSheetProps) => {
  const { total, isUnlocked, remaining } = useCart();
  const { data: products = [], isLoading } = useProducts();
  const { recommendations } = useRecommendations(products);
  const prevUnlocked = useRef(isUnlocked);

  // Auto-close and proceed when threshold is reached
  useEffect(() => {
    if (open && isUnlocked && !prevUnlocked.current) {
      // Small delay so user sees the success state
      const timer = setTimeout(() => {
        onClose();
        onProceed();
      }, 600);
      return () => clearTimeout(timer);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked, open, onClose, onProceed]);

  const progress = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);
  const gap = remaining;

  // Take up to 8 recommendations for the sheet
  const sheetItems = useMemo(() => recommendations.slice(0, 8), [recommendations]);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh] focus:outline-none">
        <DrawerTitle className="sr-only">მინიმალური შეკვეთა</DrawerTitle>
        <div className="px-4 pt-4 pb-2 space-y-3">
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-lg font-extrabold text-foreground">
              კიდევ {gap.toFixed(1)} ₾ დარჩა 🎉
            </h2>
            <p className="text-sm text-muted-foreground">
              დაამატე 1–2 პროდუქტი მინ. შეკვეთის მისაღწევად ({DELIVERY_THRESHOLD} ₾)
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-bold text-muted-foreground">
              <span>{total.toFixed(1)} ₾</span>
              <span>{DELIVERY_THRESHOLD} ₾</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        </div>

        {/* Recommendations grid */}
        <div className="px-4 pb-6 overflow-y-auto max-h-[55vh]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">რეკომენდაცია</span>
          </div>

          {isLoading || sheetItems.length === 0 ? (
            <SkeletonGrid />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {sheetItems.map((product) => (
                <SheetProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>

        {/* Unlocked state overlay */}
        {isUnlocked && (
          <div className="absolute inset-0 bg-card/90 flex items-center justify-center z-10 rounded-t-[10px]">
            <div className="text-center space-y-2">
              <p className="text-2xl font-extrabold text-success">მიტანა გახსნილია ✅</p>
              <p className="text-sm text-muted-foreground">გადამისამართება...</p>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default SoftCheckoutSheet;
