import { ShoppingCart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";
import DeliveryMissionBar from "./DeliveryMissionBar";
import DeliveryInfoMini from "./DeliveryInfoMini";
import { Button } from "@/components/ui/button";

const StickyCartHUD = () => {
  const { items, total, itemCount, isUnlocked, remaining } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/success" || location.pathname === "/cart") return null;
  if (itemCount === 0) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-card border-t-2 shadow-lg transition-all duration-300 ${
        isUnlocked ? "border-success glow-unlock" : "border-primary"
      }`}
    >
      <div className="container max-w-2xl mx-auto px-4 py-2.5 space-y-1.5">
        {/* Row: thumbnails + total */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto">
            {items.slice(0, 5).map((item) => (
              <div
                key={item.product.id}
                className="relative w-9 h-9 rounded-md overflow-hidden border border-border flex-shrink-0"
              >
                <img
                  src={item.product.image}
                  alt={item.product.title}
                  className="w-full h-full object-cover"
                />
                {item.quantity > 1 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {item.quantity}
                  </span>
                )}
              </div>
            ))}
            {items.length > 5 && (
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground border border-border">
                +{items.length - 5}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-foreground" />
            <span className="text-lg font-extrabold text-foreground">{total.toFixed(1)} ₾</span>
          </div>
        </div>

        {/* Mini mission bar */}
        <DeliveryMissionBar mini />
        <DeliveryInfoMini />

        {/* CTA */}
        {isUnlocked ? (
          <Button
            onClick={() => navigate("/cart")}
            className="w-full h-11 text-base font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground transition-all duration-200"
            size="lg"
          >
            შეკვეთის დასრულება
          </Button>
        ) : (
          <p className="text-center text-sm font-bold text-muted-foreground py-1">
            კიდევ {remaining.toFixed(1)} ₾ — მინ. შეკვეთა {DELIVERY_THRESHOLD} ₾ + უფასო მიტანა
          </p>
        )}
      </div>
    </div>
  );
};

export default StickyCartHUD;
