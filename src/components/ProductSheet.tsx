import { useState, useEffect, useCallback, useMemo } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Check, Truck, Banknote, ShoppingBag, ChevronDown, Lock, CheckCircle } from "lucide-react";
import {
  getSimulatedStock,
  getStockLabel,
  getStockBarPercent,
  getDemoBadges,
  getTimerEnd,
  formatCountdown,
} from "@/lib/demoData";

interface ProductSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

const ImageCarousel = ({ images, title }: { images: string[]; title: string }) => {
  const [current, setCurrent] = useState(0);
  const imgs = images.length > 0 ? images : ["/placeholder.svg"];

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

  const barColor =
    label.color === "red"
      ? "bg-destructive"
      : label.color === "orange"
      ? "bg-secondary"
      : "bg-success";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            label.color === "red" ? "bg-destructive" : label.color === "orange" ? "bg-secondary" : "bg-success"
          }`}
        />
        <span className="text-sm font-bold text-foreground">{label.text}</span>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-medium">ხელმისაწვდომობა დღეს</span>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted mt-1">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${barPercent}%` }}
          />
        </div>
      </div>
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

  // Subtle pulse every 10s
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

const DeliveryQuestMini = () => {
  const { total, isUnlocked, remaining } = useCart();
  const percent = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);

  return (
    <div className="mx-4 py-3 px-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 mb-1.5">
        {isUnlocked ? (
          <CheckCircle className="w-4 h-4 text-success" />
        ) : (
          <Lock className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-bold text-foreground">
          {isUnlocked ? "მიტანა განბლოკილია!" : "დაამატე პროდუქტები მიტანის განსაბლოკად"}
        </span>
      </div>
      {!isUnlocked && (
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
};

const DescriptionSection = ({ description }: { description: string }) => {
  const [expanded, setExpanded] = useState(false);

  const bullets = useMemo(() => {
    if (!description) return [];
    // Extract first 3 sentences as bullet benefits
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
  const { addItem, updateQuantity, getQuantity } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  if (!product) return null;

  const quantity = getQuantity(product.id);

  const handleAdd = () => {
    addItem(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh] focus:outline-none">
        <DrawerTitle className="sr-only">{product.title}</DrawerTitle>
        <div className="overflow-y-auto max-h-[calc(92vh-120px)]">
          {/* A) Image carousel */}
          <ImageCarousel images={product.images} title={product.id} />

          {/* B) Title + Trust */}
          <div className="px-4 pt-3 pb-1">
            <h2 className="text-lg font-extrabold text-foreground leading-tight line-clamp-2">
              {product.title}
            </h2>
            <p className="text-price text-primary mt-1">{product.price} ₾</p>
          </div>
          <TrustStrip />

          {/* C) Scarcity */}
          <ScarcityPanel productId={product.id} />

          {/* D) Timer */}
          <DemoTimer productId={product.id} />

          {/* E) Delivery quest */}
          <div className="mt-3">
            <DeliveryQuestMini />
          </div>

          {/* F) Description */}
          <DescriptionSection description={product.description} />
        </div>

        {/* G) Action zone — sticky */}
        <div className="border-t border-border p-4 bg-card space-y-3">
          {quantity > 0 && (
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
                onClick={handleAdd}
                size="icon"
                className="h-12 w-12 rounded-lg"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          )}
          <Button
            onClick={handleAdd}
            className={`w-full h-14 text-base font-bold rounded-xl transition-all duration-200 ${
              justAdded ? "bg-success hover:bg-success/90 text-success-foreground scale-105" : ""
            }`}
            size="lg"
          >
            {justAdded ? (
              <span className="flex items-center gap-2 animate-pop-in">
                <Check className="w-5 h-5" /> დამატებულია
              </span>
            ) : (
              "კალათაში — გადახდა მიტანისას"
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ProductSheet;
