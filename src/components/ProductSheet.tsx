import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import DeliveryMissionBar from "@/components/DeliveryMissionBar";
import DeliveryInfoRow from "@/components/DeliveryInfoRow";
import { MicroBenefitStacked } from "@/components/MicroBenefits";
import { Plus, Minus, Check, Truck, Banknote, ShoppingBag, ChevronDown, Flame, ShoppingCart, X } from "lucide-react";
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
import { getStockOverrides, subscribeOverrides } from "@/lib/stockOverrideStore";

interface ProductSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

// ── Swipe Carousel with touch support + preloading ──
const ImageCarousel = ({ images, title, productId }: { images: string[]; title: string; productId: string }) => {
  const [current, setCurrent] = useState(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startXRef = useRef(0);
  const imgs = images.length > 0 ? images : ["/placeholder.svg"];

  // Reset on product change
  useEffect(() => {
    setCurrent(0);
    setOffset(0);
  }, [productId]);

  // Preload all images
  useEffect(() => {
    imgs.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [imgs]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    setOffset(e.touches[0].clientX - startXRef.current);
  }, [swiping]);

  const handleTouchEnd = useCallback(() => {
    setSwiping(false);
    const threshold = 50;
    if (offset < -threshold && current < imgs.length - 1) {
      setCurrent((c) => c + 1);
    } else if (offset > threshold && current > 0) {
      setCurrent((c) => c - 1);
    }
    setOffset(0);
  }, [offset, current, imgs.length]);

  return (
    <div
      className="relative w-full aspect-square bg-muted overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(-${current * 100}% + ${swiping ? offset : 0}px))`,
          transition: swiping ? "none" : "transform 280ms ease-out",
        }}
      >
        {imgs.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`${title} ${i + 1}`}
            className="w-full h-full object-cover flex-shrink-0"
            draggable={false}
          />
        ))}
      </div>
      {imgs.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {imgs.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current ? "w-6 h-2.5 bg-primary" : "w-2.5 h-2.5 bg-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
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
        <span key={b} className="bg-badge text-badge-foreground text-xs font-bold px-2.5 py-1 rounded-md shadow-md">
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
  const barColor = isLow ? "bg-destructive" : isMed ? "bg-secondary" : "bg-primary";
  const iconColor = isLow ? "text-destructive" : isMed ? "text-secondary" : "text-primary";

  return (
    <div className="mx-4 py-2.5 px-3 rounded-lg bg-card border border-border space-y-2">
      <div className="flex items-center gap-2">
        <Flame className={`w-4 h-4 ${iconColor} ${isLow ? "animate-pulse" : ""}`} />
        <span className="text-sm font-bold text-foreground">{label.text}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${barPercent}%` }} />
      </div>
      <p className="text-xs font-bold text-foreground mt-1.5">📦 {stock} ცალი დარჩა მარაგში</p>
    </div>
  );
};

const DemoTimer = ({ productId }: { productId: string }) => {
  const [timerEnd] = useState(() => getTimerEnd(productId));
  const [msLeft, setMsLeft] = useState(() => Math.max(0, timerEnd - Date.now()));
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setMsLeft(Math.max(0, timerEnd - Date.now())), 1000);
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
      <p className="text-xl font-extrabold text-primary tracking-wider font-mono">{formatCountdown(msLeft)}</p>
    </div>
  );
};

const DescriptionSection = ({ description }: { description: string }) => {
  const [expanded, setExpanded] = useState(false);
  const bullets = useMemo(() => {
    if (!description) return [];
    return description.replace(/<[^>]*>/g, "").split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 5).slice(0, 3);
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
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-sm font-bold text-primary">
            {expanded ? "ნაკლები" : "მეტი დეტალები"}
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && <p className="text-sm text-muted-foreground leading-relaxed">{fullText}</p>}
        </>
      )}
    </div>
  );
};

const ProductSheet = ({ product, open, onClose }: ProductSheetProps) => {
  const { addItem, updateQuantity, getQuantity, isUnlocked, itemCount } = useCart();
  const { handleCheckoutIntent } = useCheckoutGate();
  const [actionState, setActionState] = useState<"idle" | "added" | "finalize">("idle");
  const prevUnlocked = useRef(isUnlocked);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const initialItemCount = useRef(0);
  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);

  // Track initial item count when sheet opens
  useEffect(() => {
    if (open) {
      setActionState("idle");
      prevUnlocked.current = isUnlocked;
      setJustUnlocked(false);
      initialItemCount.current = itemCount;
    }
  }, [open, product?.id]);

  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 2000);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  if (!product) return null;

  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;

  const quantity = getQuantity(product.id);
  // Show threshold UI only if cart has items (either before opening or after adding)
  const showThresholdUI = itemCount > 0;

  const handleAdd = () => {
    if (isOOS) return;
    addItem(product);
    setActionState("added");
    setTimeout(() => setActionState("finalize"), 1000);
  };

  const handleFinalize = () => {
    onClose();
    handleCheckoutIntent("pdp_sheet");
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh] focus:outline-none">
        <DrawerTitle className="sr-only">{product.title}</DrawerTitle>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-md"
          aria-label="დახურვა"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>
        <div className="overflow-y-auto max-h-[calc(92vh-180px)]">
          <ImageCarousel images={product.images} title={product.id} productId={product.id} />

          <div className="px-4 pt-3 pb-1">
            <h2 className="text-lg font-extrabold text-foreground leading-tight line-clamp-2">{product.title}</h2>
            {(() => {
              const oldPrice = getFakeOldPrice(product.id, product.price);
              const discount = getDiscountPercent(product.price, oldPrice);
              return (
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-primary">{product.price} ₾</span>
                  <span className="text-base text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
                  <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{discount}%</span>
                </div>
              );
            })()}
            {/* Micro-benefits */}
            <MicroBenefitStacked />
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
          {isOOS ? (
            <div className="w-full h-14 rounded-xl bg-muted flex items-center justify-center">
              <span className="text-muted-foreground font-bold text-base">ამოიწურა — Sold Out</span>
            </div>
          ) : (
            <>
              {/* Delivery progress — only when cart has items */}
              {showThresholdUI && (
                <div className={`rounded-lg transition-all duration-500 ${justUnlocked ? "animate-glow-pulse" : ""}`}>
                  <DeliveryMissionBar />
                </div>
              )}

              {/* Quantity selector */}
              {quantity > 0 && actionState !== "added" && (
                <div className="flex items-center justify-center gap-4">
                  <Button onClick={() => updateQuantity(product.id, quantity - 1)} variant="outline" size="icon" className="h-12 w-12 rounded-lg border-2">
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-2xl font-extrabold text-foreground min-w-[2.5rem] text-center">{quantity}</span>
                  <Button onClick={() => addItem(product)} size="icon" className="h-12 w-12 rounded-lg">
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              )}

              {/* Morphing button */}
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
                      <><ShoppingCart className="w-5 h-5" /> შეკვეთის დასრულება</>
                    ) : (
                      "გააგრძელე შოპინგი — მინ. შეკვეთა 40 ₾"
                    )}
                  </button>
                ) : (
                  <Button onClick={handleAdd} className="w-full h-full text-base font-bold rounded-xl transition-all duration-200" size="lg">
                    {showThresholdUI ? "კალათაში — გადახდა მიტანისას" : "დამატება კალათაში"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ProductSheet;
