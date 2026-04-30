import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Star, Loader2, GripVertical, ImageIcon } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
  productTitle: string;
  currentImage: string;
  currentImages: string[];
  onSaved: () => void;
}

const BUCKET = "product-images";

const ProductImageManager = ({ open, onClose, productId, productTitle, currentImage, currentImages, onSaved }: Props) => {
  const { toast } = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      const merged = currentImages?.length ? [...currentImages] : (currentImage ? [currentImage] : []);
      setImages(merged);
      setPrimary(currentImage || merged[0] || "");
    }
  }, [open, productId]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const path = `${safeId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (error) {
          toast({ title: `Upload failed: ${file.name}`, description: error.message, variant: "destructive" });
          continue;
        }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
      if (newUrls.length) {
        setImages((prev) => {
          const next = [...prev, ...newUrls];
          if (!primary && next.length) setPrimary(next[0]);
          return next;
        });
        toast({ title: `Uploaded ${newUrls.length} image(s)` });
      }
    } finally {
      setUploading(false);
    }
  }, [productId, primary, toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    uploadFiles(files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) uploadFiles(files);
  };

  const handleDelete = (url: string) => {
    setImages((prev) => prev.filter((u) => u !== url));
    if (primary === url) {
      const remaining = images.filter((u) => u !== url);
      setPrimary(remaining[0] || "");
    }
  };

  const handleReorder = (from: number, to: number) => {
    if (from === to) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    if (!images.length) {
      toast({ title: "Add at least one image", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const finalPrimary = primary && images.includes(primary) ? primary : images[0];
      // Make sure primary is first in the array for consistency
      const ordered = [finalPrimary, ...images.filter((u) => u !== finalPrimary)];
      const { error } = await supabase
        .from("products")
        .update({ image: finalPrimary, images: ordered })
        .eq("id", productId);
      if (error) throw error;
      toast({ title: "Images updated" });
      localStorage.removeItem("bigmart-products-v4");
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold line-clamp-1">Manage images — {productTitle}</DialogTitle>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Upload className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Drop images here, or</p>
          <label className="inline-block mt-2">
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
            <span className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-bold">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Choose files</>}
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground mt-2">JPG, PNG, WebP — multiple allowed</p>
        </div>

        <div className="mt-4">
          <p className="text-xs font-bold text-muted-foreground mb-2">
            {images.length} image(s). Click ⭐ to set primary. Drag to reorder.
          </p>
          {images.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ImageIcon className="w-8 h-8 opacity-40" />
              No images yet
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((url, idx) => {
                const isPrimary = url === primary;
                return (
                  <div
                    key={url + idx}
                    draggable
                    onDragStart={() => setDraggingIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingIdx !== null) handleReorder(draggingIdx, idx);
                      setDraggingIdx(null);
                    }}
                    className={`relative group rounded-lg overflow-hidden border-2 ${isPrimary ? "border-primary ring-2 ring-primary/30" : "border-border"} bg-muted aspect-square`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm rounded p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                      <GripVertical className="w-3 h-3" />
                    </div>
                    {isPrimary && (
                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                        Primary
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm flex items-center justify-between px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setPrimary(url)}
                        className="text-white hover:text-yellow-300"
                        title="Set as primary"
                      >
                        <Star className={`w-4 h-4 ${isPrimary ? "fill-yellow-300 text-yellow-300" : ""}`} />
                      </button>
                      <span className="text-[10px] text-white/80">#{idx + 1}</span>
                      <button
                        onClick={() => handleDelete(url)}
                        className="text-white hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductImageManager;
