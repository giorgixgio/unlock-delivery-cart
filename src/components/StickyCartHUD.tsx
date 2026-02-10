import { ShoppingCart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import DeliveryProgressBar from "./DeliveryProgressBar";
import { Button } from "@/components/ui/button";

const StickyCartHUD = () => {
  const { items, total, itemCount, isUnlocked } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on success page
  if (location.pathname === "/success") return null;
  // Don't show when cart empty
  if (itemCount === 0) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-card border-t-2 shadow-lg transition-all duration-300 ${
        isUnlocked ? "border-success glow-unlock" : "border-primary"
      }`}
    >
      <div className="container max-w-2xl mx-auto px-4 py-3 space-y-2">
        {/* Item thumbnails row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <div className="flex gap-1.5 flex-shrink-0">
            {items.slice(0, 6).map((item) => (
              <div
                key={item.product.id}
                className="relative w-10 h-10 rounded-md overflow-hidden border-2 border-border flex-shrink-0"
              >
                <img
                  src={item.product.image}
                  alt={item.product.title}
                  className="w-full h-full object-cover"
                />
                {item.quantity > 1 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {item.quantity}
                  </span>
                )}
              </div>
            ))}
            {items.length > 6 && (
              <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border-2 border-border">
                +{items.length - 6}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-foreground" />
            <span className="text-xl font-extrabold text-foreground">{total.toFixed(1)} ₾</span>
          </div>
        </div>

        {/* Progress bar */}
        <DeliveryProgressBar />

        {/* CTA */}
        <Button
          onClick={() => navigate("/cart")}
          disabled={!isUnlocked}
          className={`w-full h-14 text-lg font-bold rounded-xl transition-all duration-200 ${
            isUnlocked
              ? "bg-success hover:bg-success/90 text-success-foreground"
              : ""
          }`}
          size="lg"
        >
          {isUnlocked
            ? "შეკვეთა — გადახდა მიტანისას"
            : `გჭირდება კიდევ ${(40 - total).toFixed(1)} ₾`}
        </Button>
      </div>
    </div>
  );
};

export default StickyCartHUD;
