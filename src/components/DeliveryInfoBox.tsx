import { useDelivery } from "@/contexts/DeliveryContext";
import { Truck, Wrench, MapPin } from "lucide-react";

/**
 * Detailed delivery info box for Cart/Checkout page.
 * Shows full dates with reactive city updates.
 */
const DeliveryInfoBox = () => {
  const {
    isTbilisi,
    processingDate,
    deliveryDateStart,
    deliveryDateEnd,
    formatDate,
  } = useDelivery();

  const deliveryText = isTbilisi
    ? formatDate(deliveryDateStart)
    : `${formatDate(deliveryDateStart)} – ${formatDate(deliveryDateEnd)}`;

  return (
    <div className="bg-accent/40 rounded-lg p-3 border border-border space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 text-primary" />
        <span>{isTbilisi ? "თბილისი" : "რეგიონი"}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-bold text-foreground">
            დამუშავება: <span className="text-primary">დღეს ({formatDate(processingDate)})</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-bold text-foreground">
            მიტანა: <span className="text-primary">{deliveryText}</span>
          </span>
        </div>
      </div>
      {!isTbilisi && (
        <p className="text-[10px] text-muted-foreground">
          რეგიონებში მიტანა შესაძლოა 2 დღემდე გაგრძელდეს
        </p>
      )}
    </div>
  );
};

export default DeliveryInfoBox;
