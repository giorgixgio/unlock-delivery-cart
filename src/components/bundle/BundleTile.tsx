import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import { Product } from "@/lib/constants";
import { getUrgencySignal } from "@/lib/bundleUrgency";
import { getBundleDisplayPrice } from "@/lib/bundleDisplayPrice";
import { shopifyThumb } from "@/hooks/useProducts";

interface BundleTileProps {
  product: Product;
  selected: boolean;
  onToggle: () => void;
  onQuickView?: () => void;
  /** Highlighted as the product the visitor arrived for (?featured=SKU). */
  featured?: boolean;
}

/** Reads image list from the products table shape (string[] or [{src}]). */
function extractImages(product: Product): string[] {
  const raw: any[] = Array.isArray(product.images) ? product.images : [];
  const urls = raw
    .map((im) => (typeof im === "string" ? im : im?.src || im?.url || ""))
    .filter(Boolean);
  if (urls.length === 0) return product.image ? [product.image] : ["/placeholder.svg"];
  return urls;
}

/** Hybrid tile: card body opens quick view, the big button adds/removes instantly. */
const BundleTile = ({ product, selected, onToggle, onQuickView, featured }: BundleTileProps) => {
  const urgency = getUrgencySignal(product.id);
  const anchorPrice = getBundleDisplayPrice(product.id);
  const images = extractImages(product);
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const swiped = useRef(false);

  const go = (next: number) => setIdx((next + images.length) % images.length);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onQuickView?.();
      }}
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
      <div
        className="relative aspect-square bg-[#f7f7fb] border-b border-[rgba(11,11,18,.07)] overflow-hidden"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (images.length > 1 && Math.abs(dx) > 40) {
            swiped.current = true;
            go(idx + (dx < 0 ? 1 : -1));
          }
        }}
      >
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={shopifyThumb(src, 400)}
              alt={`${product.title} ${i + 1}`}
              loading={i === 0 ? "lazy" : "lazy"}
              decoding="async"
              className="w-full h-full object-cover flex-shrink-0"
              style={{ minWidth: "100%" }}
            />
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="წინა ფოტო"
              onClick={(e) => {
                e.stopPropagation();
                go(idx - 1);
              }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center active:scale-90 transition-transform"
            >
              <ChevronLeft className="w-4 h-4 text-[#0b0b12]" strokeWidth={3} />
            </button>
            <button
              type="button"
              aria-label="შემდეგი ფოტო"
              onClick={(e) => {
                e.stopPropagation();
                go(idx + 1);
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/85 backdrop-blur-sm shadow-sm flex items-center justify-center active:scale-90 transition-transform"
            >
              <ChevronRight className="w-4 h-4 text-[#0b0b12]" strokeWidth={3} />
            </button>
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex gap-1">
              {images.slice(0, 6).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === idx ? "w-3 bg-[#0b0b12]" : "w-1 bg-[#0b0b12]/25"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {featured && (
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-white bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] px-2 py-1 rounded-full">
            <Star className="w-3 h-3" strokeWidth={3} />
            შერჩეული
          </span>
        )}
        {selected && (
          <span className="bnd-pop absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-[#00a15a] flex items-center justify-center shadow-[0_4px_14px_rgba(0,161,90,.45)]">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 gap-2">
        <p className="text-[13px] font-bold text-[#0b0b12] leading-snug line-clamp-2 min-h-[34px]">
          {product.title}
        </p>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-extrabold text-[#c2410c] line-through decoration-[#c2410c] decoration-2">
            {anchorPrice}₾
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
