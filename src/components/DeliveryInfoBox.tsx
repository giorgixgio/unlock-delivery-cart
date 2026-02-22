import { useDelivery } from "@/contexts/DeliveryContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Truck, Wrench, MapPin } from "lucide-react";

const DeliveryInfoBox = () => {
  const {
    isTbilisi,
    processingDate,
    deliveryDateStart,
    deliveryDateEnd,
    formatDate,
  } = useDelivery();
  const { t } = useLanguage();

  const deliveryText = isTbilisi
    ? formatDate(deliveryDateStart)
    : `${formatDate(deliveryDateStart)} – ${formatDate(deliveryDateEnd)}`;

  return (
    <div className="bg-accent/40 rounded-lg p-3 border border-border space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 text-primary" />
        <span>{isTbilisi ? t("tbilisi") : t("region")}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-bold text-foreground">
            {t("processing")}: <span className="text-primary">{t("today")} ({formatDate(processingDate)})</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-bold text-foreground">
            {t("delivery")}: <span className="text-primary">{deliveryText}</span>
          </span>
        </div>
      </div>
      {!isTbilisi && (
        <p className="text-[10px] text-muted-foreground">
          {t("region_delivery_note")}
        </p>
      )}
    </div>
  );
};

export default DeliveryInfoBox;
