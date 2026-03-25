import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Truck, CheckCircle2 } from "lucide-react";
import { trackConfirmationViewed, trackConfirmationOfferClicked, trackConfirmationOfferSkipped } from "@/lib/funnelTracking";

interface OrderConfirmationOverlayProps {
  open: boolean;
  orderId: string;
  productId: string;
  onViewOffer: () => void;
  onSkip: () => void;
}

const COUNTDOWN_SECONDS = 3 * 60; // 3 minutes

const OrderConfirmationOverlay = ({
  open,
  orderId,
  productId,
  onViewOffer,
  onSkip,
}: OrderConfirmationOverlayProps) => {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      trackConfirmationViewed(orderId, productId);
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const handleViewOffer = () => {
    trackConfirmationOfferClicked(orderId, productId);
    onViewOffer();
  };

  const handleSkip = () => {
    trackConfirmationOfferSkipped(orderId, productId);
    onSkip();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl p-0 gap-0 border-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">შეკვეთა მიღებულია</DialogTitle>

        {/* Success section */}
        <div className="px-6 pt-7 pb-5 text-center">
          <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-lg font-extrabold text-foreground leading-tight">
            ✔️ შეკვეთა მიღებულია
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-snug">
            ოპერატორი დაგიკავშირდებათ დასადასტურებლად
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-6" />

        {/* Offer section + CTA */}
        <div className="px-6 pt-5 pb-6">
          {/* Countdown */}
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <span className="text-xs text-muted-foreground">შეთავაზება იწურება:</span>
            <span className="text-sm font-extrabold text-destructive tabular-nums tracking-wide">
              {mm}:{ss}
            </span>
          </div>

          {/* Primary CTA — pulsing */}
          <button
            onClick={handleViewOffer}
            className="group relative w-full rounded-xl bg-primary text-primary-foreground shadow-lg overflow-hidden animate-[ctaPulse_2s_ease-in-out_infinite]"
          >
            <div className="relative z-10 flex flex-col items-center py-4 px-4">
              <span className="text-[15px] font-extrabold leading-tight">
                აირჩიე 2 პროდუქტი 19₾-ად
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-foreground/80 mt-1">
                <Truck className="w-3.5 h-3.5" />
                მხოლოდ ახლა • უფასო მიწოდება
              </span>
            </div>
          </button>

          <button
            onClick={handleSkip}
            className="w-full text-center text-[13px] text-muted-foreground underline underline-offset-2 py-2 mt-2 hover:text-foreground transition-colors"
          >
            გამოტოვება და გაგრძელება
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderConfirmationOverlay;
