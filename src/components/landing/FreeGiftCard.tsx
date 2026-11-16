import { useEffect, useState } from "react";
import { Gift, Check, Sparkles, Clock, Timer } from "lucide-react";
import { Product } from "@/lib/constants";
import { FreeGiftOffer } from "@/lib/freeGiftOffers";

const GIFT_TIMER_SECONDS = 15 * 60;

/** Evergreen 15-min countdown — resets on every mount/refresh, no storage. */
const useGiftCountdown = () => {
  const [left, setLeft] = useState(GIFT_TIMER_SECONDS);
  useEffect(() => {
    const id = setInterval(
      () => setLeft((s) => (s <= 1 ? GIFT_TIMER_SECONDS : s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * Pre-selected free gift block for the landing page.
 * Deliberately loud + unmissable: gold ribbon, gift image, locked-in
 * "already added" checkmark, 0 ₾ against a struck-through value.
 */
const FreeGiftCard = ({
  offer,
  giftProduct,
}: {
  offer: FreeGiftOffer;
  giftProduct: Product;
}) => {
  const value = offer.valueGel ?? giftProduct.price;
  const countdown = useGiftCountdown();

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-success/50 bg-gradient-to-br from-success/10 via-card to-card shadow-[0_8px_28px_-12px_hsl(var(--success)/0.55)]">
      {/* animated sheen */}
      <div className="gift-sheen pointer-events-none absolute inset-0 opacity-70" />

      {/* ribbon */}
      <div className="relative flex items-center gap-1.5 bg-success px-3 py-1.5 text-success-foreground">
        <Gift className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-extrabold leading-snug">
          {offer.headline}
        </span>
        <Sparkles className="ml-auto h-4 w-4 opacity-90" />
      </div>

      {offer.limitedTime && (
        <div className="relative flex items-center justify-center gap-2 bg-destructive px-3 py-2 text-destructive-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="text-sm font-bold">არ გამოტოვო შეზღუდული დროის შეთავაზება</span>
        </div>
      )}

      {/* evergreen 15-min gift countdown */}
      <div className="relative flex items-center justify-center gap-1.5 border-b border-destructive/30 bg-destructive/10 px-3 py-1">
        <Timer className="h-3.5 w-3.5 text-destructive" />
        <span className="text-xs font-bold text-foreground">
          საჩუქარი დაჯავშნილია:
        </span>
        <span className="rounded-md bg-destructive px-1.5 py-0.5 font-mono text-xs font-extrabold tabular-nums text-destructive-foreground">
          {countdown}
        </span>
      </div>

      <div className="relative flex items-center gap-3 p-3">
        <div className="relative flex-shrink-0">
          <img
            src={giftProduct.image}
            alt={giftProduct.title}
            loading="lazy"
            className={offer.limitedTime ? "h-28 w-28 rounded-xl border border-border object-contain bg-muted" : "h-20 w-20 rounded-xl border border-border object-cover bg-muted"}
          />
          <span className="absolute -left-1 -top-1 rounded-full bg-deal px-1.5 py-0.5 text-[10px] font-extrabold text-deal-foreground shadow">
            {offer.label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-tight text-foreground line-clamp-2">
            {giftProduct.title}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-success">0 ₾</span>
            {value > 0 && <span className="text-sm text-muted-foreground line-through">
              {value.toFixed(0)} ₾
            </span>}
            {offer.limitedTime && <span className="text-sm font-bold text-success">უფასოდ</span>}
          </div>
          {offer.giftSku === "testwebo" && (
            <p className="mt-2 text-base font-extrabold text-success">ზოგავ 19₾ — საჩუქარი სრულიად უფასოა!</p>
          )}
          <ul className="mt-1.5 space-y-0.5">
            {offer.bullets.map((b) => (
              <li
                key={b}
                className={`flex items-start gap-1 font-medium text-muted-foreground ${offer.limitedTime ? "text-sm" : "text-[11px]"}`}
              >
                <Check className="mt-[2px] h-3 w-3 flex-shrink-0 text-success" />
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* locked-in state */}
      <div className="relative flex items-center gap-2 border-t border-success/30 bg-success/10 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-success text-success-foreground">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span className="text-xs font-bold text-foreground">
          დამატებულია შენს შეკვეთაში — უფასოდ
        </span>
      </div>
    </div>
  );
};

export default FreeGiftCard;
