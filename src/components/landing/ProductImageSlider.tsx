import { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shopifyThumb } from "@/hooks/useProducts";

interface ProductImageSliderProps {
  images: string[];
  alt: string;
  children?: React.ReactNode; // overlay badges
}

const ProductImageSlider = ({ images, alt, children }: ProductImageSliderProps) => {
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const safeImages = images.length > 0 ? images : ["/placeholder.svg"];

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, safeImages.length - 1)));
  }, [safeImages.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      goTo(current + (dx < 0 ? 1 : -1));
    }
  };

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-lg">
      <div
        ref={trackRef}
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {safeImages.map((src, i) => (
          <img
            key={i}
            src={shopifyThumb(src, 800)}
            alt={`${alt} ${i + 1}`}
            className="w-full h-full object-cover flex-shrink-0"
            style={{ minWidth: "100%" }}
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>

      {/* Dots */}
      {safeImages.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {safeImages.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current
                  ? "bg-primary w-5"
                  : "bg-foreground/30"
              }`}
            />
          ))}
        </div>
      )}

      {/* Arrow buttons for desktop */}
      {safeImages.length > 1 && current > 0 && (
        <button
          onClick={() => goTo(current - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center shadow-md"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
      )}
      {safeImages.length > 1 && current < safeImages.length - 1 && (
        <button
          onClick={() => goTo(current + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center shadow-md"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}

      {/* Overlay children (badges, discount tag) */}
      {children}
    </div>
  );
};

export default ProductImageSlider;
