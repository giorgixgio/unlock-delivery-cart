import { useState, useEffect, useRef, useMemo } from "react";
import { Minus, Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import ProductSheet from "@/components/ProductSheet";

const DEMO_URGENCY_MODE = true;

// Seeded random for consistent demo assignments per product
function seededRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

type ChipType = "timer" | "stock" | "none";

function getChipType(productId: string): ChipType {
  if (!DEMO_URGENCY_MODE) return "none";
  const r = seededRand(productId + "_cart_chip");
  if (r < 0.5) return "timer";
  if (r < 0.8) return "stock";
  return "none";
}

function getStockCount(productId: string): number {
  return Math.floor(seededRand(productId + "_cart_stock") * 8) + 2; // 2-9
}

function getTimerDuration(productId: string): number {
  return Math.floor(seededRand(productId + "_cart_timer") * 240 + 360); // 360-600 seconds (6-10 min)
}

// Flash deal timer chip
const FlashDealChip = ({ productId }: { productId: string }) => {
  const [duration] = useState(() => getTimerDuration(productId));
  const startRef = useRef(Date.now());
  const [secsLeft, setSecsLeft] = useState(duration);

  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const left = Math.max(0, duration - elapsed);
      setSecsLeft(left);
      if (left <= 0) clearInterval(iv);
    }, 1000);
    return () => clearInterval(iv);
  }, [duration]);

  if (secsLeft <= 0) return null;

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const ss = String(secsLeft % 60).padStart(2, "0");

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-destructive/10 text-destructive px-2 py-0.5 rounded-md">
      <Clock className="w-3 h-3" />
      Flash deal {mm}:{ss}
    </span>
  );
};

// Low stock chip
const LowStockChip = ({ productId }: { productId: string }) => {
  const count = useMemo(() => getStockCount(productId), [productId]);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-secondary/15 text-secondary px-2 py-0.5 rounded-md">
      <AlertTriangle className="w-3 h-3" />
      მხოლოდ {count} დარჩა
    </span>
  );
};

interface CartItemRowProps {
  product: Product;
  quantity: number;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}

const CartItemRow = ({ product, quantity, onUpdateQuantity, onRemove }: CartItemRowProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const chipType = useMemo(() => getChipType(product.id), [product.id]);

  return (
    <>
      <div className="flex items-start gap-3 bg-card rounded-lg p-3 shadow-card border border-border">
        {/* Tappable image */}
        <button
          onClick={() => setSheetOpen(true)}
          className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 active:opacity-80 transition-opacity"
        >
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Title — 2-line clamp */}
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {product.title}
          </p>

          {/* Urgency chip */}
          {chipType === "timer" && <FlashDealChip productId={product.id} />}
          {chipType === "stock" && <LowStockChip productId={product.id} />}

          {/* Price */}
          <p className="text-base font-bold text-primary">{(product.price * quantity).toFixed(1)} ₾</p>
        </div>

        {/* Quantity controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            onClick={() => onUpdateQuantity(product.id, quantity - 1)}
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-lg"
          >
            <Minus className="w-3.5 h-3.5" />
          </Button>
          <span className="text-base font-bold w-6 text-center">{quantity}</span>
          <Button
            onClick={() => onUpdateQuantity(product.id, quantity + 1)}
            size="icon"
            className="h-9 w-9 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={() => onRemove(product.id)}
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Product Sheet modal */}
      <ProductSheet product={sheetOpen ? product : null} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
};

export default CartItemRow;
