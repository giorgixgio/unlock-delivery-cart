import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import DeliveryInfoRow from "@/components/DeliveryInfoRow";
import { MicroBenefitStacked } from "@/components/MicroBenefits";
import { Plus, Minus, Check, Truck, Banknote, ShoppingBag, ChevronDown, Flame, ShoppingCart, X, Link2, Lock, Gift, PartyPopper } from "lucide-react";
import AttentionButton from "@/components/AttentionButton";
import { toast } from "sonner";
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
import { trackViewContent } from "@/lib/metaPixel";
import { cn } from "@/lib/utils";

interface ProductSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

// ── Image Carousel ──
const ImageCarousel = ({ images, title, productId }: { images: string[]; title: string; productId: string }) => {
  const [current, setCurrent] = useState(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startXRef = useRef(0);
  const imgs = images.length > 0 ? images : ["/placeholder.svg"];

  useEffect(() => { setCurrent(0); setOffset(0); }, [productId]);
  useEffect(() => { imgs.forEach((src) => { const img = new Image(); img.src = src; }); }, [imgs]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => { startXRef.current = e.touches[0].clientX; setSwiping(true); }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => { if (!swiping) return; setOffset(e.touches[0].clientX - startXRef.current); }, [swiping]);
  const handleTouchEnd = useCallback(() => {
    setSwiping(false);
    const threshold = 50;
    if (offset < -threshold && current < imgs.length - 1) setCurrent((c) => c + 1);
    else if (offset > threshold && current > 0) setCurrent((c) => c - 1);
    setOffset(0);
  }, [offset, current, imgs.length]);

  return (
    <div className="relative w-full aspect-square bg-muted overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="flex h-full" style={{ transform: `translateX(calc(-${current * 100}% + ${swiping ? offset : 0}px))`, transition: swiping ? "none" : "transform 280ms ease-out" }}>
        {imgs.map((src, i) => (
          <img key={i} src={src} alt={`${title} ${i + 1}`} className="w-full h-full object-cover flex-shrink-0" draggable={false} />
        ))}
      </div>
      {imgs.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {imgs.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)} className={`rounded-full transition-all duration-300 ${i === current ? "w-6 h-2.5 bg-primary" : "w-2.5 h-2.5 bg-foreground/30"}`} />
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
        <span key={b} className="bg-badge text-badge-foreground text-xs font-bold px-2.5 py-1 rounded-md shadow-md">{b}</span>
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
  useEffect(() => { const interval = setInterval(() => setMsLeft(Math.max(0, timerEnd - Date.now())), 1000); return () => clearInterval(interval); }, [timerEnd]);
  useEffect(() => { const interval = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600); }, 10000); return () => clearInterval(interval); }, []);
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

// ── Sheet Progress Bar — elastic pulse fill ──
const SheetProgressBar = ({ itemCount, threshold, isUnlocked }: { itemCount: number; threshold: number; isUnlocked: boolean }) => {
  const progress = Math.min(100, (itemCount / threshold) * 100);
  const [pulsing, setPulsing] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 450);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  const StatusIcon = isUnlocked ? PartyPopper : itemCount > 0 ? Gift : Lock;
  const remaining = Math.max(0, threshold - itemCount);

  return (
    <div className="px-4 py-2.5 space-y-2 bg-accent/30 border-b border-border/50">
      {/* Status line */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300",
          isUnlocked ? "bg-success text-success-foreground" : "bg-primary/15 text-primary",
          pulsing && "scale-125"
        )}>
          <StatusIcon className="w-3 h-3" />
        </div>
        <p className={cn(
          "text-[13px] font-bold leading-tight flex-1",
          isUnlocked ? "text-success" : "text-foreground"
        )}>
          {isUnlocked
            ? "🎉 შეკვეთა მზადაა"
            : remaining === 1
            ? "🔥 კიდევ 1 პროდუქტი დარჩა!"
            : `კიდევ ${remaining} პროდუქტი — გახსნი შეკვეთას`}
        </p>
        <span className={cn(
          "text-xs font-extrabold px-2 py-0.5 rounded-full flex-shrink-0",
          isUnlocked ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
        )}>
          {itemCount}/{threshold}
        </span>
      </div>

      {/* Thick elastic progress bar */}
      <div className="h-2.5 bg-muted/60 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            isUnlocked ? "delivery-path-complete progress-glow-success" : "delivery-path-active progress-glow",
            pulsing && "animate-pulse-fill"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Micro explanation */}
      <p className="text-[10px] text-muted-foreground leading-tight">
        {isUnlocked
          ? "შეგიძლია გააგრძელო ან შეკვეთა დაასრულო"
          : `მინიმუმ ${threshold} პროდუქტი შეკვეთის გასაგრძელებლად`}
      </p>
    </div>
  );
};

