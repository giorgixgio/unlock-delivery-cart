import { useDelivery } from "@/contexts/DeliveryContext";
import { Truck } from "lucide-react";

/**
 * Single-line mini delivery hint for StickyCartHUD.
 */
const DeliveryInfoMini = () => {
  const { isTbilisi, loading } = useDelivery();

  if (loading) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5">
      <Truck className="w-3 h-3 text-primary" />
      <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
        {isTbilisi ? "თბილისი: მიტანა ხვალ" : "რეგიონი: 1–2 დღეში მიტანა"}
      </span>
    </div>
  );
};

export default DeliveryInfoMini;
