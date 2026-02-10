import { ShoppingBag, CheckCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";

const DeliveryProgressBar = () => {
  const { total, isUnlocked, remaining } = useCart();
  const percent = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {isUnlocked ? (
            <CheckCircle className="w-5 h-5 text-success animate-pop-in" />
          ) : (
            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {isUnlocked ? "უფასო მიტანა ✓" : `კიდევ ${remaining.toFixed(1)} ₾ მინიმალურ შეკვეთამდე`}
          </span>
        </div>
        <span className="text-sm font-bold text-foreground">
          {total.toFixed(1)} / {DELIVERY_THRESHOLD} ₾
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isUnlocked ? "bg-success glow-unlock" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
        {/* Threshold marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/20"
          style={{ left: "100%" }}
        />
      </div>
    </div>
  );
};

export default DeliveryProgressBar;
