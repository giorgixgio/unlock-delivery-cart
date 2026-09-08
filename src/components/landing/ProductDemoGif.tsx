import { getProductDemoMedia } from "@/lib/productDemoMedia";
import { Play } from "lucide-react";

interface ProductDemoGifProps {
  sku: string | number | undefined | null;
}

/**
 * Eye-catching "see it in action" animated demo card for product landing pages.
 * Only renders when a demo clip is registered for the product's SKU.
 */
const ProductDemoGif = ({ sku }: ProductDemoGifProps) => {
  const media = getProductDemoMedia(sku);
  if (!media) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/5 shadow-lg">
      {/* Glow accent */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-success/20 blur-3xl" />

      <div className="relative flex flex-col items-center gap-3 p-4">
        <div className="flex items-center gap-1.5 self-start">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Play className="h-3 w-3 fill-primary" />
            {media.eyebrow ?? "როგორ მუშაობს"}
          </span>
        </div>

        <div className="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-xl bg-muted shadow-md ring-1 ring-border">
          <img
            src={media.src}
            alt={media.caption}
            className="h-full w-full object-cover"
            loading="lazy"
            // Animated WebP loops automatically; no controls needed.
          />
        </div>

        <p className="text-center text-sm font-semibold leading-snug text-foreground">
          {media.caption}
        </p>
      </div>
    </section>
  );
};

export default ProductDemoGif;
