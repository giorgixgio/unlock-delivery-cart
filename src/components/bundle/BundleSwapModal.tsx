import { useEffect, useState } from "react";
import { X, ArrowLeftRight, Plus } from "lucide-react";
import { Product } from "@/lib/constants";

interface BundleSwapModalProps {
  /** The product the user is trying to add (the "incoming" item). */
  incoming: Product | null;
  /** The 5 currently selected products. */
  selected: Product[];
  open: boolean;
  onClose: () => void;
  /** Remove this selected id and add the incoming id. */
  onSwap: (outgoingId: string) => void;
}

/** Centered popup shown when the user tries to add a 6th bundle item.
 *  Forces an explicit swap choice instead of silently dropping the oldest. */
const BundleSwapModal = ({
  incoming,
  selected,
  open,
  onClose,
  onSwap,
}: BundleSwapModalProps) => {
  const [render, setRender] = useState(open);

  // Keep mounted through the exit transition, then unmount.
  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    const t = setTimeout(() => setRender(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!render || !incoming) return null;

  return (
    <div
      className={`bnd-root fixed inset-0 z-[70] flex items-end sm:items-center justify-center ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Scrim with blur */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-[#0b0b12]/60 transition-opacity duration-200 ${
          open ? "opacity-100 backdrop-blur-[3px]" : "opacity-0"
        }`}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ნაკრების ლიმიტი"
        className={`relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-[0_24px_60px_rgba(11,11,18,.35)] flex flex-col overflow-hidden transition-all duration-220 ease-out ${
          open ? "translate-y-0 opacity-100 scale-100" : "translate-y-6 opacity-0 scale-[0.98]"
        }`}
        style={{ maxHeight: "92dvh" }}
      >
        {/* Top gradient rule */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[linear-gradient(90deg,#ff3b3b,#ff6b00,#ff3b3b)]" />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="დახურვა"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-[#f2f2f7] border border-[rgba(11,11,18,.08)] flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="w-5 h-5 text-[#0b0b12]" />
        </button>

        {/* Header */}
        <div className="px-5 pt-6 pb-3 text-center flex-shrink-0">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[rgba(255,59,59,.1)] border border-[rgba(255,59,59,.25)] flex items-center justify-center mb-2.5">
            <ArrowLeftRight className="w-6 h-6 text-[#ff3b3b]" strokeWidth={2.5} />
          </div>
          <h2 className="bnd-display text-[22px] text-[#0b0b12] leading-tight">
            მაქსიმუმ 5 ნივთი შეგიძლია აირჩიო
          </h2>
          <p className="mt-1.5 text-[13px] font-semibold text-[#6f6f85] leading-relaxed">
            ახალი პროდუქტის დასამატებლად, გთხოვ, ამოშალე ან შეცვალე ქვემოდან ერთ-ერთი:
          </p>
        </div>

        {/* Incoming item banner */}
        <div className="mx-4 mb-3 flex-shrink-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#c2410c] mb-1.5 px-1">
            დასამატებელი
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(255,107,0,.3)] bg-[rgba(255,107,0,.06)] p-2.5">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#f7f7fb] flex-shrink-0">
              <img
                src={incoming.image}
                alt={incoming.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-[#0b0b12] leading-snug line-clamp-2">
                {incoming.title}
              </p>
              <p className="mt-0.5 text-[12px] font-extrabold text-[#ff6b00]">
                ახალი +5
              </p>
            </div>
            <Plus className="w-5 h-5 text-[#ff6b00] flex-shrink-0" strokeWidth={3} />
          </div>
        </div>

        {/* Scrollable list of selected items to swap out */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#6f6f85] mb-1.5 px-1">
            აირჩიე შესაცვლელი
          </p>
          <div className="space-y-2">
            {selected.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSwap(p.id)}
                className="w-full flex items-center gap-3 rounded-2xl border border-[rgba(11,11,18,.09)] bg-white p-2.5 text-left active:scale-[0.985] transition-transform hover:border-[rgba(255,59,59,.4)] hover:bg-[rgba(255,59,59,.03)]"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#f7f7fb] flex-shrink-0">
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#0b0b12] leading-snug line-clamp-2">
                    {p.title}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#6f6f85]">
                    {Math.round(p.price)}₾ · არჩეულია
                  </p>
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] text-white text-[11px] font-extrabold px-3 py-2 shadow-[0_6px_16px_rgba(255,59,59,.25)]">
                  <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={3} />
                  შეცვლა
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer: keep current */}
        <div
          className="flex-shrink-0 border-t border-[rgba(11,11,18,.08)] bg-white px-4 pt-3"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl border border-[rgba(11,11,18,.12)] bg-[#f7f7fb] text-[#0b0b12] text-[14px] font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <X className="w-4 h-4" strokeWidth={3} />
            დახურვა
          </button>
        </div>
      </div>
    </div>
  );
};

export default BundleSwapModal;
