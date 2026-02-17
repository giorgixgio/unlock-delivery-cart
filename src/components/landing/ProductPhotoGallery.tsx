import { shopifyThumb } from "@/hooks/useProducts";
import { Camera } from "lucide-react";

interface ProductPhotoGalleryProps {
  images: string[];
  alt: string;
}

const ProductPhotoGallery = ({ images, alt }: ProductPhotoGalleryProps) => {
  // Show extra images beyond the first (hero) one
  const galleryImages = images.length > 1 ? images.slice(1) : images;

  if (galleryImages.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground">ფოტო გალერეა</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {galleryImages.map((src, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl overflow-hidden bg-muted border border-border shadow-sm"
          >
            <img
              src={shopifyThumb(src, 400)}
              alt={`${alt} ${i + 2}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductPhotoGallery;
