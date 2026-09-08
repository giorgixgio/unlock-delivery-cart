import { Gift, Check, Sparkles } from "lucide-react";
import { Product } from "@/lib/constants";
import { FreeGiftOffer } from "@/lib/freeGiftOffers";

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

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-success/50 bg-gradient-to-br from-success/10 via-card to-card shadow-[0_8px_28px_-12px_hsl(var(--success)/0.55)]">
      {/* animated sheen */}
      <div className="gift-sheen pointer-events-none absolute inset-0 opacity-70" />

      {/* ribbon */}
      <div className="relative flex items-center gap-1.5 bg-success px-3 py-1.5 text-success-foreground">
        <Gift className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs font-extrabold uppercase tracking-wide">
          {offer.headline}
        </span>
        <Sparkles className="ml-auto h-4 w-4 opacity-90" />
      </div>

      <div className="relative flex items-center gap-3 p-3">
        <div className="relative flex-shrink-0">
          <img
            src={giftProduct.image}
            alt={giftProduct.title}
            loading="lazy"
            className="h-20 w-20 rounded-xl border border-border object-cover bg-muted"
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
            <span className="text-sm text-muted-foreground line-through">
              {value.toFixed(0)} ₾
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {offer.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-1 text-[11px] font-medium text-muted-foreground"
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
