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

  if (!product) return null;

  const full = selectedCount >= bundleSize && !selected;
  const desc = plainText(product.description || "");

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-foreground/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
        className={`absolute inset-x-0 bottom-0 bg-card rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: "92dvh",
          transform: open && dragY ? `translateY(${dragY}px)` : undefined,
        }}
      >
        {/* Drag handle / swipe-down to close */}
        <div
          className="pt-2 pb-1 flex-shrink-0 touch-none"
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
          <div className="w-11 h-1.5 rounded-full bg-muted mx-auto" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="დახურვა"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <ProductImageSlider images={extractImages(product)} alt={product.title} />

          <h2 className="mt-4 text-[18px] font-extrabold text-foreground leading-snug">
            {product.title}
          </h2>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground line-through font-semibold">
              {Math.round(product.price)}₾
            </span>
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
              შედის {bundleSize}-ის ნაკრებში — სულ {bundlePrice}₾
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[12px] font-bold text-success">
            <Truck className="w-4 h-4" />
            მიტანა უფასო · გადაიხდი კურიერთან
          </div>

          {desc && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground whitespace-pre-line">
              {desc.length > 600 ? `${desc.slice(0, 600)}…` : desc}
            </p>
          )}
        </div>

        {/* Sticky footer: select + live bundle state */}
        <div
          className="flex-shrink-0 border-t border-border bg-card px-4 pt-3 space-y-2"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              const wasSelected = selected;
              onToggle();
              if (!wasSelected) setTimeout(onClose, 180);
            }}
            className={`w-full h-14 rounded-xl text-[15px] font-extrabold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform ${
              selected
                ? "bg-muted text-foreground border-2 border-success"
                : "bg-success text-success-foreground"
            }`}
          >
            {selected ? (
              <>
                <Check className="w-5 h-5 text-success" strokeWidth={3} />
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
            <p className="text-[11px] font-bold text-primary text-center">
              უკვე არჩეულია {bundleSize} პროდუქტი — დამატებისას პირველი შეიცვლება.
            </p>
          )}

          <p className="text-[12px] font-extrabold text-foreground text-center">
            არჩეული: {selectedCount}/{bundleSize} · სულ {bundlePrice}₾
          </p>
        </div>
      </div>
    </div>
  );
};

export default BundleQuickViewSheet;
