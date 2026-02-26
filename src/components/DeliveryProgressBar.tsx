import { CheckCircle, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";
import AnimatedNumber from "@/components/AnimatedNumber";

const DeliveryProgressBar = () => {
  const { total, isUnlocked, remaining, isFreeDelivery } = useCart();
  const { t } = useLanguage();
  const percent = Math.min(100, (total / DELIVERY_THRESHOLD) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {isUnlocked ? (
            <CheckCircle className="w-5 h-5 text-success animate-success-reveal" />
          ) : (
            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {isUnlocked ? (
              <span className="animate-success-reveal inline-block">
                {isFreeDelivery ? "✅ მიტანა უფასო!" : "✅ შეკვეთა მზადაა — მიტანა 5 ₾"}
              </span>
            ) : (
              <>{t("more_to_go")} <AnimatedNumber value={remaining} /> ₾ {t("min_order_threshold")}</>
            )}
          </span>
        </div>
        {!isUnlocked && (
          <span className="text-sm font-bold text-muted-foreground">
            <AnimatedNumber value={total} /> / {DELIVERY_THRESHOLD} ₾
          </span>
        )}
      </div>
      {!isUnlocked && !isFreeDelivery && (
        <p className="text-[11px] text-success font-semibold mb-1.5">
          💡 დაამატე კიდევ 1 პროდუქტი — მიტანა უფასო!
        </p>
      )}
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isUnlocked ? "bg-success glow-unlock" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default DeliveryProgressBar;
