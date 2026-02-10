import { useEffect, useState, useRef } from "react";
import { Truck, MapPin } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";

interface DeliveryMissionBarProps {
  /** Compact mode for sticky HUD — no text, thinner */
  mini?: boolean;
}

const DeliveryMissionBar = ({ mini = false }: DeliveryMissionBarProps) => {
  const { total, isUnlocked, remaining } = useCart();
  const percent = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);
  const [bounce, setBounce] = useState(false);
  const [glow, setGlow] = useState(false);
  const prevUnlocked = useRef(isUnlocked);

  // Bounce truck + glow endpoint when unlocked
  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setBounce(true);
      setGlow(true);
      setTimeout(() => setBounce(false), 800);
      setTimeout(() => setGlow(false), 1500);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  const barHeight = mini ? "h-2" : "h-2.5";
  const truckSize = mini ? "w-5 h-5" : "w-6 h-6";
  const pinSize = mini ? "w-4 h-4" : "w-5 h-5";

  return (
    <div className={`w-full ${mini ? "" : "space-y-1.5"}`}>
      {/* Track */}
      <div className="relative w-full">
        {/* Background track */}
        <div className={`w-full ${barHeight} rounded-full overflow-hidden bg-muted/60`}>
          {/* Animated gradient fill */}
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${
              isUnlocked ? "delivery-path-complete" : "delivery-path-active"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Truck icon riding the path */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out ${
            bounce ? "animate-truck-bounce" : ""
          }`}
          style={{ left: `calc(${percent}% - ${mini ? 10 : 12}px)` }}
        >
          <Truck
            className={`${truckSize} drop-shadow-md ${
              isUnlocked ? "text-success" : "text-primary"
            }`}
          />
        </div>

        {/* End marker */}
        <div
          className={`absolute right-0 top-1/2 -translate-y-1/2 transition-all duration-500 ${
            glow ? "delivery-pin-glow scale-125" : ""
          }`}
        >
          <MapPin
            className={`${pinSize} ${
              isUnlocked ? "text-success" : "text-muted-foreground/50"
            }`}
          />
        </div>
      </div>

      {/* Micro-text (hidden in mini mode) */}
      {!mini && (
        <p
          className={`text-xs font-semibold text-center transition-opacity duration-500 ${
            isUnlocked
              ? "opacity-0 h-0 overflow-hidden"
              : "opacity-100 text-muted-foreground"
          }`}
        >
          კიდევ {remaining.toFixed(1)} ₾ მიტანის განსაბლოკად
        </p>
      )}
    </div>
  );
};

export default DeliveryMissionBar;
