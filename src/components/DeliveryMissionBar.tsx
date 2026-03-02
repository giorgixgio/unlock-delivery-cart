import { useEffect, useState, useRef } from "react";
import { Truck, MapPin } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";
import AnimatedNumber from "@/components/AnimatedNumber";

interface DeliveryMissionBarProps {
  mini?: boolean;
}

const DeliveryMissionBar = ({ mini = false }: DeliveryMissionBarProps) => {
  const { total, isUnlocked, remaining, isFreeDelivery, uniqueItemCount } = useCart();
  const { t } = useLanguage();
  const targetPercent = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);
  const [percent, setPercent] = useState(0);
  const hasAnimated = useRef(false);
  const [bounce, setBounce] = useState(false);
  const [microBounce, setMicroBounce] = useState(false);
  const [glow, setGlow] = useState(false);
  const prevUnlocked = useRef(isUnlocked);
  const prevTotal = useRef(total);

  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setBounce(true);
      setGlow(true);
      setTimeout(() => setBounce(false), 800);
      setTimeout(() => setGlow(false), 1500);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    if (total !== prevTotal.current && total > 0 && !isUnlocked) {
      setMicroBounce(true);
      setTimeout(() => setMicroBounce(false), 400);
    }
    prevTotal.current = total;
  }, [total, isUnlocked]);

  // Animate from 0 on first render, then track changes instantly
  useEffect(() => {
    if (!hasAnimated.current) {
      hasAnimated.current = true;
      // Start from 0 and animate to current value
      const timer = setTimeout(() => setPercent(targetPercent), 50);
      return () => clearTimeout(timer);
    } else {
      setPercent(targetPercent);
    }
  }, [targetPercent]);

  const barHeight = mini ? "h-2" : "h-2.5";
  const truckSize = mini ? "w-5 h-5" : "w-6 h-6";
  const pinSize = mini ? "w-4 h-4" : "w-5 h-5";

  const truckAnimation = bounce
    ? "animate-truck-bounce"
    : microBounce
    ? "animate-truck-micro-bounce"
    : "";

  return (
    <div className={`w-full ${mini ? "" : "space-y-1.5"}`}>
      <div className="relative w-full">
        <div className={`w-full ${barHeight} rounded-full overflow-hidden bg-muted/60`}>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              isUnlocked ? "delivery-path-complete" : "delivery-path-active"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div
          className={`absolute top-1/2 -translate-y-1/2 transition-[left] duration-500 ease-out ${truckAnimation}`}
          style={{ left: `calc(${percent}% - ${mini ? 10 : 12}px)` }}
        >
          <Truck className={`${truckSize} drop-shadow-md ${isUnlocked ? "text-success" : "text-primary"}`} />
        </div>

        <div className={`absolute right-0 top-1/2 -translate-y-1/2 transition-all duration-500 ${glow ? "delivery-pin-glow scale-125" : ""}`}>
          <MapPin className={`${pinSize} ${isUnlocked ? "text-success" : "text-muted-foreground/50"}`} />
        </div>
      </div>

      {!mini && (
        <p className={`text-xs font-semibold text-center transition-all duration-500 ${
            isUnlocked
              ? "text-success animate-success-reveal"
              : remaining < 5
              ? "almost-there-text"
              : "text-muted-foreground"
          }`}
        >
        {isUnlocked ? (
            "✅ შეკვეთა მზადაა — მიტანა უფასო!"
          ) : remaining < 5 ? (
            <>{t("almost_there")} {t("more_to_go")} <AnimatedNumber value={remaining} /> ₾</>
          ) : (
            <>{t("more_to_go")} <AnimatedNumber value={remaining} /> ₾ — {t("min_order")} {DELIVERY_THRESHOLD} ₾</>
          )}
        </p>
      )}
    </div>
  );
};

export default DeliveryMissionBar;
