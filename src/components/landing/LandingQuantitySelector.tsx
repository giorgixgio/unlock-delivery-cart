import { Flame, Diamond } from "lucide-react";
import { getQtyDiscountPct, getDiscountedTotal, getOriginalTotal } from "@/lib/landingDiscounts";

interface LandingQuantitySelectorProps {
  unitPrice: number;
  selectedQty: number;
  onSelect: (qty: number) => void;
  /** Dark mode variant for spy-detector style pages */
  dark?: boolean;
}

const OPTIONS = [
  { qty: 1, label: "1 ცალი", tag: null, tagIcon: null },
  { qty: 2, label: "2 ცალი", tag: "პოპულარული", tagIcon: Flame },
  { qty: 3, label: "3 ცალი", tag: "საუკეთესო ფასი", tagIcon: Diamond },
];

const LandingQuantitySelector = ({
  unitPrice,
  selectedQty,
  onSelect,
  dark = false,
}: LandingQuantitySelectorProps) => {
  return (
    <div className="space-y-2.5">
      <p className={`text-base font-extrabold ${dark ? "text-white" : "text-foreground"}`}>
        აირჩიე რაოდენობა
      </p>
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const isSelected = selectedQty === opt.qty;
          const discountPct = getQtyDiscountPct(opt.qty);
          const discountedTotal = getDiscountedTotal(unitPrice, opt.qty);
          const originalTotal = getOriginalTotal(unitPrice, opt.qty);
          const hasDiscount = discountPct > 0;
          const perUnit = opt.qty > 1 ? `${Math.round(discountedTotal / opt.qty)}₾ / ცალი` : undefined;

          return (
            <button
              key={opt.qty}
              onClick={() => onSelect(opt.qty)}
              className={`relative w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? dark
                    ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20 ring-1 ring-red-500/30"
                    : "border-primary bg-primary/5 shadow-lg shadow-primary/20 ring-1 ring-primary/30"
                  : dark
                    ? "border-white/10 bg-white/5 hover:border-white/20"
                    : "border-border bg-card hover:border-primary/30"
              }`}
            >
              {/* Left: radio + label */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? dark
                        ? "border-red-500 bg-red-500/20"
                        : "border-primary bg-primary/20"
                      : dark
                        ? "border-white/30"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && (
                    <div
                      className={`w-3 h-3 rounded-full ${
                        dark ? "bg-red-500" : "bg-primary"
                      }`}
                    />
                  )}
                </div>
                <div className="text-left">
                  <span
                    className={`font-bold text-base ${
                      dark ? "text-white" : "text-foreground"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {perUnit && (
                    <p
                      className={`text-xs mt-0.5 ${
                        dark ? "text-white/50" : "text-muted-foreground"
                      }`}
                    >
                      {perUnit}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: price */}
              <div className="text-right flex items-baseline gap-1.5">
                {hasDiscount && (
                  <span
                    className={`text-xs line-through ${
                      dark ? "text-white/30" : "text-muted-foreground"
                    }`}
                  >
                    {originalTotal.toFixed(0)}₾
                  </span>
                )}
                <span
                  className={`font-extrabold text-lg ${
                    dark ? "text-red-400" : "text-primary"
                  }`}
                >
                  {discountedTotal.toFixed(0)}₾
                </span>
                {hasDiscount && (
                  <span className="text-[10px] font-bold text-white bg-red-500 rounded px-1 py-0.5">
                    -{discountPct}%
                  </span>
                )}
              </div>

              {/* Tag badge */}
              {opt.tag && (
                <span
                  className={`absolute -top-2.5 right-3 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    opt.qty === 2
                      ? "bg-orange-500 text-white"
                      : "bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                  }`}
                >
                  {opt.tagIcon && <opt.tagIcon className="w-3 h-3" />}
                  {opt.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LandingQuantitySelector;
