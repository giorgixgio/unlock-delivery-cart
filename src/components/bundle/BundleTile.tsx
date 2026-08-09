import { Check, HandCoins, Plus, Search, Star } from "lucide-react";
import { Product } from "@/lib/constants";

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
      } ${featured ? "ring-2 ring-[#ff6b00] shadow-[0_10px_30px_rgba(255,107,0,.25)]" : ""}`}
    >
      <div className="relative aspect-square bg-[#f2f2f7]">
        <img
          src={product.image}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {featured && (
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-white bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] px-2 py-1 rounded-full shadow-[0_4px_14px_rgba(255,107,0,.45)]">
            <Star className="w-3 h-3" strokeWidth={3} />
            თქვენთვის შერჩეული
          </span>
        )}
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
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#007a45] bg-[rgba(0,161,90,.1)] border border-[rgba(0,161,90,.25)] px-1.5 py-0.5 rounded-full">
          <HandCoins className="w-3 h-3" strokeWidth={3} />
          გადახდა კურიერთან
        </span>
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
