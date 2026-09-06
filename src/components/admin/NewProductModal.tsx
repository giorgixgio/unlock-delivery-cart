import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Star, Loader2, ImageIcon, Link2, Sparkles, RefreshCw } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { clearProductsCache } from "@/hooks/useProducts";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultWarehouse?: "" | "A" | "B";
  /** When set, the modal runs in edit mode, pre-filled with this product. */
  editProductId?: string | null;
}

const BUCKET = "product-images";

// Parse a human-readable product title from the URL slug itself — no network
// request, so nothing to bot-block. Returns null for unknown patterns.
function titleFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    let slug: string | null = null;

    if (host.includes("temu.com")) {
      // temu.com/{hyphenated-slug}-g-{numeric-id}.html
      const m = path.match(/\/([a-z0-9-]+)-g-\d+\.html/i);
      if (m) slug = m[1];
    } else if (host.includes("aliexpress.")) {
      // description query param on some variants, or slug before item id
      const desc = u.searchParams.get("description");
      if (desc && desc.length > 3) slug = desc;
      else {
        const m = path.match(/\/([a-z0-9-]{8,})\/\d+\.html/i) || path.match(/\/([a-z0-9-]{8,})-\d+\.html/i);
        if (m) slug = m[1];
      }
    } else if (host.includes("amazon.")) {
      // amazon.com/{slug}/dp/{ASIN}
      const m = path.match(/^\/([A-Za-z0-9-]{8,})\/(?:dp|gp\/product)\//);
      if (m) slug = m[1];
    }

    if (!slug) return null;
    const words = decodeURIComponent(slug)
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 0 && !/^\d+$/.test(w));
    if (words.length < 2) return null;
    const title = words
      .map((w) => (w.length <= 2 && /^[a-z]+$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
      .join(" ");
    return title.slice(0, 200);
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10A0-\u10FF]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `product-${Date.now()}`;
}

