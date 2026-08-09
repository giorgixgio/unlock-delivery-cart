import { useEffect, useState } from "react";
import { X, Check, Plus, Truck } from "lucide-react";
import { Product } from "@/lib/constants";
import ProductImageSlider from "@/components/landing/ProductImageSlider";

interface BundleQuickViewSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  selected: boolean;
  selectedCount: number;
  bundleSize: number;
  bundlePrice: number;
  onToggle: () => void;
}

/** Reads image list from the products table shape (string[] or [{src}]). */
function extractImages(product: Product): string[] {
  const raw: any[] = Array.isArray(product.images) ? product.images : [];
  const urls = raw
    .map((im) => (typeof im === "string" ? im : im?.src || im?.url || ""))
    .filter(Boolean);
  if (urls.length === 0 && product.image) return [product.image];
  return urls;
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bottom-sheet quick view for a bundle product. Selection stays live. */
const BundleQuickViewSheet = ({
  product,
  open,
  onClose,
  selected,
  selectedCount,
  bundleSize,
  bundlePrice,
  onToggle,
}: BundleQuickViewSheetProps) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open, product?.id]);

  // Keep mounted through the 300ms exit transition, then fully unmount.
  // Without this the fixed inset-0 wrapper (and its backdrop-blur scrim)
  // stayed in the tree after closing and blurred the whole page white.
  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    const t = setTimeout(() => setRender(false), 210);
    return () => clearTimeout(t);
  }, [open]);

  if (!render || !product) return null;

  const full = selectedCount >= bundleSize && !selected;
  const desc = plainText(product.description || "");

  return (
    <div
      className={`bnd-root fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-[#0b0b12]/55 transition-opacity duration-200 ${
          open ? "opacity-100 backdrop-blur-[2px]" : "opacity-0"
        }`}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
        className={`absolute inset-x-0 bottom-0 bg-white rounded-t-[28px] shadow-[0_-16px_50px_rgba(11,11,18,.25)] transition-transform duration-200 ease-out flex flex-col ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: "92dvh",
          transform: open && dragY ? `translateY(${dragY}px)` : undefined,
        }}
      >
        {/* Gradient top rule, matching the reference skin */}
        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[28px] bg-[linear-gradient(90deg,#ff3b3b,#ff6b00,#ff3b3b)]" />

        {/* Drag handle / swipe-down to close */}
        <div
          className="pt-2.5 pb-1 flex-shrink-0 touch-none"
          onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
          onTouchMove={(e) => {
            if (touchStartY === null) return;
            setDragY(Math.max(0, e.touches[0].clientY - touchStartY));
          }}
          onTouchEnd={() => {
            if (dragY > 90) onClose();
            setDragY(0);
            setTouchStartY(null);
          }}
        >
          <div className="w-11 h-1.5 rounded-full bg-[#e3e3ec] mx-auto" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="დახურვა"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-[#f2f2f7] border border-[rgba(11,11,18,.08)] flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="w-5 h-5 text-[#0b0b12]" />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="rounded-[18px] overflow-hidden border border-[rgba(11,11,18,.08)]">
            <ProductImageSlider images={extractImages(product)} alt={product.title} />
          </div>

          <h2 className="bnd-display mt-4 text-[22px] text-[#0b0b12] leading-tight">
            {product.title}
          </h2>

          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#6f6f85] line-through font-bold">
              {Math.round(product.price)}₾
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#c2410c] bg-[rgba(255,107,0,.1)] border border-[rgba(255,107,0,.25)] px-2 py-1 rounded-full">
              შედის {bundleSize}-ის ნაკრებში — სულ {bundlePrice}₾
            </span>
          </div>

          <div className="mt-3 bnd-pill bnd-pill-green">
            <Truck className="w-4 h-4" />
            მიტანა ყველა სოფელში და ქალაქში · გადახდა კურიერთან
          </div>

          {desc && (
            <p className="mt-3 text-[13px] leading-relaxed text-[#6f6f85] whitespace-pre-line">
              {desc.length > 600 ? `${desc.slice(0, 600)}…` : desc}
            </p>
          )}
        </div>

        {/* Sticky footer: select + live bundle state */}
        <div
          className="flex-shrink-0 border-t border-[rgba(11,11,18,.08)] bg-white px-4 pt-3 space-y-2"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              const wasSelected = selected;
              onToggle();
              if (!wasSelected) setTimeout(onClose, 180);
            }}
            className={`w-full h-14 rounded-[16px] text-[15px] uppercase tracking-wide flex items-center justify-center gap-2 ${
              selected ? "bnd-btn-green" : "bnd-btn-grad"
            }`}
          >
            {selected ? (
              <>
                <Check className="w-5 h-5" strokeWidth={3} />
                არჩეულია ✓ — წაშლა
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" strokeWidth={3} />
                დაამატე ნაკრებში
              </>
            )}
          </button>

          {full && (
            <p className="text-[11px] font-bold text-[#c2410c] text-center">
              უკვე არჩეულია {bundleSize} პროდუქტი — დამატებისას პირველი შეიცვლება.
            </p>
          )}

          <p className="text-[12px] font-extrabold text-[#0b0b12] text-center">
            არჩეული: {selectedCount}/{bundleSize} · სულ {bundlePrice}₾
          </p>
        </div>
      </div>
    </div>
  );
};

export default BundleQuickViewSheet;
