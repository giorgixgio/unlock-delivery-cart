import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle, Home, Truck, PackageCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackPurchase } from "@/lib/metaPixel";
import { useDelivery } from "@/contexts/DeliveryContext";
import { useLanguage } from "@/contexts/LanguageContext";

const OrderSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { orderNumber?: string; orderTotal?: number } | null;
  const orderNumber = state?.orderNumber;
  const orderTotal = state?.orderTotal;
  const { isTbilisi, deliveryDateStart, deliveryDateEnd, formatDate } = useDelivery();
  const { t } = useLanguage();

  useEffect(() => {
    if (orderTotal != null) {
      trackPurchase(orderTotal, orderNumber);
    }
  }, []);

  const deliveryLabel = isTbilisi
    ? formatDate(deliveryDateStart)
    : `${formatDate(deliveryDateStart)} – ${formatDate(deliveryDateEnd)}`;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="animate-pop-in">
          <CheckCircle className="w-20 h-20 text-success mx-auto" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-foreground mb-1">{t("order_success")}</h1>
          {orderNumber && <p className="text-lg font-bold text-primary">#{orderNumber}</p>}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-card space-y-4 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("estimated_delivery")}</p>
              <p className="text-base font-bold text-primary">{deliveryLabel}</p>
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center gap-3">
              <PackageCheck className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{t("courier_will_contact")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{t("pay_on_spot")}</p>
            </div>
          </div>
        </div>
        <Button onClick={() => navigate("/")} size="lg" className="w-full h-14 text-lg font-bold rounded-xl">
          <Home className="w-5 h-5 mr-2" />
          {t("back_to_home")}
        </Button>
      </div>
    </main>
  );
};

export default OrderSuccess;
