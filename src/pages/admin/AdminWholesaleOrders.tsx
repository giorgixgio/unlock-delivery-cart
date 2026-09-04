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
import { Plus, ImagePlus, Loader2, ExternalLink, Package } from "lucide-react";

type Warehouse = "A" | "B";

type Batch = {
  id: string;
  batch_number: string;
  warehouse: Warehouse;
  created_at: string;
};

type Item = {
  id: string;
  batch_id: string | null;
  warehouse: Warehouse;
  sku: string;
  title: string | null;
  image_url: string | null;
  alibaba_link: string | null;
  unit_price: number | null;
  weight_kg: number | null;
  notes: string | null;
  logistics_stage: string;
  listing_status: string;
  storefront_product_id: string | null;
  created_at: string;
  updated_at: string;
};

const STAGES = [
  { value: "ordered", label: "Ordered", className: "bg-muted text-muted-foreground" },
  { value: "at_freight_forwarder", label: "At Forwarder", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "in_transit", label: "In Transit", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "arrived", label: "Arrived", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { value: "cleared_customs", label: "Cleared Customs", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
];

const stageMeta = (v: string) => STAGES.find((s) => s.value === v) ?? STAGES[0];

const warehouseClass = (w: Warehouse) =>
  w === "A"
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
    : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";

const gel = (n: number) =>
  `₾${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Signed-URL cache for the private wholesale-images bucket. */
const signedCache = new Map<string, string>();

function ItemImage({
  path,
  onUpload,
  uploading,
}: {
  path: string | null;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const [url, setUrl] = useState<string | null>(path ? signedCache.get(path) ?? null : null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onUpload(f);
      }}
      onClick={() => inputRef.current?.click()}
      className="h-14 w-14 shrink-0 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/60 transition-colors"
      title="Click or drag an image here"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : url ? (
        <img src={url} alt="Wholesale item" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <ImagePlus className="h-4 w-4 text-muted-foreground" />
      )}
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

  const [batchFilter, setBatchFilter] = useState<string>("ALL");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("sku");

  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newBatchWarehouse, setNewBatchWarehouse] = useState<Warehouse>("A");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [addBatchId, setAddBatchId] = useState<string>("");
  const [addingRow, setAddingRow] = useState(false);
  const [bulkStage, setBulkStage] = useState<string>("");

  const setWarehouse = (w: Warehouse | "ALL") => {
    const next = new URLSearchParams(searchParams);
    if (w === "ALL") next.delete("warehouse");
    else next.set("warehouse", w);
    setSearchParams(next, { replace: true });
    setBatchFilter("ALL");
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
    if (!addBatchId || !warehouseBatches.some((b) => b.id === addBatchId)) {
      setAddBatchId(warehouseBatches[0]?.id ?? "");
    }
  }, [warehouseBatches, addBatchId]);

  const visibleItems = useMemo(() => {
    let rows = items.filter((it) => (warehouse === "ALL" ? true : it.warehouse === warehouse));
    if (batchFilter !== "ALL") rows = rows.filter((it) => it.batch_id === batchFilter);
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
    return sorted;
  }, [items, warehouse, batchFilter, stageFilter, sortBy]);

  const summary = useMemo(() => {
    const calc = (w: Warehouse) => {
      const rows = items.filter((i) => i.warehouse === w);
      return {
        count: rows.length,
        value: rows.reduce((sum, r) => sum + (Number(r.unit_price) || 0), 0),
      };
    };
    return { A: calc("A"), B: calc("B") };
  }, [items]);

  const batchNumber = (id: string | null) =>
    batches.find((b) => b.id === id)?.batch_number ?? "—";

  const patchItem = async (id: string, patch: Partial<Item>) => {
    const prev = items;
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("wholesale_items").update(patch).eq("id", id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
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
    setAddBatchId((data as Batch).id);
    setNewBatchOpen(false);
    toast.success(`Batch ${num} created (Warehouse ${newBatchWarehouse})`);
  };

  const addRow = async () => {
    if (!addBatchId) return toast.error("Create or select a batch first");
    setAddingRow(true);
    const { data, error } = await supabase.rpc("create_wholesale_item", { p_batch_id: addBatchId });
    setAddingRow(false);
    if (error) return toast.error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as Item;
    setItems((rows) => [...rows, row]);
    toast.success(`Row added — ${row.sku}`);
  };

  const uploadImage = async (item: Item, file: File) => {
    setUploadingId(item.id);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${item.warehouse}/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("wholesale-images").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    setUploadingId(null);
    if (error) return toast.error(error.message);
    await patchItem(item.id, { image_url: path });
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

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["A", "B"] as const).map((w) => (
          <div key={w} className={`rounded-xl border p-4 ${warehouseClass(w)}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Warehouse {w}</div>
            <div className="mt-1 text-lg font-bold text-foreground">
              {summary[w].count} items · {gel(summary[w].value)}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border p-4 bg-muted/30">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="mt-1 text-lg font-bold">
            {summary.A.count + summary.B.count} items · {gel(summary.A.value + summary.B.value)}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openNewBatch} variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Batch
        </Button>

        <Select value={addBatchId} onValueChange={setAddBatchId}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="Select batch" />
          </SelectTrigger>
          <SelectContent>
            {warehouseBatches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.warehouse} · {b.batch_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={addRow} size="sm" disabled={addingRow || !addBatchId}>
          {addingRow ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Add Row
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        <Select value={batchFilter} onValueChange={setBatchFilter}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All batches</SelectItem>
            {warehouseBatches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.warehouse} · {b.batch_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            <SelectItem value="sku">Sort: SKU</SelectItem>
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
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(c) =>
                    setSelected(c ? new Set(visibleItems.map((i) => i.id)) : new Set())
                  }
                />
              </th>
              <th className="p-3 text-left w-20">Image</th>
              <th className="p-3 text-left w-36">SKU</th>
              <th className="p-3 text-left w-20">WH</th>
              <th className="p-3 text-left w-40">Batch</th>
              <th className="p-3 text-left min-w-[200px]">Title</th>
              <th className="p-3 text-left min-w-[180px]">Alibaba link</th>
              <th className="p-3 text-left w-28">Unit price</th>
              <th className="p-3 text-left w-24">Weight kg</th>
              <th className="p-3 text-left w-44">Stage</th>
              <th className="p-3 text-left min-w-[180px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  No items yet. Create a batch and add rows.
                </td>
              </tr>
            ) : (
              visibleItems.map((it) => (
                <tr key={it.id} className="border-t border-border align-middle">
                  <td className="p-3">
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
                  <td className="p-3">
                    <ItemImage
                      path={it.image_url}
                      uploading={uploadingId === it.id}
                      onUpload={(f) => uploadImage(it, f)}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs font-semibold">{it.sku}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={warehouseClass(it.warehouse)}>
                      {it.warehouse}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Select
                      value={it.batch_id ?? ""}
                      onValueChange={(v) => patchItem(it.id, { batch_id: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={batchNumber(it.batch_id)} />
                      </SelectTrigger>
                      <SelectContent>
                        {batches
                          .filter((b) => b.warehouse === it.warehouse)
                          .map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.batch_number}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <EditableCell
                      value={it.title}
                      placeholder="Product title"
                      onSave={(v) => patchItem(it.id, { title: v || null })}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <EditableCell
                        value={it.alibaba_link}
                        placeholder="https://…"
                        onSave={(v) => patchItem(it.id, { alibaba_link: v || null })}
                      />
                      {it.alibaba_link && (
                        <a href={it.alibaba_link} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <EditableCell
                      type="number"
                      value={it.unit_price}
                      placeholder="0.00"
                      onSave={(v) => patchItem(it.id, { unit_price: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="p-3">
                    <EditableCell
                      type="number"
                      value={it.weight_kg}
                      placeholder="0.0"
                      onSave={(v) => patchItem(it.id, { weight_kg: v === "" ? null : Number(v) })}
                    />
                  </td>
                  <td className="p-3">
                    <Select
                      value={it.logistics_stage}
                      onValueChange={(v) => patchItem(it.id, { logistics_stage: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          <Badge variant="outline" className={stageMeta(it.logistics_stage).className}>
                            {stageMeta(it.logistics_stage).label}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <EditableCell
                      value={it.notes}
                      placeholder="Notes"
                      onSave={(v) => patchItem(it.id, { notes: v || null })}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
