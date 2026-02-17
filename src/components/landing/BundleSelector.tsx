import { BundleOption } from "@/hooks/useLandingConfig";

interface BundleSelectorProps {
  options: BundleOption[];
  selectedQty: number;
  onSelect: (qty: number) => void;
  unitPrice: number;
}

const BundleSelector = ({ options, selectedQty, onSelect, unitPrice }: BundleSelectorProps) => {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-foreground">აირჩიე რაოდენობა:</p>
      <div className="grid gap-2">
        {options.map((opt) => {
          const isSelected = selectedQty === opt.qty;
          const totalBefore = unitPrice * opt.qty;
          const totalAfter = totalBefore * (1 - opt.discount_pct / 100);
          return (
            <button
              key={opt.qty}
              onClick={() => onSelect(opt.qty)}
              className={`relative flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? "border-primary" : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <span className="font-bold text-foreground text-sm">{opt.label}</span>
              </div>
              <div className="text-right">
                {opt.discount_pct > 0 && (
                  <span className="text-xs text-muted-foreground line-through mr-2">
                    {totalBefore.toFixed(2)} ₾
                  </span>
                )}
                <span className="font-extrabold text-primary text-base">
                  {totalAfter.toFixed(2)} ₾
                </span>
              </div>
              {opt.discount_pct > 0 && (
                <span className="absolute -top-2 -right-2 bg-deal text-deal-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                  -{opt.discount_pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BundleSelector;