// ── Main Product Sheet ──
const ProductSheet = ({ product, open, onClose }: ProductSheetProps) => {
  const { addItem, updateQuantity, getQuantity, isUnlocked, itemCount, remaining, threshold } = useCart();
  const isMobile = useIsMobile();
  const { handleCheckoutIntent } = useCheckoutGate();
  const [actionState, setActionState] = useState<"idle" | "added" | "finalize">("idle");
  const prevUnlocked = useRef(isUnlocked);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const initialItemCount = useRef(0);
  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);

  useEffect(() => {
    if (open && product) {
      setActionState("idle");
      prevUnlocked.current = isUnlocked;
      setJustUnlocked(false);
      initialItemCount.current = itemCount;
      trackViewContent(product);
    }
  }, [open, product?.id]);

  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 2500);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  if (!product) return null;

  const isOOS = overrides[product.id] !== undefined ? !overrides[product.id] : product.available === false;
  const quantity = getQuantity(product.id);

  const { addAndGate } = useCheckoutGate();

  const handleQuickOrder = () => {
    if (isOOS) return;
    setActionState("added");
    setTimeout(() => {
      onClose();
      addAndGate(product, "pdp_quick_order");
    }, 600);
  };

  const handleFinalize = () => {
    onClose();
    if (isUnlocked) {
      handleCheckoutIntent("pdp_sheet");
    } else {
      handleCheckoutIntent("pdp_sheet");
    }
  };

  const renderActionZone = () => {
    if (isOOS) {
      return (
        <div className="w-full h-14 rounded-xl bg-muted flex items-center justify-center">
          <span className="text-muted-foreground font-bold text-base">ამოიწურა — Sold Out</span>
        </div>
      );
    }
    return (
      <>
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
        <div className="relative w-full h-14 rounded-xl overflow-hidden md:max-w-md md:mx-auto">
          {actionState === "added" ? (
            <div className="w-full h-full bg-success flex items-center justify-center transition-all duration-300">
              <span className="flex items-center gap-2 text-success-foreground font-bold text-base animate-pop-in">
                <Check className="w-5 h-5" /> დამატებულია
              </span>
            </div>
          ) : quantity > 0 && isUnlocked ? (
            <Button
              onClick={handleFinalize}
              className={cn(
                "w-full h-full text-base font-bold rounded-xl bg-success text-success-foreground hover:bg-success/90 glow-unlock",
                justUnlocked && "animate-cta-pulse-success"
              )}
              size="lg"
            >
              <ShoppingCart className="w-5 h-5 mr-2" /> კალათის გახსნა
            </Button>
          ) : quantity > 0 && !isUnlocked ? (
            <AttentionButton
              isBelowThreshold={true}
              onClick={handleFinalize}
              className="h-full text-base transition-all duration-300 bg-primary text-primary-foreground"
            >
              დაამატე კიდევ — აკლია {remaining} პროდუქტი
            </AttentionButton>
          ) : (
            <Button onClick={handleQuickOrder} className="w-full h-full text-base font-bold rounded-xl transition-all duration-200" size="lg">
              <span className="flex flex-col items-center leading-tight">
                <span>სწრაფი შეკვეთა</span>
                <span className="text-[10px] font-medium opacity-80">გადახდა კურიერთან</span>
              </span>
            </Button>
          )}
        </div>
      </>
    );
  };

  const sheetContent = (
    <>
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-md"
        aria-label="დახურვა"
      >
        <X className="w-5 h-5 text-foreground" />
      </button>
      <div className={`overflow-y-auto ${isMobile ? 'max-h-[calc(92vh-180px)]' : 'flex gap-0 max-h-[80vh]'}`}>
        <div className={isMobile ? '' : 'w-[420px] flex-shrink-0'}>
          <ImageCarousel images={product.images} title={product.id} productId={product.id} />
        </div>

        <div className={isMobile ? '' : 'flex-1 overflow-y-auto max-h-[80vh]'}>
          {/* ── Progress bar — PRIMARY feedback surface ── */}
          <SheetProgressBar itemCount={itemCount} threshold={threshold} isUnlocked={isUnlocked} />

          <div className="px-4 pt-3 pb-1 md:px-6 md:pt-5">
            <div className="flex items-start gap-2">
              <h2 className="text-lg font-extrabold text-foreground leading-tight line-clamp-2 flex-1 md:text-xl">{product.title}</h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const slug = product.handle || product.id;
                  const url = `${window.location.origin}/shop?product_id=${slug}`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast("ლინკი დაკოპირდა", { duration: 1500 });
                  });
                }}
                className="flex-shrink-0 mt-0.5 p-1.5 rounded-md hover:bg-muted transition-colors"
                aria-label="Copy product link"
              >
                <Link2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {(() => {
              const oldPrice = getFakeOldPrice(product.id, product.price);
              const discount = getDiscountPercent(product.price, oldPrice);
              return (
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  <span className="text-2xl font-extrabold text-primary md:text-3xl">{product.price} ₾</span>
                  <span className="text-base text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
                  <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{discount}%</span>
                </div>
              );
            })()}
            <MicroBenefitStacked />
          </div>
          <div className="my-3"><DeliveryInfoRow /></div>
          <TrustStrip />
          <div className="my-3"><ScarcityPanel productId={product.id} /></div>
          <DemoTimer productId={product.id} />
          <DescriptionSection description={product.description} />

          {!isMobile && (
            <div className="border-t border-border p-6 bg-card space-y-3">
              {renderActionZone()}
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <div className="border-t border-border p-4 bg-card space-y-3">
          {renderActionZone()}
        </div>
      )}

      {/* Sticky bottom CTA when unlocked — always visible */}
      {isUnlocked && quantity > 0 && (
        <div className="sticky bottom-0 z-20 bg-card border-t border-success/30 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-fade-in">
          <p className="text-center text-[11px] font-semibold text-success mb-1.5">
            ✅ შეკვეთა მზადაა
          </p>
          <Button
            onClick={handleFinalize}
            className="w-full h-12 text-base font-bold rounded-xl bg-success text-success-foreground hover:bg-success/90 shadow-lg"
            size="lg"
          >
            კალათაზე გადასვლა
          </Button>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92vh] focus:outline-none">
          <DrawerTitle className="sr-only">{product.title}</DrawerTitle>
          {sheetContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[960px] w-[95vw] p-0 overflow-hidden rounded-2xl gap-0">
        <DialogTitle className="sr-only">{product.title}</DialogTitle>
        {sheetContent}
      </DialogContent>
    </Dialog>
  );
};

export default ProductSheet;
