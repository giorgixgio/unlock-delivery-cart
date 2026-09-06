import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, ImagePlus, Loader2, ExternalLink, Package, Upload, Copy, Check, X, Link2, Star, Sparkles, AlertTriangle, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { titleFromUrl } from "@/lib/sourceTitleParser";
import { generateTitleRu } from "@/lib/wholesaleRuTitle";

type Warehouse = "A" | "B";

type Batch = {
  id: string;
  batch_number: string;
  warehouse: Warehouse;
  created_at: string;
  is_completed: boolean;
  shipping_stage: string | null;
};

type Item = {
  id: string;
  batch_id: string | null;
  warehouse: Warehouse;
  sku: string;
  title: string | null;
  image_url: string | null;
  images: string[] | null;
  alibaba_link: string | null;
  alibaba_order_id: string | null;

  alibaba_title: string | null;
  supplier_group_id: string | null;
  unit_price: number | null;
  selling_price: number | null;
  old_price: number | null;

  weight_kg: number | null;
  quantity: number | null;
  carton_count: number | null;
  notes: string | null;
  description: string | null;
  title_ru: string | null;
  logistics_stage: string;
  listing_status: string;
  storefront_product_id: string | null;
  hs_code: string | null;
  hs_confidence: string | null;
  hs_requires_certification: boolean | null;
  hs_notes: string | null;
  hs_reviewed: boolean;
  created_at: string;
  updated_at: string;
};

const MARK_PREFIX = "G888-T1482";
const INTRO = "Please prepare a draft order. I'll pay once I finish collecting all items. Please include an estimated delivery date.";

const productLabel = (it: Pick<Item, "title" | "alibaba_title" | "sku">) => {
  const base = it.title || it.sku;
  return it.alibaba_title ? `${base} (your listing: ${it.alibaba_title})` : base;
};

/** Build the supplier message for a standalone item or a whole supplier group. */
const buildShippingMarkText = (item: Item, groupItems: Item[]) => {
  if (item.supplier_group_id && groupItems.length > 1) {
    const lines = groupItems
      .map((g, i) => `${i + 1}. ${productLabel(g)} → ${MARK_PREFIX}-${g.sku}`)
      .join("\n");
    return `${INTRO}\n\nCarton shipping marks (one per product):\n${lines}`;
  }
  return `${INTRO}\n\nCarton shipping mark: ${MARK_PREFIX}-${item.sku}\nProduct: ${productLabel(item)}`;
};

const GROUP_COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-orange-500",
];
const GROUP_ROW_TINTS = [
  "bg-rose-500/10",
  "bg-amber-500/10",
  "bg-emerald-500/10",
  "bg-sky-500/10",
  "bg-violet-500/10",
  "bg-fuchsia-500/10",
  "bg-lime-500/10",
  "bg-orange-500/10",
];
const groupHash = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
};
const groupColor = (id: string) => GROUP_COLORS[groupHash(id) % GROUP_COLORS.length];
const groupRowTint = (id: string) => GROUP_ROW_TINTS[groupHash(id) % GROUP_ROW_TINTS.length];

/**
 * Operator-facing completeness check. Purely informative — nothing is required
 * for saving, publishing or generating documents. Notes and Old price are
 * intentionally excluded.
 */
const COMPLETENESS_FIELDS: { key: string; label: string; get: (i: Item) => unknown }[] = [
  { key: "title", label: "Title", get: (i) => i.title },
  { key: "alibaba_title", label: "Alibaba title", get: (i) => i.alibaba_title },
  { key: "alibaba_link", label: "Alibaba link", get: (i) => i.alibaba_link },
  { key: "images", label: "Image", get: (i) => i.image_url ?? (i.images?.length ? "x" : null) },
  { key: "quantity", label: "Quantity", get: (i) => i.quantity },
  { key: "carton_count", label: "Cartons", get: (i) => i.carton_count },
  { key: "weight_kg", label: "Weight", get: (i) => i.weight_kg },
  { key: "unit_price", label: "Unit price", get: (i) => i.unit_price },
  { key: "selling_price", label: "Selling price", get: (i) => i.selling_price },
  { key: "hs_code", label: "HS code", get: (i) => i.hs_code },
  { key: "title_ru", label: "Russian name", get: (i) => i.title_ru },
  { key: "description", label: "Description", get: (i) => i.description },
];

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());

const missingFields = (i: Item) =>
  COMPLETENESS_FIELDS.filter((f) => isBlank(f.get(i))).map((f) => f.label);

const missingKeys = (i: Item) => new Set(COMPLETENESS_FIELDS.filter((f) => isBlank(f.get(i))).map((f) => f.key));