const NewProductModal = ({ open, onClose, onCreated, defaultWarehouse = "", editProductId = null }: Props) => {
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
  const [stockQuantity, setStockQuantity] = useState("0");
  const [isVerified, setIsVerified] = useState(true);
  const [warehouse, setWarehouse] = useState<"" | "A" | "B">(defaultWarehouse);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sourceLink, setSourceLink] = useState("");
  const [keyFeatures, setKeyFeatures] = useState("");
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const isEdit = !!editProductId;

  useEffect(() => {
    if (open) setWarehouse(defaultWarehouse);
  }, [open, defaultWarehouse]);

  // Edit mode: load the full product row and pre-fill every field.
  useEffect(() => {
    if (!open || !editProductId) return;
    let cancelled = false;
    setLoadingProduct(true);
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("title, sku, price, compare_at_price, category, vendor, description, image, images, bin_location, stock_quantity, is_verified, warehouse")
        .eq("id", editProductId)
        .maybeSingle();
      if (cancelled) return;
      setLoadingProduct(false);
      if (error || !data) {
        toast({ title: "Couldn't load product", description: error?.message, variant: "destructive" });
        return;
      }
      const imgs: string[] = Array.isArray(data.images) && data.images.length
        ? (data.images as string[])
        : (data.image ? [data.image] : []);
      setTitle(data.title || "");
      setSku(data.sku || "");
      setPrice(data.price != null ? String(data.price) : "");
      setCompareAtPrice(data.compare_at_price != null ? String(data.compare_at_price) : "");
      setCategory(data.category || "uncategorized");
      setVendor(data.vendor || "");
      setDescription(data.description || "");
      setImages(imgs);
      setPrimary(data.image && imgs.includes(data.image) ? data.image : (imgs[0] || ""));
      setBinLocation(data.bin_location || "");
      setStockQuantity(String(Math.max(data.stock_quantity ?? 0, 0)));
      setIsVerified(data.is_verified !== false);
      setWarehouse((data.warehouse as "" | "A" | "B") || "");
    })();
    return () => { cancelled = true; };
  }, [open, editProductId]);

  const reset = () => {
    setTitle(""); setSku(""); setPrice(""); setCompareAtPrice("");
    setCategory("uncategorized"); setVendor(""); setDescription("");
    setImages([]); setPrimary(""); setBinLocation(""); setIsVerified(true); setWarehouse(defaultWarehouse);
    setSourceLink(""); setKeyFeatures(""); setStockQuantity("0");
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

  const handleFetchInfo = async () => {
    const url = sourceLink.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return toast({ title: "Paste a valid link first", variant: "destructive" });
    }
    // Step 1: parse title from the URL slug itself — instant, no network,
    // works even when the site (e.g. Temu) blocks scrapers. Never overwrites.
    let filled = 0;
    const slugTitle = titleFromUrl(url);
    const titleWasEmpty = !title.trim();

    // Run the AI title polish and the live page fetch in parallel — neither
    // blocks the other, and each falls back gracefully on its own.
    const aiTitlePromise = (async (): Promise<string | null> => {
      if (!slugTitle || !titleWasEmpty) return null;
      try {
        const { data, error } = await supabase.functions.invoke("generate-product-title", {
          body: { raw_title: slugTitle },
        });
        if (error || !data?.title) return null;
        return String(data.title).slice(0, 200);
      } catch {
        return null; // fall back to the raw slug title below
      }
    })();

    // Step 2: best-effort live fetch for image/price (and title only if the
    // slug parse found nothing).
    setFetching(true);
    let fetched = false;
    let fetchedTitle: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-product-info", { body: { url } });
      if (error) throw error;
      if (data?.ok) {
        fetched = true;
        if (data.title && !slugTitle) fetchedTitle = String(data.title).slice(0, 200);
        if (data.price && !price.trim()) { setPrice(String(data.price)); filled++; }
        if (data.image && images.length === 0) {
          setImages([String(data.image)]);
          setPrimary(String(data.image));
          filled++;
        }
      }
    } catch (_err) {
      // ignore — slug result still stands
    } finally { setFetching(false); }

    // Step 3: fill the title (only if still empty) — prefer the AI-polished
    // Georgian title, fall back to the raw slug, then the fetched page title.
    if (titleWasEmpty) {
      const aiTitle = await aiTitlePromise;
      const finalTitle = aiTitle || slugTitle || fetchedTitle;
      if (finalTitle) {
        setTitle(finalTitle);
        filled++;
      }
    }

    if (filled > 0) {
      toast({ title: `Filled ${filled} empty field${filled > 1 ? "s" : ""}` });
    } else if (!fetched) {
      toast({
        title: "Couldn't auto-fetch details",
        description: "You can still generate a description from the title and key features below.",
      });
    } else {
      toast({ title: "Nothing new to fill", description: "Your existing values were kept as-is." });
    }
  };

  const handleGenerateDescription = async () => {
    if (!title.trim() && !keyFeatures.trim() && !description.trim()) {
      return toast({ title: "Add a title or key features first", variant: "destructive" });
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-product-description", {
        body: {
          title: title.trim(),
          features: keyFeatures.trim(),
          existing_description: description.trim(),
          source_url: sourceLink.trim(),
          price: price.trim() ? parseFloat(price) : null,
        },
      });
      if (error) throw error;
      if (data?.error || !data?.description) throw new Error(data?.error || "No description returned");
      setDescription(String(data.description));
      toast({ title: "Description generated" });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err?.message || "Try again", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const handleSave = async () => {
    const t = title.trim();
    const s = sku.trim();
    const p = parseFloat(price);
    if (!t) return toast({ title: "Title required", variant: "destructive" });
    if (!s) return toast({ title: "SKU required", variant: "destructive" });
    if (isNaN(p) || p < 0) return toast({ title: "Valid price required", variant: "destructive" });
    if (warehouse !== "A" && warehouse !== "B") return toast({ title: "Warehouse required", description: "Choose Warehouse A or B", variant: "destructive" });

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
        stock_quantity: Math.max(parseInt(stockQuantity, 10) || 0, 0),
        is_verified: isVerified, warehouse,
      };
      if (binLocation.trim()) payload.bin_location = binLocation.trim();

      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;

      toast({ title: "Product created" });
      clearProductsCache();
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
            <Label className="text-xs font-bold">Stock quantity</Label>
            <Input type="number" min="0" step="1" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
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
            <Label className="text-xs font-bold">Warehouse *</Label>
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value as "" | "A" | "B")}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select warehouse…</option>
              <option value="A">Warehouse A</option>
              <option value="B">Warehouse B</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-bold">Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Brand" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-bold">Source link</Label>
            <div className="flex gap-2">
              <Input
                value={sourceLink}
                onChange={(e) => setSourceLink(e.target.value)}
                placeholder="https://... (Temu, AliExpress, etc.) — optional"
              />
              <Button type="button" variant="outline" onClick={handleFetchInfo} disabled={fetching}>
                {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">Fetch info</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Only fills fields that are still empty — nothing you typed gets overwritten.
            </p>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-bold">Key features</Label>
            <Textarea
              rows={2}
              value={keyFeatures}
              onChange={(e) => setKeyFeatures(e.target.value)}
              placeholder="wireless, waterproof, USB-C charging — optional, helps the AI"
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <Label className="text-xs font-bold">Description</Label>
              <Button
                type="button"
                size="sm"
                variant={description.trim() ? "outline" : "default"}
                onClick={handleGenerateDescription}
                disabled={generating}
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                ) : description.trim() ? (
                  <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate description</>
                )}
              </Button>
            </div>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
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
