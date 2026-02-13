import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle, Home, Truck, PackageCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackPurchase } from "@/lib/metaPixel";
import { useDelivery } from "@/contexts/DeliveryContext";

const OrderSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { orderNumber?: string; orderTotal?: number } | null;
  const orderNumber = state?.orderNumber;
  const orderTotal = state?.orderTotal;
  const { isTbilisi, deliveryDateStart, deliveryDateEnd, formatDate } = useDelivery();

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
        {/* Success Icon */}
        <div className="animate-pop-in">
          <CheckCircle className="w-20 h-20 text-success mx-auto" />
        </div>

        {/* Title & order number */}
        <div>
          <h1 className="text-2xl font-extrabold text-foreground mb-1">
            შეკვეთა წარმატებულია!
          </h1>
          {orderNumber && (
            <p className="text-lg font-bold text-primary">
              #{orderNumber}
            </p>
          )}
        </div>

        {/* Delivery Estimation Card */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card space-y-4 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">მიტანის სავარაუდო დრო</p>
              <p className="text-base font-bold text-primary">{deliveryLabel}</p>
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center gap-3">
              <PackageCheck className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                კურიერი დაგიკავშირდებათ მიტანამდე
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                თანხას გადაიხდით ადგილზე (ნაღდი / ბარათი)
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={() => navigate("/")}
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl"
        >
          <Home className="w-5 h-5 mr-2" />
          მთავარ გვერდზე დაბრუნება
        </Button>
      </div>
    </main>
  );
};

export default OrderSuccess;
