import { Check, Plus, Search } from "lucide-react";
import { Product } from "@/lib/constants";

interface BundleTileProps {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onQuickView?: () => void;
}

/** Hybrid tile: card body opens quick view, the big button adds/removes instantly. */
const BundleTile = ({ product, selected, onToggle, onQuickView }: BundleTileProps) => {
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
      className={`bnd-card relative w-full text-left overflow-hidden transition-all active:scale-[0.98] cursor-pointer ${
        selected ? "bnd-card-selected" : ""
      }`}
    >
      <div className="relative aspect-square bg-[#f2f2f7]">
        <img
          src={product.image}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0b0b12] bg-white/92 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
          <Search className="w-3 h-3" strokeWidth={3} />
          დეტალურად
        </span>
        {selected && (
          <span className="bnd-pop absolute top-2 right-2 w-7 h-7 rounded-full bg-[#00a15a] flex items-center justify-center shadow-[0_4px_14px_rgba(0,161,90,.45)]">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="p-2.5 space-y-2">
        <p className="text-[13px] font-bold text-[#0b0b12] leading-snug line-clamp-2 min-h-[34px]">
          {product.title}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-[#6f6f85] line-through font-bold">
            {Math.round(product.price)}₾
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#c2410c] bg-[rgba(255,107,0,.1)] border border-[rgba(255,107,0,.25)] px-1.5 py-0.5 rounded-full">
            შედის 5-ის ნაკრებში
          </span>
        </div>
        <button
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`w-full h-12 rounded-[14px] flex items-center justify-center gap-1.5 text-[14px] uppercase tracking-wide ${
            selected ? "bnd-btn-green" : "bnd-btn-grad"
          }`}
        >
          {selected ? (
            <>
              <Check className="w-4 h-4" strokeWidth={3} />
              არჩეულია ✓
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" strokeWidth={3} />
              აირჩიე
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default BundleTile;
