import { Check, Search } from "lucide-react";
import { Product } from "@/lib/constants";

interface BundleTileProps {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onQuickView?: () => void;
}

/** Selectable product tile for the 5-for-39 bundle grid. */
const BundleTile = ({ product, selected, onToggle, onQuickView }: BundleTileProps) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-pressed={selected}
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
        {onQuickView && (
          <button
            type="button"
            aria-label="დეტალურად"
            onClick={(e) => {
              e.stopPropagation();
              onQuickView();
            }}
            className="absolute top-2 left-2 w-9 h-9 rounded-full bg-card/95 backdrop-blur-sm shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <Search className="w-4 h-4 text-foreground" strokeWidth={2.5} />
          </button>
        )}
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
        <div
          className={`h-9 rounded-lg flex items-center justify-center text-[13px] font-extrabold ${
            selected
              ? "bg-success text-success-foreground"
              : "bg-foreground text-background"
          }`}
        >
          {selected ? "არჩეულია ✓" : "აირჩიე"}
        </div>
      </div>
    </button>
  );
};

export default BundleTile;
