import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, Truck, CheckCircle2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface OrderConfirmationOverlayProps {
  open: boolean;
  orderId: string;
  onViewOffer: () => void;
  onSkip: () => void;
}

const OrderConfirmationOverlay = ({
  open,
  orderId,
  onViewOffer,
  onSkip,
}: OrderConfirmationOverlayProps) => {
  const handleViewOffer = () => {
    trackEvent("upsell_offer_accepted", { order_id: orderId });
    onViewOffer();
  };

  const handleSkip = () => {
    trackEvent("upsell_offer_skipped", { order_id: orderId });
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

        {/* Offer section */}
        <div className="px-6 py-5">
          <div className="rounded-xl bg-primary/5 border border-primary/15 p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Gift className="w-4.5 h-4.5 text-primary" />
              </div>
              <span className="text-sm font-extrabold text-foreground leading-snug">
                🔥 სპეციალური შეთავაზება მხოლოდ ახლა
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              აირჩიე ნებისმიერი <strong className="text-foreground">2 პროდუქტი 19₾-ად</strong> და მიიღე{" "}
              <span className="inline-flex items-center gap-1 text-success font-bold">
                <Truck className="w-3.5 h-3.5" />
                უფასო მიწოდება
              </span>
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-6 pb-6 space-y-2.5">
          <Button
            onClick={handleViewOffer}
            className="w-full h-13 text-[15px] font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            size="lg"
          >
            ნახვა შეთავაზების
          </Button>
          <button
            onClick={handleSkip}
            className="w-full text-center text-[13px] text-muted-foreground underline underline-offset-2 py-1.5 hover:text-foreground transition-colors"
          >
            გამოტოვება და გაგრძელება
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderConfirmationOverlay;
