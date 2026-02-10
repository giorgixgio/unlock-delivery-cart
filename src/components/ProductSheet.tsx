import { useState, useEffect, useRef, useMemo } from "react";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import DeliveryMissionBar from "@/components/DeliveryMissionBar";
import DeliveryInfoRow from "@/components/DeliveryInfoRow";
import { Plus, Minus, Check, Truck, Banknote, ShoppingBag, ChevronDown, Flame, ShoppingCart } from "lucide-react";
import {
  getSimulatedStock,
  getStockLabel,
  getStockBarPercent,
  getDemoBadges,
  getTimerEnd,
  formatCountdown,
  getFakeOldPrice,
  getDiscountPercent,
} from "@/lib/demoData";

interface ProductSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

const ImageCarousel = ({ images, title, productId }: { images: string[]; title: string; productId: string }) => {
  const [current, setCurrent] = useState(0);
  const imgs = images.length > 0 ? images : ["/placeholder.svg"];

  // Reset to first image when product changes
  useEffect(() => {
    setCurrent(0);
  }, [productId]);

  return (
    <div className="relative w-full aspect-square bg-muted overflow-hidden">
      <img
        src={imgs[current]}
        alt={title}
        className="w-full h-full object-cover"
        draggable={false}
      />
      {imgs.length > 1 && (
        <>
          {/* Swipe zones */}
          <button
            className="absolute left-0 top-0 w-1/3 h-full z-10"
            onClick={() => setCurrent((p) => (p > 0 ? p - 1 : imgs.length - 1))}
            aria-label="Previous image"
          />
          <button
            className="absolute right-0 top-0 w-1/3 h-full z-10"
            onClick={() => setCurrent((p) => (p < imgs.length - 1 ? p + 1 : 0))}
            aria-label="Next image"
          />
          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-3 h-3 rounded-full transition-all ${
                  i === current ? "bg-primary scale-125" : "bg-foreground/30"
                }`}
              />
            ))}
          </div>
        </>
      )}
      {/* Badge overlays */}
      <DemoBadges productId={title} />
    </div>
  );
};

const DemoBadges = ({ productId }: { productId: string }) => {
  const badges = getDemoBadges(productId);
  if (badges.length === 0) return null;
  return (
    <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20">
      {badges.map((b) => (
        <span
          key={b}
          className="bg-badge text-badge-foreground text-xs font-bold px-2.5 py-1 rounded-md shadow-md"
        >
          {b}
        </span>
      ))}
    </div>
  );
};

const TrustStrip = () => (
  <div className="flex items-center justify-around py-3 border-y border-border bg-accent/30">
    <div className="flex flex-col items-center gap-1">
      <Banknote className="w-5 h-5 text-primary" />
      <span className="text-[11px] font-semibold text-foreground">გადახდა მიტანისას</span>
    </div>
    <div className="flex flex-col items-center gap-1">
      <Truck className="w-5 h-5 text-primary" />
      <span className="text-[11px] font-semibold text-foreground">კურიერით მიტანა</span>
    </div>
    <div className="flex flex-col items-center gap-1">
      <ShoppingBag className="w-5 h-5 text-primary" />
      <span className="text-[11px] font-semibold text-foreground">მარტივი შეკვეთა</span>
    </div>
  </div>
);

const ScarcityPanel = ({ productId }: { productId: string }) => {
  const stock = getSimulatedStock(productId);
  const label = getStockLabel(stock);
  const barPercent = getStockBarPercent(productId);

  const isLow = label.color === "red";
  const isMed = label.color === "orange";

  const barColor = isLow
    ? "bg-destructive"
    : isMed
    ? "bg-secondary"
    : "bg-primary";

  const iconColor = isLow
    ? "text-destructive"
    : isMed
    ? "text-secondary"
    : "text-primary";

  return (
    <div className="mx-4 py-2.5 px-3 rounded-lg bg-card border border-border space-y-2">
      <div className="flex items-center gap-2">
        <Flame className={`w-4 h-4 ${iconColor} ${isLow ? "animate-pulse" : ""}`} />
        <span className="text-sm font-bold text-foreground">{label.text}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="text-xs font-bold text-foreground mt-1.5">
        📦 {stock} ცალი დარჩა მარაგში
      </p>
    </div>
  );
};

const DemoTimer = ({ productId }: { productId: string }) => {
  const [timerEnd] = useState(() => getTimerEnd(productId));
  const [msLeft, setMsLeft] = useState(() => Math.max(0, timerEnd - Date.now()));
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, timerEnd - Date.now());
      setMsLeft(left);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerEnd]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`mx-4 py-2.5 px-3 rounded-lg bg-accent border border-primary/20 transition-transform duration-300 ${pulse ? "scale-[1.02]" : ""}`}>
      <p className="text-xs text-muted-foreground font-medium">ფასი შენთვის დაცულია</p>
      <p className="text-xl font-extrabold text-primary tracking-wider font-mono">
        {formatCountdown(msLeft)}
      </p>
    </div>
  );
};

const DescriptionSection = ({ description }: { description: string }) => {
  const [expanded, setExpanded] = useState(false);

  const bullets = useMemo(() => {
    if (!description) return [];
    const sentences = description
      .replace(/<[^>]*>/g, "")
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
    return sentences.slice(0, 3);
  }, [description]);

  const fullText = description?.replace(/<[^>]*>/g, "").trim();

  return (
    <div className="px-4 py-3 space-y-2">
      {bullets.length > 0 && (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {fullText && fullText.length > 100 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm font-bold text-primary"
          >
            {expanded ? "ნაკლები" : "მეტი დეტალები"}
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <p className="text-sm text-muted-foreground leading-relaxed">{fullText}</p>
          )}
        </>
      )}
    </div>
  );
};

const ProductSheet = ({ product, open, onClose }: ProductSheetProps) => {
  const { addItem, updateQuantity, getQuantity, isUnlocked } = useCart();
  const { handleCheckoutIntent } = useCheckoutGate();
  // "idle" → "added" (checkmark morphs into finalize via slide)
  const [actionState, setActionState] = useState<"idle" | "added" | "finalize">("idle");
  const prevUnlocked = useRef(isUnlocked);
  const [justUnlocked, setJustUnlocked] = useState(false);

  // Reset state when sheet opens/closes or product changes
  useEffect(() => {
    if (open) {
      setActionState("idle");
      prevUnlocked.current = isUnlocked;
      setJustUnlocked(false);
    }
  }, [open, product?.id]);

  // Detect threshold crossing
  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 2000);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  if (!product) return null;

  const quantity = getQuantity(product.id);

  const handleAdd = () => {
    addItem(product);
    setActionState("added");
    setTimeout(() => {
      setActionState("finalize");
    }, 1000);
  };

  const handleFinalize = () => {
    onClose();
    handleCheckoutIntent("pdp_sheet");
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh] focus:outline-none">
        <DrawerTitle className="sr-only">{product.title}</DrawerTitle>
        <div className="overflow-y-auto max-h-[calc(92vh-180px)]">
          <ImageCarousel images={product.images} title={product.id} productId={product.id} />

          <div className="px-4 pt-3 pb-1">
            <h2 className="text-lg font-extrabold text-foreground leading-tight line-clamp-2">
              {product.title}
            </h2>
            {(() => {
              const oldPrice = getFakeOldPrice(product.id, product.price);
              const discount = getDiscountPercent(product.price, oldPrice);
              return (
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-primary">{product.price} ₾</span>
                  <span className="text-base text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
                  <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">
                    -{discount}%
                  </span>
                </div>
              );
            })()}
          </div>
          <div className="my-3">
            <DeliveryInfoRow />
          </div>
          <TrustStrip />
          <div className="my-3">
            <ScarcityPanel productId={product.id} />
          </div>
          <DemoTimer productId={product.id} />
          <DescriptionSection description={product.description} />
        </div>

        {/* Action zone — sticky */}
        <div className="border-t border-border p-4 bg-card space-y-3">
          {/* Delivery progress — always visible */}
          <div className={`rounded-lg transition-all duration-500 ${justUnlocked ? "animate-glow-pulse" : ""}`}>
            <DeliveryMissionBar />
          </div>

          {/* Quantity selector — always visible when items in cart */}
          {quantity > 0 && actionState !== "added" && (
            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={() => updateQuantity(product.id, quantity - 1)}
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-lg border-2"
              >
                <Minus className="w-5 h-5" />
              </Button>
              <span className="text-2xl font-extrabold text-foreground min-w-[2.5rem] text-center">
                {quantity}
              </span>
              <Button
                onClick={() => { addItem(product); }}
                size="icon"
                className="h-12 w-12 rounded-lg"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          )}

          {/* Morphing button: idle → added ✓ → finalize (slide reveal) */}
          <div className="relative w-full h-14 rounded-xl overflow-hidden">
            {actionState === "added" ? (
              <div className="w-full h-full bg-success flex items-center justify-center transition-all duration-300">
                <span className="flex items-center gap-2 text-success-foreground font-bold text-base animate-pop-in">
                  <Check className="w-5 h-5" /> დამატებულია
                </span>
              </div>
            ) : actionState === "finalize" ? (
              <button
                onClick={handleFinalize}
                className={`w-full h-full font-bold text-base rounded-xl flex items-center justify-center gap-2 transition-all duration-300 ${
                  isUnlocked
                    ? "bg-success text-success-foreground glow-unlock animate-slide-reveal"
                    : "bg-accent text-foreground animate-slide-reveal"
                }`}
              >
                {isUnlocked ? (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    შეკვეთის დასრულება
                  </>
                ) : (
                  "გააგრძელე შოპინგი — მინ. შეკვეთა 40 ₾"
                )}
              </button>
            ) : (
              <Button
                onClick={handleAdd}
                className="w-full h-full text-base font-bold rounded-xl transition-all duration-200"
                size="lg"
              >
                კალათაში — გადახდა მიტანისას
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ProductSheet;
