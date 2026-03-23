import { useMemo } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Product, CartItem } from "@/lib/constants";
import { Button } from "@/components/ui/button";

// Seeded random for consistent urgency badges per product
function seededRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

type BadgeType = "low_stock" | "selling_fast" | "hit" | "none";

function getBadgeType(productId: string): BadgeType {
  const r = seededRand(productId + "_checkout_badge");
  if (r < 0.35) return "low_stock";
  if (r < 0.6) return "selling_fast";
  if (r < 0.85) return "hit";
  return "none";
}

function getStockCount(productId: string): number {
  return Math.floor(seededRand(productId + "_checkout_stock") * 10) + 3;
}

function getBadgeContent(productId: string, product: Product): { line1: string; line2?: string } {
  const type = getBadgeType(productId);
  const discount = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(product.compareAtPrice - product.price)
    : null;

  switch (type) {
    case "low_stock":
      return {
        line1: `მხოლოდ ${getStockCount(productId)} დარჩა`,
        line2: discount ? `-${discount}₾ ფასდაკლება` : undefined,
      };
    case "selling_fast":
      return {
        line1: "სწრაფად იწურება",
        line2: discount ? `-${discount}₾ ფასდაკლება` : "ბონუსშია",
      };
    case "hit":
      return {
        line1: "ჰიტი პროდუქტი",
        line2: discount ? `-${discount}₾ ფასდაკლება` : undefined,
      };
    default:
      return {
        line1: discount ? `-${discount}₾ ფასდაკლება` : "პოპულარული",
      };
  }
}

// Generate compare price if missing
function getComparePrice(product: Product): number | null {
  if (product.compareAtPrice && product.compareAtPrice > product.price) {
    return product.compareAtPrice;
  }
  // Generate synthetic compare price for visual consistency
  const mult = 2.0 + seededRand(product.id + "_compare") * 0.9; // 2.0x–2.9x
  return Math.round(product.price * mult * 10) / 10;
}

interface CheckoutProductCarouselProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}

const CheckoutProductCarousel = ({ items, onUpdateQuantity, onRemove }: CheckoutProductCarouselProps) => {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
      <div
        className="flex gap-2 snap-x snap-mandatory pb-1"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {items.map(({ product, quantity }) => {
          const badge = getBadgeContent(product.id, product);
          const comparePrice = getComparePrice(product);
          return (
            <div
              key={product.id}
              className="snap-start flex-shrink-0 w-[110px] bg-card rounded-lg border border-border shadow-sm overflow-hidden relative"
            >
              {/* Urgency Badge */}
              <div className="absolute top-1 left-1 z-10 flex flex-col gap-0.5">
                <span className="bg-destructive/90 text-destructive-foreground text-[8px] font-bold px-1 py-[1px] rounded leading-tight line-clamp-1">
                  {badge.line1}
                </span>
                {badge.line2 && (
                  <span className="bg-deal/90 text-deal-foreground text-[8px] font-bold px-1 py-[1px] rounded leading-tight line-clamp-1">
                    {badge.line2}
                  </span>
                )}
              </div>

              {/* Product Image — compact */}
              <div className="w-full aspect-[4/3] bg-muted/30">
                <img
                  src={product.image}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info — tight */}
              <div className="p-1.5 space-y-1">
                <p className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2 h-[1.75rem]">
                  {product.title}
                </p>

                {/* Price with strikethrough */}
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-extrabold text-primary">
                    {(product.price * quantity).toFixed(1)}₾
                  </span>
                  {comparePrice && (
                    <span className="text-[9px] text-muted-foreground line-through">
                      {(comparePrice * quantity).toFixed(1)}₾
                    </span>
                  )}
                </div>

                {/* Quantity Controls — compact */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    <Button
                      onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                      variant="outline"
                      size="icon"
                      className="h-5 w-5 rounded"
                    >
                      <Minus className="w-2 h-2" />
                    </Button>
                    <span className="text-[10px] font-bold w-3 text-center">{quantity}</span>
                    <Button
                      onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                      size="icon"
                      className="h-5 w-5 rounded"
                    >
                      <Plus className="w-2 h-2" />
                    </Button>
                  </div>
                  <Button
                    onClick={() => onRemove(product.id)}
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CheckoutProductCarousel;
