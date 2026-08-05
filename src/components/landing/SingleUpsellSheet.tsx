import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Check, Clock, Loader2 } from "lucide-react";
import { Product } from "@/lib/constants";
import { SingleUpsellOffer } from "@/lib/singleUpsellOffers";
import { addUpsellItems } from "@/lib/orderService";
import { trackEvent } from "@/lib/analytics";

interface SingleUpsellSheetProps {
  open: boolean;
  orderId: string;
  orderNumber?: string;
  offer: SingleUpsellOffer;
  offerProduct: Product;
  /** Current order subtotal (without delivery) */
  basePrice: number;
  /** Current delivery fee, kept unchanged */
  deliveryFee: number;
  /** Called after accept (true) or decline (false) — continue the regular flow */
  onDone: (accepted: boolean, newSubtotal: number) => void;
}

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const SingleUpsellSheet = ({
  open,
  orderId,
  orderNumber,
  offer,
  offerProduct,
  basePrice,
  deliveryFee,
  onDone,
}: SingleUpsellSheetProps) => {
  const [secondsLeft, setSecondsLeft] = useState(offer.timerSeconds);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(offer.timerSeconds);
    trackEvent("single_upsell_viewed", {
      order_id: orderId,
      offer_sku: offer.offerSku,
      offer_price: offer.offerPrice,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [open]);

  const savings = useMemo(
    () => Math.max(0, offer.compareAtPrice - offer.offerPrice),
    [offer]
  );
  const discountPct = useMemo(
    () =>
      offer.compareAtPrice > 0
        ? Math.round((savings / offer.compareAtPrice) * 100)
        : 0,
    [offer, savings]
  );

  const handleAccept = async () => {
    if (submitting) return;
    setSubmitting(true);
    const newSubtotal = basePrice + offer.offerPrice;
    try {
      await addUpsellItems(
        orderId,
        [{ product: { ...offerProduct, price: offer.offerPrice }, quantity: 1 }],
        deliveryFee,
        newSubtotal + deliveryFee
      );
      trackEvent("single_upsell_accepted", {
        order_id: orderId,
        offer_sku: offer.offerSku,
        offer_price: offer.offerPrice,
      });
      onDone(true, newSubtotal);
    } catch (err) {
      console.error("Single upsell failed:", err);
      onDone(false, basePrice);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = () => {
    if (submitting) return;
    trackEvent("single_upsell_declined", {
      order_id: orderId,
      offer_sku: offer.offerSku,
    });
    onDone(false, basePrice);
  };

  return (
    <Sheet open={open} onOpenChange={() => {}}>
      <SheetContent
        side="bottom"
        className="max-h-[96dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        <SheetTitle className="sr-only">ერთჯერადი შეთავაზება</SheetTitle>

        {/* Urgency bar */}
        <div className="flex-shrink-0 bg-deal text-deal-foreground px-4 py-2 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-extrabold">
            შეთავაზება ქრება: {fmtTime(secondsLeft)}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-2">
          {orderNumber && (
            <p className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight mb-2">
              ✅ შეკვეთა #{orderNumber} მიღებულია — ეს არის დამატებითი შეთავაზება
            </p>
          )}

          <h2 className="text-lg font-extrabold text-foreground leading-tight text-center">
            {offer.headline}
          </h2>
          <p className="text-[12px] text-muted-foreground text-center mt-0.5">
            {offer.subline}
          </p>

          {/* Product */}
          <div className="mt-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 flex gap-3">
            <img
              src={offerProduct.image}
              alt={offerProduct.title}
              className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-3">
                {offerProduct.title}
              </p>
              <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                <span className="text-2xl font-extrabold text-primary">
                  {offer.offerPrice}₾
                </span>
                <span className="text-sm text-muted-foreground line-through">
                  {offer.compareAtPrice}₾
                </span>
                {discountPct > 0 && (
                  <span className="bg-deal text-deal-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                    -{discountPct}%
                  </span>
                )}
              </div>
              <p className="text-[11px] font-bold text-success mt-1">
                ზოგავ {savings}₾-ს
              </p>
            </div>
          </div>

          {/* Bullets */}
          <ul className="mt-3 space-y-1.5">
            {offer.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <span className="text-[13px] text-foreground leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 bg-card border-t border-border px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleAccept}
            disabled={submitting}
            className="w-full h-14 rounded-xl bg-success text-success-foreground font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>დაამატე შეკვეთაში — {offer.offerPrice}₾</>
            )}
          </button>
          <button
            onClick={handleDecline}
            disabled={submitting}
            className="w-full py-3 text-[13px] text-muted-foreground underline underline-offset-2"
          >
            არა, მადლობა — გავაგრძელებ შეკვეთის გაფორმებას
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SingleUpsellSheet;
