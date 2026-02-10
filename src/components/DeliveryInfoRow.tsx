import { useState } from "react";
import { useDelivery } from "@/contexts/DeliveryContext";
import { Truck, Wrench, MapPin } from "lucide-react";

/**
 * Compact delivery info row for ProductSheet.
 * Shows processing + delivery dates with location override.
 */
const DeliveryInfoRow = () => {
  const {
    isTbilisi,
    setManualLocation,
    isManualOverride,
    detectedCity,
    loading,
    processingDate,
    deliveryDateStart,
    deliveryDateEnd,
    formatDate,
  } = useDelivery();

  const [showSelector, setShowSelector] = useState(false);

  if (loading) return null;

  const deliveryText = isTbilisi
    ? formatDate(deliveryDateStart)
    : `${formatDate(deliveryDateStart)}–${formatDate(deliveryDateEnd)}`;

  return (
    <div className="mx-4 py-2.5 px-3 rounded-lg bg-accent/40 border border-border space-y-1.5">
      {/* Location label */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="w-3 h-3" />
        <span className="font-semibold">
          {isTbilisi ? "თბილისი" : "რეგიონი"}
        </span>
        {!isManualOverride && detectedCity && (
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="ml-1 text-primary font-bold underline underline-offset-2 text-[11px]"
          >
            შეცვლა
          </button>
        )}
        {isManualOverride && (
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="ml-1 text-primary font-bold underline underline-offset-2 text-[11px]"
          >
            შეცვლა
          </button>
        )}
      </div>

      {/* Location selector */}
      {showSelector && (
        <div className="flex gap-2 pb-1">
          <button
            onClick={() => { setManualLocation(true); setShowSelector(false); }}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              isTbilisi
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            თბილისი
          </button>
          <button
            onClick={() => { setManualLocation(false); setShowSelector(false); }}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              !isTbilisi
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            რეგიონი
          </button>
        </div>
      )}

      {/* Processing + Delivery */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">
            დამუშავება: <span className="text-primary">დღეს</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">
            მიტანა: <span className="text-primary">{deliveryText}</span>
          </span>
        </div>
      </div>

      {/* Region subtext */}
      {!isTbilisi && (
        <p className="text-[10px] text-muted-foreground">
          რეგიონებში მიტანა შესაძლოა 2 დღემდე გაგრძელდეს
        </p>
      )}
    </div>
  );
};

export default DeliveryInfoRow;
