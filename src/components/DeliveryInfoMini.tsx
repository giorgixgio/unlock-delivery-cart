import { useDelivery } from "@/contexts/DeliveryContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Truck } from "lucide-react";

const DeliveryInfoMini = () => {
  const { isTbilisi, loading } = useDelivery();
  const { t } = useLanguage();

  if (loading) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5">
      <Truck className="w-3 h-3 text-primary" />
      <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
        {isTbilisi ? t("delivery_tomorrow") : t("delivery_region")}
      </span>
    </div>
  );
};

export default DeliveryInfoMini;