/** SKU cell with click-to-copy supplier message + group indicator. */
function SkuCell({
  item,
  groupItems,
  onUngroup,
}: {
  item: Item;
  groupItems: Item[];
  onUngroup: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildShippingMarkText(item, groupItems));
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      {item.supplier_group_id && (
        <button
          type="button"
          onClick={onUngroup}
          title={`Same-supplier group (${groupItems.length} items) — click to remove this row from the group`}
          className="group/dot relative inline-flex h-4 w-4 items-center justify-center"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${groupColor(item.supplier_group_id)} group-hover/dot:opacity-0 transition-opacity`}
          />
          <X className="absolute h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/dot:opacity-100 transition-opacity" />
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        title="Click to copy supplier message"
        className="group inline-flex items-center gap-1 font-mono text-xs font-semibold hover:text-primary transition-colors"
      >
        {item.sku}
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </div>
  );
}

const STAGES = [
  { value: "to_be_ordered", label: "To Be Ordered", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  { value: "ordered", label: "Ordered", className: "bg-muted text-muted-foreground" },
  { value: "at_freight_forwarder", label: "At Forwarder", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "in_transit", label: "In Transit", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "arrived", label: "Arrived", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { value: "cleared_customs", label: "Cleared Customs", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
];

/** Stages that are managed for the whole batch at once, not per item. */
const SHIPPING_STAGES = ["in_transit", "arrived", "cleared_customs"];

const stageMeta = (v: string) => STAGES.find((s) => s.value === v) ?? STAGES[0];

const warehouseClass = (w: Warehouse) =>
  w === "A"
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
    : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";

/** Manual FX rate — update this value if the USD→GEL rate changes. */
const USD_TO_GEL = 2.65;

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const gelFromUsd = (n: number) =>
  `₾${(n * USD_TO_GEL).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** USD hero amount with the converted GEL value underneath. */
function DualPrice({ amountUsd, size = "sm" }: { amountUsd: number; size?: "sm" | "lg" }) {
  return (
    <div className="leading-tight">
      <div className={size === "lg" ? "text-lg font-bold" : "text-sm font-bold text-foreground"}>
        {usd(amountUsd)}
      </div>
      <div className={`${size === "lg" ? "text-sm" : "text-xs"} text-muted-foreground`}>
        {gelFromUsd(amountUsd)}
      </div>
    </div>
  );
}

/** Signed-URL cache for the private wholesale-images bucket. */
const signedCache = new Map<string, string>();

function useSignedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(path ? signedCache.get(path) ?? null : null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = signedCache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    supabase.storage
      .from("wholesale-images")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!active || !data?.signedUrl) return;
        signedCache.set(path, data.signedUrl);
        setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

function Thumb({
  path,
  primary,
  onMakePrimary,
  onRemove,
  onOpen,
}: {
  path: string;
  primary: boolean;
  onMakePrimary: () => void;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  const url = useSignedUrl(path);

  return (
    <div
      className={`group/th relative h-14 w-14 shrink-0 overflow-hidden rounded-md border ${
        primary ? "border-primary ring-1 ring-primary" : "border-border"
      } bg-muted/40`}
      title={onOpen ? "Click the image to edit this item" : primary ? "Primary image" : "Click the star to make primary"}
    >
      {url ? (
        <img
          src={url}
          alt="Wholesale item"
          className={`h-full w-full object-cover ${onOpen ? "cursor-pointer" : ""}`}
          loading="lazy"
          onClick={onOpen}
        />

      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/80 opacity-0 transition-opacity group-hover/th:opacity-100">
        <button
          type="button"
          onClick={onMakePrimary}
          title="Make primary"
          className="p-0.5 hover:text-primary"
        >
          <Star className={`h-3 w-3 ${primary ? "fill-primary text-primary" : ""}`} />
        </button>
        <button type="button" onClick={onRemove} title="Remove image" className="p-0.5 hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </div>
      {primary && (
        <Star className="absolute right-0.5 top-0.5 h-3 w-3 fill-primary text-primary drop-shadow" />
      )}
    </div>
  );
}

/** Compact grid cell: single primary thumbnail + count badge; still accepts file drops. */
function GridImageCell({
  images,
  primary,
  onUpload,
  uploading,
  onOpen,
}: {
  images: string[];
  primary: string | null;
  onUpload: (files: File[]) => void;
  uploading: boolean;
  onOpen: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const primaryPath = primary ?? images[0] ?? null;
  const url = useSignedUrl(primaryPath);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
        if (files.length) onUpload(files);
      }}
      title="Click to edit item — or drop images here to add them"
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 transition-colors ${
        dragOver ? "border-primary ring-2 ring-primary/40" : "border-border"
      }`}
    >
      {primaryPath && url ? (
        <img
          src={url}
          alt="Wholesale item"
          className="h-full w-full cursor-pointer object-cover"
          loading="lazy"
          onClick={onOpen}
        />
      ) : uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : primaryPath ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <ImagePlus
          className="h-4 w-4 cursor-pointer text-muted-foreground"
          onClick={onOpen}
        />
      )}
      {images.length > 1 && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-background/85 px-1 py-px text-[10px] font-semibold text-foreground shadow-sm">
          ×{images.length}
        </span>
      )}
      {uploading && primaryPath && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

/** Multi-image editor (item popup): thumbnail stack, obvious drop zone, remove, set primary. */
function ItemImages({
  images,
  primary,
  onUpload,
  onSetPrimary,
  onRemove,
  uploading,
  onOpen,
  className,
}: {
  images: string[];
  primary: string | null;
  onUpload: (files: File[]) => void;
  onSetPrimary: (path: string) => void;
  onRemove: (path: string) => void;
  uploading: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {images.map((p) => (
            <Thumb
              key={p}
              path={p}
              primary={p === primary}
              onMakePrimary={() => onSetPrimary(p)}
              onRemove={() => onRemove(p)}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
          if (files.length) onUpload(files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) onUpload(files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Uploading…</span>
          </>
        ) : (
          <>
            <ImagePlus className={`h-5 w-5 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">
              {dragOver ? "Drop images to add them" : "Drag & drop images here, or click to browse"}
            </span>
            <span className="text-xs text-muted-foreground">Multiple files allowed</span>
          </>
        )}
      </div>
    </div>
  );
}


const CONF_CLASS: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  low: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

/**
 * HS classification cell — AI suggestion + manual override + reviewed toggle.
 * Informational only: it never blocks customs docs, publishing or anything else.
 */
function HsCell({
  item,
  images,
  loading,
  onGenerate,
  onPatch,
}: {
  item: Item;
  images: string[];
  loading: boolean;
  onGenerate: () => void;
  onPatch: (patch: Partial<Item>) => void;
}) {
  const canGenerate = !!(item.title && item.title.trim()) && images.length > 0;
  const conf = (item.hs_confidence || "").toLowerCase();
  const certUnknownOrTrue = item.hs_requires_certification !== false;

  return (
    <div className="min-w-[210px] space-y-1.5">
      <EditableCell
        value={item.hs_code}
        placeholder="HS code"
        className="font-mono"
        onSave={(v) => onPatch({ hs_code: v || null })}
      />

      {item.hs_code && (
        <div className="flex flex-wrap items-center gap-1">
          {conf && (
            <Badge variant="outline" className={CONF_CLASS[conf] ?? CONF_CLASS.low}>
              {conf}
            </Badge>
          )}
          {item.hs_confidence && certUnknownOrTrue && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px]">
                  {item.hs_requires_certification
                    ? "Certification appears to be required for this product."
                    : "Certification requirement unknown — check with the forwarder."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {conf === "low" && (
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
              Needs manual review
            </span>
          )}
        </div>
      )}

      {item.hs_notes && (
        <p className="text-xs leading-snug text-muted-foreground line-clamp-3" title={item.hs_notes}>
          {item.hs_notes}
        </p>
      )}

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={!canGenerate || loading}
                  onClick={onGenerate}
                >
                  {loading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  {item.hs_code ? "Regenerate" : "Generate HS Code"}
                </Button>
              </span>
            </TooltipTrigger>
            {!canGenerate && (
              <TooltipContent>Add a title and at least one image first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={!!item.hs_reviewed}
          onCheckedChange={(c) => onPatch({ hs_reviewed: !!c })}
        />
        Reviewed
      </label>
    </div>
  );
}

/** Text/number cell with autosave on blur. */

function EditableCell({
  value,
  onSave,
  type = "text",
  placeholder,
  className,
}: {
  value: string | number | null;
  onSave: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => setLocal(value ?? ""), [value]);
  return (
    <Input
      type={type}
      value={local as string | number}
      placeholder={placeholder}
      className={`h-9 text-sm ${className ?? ""}`}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const next = String(local ?? "");
        if (next !== String(value ?? "")) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10a0-\u10ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

/**
 * Copies a private wholesale image into the public product-images bucket so the
 * storefront can render it. Returns a public URL, or null when there is no image.
 */
async function copyImageToProductBucket(path: string | null, sku: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("wholesale-images").download(path);
  if (error || !data) throw new Error(error?.message || "Could not read wholesale image");
  const ext = path.split(".").pop() || "jpg";
  const target = `wholesale/${sku}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("product-images").upload(target, data, {
    upsert: true,
    contentType: data.type || `image/${ext}`,
  });
  if (up.error) throw new Error(up.error.message);
  return supabase.storage.from("product-images").getPublicUrl(target).data.publicUrl;
}

/** Labelled field wrapper for the item edit popup. */
function Field({
  label,
  hint,
  children,
  className,
  missing,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** Visual-only completeness flag — never blocks saving. */
  missing?: boolean;
}) {
  return (
    <div
      className={`space-y-1.5 ${
        missing ? "rounded-md border border-destructive/40 bg-destructive/5 p-2 -m-2" : ""
      } ${className ?? ""}`}
    >
      <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {missing && <AlertTriangle className="h-3 w-3 text-destructive" />}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}


/**
 * Full single-item editor. Every field autosaves through `onPatch`, exactly like
 * the inline grid cells did — the popup is only a nicer surface for the same data.
 */
function WholesaleItemModal({
  item,
  batches,
  groupItems,
  images,
  uploading,
  hsLoading,
  publishing,
  onClose,
  onPatch,
  onAssignBatch,
  onUpload,
  onSetPrimary,
  onRemoveImage,
  onGenerateHs,
  onPublish,
}: {
  item: Item;
  batches: Batch[];
  groupItems: Item[];
  images: string[];
  uploading: boolean;
  hsLoading: boolean;
  publishing: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<Item>) => void;
  onAssignBatch: (batchId: string | null) => void;
  onUpload: (files: File[]) => void;
  onSetPrimary: (path: string) => void;
  onRemoveImage: (path: string) => void;
  onGenerateHs: () => void;
  onPublish: () => void;
}) {
  const itemBatch = batches.find((b) => b.id === item.batch_id) ?? null;
  const miss = missingKeys(item);

  // Old Price auto-fills at 2x the selling price until the operator edits it directly.
  const [oldPriceManual, setOldPriceManual] = useState(item.old_price != null);
  const [fetching, setFetching] = useState(false);
  const [genDesc, setGenDesc] = useState(false);
  const [genRu, setGenRu] = useState(false);
  const [descLocal, setDescLocal] = useState(item.description ?? "");
  useEffect(() => {
    setOldPriceManual(item.old_price != null);
    setDescLocal(item.description ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const onSellingPriceSave = (v: string) => {
    const price = v === "" ? null : Number(v);
    const patch: Partial<Item> = { selling_price: price };
    if (!oldPriceManual) {
      patch.old_price =
        price != null && !Number.isNaN(price) && price > 0
          ? Math.round(price * 2 * 100) / 100
          : null;
    }
    onPatch(patch);
  };

  /** Same flow as the product form: slug parse → AI Georgian title, plus a
   *  best-effort live fetch for image/price. Never overwrites filled fields. */
  const handleFetchInfo = async () => {
    const url = (item.alibaba_link || "").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return toast.error("Add a valid Alibaba/source link first");

    const slugTitle = titleFromUrl(url);
    const titleWasEmpty = !(item.title || "").trim();
    let filled = 0;

    const aiTitlePromise = (async (): Promise<string | null> => {
      if (!slugTitle || !titleWasEmpty) return null;
      try {
        const { data, error } = await supabase.functions.invoke("generate-product-title", {
          body: { raw_title: slugTitle },
        });
        if (error || !data?.title) return null;
        return String(data.title).slice(0, 200);
      } catch {
        return null;
      }
    })();

    setFetching(true);
    let fetched = false;
    let fetchedTitle: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-product-info", { body: { url } });
      if (error) throw error;
      if (data?.ok) {
        fetched = true;
        if (data.title && !slugTitle) fetchedTitle = String(data.title).slice(0, 200);
        if (data.price && item.unit_price == null) {
          onPatch({ unit_price: Number(data.price) });
          filled++;
        }
      }
    } catch {
      /* slug result still stands */
    } finally {
      setFetching(false);
    }

    if (titleWasEmpty) {
      const finalTitle = (await aiTitlePromise) || slugTitle || fetchedTitle;
      if (finalTitle) {
        onPatch({ title: finalTitle });
        filled++;
      }
    }

    if (filled > 0) toast.success(`Filled ${filled} empty field${filled > 1 ? "s" : ""}`);
    else if (!fetched) toast.message("Couldn't auto-fetch details", { description: "Fill the title manually." });
    else toast.message("Nothing new to fill");
  };

  const handleGenerateDescription = async () => {
    if (!(item.title || item.alibaba_title || item.notes)) {
      return toast.error("Add a title or notes first");
    }
    setGenDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-product-description", {
        body: {
          title: (item.title || item.alibaba_title || "").trim(),
          features: (item.notes || "").trim(),
          existing_description: descLocal.trim(),
          source_url: (item.alibaba_link || "").trim(),
          price: item.selling_price ?? null,
        },
      });
      if (error) throw error;
      if (data?.error || !data?.description) throw new Error(data?.error || "No description returned");
      const text = String(data.description);
      setDescLocal(text);
      onPatch({ description: text });
      toast.success("Description generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenDesc(false);
    }
  };

  const handleGenerateRu = async () => {
    if (!(item.title || item.alibaba_title)) return toast.error("Add a title first");
    setGenRu(true);
    try {
      const ru = await generateTitleRu(item);
      onPatch({ title_ru: ru });
      toast.success("Russian name generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setGenRu(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>

      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{item.title || "Untitled item"}</span>
            <Badge variant="outline" className={warehouseClass(item.warehouse)}>
              Warehouse {item.warehouse}
            </Badge>
            <Badge
              variant="outline"
              className={
                item.listing_status === "published"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted text-muted-foreground"
              }
            >
              {item.listing_status === "published" ? "Published" : "Not Listed"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Field label="SKU (click to copy supplier message)">
            <SkuCell item={item} groupItems={groupItems} onUngroup={() => onPatch({ supplier_group_id: null })} />
          </Field>

          <Field
            label="Images"
            missing={miss.has("images")}
            hint="Drag & drop into the dashed area or click it to browse. Star sets the primary image."
          >
            <ItemImages
              images={images}
              primary={item.image_url ?? images[0] ?? null}
              uploading={uploading}
              onUpload={onUpload}
              onSetPrimary={onSetPrimary}
              onRemove={onRemoveImage}
              className="max-w-full"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2" missing={miss.has("title")}>
              <EditableCell
                value={item.title}
                placeholder="Product title"
                onSave={(v) => onPatch({ title: v || null })}
              />
            </Field>
            <Field label="Alibaba title" missing={miss.has("alibaba_title")}>
              <EditableCell
                value={item.alibaba_title}
                placeholder="Seller's listing title"
                onSave={(v) => onPatch({ alibaba_title: v || null })}
              />
            </Field>
            <Field
              label="Alibaba link"
              missing={miss.has("alibaba_link")}
              hint="Used as the source link for Fetch Info."
            >
              <div className="flex items-center gap-1">
                <EditableCell
                  value={item.alibaba_link}
                  placeholder="https://…"
                  onSave={(v) => onPatch({ alibaba_link: v || null })}
                />
                {item.alibaba_link && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={item.alibaba_link} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="h-4 w-4" />
                      <span className="ml-1">Open</span>
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleFetchInfo} disabled={fetching}>
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  <span className="ml-1">Fetch Info</span>
                </Button>
              </div>
            </Field>

            <Field
              label="Alibaba Order ID"
              hint="Items sharing this order ID (same warehouse) are grouped automatically."
            >
              <EditableCell
                value={item.alibaba_order_id}
                placeholder="e.g. 1234567890123"
                onSave={(v) => onPatch({ alibaba_order_id: v || null })}
              />
            </Field>
          </div>


          <Field
            label="Russian name (customs)"
            missing={miss.has("title_ru")}
            hint="Plain descriptive name used on the packing list. Auto-generated on export if left empty."
          >
            <div className="flex items-center gap-2">
              <EditableCell
                value={item.title_ru}
                placeholder="Наименование товара"
                onSave={(v) => onPatch({ title_ru: v || null })}
              />
              <Button size="sm" variant="outline" onClick={handleGenerateRu} disabled={genRu}>
                {genRu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1 whitespace-nowrap">{item.title_ru ? "Regenerate" : "Generate"}</span>
              </Button>
            </div>
          </Field>

          <Field label="Notes / key features">
            <EditableCell value={item.notes} placeholder="Notes" onSave={(v) => onPatch({ notes: v || null })} />
          </Field>

          <Field label="Description (storefront)" missing={miss.has("description")}>
            <div className="space-y-2">
              <Textarea
                value={descLocal}
                placeholder="Georgian product description"
                rows={6}
                onChange={(e) => setDescLocal(e.target.value)}
                onBlur={() => {
                  if (descLocal !== (item.description ?? "")) onPatch({ description: descLocal || null });
                }}
              />
              <Button size="sm" variant="outline" onClick={handleGenerateDescription} disabled={genDesc}>
                {genDesc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1">{item.description ? "Regenerate description" : "Generate description"}</span>
              </Button>
            </div>
          </Field>


          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" missing={miss.has("quantity")}>
              <EditableCell
                type="number"
                value={item.quantity}
                placeholder="1"
                onSave={(v) => onPatch({ quantity: v === "" ? null : Number(v) })}
              />
            </Field>
            <Field label="Cartons" missing={miss.has("carton_count")}>
              <EditableCell
                type="number"
                value={item.carton_count}
                placeholder="1"
                onSave={(v) => onPatch({ carton_count: v === "" ? null : Number(v) })}
              />
            </Field>
            <Field label="Weight (kg)" missing={miss.has("weight_kg")}>
              <EditableCell
                type="number"
                value={item.weight_kg}
                placeholder="0.0"
                onSave={(v) => onPatch({ weight_kg: v === "" ? null : Number(v) })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Unit price (USD)" missing={miss.has("unit_price")} hint={gelFromUsd(Number(item.unit_price) || 0)}>
              <EditableCell
                type="number"
                value={item.unit_price}
                placeholder="0.00"
                onSave={(v) => onPatch({ unit_price: v === "" ? null : Number(v) })}
              />
            </Field>
            <Field label="Selling price (₾)" missing={miss.has("selling_price")} hint="Used as the storefront price when publishing.">
              <EditableCell
                type="number"
                value={item.selling_price}
                placeholder="0.00"
                onSave={onSellingPriceSave}
              />
            </Field>
            <Field
              label="Old price (₾)"
              hint={oldPriceManual ? "Manually set — no longer auto-calculated." : "Auto-set to 2× the selling price."}
            >
              <EditableCell
                type="number"
                value={item.old_price}
                placeholder="0.00"
                onSave={(v) => {
                  setOldPriceManual(v !== "");
                  onPatch({ old_price: v === "" ? null : Number(v) });
                }}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Logistics stage"
              hint={
                itemBatch?.shipping_stage
                  ? "Managed at batch level — shipping stages follow the batch."
                  : undefined
              }
            >
              <Select
                value={item.logistics_stage}
                onValueChange={(v) => onPatch({ logistics_stage: v })}
                disabled={!!itemBatch?.shipping_stage}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>
                    <Badge variant="outline" className={stageMeta(item.logistics_stage).className}>
                      {stageMeta(item.logistics_stage).label}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STAGES.filter((s) => !SHIPPING_STAGES.includes(s.value)).map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Batch" hint="Moving an item into a shipped batch adopts that batch's stage.">
              <div className="flex items-center gap-2">
                <Select
                  value={item.batch_id ?? "UNASSIGNED"}
                  onValueChange={(v) => onAssignBatch(v === "UNASSIGNED" ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned (hanging)</SelectItem>
                    {batches
                      .filter((b) => b.warehouse === item.warehouse)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batch_number}
                          {b.is_completed ? " · Completed" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {item.batch_id && (
                  <Button size="sm" variant="outline" onClick={() => onAssignBatch(null)}>
                    Remove
                  </Button>
                )}
              </div>
            </Field>
          </div>


          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              HS classification
            </div>
            <HsCell
              item={item}
              images={images}
              loading={hsLoading}
              onGenerate={onGenerateHs}
              onPatch={onPatch}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onPublish} disabled={publishing}>
            {publishing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {item.storefront_product_id ? "Update storefront" : "Publish to storefront"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


const AdminWholesaleOrders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const warehouseParam = (searchParams.get("warehouse") ?? "ALL").toUpperCase();
  const warehouse: Warehouse | "ALL" =
    warehouseParam === "A" || warehouseParam === "B" ? (warehouseParam as Warehouse) : "ALL";

  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // One control drives both "which batch do new rows go into" and "which items are listed".
  // "" = nothing picked yet, "UNASSIGNED" = items detached from every batch.
  const [activeBatch, setActiveBatch] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("sku");

  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newBatchWarehouse, setNewBatchWarehouse] = useState<Warehouse>("A");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [bulkStage, setBulkStage] = useState<string>("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const [bulkPublishing, setBulkPublishing] = useState(false);

  const setWarehouse = (w: Warehouse | "ALL") => {
    const next = new URLSearchParams(searchParams);
    if (w === "ALL") next.delete("warehouse");
    else next.set("warehouse", w);
    setSearchParams(next, { replace: true });
    setActiveBatch("");
    setSelected(new Set());
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [b, i] = await Promise.all([
      supabase.from("wholesale_batches").select("*").order("created_at", { ascending: false }),
      supabase.from("wholesale_items").select("*").order("sku", { ascending: true }),
    ]);
    if (b.error) toast.error(b.error.message);
    if (i.error) toast.error(i.error.message);
    setBatches((b.data as Batch[]) ?? []);
    setItems((i.data as Item[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const warehouseBatches = useMemo(
    () => (warehouse === "ALL" ? batches : batches.filter((b) => b.warehouse === warehouse)),
    [batches, warehouse],
  );

  useEffect(() => {
    if (activeBatch && activeBatch !== "UNASSIGNED" && !warehouseBatches.some((b) => b.id === activeBatch)) {
      setActiveBatch("");
    }
  }, [warehouseBatches, activeBatch]);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === activeBatch) ?? null,
    [batches, activeBatch],
  );

  const visibleItems = useMemo(() => {
    if (!activeBatch) return [];
    let rows = items.filter((it) => (warehouse === "ALL" ? true : it.warehouse === warehouse));
    rows =
      activeBatch === "UNASSIGNED"
        ? rows.filter((it) => !it.batch_id)
        : rows.filter((it) => it.batch_id === activeBatch);
    if (stageFilter !== "ALL") rows = rows.filter((it) => it.logistics_stage === stageFilter);

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "stage":
          return a.logistics_stage.localeCompare(b.logistics_stage) || a.sku.localeCompare(b.sku);
        case "price":
          return (b.unit_price ?? 0) - (a.unit_price ?? 0);
        case "warehouse":
          return a.warehouse.localeCompare(b.warehouse) || a.sku.localeCompare(b.sku);
        default:
          return a.sku.localeCompare(b.sku);
      }
    });

    // Cluster same-supplier rows together (default view + explicit "group" sort).
    if (sortBy === "sku" || sortBy === "group") {
      const order: string[] = [];
      const buckets = new Map<string, Item[]>();
      for (const r of sorted) {
        const key = r.supplier_group_id ?? `solo:${r.id}`;
        if (!buckets.has(key)) {
          buckets.set(key, []);
          order.push(key);
        }
        buckets.get(key)!.push(r);
      }
      if (sortBy === "group") {
        order.sort((a, b) => {
          const ga = a.startsWith("solo:") ? 1 : 0;
          const gb = b.startsWith("solo:") ? 1 : 0;
          return ga - gb;
        });
      }
      return order.flatMap((k) => buckets.get(k)!);
    }
    return sorted;

  }, [items, warehouse, activeBatch, stageFilter, sortBy]);

  const lineValueUsd = (r: Item) => (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);

  const summary = useMemo(() => {
    const calc = (w: Warehouse) => {
      const rows = items.filter((i) => i.warehouse === w);
      return {
        count: rows.length,
        value: rows.reduce((sum, r) => sum + lineValueUsd(r), 0),
      };
    };
    return { A: calc("A"), B: calc("B") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /** Grand total across currently visible (filtered) rows. */
  const filteredTotal = useMemo(
    () => ({
      count: visibleItems.length,
      value: visibleItems.reduce((sum, r) => sum + lineValueUsd(r), 0),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleItems],
  );

  const batchNumber = (id: string | null) =>
    batches.find((b) => b.id === id)?.batch_number ?? "—";

  /** Auto-group items that share the same Alibaba Order ID (same warehouse). */
  const autoGroupByOrderId = async (item: Item, orderId: string) => {
    const key = orderId.trim();
    if (!key) return;
    const matches = items.filter(
      (r) =>
        r.id !== item.id &&
        r.warehouse === item.warehouse &&
        (r.alibaba_order_id || "").trim().toLowerCase() === key.toLowerCase(),
    );
    if (matches.length === 0) return;

    const existingGroup =
      matches.find((m) => m.supplier_group_id)?.supplier_group_id ||
      item.supplier_group_id ||
      crypto.randomUUID();

    const toUpdate = [item, ...matches].filter((r) => r.supplier_group_id !== existingGroup);
    if (toUpdate.length === 0) return;

    const ids = toUpdate.map((r) => r.id);
    setItems((rows) =>
      rows.map((r) => (ids.includes(r.id) ? { ...r, supplier_group_id: existingGroup } : r)),
    );
    const { error } = await supabase
      .from("wholesale_items")
      .update({ supplier_group_id: existingGroup })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(
      `Grouped with ${matches.length} other item${matches.length === 1 ? "" : "s"} sharing this order ID`,
    );
  };

  const patchItem = async (id: string, patch: Partial<Item>) => {
    const prev = items;
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("wholesale_items").update(patch).eq("id", id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
      return;
    }
    if (typeof patch.alibaba_order_id === "string" && patch.alibaba_order_id.trim()) {
      const target = prev.find((r) => r.id === id);
      if (target) await autoGroupByOrderId({ ...target, ...patch }, patch.alibaba_order_id);
    }
  };


  const suggestedBatchNumber = () => {
    const year = new Date().getFullYear();
    const prefix = `B${year}-`;
    const max = batches
      .filter((b) => b.batch_number.startsWith(prefix))
      .map((b) => parseInt(b.batch_number.slice(prefix.length), 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  const openNewBatch = () => {
    setNewBatchNumber(suggestedBatchNumber());
    setNewBatchWarehouse(warehouse === "B" ? "B" : "A");
    setNewBatchOpen(true);
  };

  const createBatch = async () => {
    const num = newBatchNumber.trim();
    if (!num) return toast.error("Batch number is required");
    setCreatingBatch(true);
    const { data, error } = await supabase
      .from("wholesale_batches")
      .insert({ batch_number: num, warehouse: newBatchWarehouse })
      .select()
      .single();
    setCreatingBatch(false);
    if (error) return toast.error(error.message);
    setBatches((b) => [data as Batch, ...b]);
    setActiveBatch((data as Batch).id);
    setNewBatchOpen(false);
    toast.success(`Batch ${num} created (Warehouse ${newBatchWarehouse})`);
  };

  const addRow = async () => {
    if (!activeBatch || activeBatch === "UNASSIGNED")
      return toast.error("Create or select a batch first");
    setAddingRow(true);
    const { data, error } = await supabase.rpc("create_wholesale_item", { p_batch_id: activeBatch });
    setAddingRow(false);
    if (error) return toast.error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as Item;
    setItems((rows) => [...rows, row]);
    toast.success(`Row added — ${row.sku}`);
  };

  /** Detach an item, or move it into another batch — adopting that batch's shipping stage. */
  const assignBatch = async (item: Item, batchId: string | null) => {
    const target = batchId ? batches.find((b) => b.id === batchId) ?? null : null;
    const patch: Partial<Item> = { batch_id: batchId };
    if (target?.shipping_stage) patch.logistics_stage = target.shipping_stage;
    await patchItem(item.id, patch);
    toast.success(batchId ? `Moved to ${target?.batch_number ?? "batch"}` : "Removed from batch");
  };

  const toggleBatchCompleted = async () => {
    if (!selectedBatch) return;
    const next = !selectedBatch.is_completed;
    const prev = batches;
    setBatches((bs) => bs.map((b) => (b.id === selectedBatch.id ? { ...b, is_completed: next } : b)));
    const { error } = await supabase
      .from("wholesale_batches")
      .update({ is_completed: next })
      .eq("id", selectedBatch.id);
    if (error) {
      setBatches(prev);
      return toast.error(error.message);
    }
    toast.success(next ? "Batch marked completed" : "Batch reopened");
  };

  /** Batch-level shipping stage — cascades to every item still in the batch. */
  const setBatchShippingStage = async (stage: string | null) => {
    if (!selectedBatch) return;
    const batchId = selectedBatch.id;
    const prevBatches = batches;
    const prevItems = items;
    setBatches((bs) => bs.map((b) => (b.id === batchId ? { ...b, shipping_stage: stage } : b)));
    if (stage) {
      setItems((rows) => rows.map((r) => (r.batch_id === batchId ? { ...r, logistics_stage: stage } : r)));
    }
    const { error } = await supabase
      .from("wholesale_batches")
      .update({ shipping_stage: stage })
      .eq("id", batchId);
    if (error) {
      setBatches(prevBatches);
      setItems(prevItems);
      return toast.error(error.message);
    }
    if (stage) {
      const { error: e2 } = await supabase
        .from("wholesale_items")
        .update({ logistics_stage: stage })
        .eq("batch_id", batchId);
      if (e2) {
        setItems(prevItems);
        return toast.error(e2.message);
      }
      toast.success(`Batch moved to ${stageMeta(stage).label}`);
    } else {
      toast.success("Batch shipping stage cleared — items are editable again");
    }
  };


  const imgList = (it: Item): string[] =>
    Array.isArray(it.images) && it.images.length
      ? it.images
      : it.image_url
        ? [it.image_url]
        : [];

  const uploadImages = async (item: Item, files: File[]) => {
    setUploadingId(item.id);
    const uploaded: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${item.warehouse}/${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from("wholesale-images").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) toast.error(error.message);
      else uploaded.push(path);
    }
    setUploadingId(null);
    if (!uploaded.length) return;
    const next = [...imgList(item), ...uploaded];
    await patchItem(item.id, { images: next, image_url: item.image_url || next[0] });
  };

  const setPrimaryImage = async (item: Item, path: string) => {
    const next = [path, ...imgList(item).filter((p) => p !== path)];
    await patchItem(item.id, { images: next, image_url: path });
  };

  const removeImage = async (item: Item, path: string) => {
    const next = imgList(item).filter((p) => p !== path);
    await patchItem(item.id, {
      images: next,
      image_url: item.image_url === path ? next[0] ?? null : item.image_url,
    });
    supabase.storage.from("wholesale-images").remove([path]).catch(() => {});
  };

  const [hsLoadingId, setHsLoadingId] = useState<string | null>(null);

  const generateHs = async (item: Item) => {
    setHsLoadingId(item.id);
    const { data, error } = await supabase.functions.invoke("suggest-hs-code", {
      body: { item_id: item.id },
    });
    setHsLoadingId(null);
    if (error) {
      const msg = (data as { error?: string } | null)?.error || error.message;
      return toast.error(msg || "Could not suggest an HS code");
    }
    const res = data as {
      hs_code: string;
      hs_confidence: string;
      hs_requires_certification: boolean | null;
      hs_notes: string | null;
      used_image?: boolean;
    };
    setItems((rows) =>
      rows.map((r) =>
        r.id === item.id
          ? {
              ...r,
              hs_code: res.hs_code,
              hs_confidence: res.hs_confidence,
              hs_requires_certification: res.hs_requires_certification,
              hs_notes: res.hs_notes,
              hs_reviewed: false,
            }
          : r,
      ),
    );
    toast.success(
      res.hs_confidence === "low"
        ? `Suggested ${res.hs_code} — low confidence, needs manual review`
        : `Suggested ${res.hs_code}`,
    );
  };


  /** Idempotent upsert of one wholesale item into the storefront products table. */
  const publishItem = async (item: Item): Promise<string> => {
    const price = Number(item.selling_price);
    if (!item.title?.trim()) throw new Error(`${item.sku}: title is required`);
    if (!item.selling_price || Number.isNaN(price) || price <= 0)
      throw new Error(`${item.sku}: selling price is required`);

    const imageUrl = await copyImageToProductBucket(item.image_url, item.sku);
    const productId = item.storefront_product_id || `wholesale-${item.id}`;

    const payload: Record<string, unknown> = {
      id: productId,
      title: item.title.trim(),
      handle: `${slugify(item.title)}-${item.sku.toLowerCase()}`,
      sku: item.sku,
      price,
      compare_at_price:
        item.old_price != null && Number(item.old_price) > 0 ? Number(item.old_price) : null,

      warehouse: item.warehouse,
      // draft by default: hidden from the live storefront until reviewed
      available: false,
      is_verified: false,
      synced_at: new Date().toISOString(),
    };
    if (imageUrl) {
      payload.image = imageUrl;
      payload.images = [imageUrl];
    }

    const { error } = await supabase
      .from("products")
      .upsert([payload] as never, { onConflict: "id" });
    if (error) throw new Error(error.message);

    const link = await supabase
      .from("wholesale_items")
      .update({ storefront_product_id: productId, listing_status: "published" })
      .eq("id", item.id);
    if (link.error) throw new Error(link.error.message);

    return productId;
  };

  const handlePublish = async (item: Item) => {
    setPublishingId(item.id);
    try {
      const productId = await publishItem(item);
      setItems((rows) =>
        rows.map((r) =>
          r.id === item.id ? { ...r, storefront_product_id: productId, listing_status: "published" } : r,
        ),
      );
      toast.success(`${item.sku} published as draft product`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishingId(null);
    }
  };

  const handleBulkPublish = async () => {
    const rows = visibleItems.filter((i) => selected.has(i.id));
    if (rows.length === 0) return;
    setBulkPublishing(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of rows) {
      try {
        const productId = await publishItem(row);
        ok += 1;
        setItems((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, storefront_product_id: productId, listing_status: "published" } : r,
          ),
        );
      } catch (e) {
        failures.push(e instanceof Error ? e.message : `${row.sku}: failed`);
      }
    }
    setBulkPublishing(false);
    if (ok > 0) toast.success(`${ok} item(s) published as drafts`);
    if (failures.length > 0) toast.error(`${failures.length} failed`, { description: failures.slice(0, 3).join(" · ") });
  };

  const applyBulkStage = async () => {
    if (!bulkStage || selected.size === 0) return;
    const ids = [...selected];
    const prev = items;
    setItems((rows) => rows.map((r) => (selected.has(r.id) ? { ...r, logistics_stage: bulkStage } : r)));
    const { error } = await supabase
      .from("wholesale_items")
      .update({ logistics_stage: bulkStage })
      .in("id", ids);
    if (error) {
      setItems(prev);
      return toast.error(error.message);
    }
    toast.success(`${ids.length} item(s) moved to ${stageMeta(bulkStage).label}`);
    setSelected(new Set());
    setBulkStage("");
  };

  const markSameSupplier = async () => {
    if (selected.size < 2) return;
    const ids = [...selected];
    const groupId = crypto.randomUUID();
    const prev = items;
    setItems((rows) => rows.map((r) => (selected.has(r.id) ? { ...r, supplier_group_id: groupId } : r)));
    const { error } = await supabase
      .from("wholesale_items")
      .update({ supplier_group_id: groupId })
      .in("id", ids);
    if (error) {
      setItems(prev);
      return toast.error(error.message);
    }
    toast.success(`${ids.length} item(s) grouped as same supplier`);
    setSelected(new Set());
  };

  const editItem = editId ? items.find((i) => i.id === editId) ?? null : null;

  const allChecked = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Package className="h-6 w-6" /> Wholesale CRM
          </h1>
          <p className="text-sm text-muted-foreground">Sourcing orders, batches and logistics stages.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(["A", "B", "ALL"] as const).map((w) => (
            <Button
              key={w}
              size="sm"
              variant={warehouse === w ? "default" : "ghost"}
              onClick={() => setWarehouse(w)}
            >
              {w === "ALL" ? "All" : `Warehouse ${w}`}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary strip — values are USD (hero) with GEL conversion beneath. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["A", "B"] as const).map((w) => (
          <div key={w} className={`rounded-xl border p-4 ${warehouseClass(w)}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Warehouse {w}</div>
            <div className="mt-1 text-sm text-foreground/80">{summary[w].count} items</div>
            <DualPrice amountUsd={summary[w].value} size="lg" />
          </div>
        ))}
        <div className="rounded-xl border border-border p-4 bg-muted/30">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total (filtered)
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{filteredTotal.count} items</div>
          <DualPrice amountUsd={filteredTotal.value} size="lg" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openNewBatch} variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Batch
        </Button>

        {/* One selector: it picks the batch new rows go into AND filters the list below. */}
        <Select value={activeBatch} onValueChange={(v) => { setActiveBatch(v); setSelected(new Set()); }}>
          <SelectTrigger className="h-9 w-[240px]">
            <SelectValue placeholder="Select a batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UNASSIGNED">Unassigned (hanging items)</SelectItem>
            {warehouseBatches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.warehouse} · {b.batch_number}
                {b.is_completed ? " · ✅ Completed" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={addRow}
          size="sm"
          disabled={addingRow || !activeBatch || activeBatch === "UNASSIGNED"}
        >
          {addingRow ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Add Row
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />


        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sku">Sort: SKU (grouped)</SelectItem>
            <SelectItem value="group">Sort: Supplier group</SelectItem>

            <SelectItem value="created">Sort: Newest</SelectItem>
            <SelectItem value="stage">Sort: Stage</SelectItem>
            <SelectItem value="price">Sort: Price</SelectItem>
            <SelectItem value="warehouse">Sort: Warehouse</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Select value={bulkStage} onValueChange={setBulkStage}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Set stage…" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={applyBulkStage} disabled={!bulkStage}>
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={markSameSupplier} disabled={selected.size < 2}>
              <Link2 className="h-4 w-4 mr-1" />
              Mark as Same Supplier
            </Button>
            <Button size="sm" variant="secondary" onClick={handleBulkPublish} disabled={bulkPublishing}>
              {bulkPublishing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Publish
            </Button>
          </div>
        )}
      </div>

      {/* Batch header — completion badge and the shared shipping stage for the whole batch. */}
      {selectedBatch && (
        <div className="rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">{selectedBatch.batch_number}</span>
            <Badge variant="outline" className={warehouseClass(selectedBatch.warehouse)}>
              Warehouse {selectedBatch.warehouse}
            </Badge>
            {selectedBatch.is_completed && (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Completed
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Batch stage</span>
            {SHIPPING_STAGES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={selectedBatch.shipping_stage === s ? "default" : "outline"}
                onClick={() => setBatchShippingStage(selectedBatch.shipping_stage === s ? null : s)}
              >
                {stageMeta(s).label}
              </Button>
            ))}
            <div className="mx-1 h-6 w-px bg-border" />
            <Button size="sm" variant="secondary" onClick={toggleBatchCompleted}>
              {selectedBatch.is_completed ? "Reopen batch" : "Mark as completed"}
            </Button>
          </div>
        </div>
      )}

      {!activeBatch ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Select or create a batch to see its items.
        </div>
      ) : (
      <>
      {/* Grid */}

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full min-w-[1990px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(c) =>
                    setSelected(c ? new Set(visibleItems.map((i) => i.id)) : new Set())
                  }
                />
              </th>
              <th className="px-4 py-3 text-left w-20">Image</th>
              <th className="px-4 py-3 text-left w-36">SKU</th>
              <th className="px-4 py-3 text-left w-20">WH</th>
              <th className="px-4 py-3 text-left w-40">Batch</th>
              <th className="px-4 py-3 text-left min-w-[200px]">Title</th>
              <th className="px-4 py-3 text-left min-w-[180px]">Alibaba link</th>
              <th className="px-4 py-3 text-left min-w-[180px]">Alibaba title</th>
              <th className="px-4 py-3 text-left min-w-[130px]">Unit Price (USD)</th>
              <th className="px-4 py-3 text-left min-w-[120px]">Selling price</th>
              <th className="px-4 py-3 text-left min-w-[110px]">Weight kg</th>
              <th className="px-4 py-3 text-left min-w-[110px]">Quantity</th>
              <th className="px-4 py-3 text-left min-w-[110px]">Cartons</th>
              <th className="px-4 py-3 text-left min-w-[120px]">Line Total</th>
              <th className="px-4 py-3 text-left w-44">Stage</th>
              <th className="px-4 py-3 text-left min-w-[180px]">Notes</th>
              <th className="px-4 py-3 text-left min-w-[220px]">HS Code</th>
              <th className="px-4 py-3 text-left w-32">Listing</th>
              <th className="px-4 py-3 text-left w-32">Storefront</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={19} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={19} className="p-8 text-center text-muted-foreground">
                  No items yet. Create a batch and add rows.
                </td>
              </tr>
            ) : (
              visibleItems.map((it) => (
                <tr
                  key={it.id}
                  className={`border-t border-border align-middle ${
                    it.supplier_group_id ? groupRowTint(it.supplier_group_id) : ""
                  }`}
                >

                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.has(it.id)}
                      onCheckedChange={(c) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (c) next.add(it.id);
                          else next.delete(it.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <GridImageCell
                      images={imgList(it)}
                      primary={it.image_url ?? imgList(it)[0] ?? null}
                      uploading={uploadingId === it.id}
                      onUpload={(files) => uploadImages(it, files)}
                      onOpen={() => setEditId(it.id)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-xs"
                      onClick={() => setEditId(it.id)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </td>


                  <td className="px-4 py-3">
                    <SkuCell
                      item={it}
                      groupItems={
                        it.supplier_group_id
                          ? items.filter((x) => x.supplier_group_id === it.supplier_group_id)
                          : [it]
                      }
                      onUngroup={() => patchItem(it.id, { supplier_group_id: null })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={warehouseClass(it.warehouse)}>
                      {it.warehouse}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Select
                        value={it.batch_id ?? "UNASSIGNED"}
                        onValueChange={(v) => assignBatch(it, v === "UNASSIGNED" ? null : v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={batchNumber(it.batch_id)} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                          {batches
                            .filter((b) => b.warehouse === it.warehouse)
                            .map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batch_number}
                                {b.is_completed ? " · Completed" : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {it.batch_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          title="Remove from batch"
                          onClick={() => assignBatch(it, null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <EditableCell
                      value={it.title}
                      placeholder="Product title"
                      className="min-w-[180px]"
                      onSave={(v) => patchItem(it.id, { title: v || null })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <EditableCell
                        value={it.alibaba_link}
                        placeholder="https://…"
                        className="min-w-[160px]"
                        onSave={(v) => patchItem(it.id, { alibaba_link: v || null })}
                      />
                      {it.alibaba_link && (
                        <a href={it.alibaba_link} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={it.alibaba_title}
                      placeholder="Seller's listing title"
                      className="min-w-[160px]"
                      onSave={(v) => patchItem(it.id, { alibaba_title: v || null })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      type="number"
                      value={it.unit_price}
                      placeholder="0.00"
                      className="min-w-[90px]"
                      onSave={(v) => patchItem(it.id, { unit_price: v === "" ? null : Number(v) })}
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {gelFromUsd(Number(it.unit_price) || 0)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      type="number"
                      value={it.selling_price}
                      placeholder="0.00"
                      className="min-w-[90px]"
                      onSave={(v) => patchItem(it.id, { selling_price: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      type="number"
                      value={it.weight_kg}
                      placeholder="0.0"
                      className="min-w-[90px]"
                      onSave={(v) => patchItem(it.id, { weight_kg: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      type="number"
                      value={it.quantity}
                      placeholder="1"
                      className="min-w-[90px]"
                      onSave={(v) => patchItem(it.id, { quantity: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      type="number"
                      value={it.carton_count}
                      placeholder="1"
                      className="min-w-[90px]"
                      onSave={(v) => patchItem(it.id, { carton_count: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <DualPrice amountUsd={lineValueUsd(it)} />
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={it.logistics_stage}
                      onValueChange={(v) => patchItem(it.id, { logistics_stage: v })}
                      disabled={!!batches.find((b) => b.id === it.batch_id)?.shipping_stage}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          <Badge variant="outline" className={stageMeta(it.logistics_stage).className}>
                            {stageMeta(it.logistics_stage).label}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.filter((s) => !SHIPPING_STAGES.includes(s.value)).map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="px-4 py-3">
                    <EditableCell
                      value={it.notes}
                      placeholder="Notes"
                      onSave={(v) => patchItem(it.id, { notes: v || null })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <HsCell
                      item={it}
                      images={imgList(it)}
                      loading={hsLoadingId === it.id}
                      onGenerate={() => generateHs(it)}
                      onPatch={(patch) => patchItem(it.id, patch)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        it.listing_status === "published"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {it.listing_status === "published" ? "Published" : "Not Listed"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={it.storefront_product_id ? "outline" : "secondary"}
                      onClick={() => handlePublish(it)}
                      disabled={publishingId === it.id}
                    >
                      {publishingId === it.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {it.storefront_product_id ? "Update" : "Publish"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}



      {editItem && (
        <WholesaleItemModal
          item={editItem}
          batches={batches}
          groupItems={
            editItem.supplier_group_id
              ? items.filter((x) => x.supplier_group_id === editItem.supplier_group_id)
              : [editItem]
          }
          images={imgList(editItem)}
          uploading={uploadingId === editItem.id}
          hsLoading={hsLoadingId === editItem.id}
          publishing={publishingId === editItem.id}
          onClose={() => setEditId(null)}
          onPatch={(patch) => patchItem(editItem.id, patch)}
          onAssignBatch={(batchId) => assignBatch(editItem, batchId)}
          onUpload={(files) => uploadImages(editItem, files)}
          onSetPrimary={(p) => setPrimaryImage(editItem, p)}
          onRemoveImage={(p) => removeImage(editItem, p)}
          onGenerateHs={() => generateHs(editItem)}
          onPublish={() => handlePublish(editItem)}
        />
      )}

      <Dialog open={newBatchOpen} onOpenChange={setNewBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Batch number</label>
              <Input value={newBatchNumber} onChange={(e) => setNewBatchNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Warehouse (locked after creation)</label>
              <Select value={newBatchWarehouse} onValueChange={(v) => setNewBatchWarehouse(v as Warehouse)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Warehouse A</SelectItem>
                  <SelectItem value="B">Warehouse B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              SKUs will be generated as {newBatchWarehouse}-{newBatchNumber || "BATCH"}-001
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewBatchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createBatch} disabled={creatingBatch}>
              {creatingBatch && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWholesaleOrders;
