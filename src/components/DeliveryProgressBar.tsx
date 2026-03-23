import { CheckCircle, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";

const DeliveryProgressBar = () => {
  const { itemCount, isUnlocked, remaining, isFreeDelivery, threshold } = useCart();
  const { t } = useLanguage();
  const percent = Math.min(100, (itemCount / threshold) * 100);

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
                {isFreeDelivery ? "✅ მიტანა უფასო!" : "✅ შეკვეთა მზადაა"}
              </span>
            ) : (
              <>{t("more_to_go")} {remaining} პროდუქტი {t("min_order_threshold")}</>
            )}
          </span>
        </div>
        {!isUnlocked && (
          <span className="text-sm font-bold text-muted-foreground">
            {itemCount} / {threshold}
          </span>
        )}
      </div>
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
