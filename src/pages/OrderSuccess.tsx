import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackPurchase } from "@/lib/metaPixel";

const OrderSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { orderNumber?: string; orderTotal?: number } | null;
  const orderNumber = state?.orderNumber;
  const orderTotal = state?.orderTotal;

  useEffect(() => {
    if (orderTotal != null) {
      trackPurchase(orderTotal, orderNumber);
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="animate-pop-in">
        <CheckCircle className="w-24 h-24 text-success mx-auto mb-6" />
      </div>
      <h1 className="text-2xl font-extrabold text-foreground mb-2">
        შეკვეთა წარმატებულია!
      </h1>
      {orderNumber && (
        <p className="text-lg font-bold text-primary mb-2">
          {orderNumber}
        </p>
      )}
      <p className="text-muted-foreground text-base mb-2">
        თქვენი შეკვეთა მიღებულია.
      </p>
      <p className="text-muted-foreground text-sm mb-8">
        კურიერი დაგიკავშირდებათ მიტანამდე. თანხას გადაიხდით ადგილზე.
      </p>
      <Button
        onClick={() => navigate("/")}
        size="lg"
        className="h-14 px-8 text-lg font-bold rounded-xl"
      >
        <Home className="w-5 h-5 mr-2" />
        მთავარ გვერდზე დაბრუნება
      </Button>
    </main>
  );
};

export default OrderSuccess;
