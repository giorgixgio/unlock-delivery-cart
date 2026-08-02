import { Check, Plus } from "lucide-react";
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
      className={`relative w-full text-left rounded-2xl border-2 bg-card overflow-hidden transition-all active:scale-[0.98] cursor-pointer ${
        selected ? "border-success shadow-md" : "border-border"
      }`}
    >
      <div className="relative aspect-square bg-muted">
        <img
          src={product.image}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-2 left-2 text-[10px] font-bold text-foreground bg-card/90 backdrop-blur-sm px-2 py-1 rounded-full shadow">
          დეტალურად
        </span>
        {selected && (
          <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-success flex items-center justify-center shadow">
            <Check className="w-4 h-4 text-success-foreground" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="p-2.5 space-y-1.5">
        <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-2 min-h-[34px]">
          {product.title}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground line-through font-semibold">
            {Math.round(product.price)}₾
          </span>
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
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
          className={`w-full h-12 rounded-lg flex items-center justify-center gap-1.5 text-[14px] font-extrabold active:scale-[0.97] transition-transform ${
            selected
              ? "bg-success text-success-foreground"
              : "bg-foreground text-background"
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
