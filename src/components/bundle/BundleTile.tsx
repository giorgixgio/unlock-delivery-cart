import { Check, Plus, Star } from "lucide-react";
import { Product } from "@/lib/constants";
import { getUrgencySignal } from "@/lib/bundleUrgency";

interface BundleTileProps {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onQuickView?: () => void;
  /** Highlighted as the product the visitor arrived for (?featured=SKU). */
  featured?: boolean;
}

/** Hybrid tile: card body opens quick view, the big button adds/removes instantly. */
const BundleTile = ({ product, selected, onToggle, onQuickView, featured }: BundleTileProps) => {
  const urgency = getUrgencySignal(product.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onQuickView?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onQuickView?.();
        }
      }}
      aria-label={`${product.title} — დეტალურად`}
      className={`bnd-card relative w-full h-full flex flex-col text-left overflow-hidden transition-all active:scale-[0.98] cursor-pointer ${
        selected ? "bnd-card-selected" : ""
      } ${featured ? "ring-2 ring-[#ff6b00]" : ""}`}
    >
      <div className="relative aspect-square bg-[#f7f7fb] border-b border-[rgba(11,11,18,.07)]">
        <img
          src={product.image}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {featured && (
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-white bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] px-2 py-1 rounded-full">
            <Star className="w-3 h-3" strokeWidth={3} />
            შერჩეული
          </span>
        )}
        {selected && (
          <span className="bnd-pop absolute top-2 right-2 w-7 h-7 rounded-full bg-[#00a15a] flex items-center justify-center shadow-[0_4px_14px_rgba(0,161,90,.45)]">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 gap-2">
        <p className="text-[13px] font-bold text-[#0b0b12] leading-snug line-clamp-2 min-h-[34px]">
          {product.title}
        </p>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] text-[#9a9aad] line-through font-semibold">
            {Math.round(product.price)}₾
          </span>
          <span className="text-[11px] font-semibold text-[#6f6f85]">
            შედის 5-ის ნაკრებში
          </span>
        </div>

        <div className="mt-auto pt-1 space-y-1.5">
          <button
            type="button"
            aria-pressed={selected}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] ${
              selected ? "bnd-btn-green" : "bnd-btn-grad"
            }`}
          >
            {selected ? (
              <>
                <Check className="w-4 h-4" strokeWidth={3} />
                არჩეულია
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" strokeWidth={3} />
                აირჩიე
              </>
            )}
          </button>
          <p
            className={`text-[11px] font-semibold text-center ${
              urgency.kind === "stock" ? "text-[#c2410c]" : "text-[#6f6f85]"
            }`}
          >
            {urgency.text}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BundleTile;

