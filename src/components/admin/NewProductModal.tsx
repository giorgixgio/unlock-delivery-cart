import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Star, Loader2, ImageIcon } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const BUCKET = "product-images";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10A0-\u10FF]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `product-${Date.now()}`;
}

const NewProductModal = ({ open, onClose, onCreated }: Props) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [category, setCategory] = useState<string>("uncategorized");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");
  const [binLocation, setBinLocation] = useState("");
  const [isVerified, setIsVerified] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setTitle(""); setSku(""); setPrice(""); setCompareAtPrice("");
    setCategory("uncategorized"); setVendor(""); setDescription("");
    setImages([]); setPrimary(""); setBinLocation(""); setIsVerified(true);
  };

  const handleClose = () => { if (!saving && !uploading) { reset(); onClose(); } };

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      const safeId = (sku || title || `new-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${safeId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg", upsert: false,
        });
        if (error) { toast({ title: `Upload failed: ${file.name}`, description: error.message, variant: "destructive" }); continue; }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
      if (newUrls.length) {
        setImages((prev) => {
          const next = [...prev, ...newUrls];
          if (!primary) setPrimary(next[0]);
          return next;
        });
      }
    } finally { setUploading(false); }
  }, [sku, title, primary, toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) uploadFiles(files);
  };

  const handleSave = async () => {
    const t = title.trim();
    const s = sku.trim();
    const p = parseFloat(price);
    if (!t) return toast({ title: "Title required", variant: "destructive" });
    if (!s) return toast({ title: "SKU required", variant: "destructive" });
    if (isNaN(p) || p < 0) return toast({ title: "Valid price required", variant: "destructive" });

    setSaving(true);
    try {
      // check duplicate sku
      const { data: dup } = await supabase.from("products").select("id,title").eq("sku", s).maybeSingle();
      if (dup) { toast({ title: "Duplicate SKU", description: `Already used by "${dup.title}"`, variant: "destructive" }); setSaving(false); return; }

      const cmp = compareAtPrice.trim() === "" ? null : parseFloat(compareAtPrice);
      if (cmp !== null && (isNaN(cmp) || cmp < 0)) {
        toast({ title: "Invalid compare price", variant: "destructive" }); setSaving(false); return;
      }

      const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const handle = slugify(t);
      const finalPrimary = primary && images.includes(primary) ? primary : (images[0] || "/placeholder.svg");
      const ordered = images.length ? [finalPrimary, ...images.filter((u) => u !== finalPrimary)] : [];

      const payload: any = {
        id, title: t, handle, sku: s, price: p, compare_at_price: cmp,
        image: finalPrimary, images: ordered, category, vendor: vendor.trim(),
        description: description.trim(), tags: [], available: true,
        is_verified: isVerified,
      };
      if (binLocation.trim()) payload.bin_location = binLocation.trim();

      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;

      toast({ title: "Product created" });
      localStorage.removeItem("bigmart-products-v6");
      onCreated();
      reset();
      onClose();
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Add new product</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs font-bold">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product name" />
          </div>
          <div>
            <Label className="text-xs font-bold">SKU *</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="ABC-123" className="font-mono" />
          </div>
          <div>
            <Label className="text-xs font-bold">Bin location</Label>
            <Input value={binLocation} onChange={(e) => setBinLocation(e.target.value)} placeholder="A-12" />
          </div>
          <div>
            <Label className="text-xs font-bold">Price (₾) *</Label>
            <Input type="number" step="0.1" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-bold">Compare-at price (₾)</Label>
            <Input type="number" step="0.1" min="0" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <Label className="text-xs font-bold">Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-bold">Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Brand" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-bold">Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-xs font-bold">Verified (visible on the live website)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uncheck if the SKU still needs to be confirmed by a packer — unverified products stay hidden from the storefront.
            </p>
          </div>
        </div>


        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mt-2 border-2 border-dashed rounded-lg p-5 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Drop images here, or</p>
          <label className="inline-block mt-2">
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const files = Array.from(e.target.files || []); uploadFiles(files); e.target.value = ""; }} />
            <span className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-bold">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Choose files</>}
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground mt-2">JPG, PNG, WebP — optional</p>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {images.map((url, idx) => {
              const isPrimary = url === primary;
              return (
                <div key={url + idx} className={`relative group rounded-lg overflow-hidden border-2 ${isPrimary ? "border-primary ring-2 ring-primary/30" : "border-border"} bg-muted aspect-square`}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {isPrimary && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded">Primary</div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 flex items-center justify-between px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setPrimary(url)} className="text-white hover:text-yellow-300" title="Set primary">
                      <Star className={`w-4 h-4 ${isPrimary ? "fill-yellow-300 text-yellow-300" : ""}`} />
                    </button>
                    <button onClick={() => {
                      setImages((prev) => prev.filter((u) => u !== url));
                      if (primary === url) setPrimary(images.find((u) => u !== url) || "");
                    }} className="text-white hover:text-red-400" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {images.length === 0 && (
          <div className="text-center text-muted-foreground text-xs flex items-center justify-center gap-1 mt-2">
            <ImageIcon className="w-3.5 h-3.5" /> No images yet — a placeholder will be used
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose} disabled={saving || uploading}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : "Create product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewProductModal;
