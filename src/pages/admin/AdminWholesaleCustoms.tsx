import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  Stamp as StampIcon,
  ClipboardList,
} from "lucide-react";
import {
  buildWholesaleInvoice,
  buildWholesalePackingList,
  type DocItem,
} from "@/lib/wholesaleDocsPdf";

type Warehouse = "A" | "B";

type Batch = { id: string; batch_number: string; warehouse: Warehouse; created_at: string };

type Item = DocItem & { id: string };

type Doc = {
  id: string;
  batch_id: string | null;
  warehouse: Warehouse;
  doc_type: string;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
};

const DOC_TYPES: Record<string, { label: string; className: string }> = {
  invoice: { label: "Invoice", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  packing_list: { label: "Packing list", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  logistics_invoice: { label: "Logistics invoice", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  shipping_receipt: { label: "Shipping receipt", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
};

const warehouseClass = (w: Warehouse) =>
  w === "A"
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
    : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";

const stampPath = (w: Warehouse) => `stamps/warehouse-${w}.png`;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export default function AdminWholesaleCustoms() {
  const [params, setParams] = useSearchParams();
  const warehouse = (params.get("wh") as Warehouse | "all") ?? "all";
  const batchId = params.get("batch") ?? "";

  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [stamps, setStamps] = useState<Record<Warehouse, string | null>>({ A: null, B: null });
  const stampInputA = useRef<HTMLInputElement>(null);
  const stampInputB = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState("logistics_invoice");
  const [dragOver, setDragOver] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    if (key === "wh") next.delete("batch");
    setParams(next, { replace: true });
  };

  const batch = useMemo(() => batches.find((b) => b.id === batchId) ?? null, [batches, batchId]);
  const visibleBatches = useMemo(
    () => (warehouse === "all" ? batches : batches.filter((b) => b.warehouse === warehouse)),
    [batches, warehouse],
  );

  /* ── data ── */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("wholesale_batches")
        .select("id,batch_number,warehouse,created_at")
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      setBatches((data ?? []) as Batch[]);
      setLoading(false);
    })();
  }, []);

  const loadBatchData = useCallback(async (id: string) => {
    if (!id) {
      setItems([]);
      setDocs([]);
      return;
    }
    const [{ data: it, error: e1 }, { data: dc, error: e2 }] = await Promise.all([
      supabase
        .from("wholesale_items")
        .select("id,sku,title,quantity,unit_price,weight_kg,carton_count")
        .eq("batch_id", id)
        .order("sku"),
      supabase
        .from("wholesale_documents")
        .select("id,batch_id,warehouse,doc_type,file_name,file_url,created_at")
        .eq("batch_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setItems((it ?? []) as Item[]);
    setDocs((dc ?? []) as Doc[]);
  }, []);

  useEffect(() => {
    loadBatchData(batchId);
  }, [batchId, loadBatchData]);

  /* ── stamps ── */
  const loadStamp = useCallback(async (w: Warehouse) => {
    const { data } = await supabase.storage
      .from("wholesale-documents")
      .createSignedUrl(stampPath(w), 60 * 60);
    setStamps((s) => ({ ...s, [w]: data?.signedUrl ?? null }));
  }, []);

  useEffect(() => {
    loadStamp("A");
    loadStamp("B");
  }, [loadStamp]);

  const uploadStamp = async (w: Warehouse, file: File) => {
    setBusy(`stamp-${w}`);
    const { error } = await supabase.storage
      .from("wholesale-documents")
      .upload(stampPath(w), file, { upsert: true, contentType: "image/png" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Warehouse ${w} stamp saved`);
    loadStamp(w);
  };

  const stampDataUrl = async (w: Warehouse): Promise<string | null> => {
    const { data, error } = await supabase.storage.from("wholesale-documents").download(stampPath(w));
    if (error || !data) return null;
    try {
      return await blobToDataUrl(data);
    } catch {
      return null;
    }
  };

  /* ── inline qty / carton edits ── */
  const patchItem = async (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("wholesale_items").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      loadBatchData(batchId);
    }
  };

  /* ── generate ── */
  const generate = async (kind: "invoice" | "packing_list") => {
    if (!batch) return;
    if (!items.length) return toast.error("This batch has no items");
    setBusy(kind);
    try {
      const stamp = kind === "invoice" ? await stampDataUrl(batch.warehouse) : null;
      const meta = {
        batchNumber: batch.batch_number,
        warehouse: batch.warehouse,
        stampDataUrl: stamp,
      };
      const pdf =
        kind === "invoice"
          ? await buildWholesaleInvoice(items, meta)
          : await buildWholesalePackingList(items, meta);

      const fileName = `${kind === "invoice" ? "invoice" : "packing-list"}-${batch.batch_number}-${Date.now()}.pdf`;
      const path = `${batch.id}/${fileName}`;
      const blob = pdf.output("blob");

      const { error: upErr } = await supabase.storage
        .from("wholesale-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: rowErr } = await supabase.from("wholesale_documents").insert({
        batch_id: batch.id,
        warehouse: batch.warehouse,
        doc_type: kind,
        file_name: fileName,
        file_url: path,
      });
      if (rowErr) throw rowErr;

      pdf.save(fileName);
      toast.success(kind === "invoice" ? "Invoice generated" : "Packing list generated");
      loadBatchData(batch.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  };

  /* ── uploads ── */
  const uploadDocs = async (files: FileList | File[]) => {
    if (!batch) return toast.error("Select a batch first");
    setBusy("upload");
    try {
      for (const file of Array.from(files)) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${batch.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("wholesale-documents")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { error: rowErr } = await supabase.from("wholesale_documents").insert({
          batch_id: batch.id,
          warehouse: batch.warehouse,
          doc_type: uploadType,
          file_name: file.name,
          file_url: path,
        });
        if (rowErr) throw rowErr;
      }
      toast.success("Uploaded");
      loadBatchData(batch.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const downloadDoc = async (doc: Doc) => {
    if (!doc.file_url) return;
    const { data, error } = await supabase.storage
      .from("wholesale-documents")
      .createSignedUrl(doc.file_url, 60 * 10, { download: doc.file_name ?? true });
    if (error || !data) return toast.error(error?.message ?? "Could not open file");
    window.open(data.signedUrl, "_blank");
  };

  const deleteDoc = async (doc: Doc) => {
    if (!window.confirm(`Delete "${doc.file_name ?? "document"}"?`)) return;
    if (doc.file_url) await supabase.storage.from("wholesale-documents").remove([doc.file_url]);
    const { error } = await supabase.from("wholesale_documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Deleted");
  };

  const totals = useMemo(() => {
    let value = 0;
    let weight = 0;
    let qty = 0;
    for (const i of items) {
      const q = i.quantity ?? 1;
      qty += q;
      value += q * (i.unit_price ?? 0);
      weight += q * (i.weight_kg ?? 0);
    }
    return { value, weight, qty };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customs &amp; Documentation</h1>
          <p className="text-sm text-muted-foreground">
            Generate invoices and packing lists, store logistics paperwork per batch.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(["all", "A", "B"] as const).map((w) => (
            <Button
              key={w}
              size="sm"
              variant={warehouse === w ? "default" : "ghost"}
              onClick={() => setParam("wh", w)}
            >
              {w === "all" ? "All" : `Warehouse ${w}`}
            </Button>
          ))}
        </div>
      </div>

      {/* stamps */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as Warehouse[]).map((w) => (
          <div key={w} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="h-16 w-16 shrink-0 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden">
              {stamps[w] ? (
                <img src={stamps[w] as string} alt={`Warehouse ${w} stamp`} className="h-full w-full object-contain" />
              ) : (
                <StampIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={warehouseClass(w)}>
                  Warehouse {w}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {stamps[w] ? "Stamp uploaded" : "No stamp"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Applied bottom-right on invoices for this warehouse. Upload the same file twice if both
                companies share one stamp.
              </p>
            </div>
            <input
              ref={w === "A" ? stampInputA : stampInputB}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadStamp(w, f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy === `stamp-${w}`}
              onClick={() => (w === "A" ? stampInputA : stampInputB).current?.click()}
            >
              {busy === `stamp-${w}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload PNG"}
            </Button>
          </div>
        ))}
      </div>

      {/* batch selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={batchId || "none"} onValueChange={(v) => setParam("batch", v === "none" ? "" : v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select batch…</SelectItem>
            {visibleBatches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.batch_number} · WH {b.warehouse}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {batch && (
          <>
            <Button onClick={() => generate("invoice")} disabled={busy === "invoice"}>
              {busy === "invoice" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Generate Invoice
            </Button>
            <Button variant="outline" onClick={() => generate("packing_list")} disabled={busy === "packing_list"}>
              {busy === "packing_list" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="mr-2 h-4 w-4" />
              )}
              Generate Packing List
            </Button>
          </>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {batch && (
        <>
          {/* items */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Weight (kg)</th>
                  <th className="px-3 py-2 text-right">Cartons</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{i.sku}</td>
                    <td className="px-3 py-2">{i.title || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        className="ml-auto h-8 w-20 text-right"
                        defaultValue={i.quantity ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (i.quantity ?? null)) patchItem(i.id, { quantity: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{i.unit_price ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{i.weight_kg ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        className="ml-auto h-8 w-20 text-right"
                        defaultValue={i.carton_count ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (i.carton_count ?? null)) patchItem(i.id, { carton_count: v });
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No items in this batch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            {items.length} SKUs · {totals.qty} pcs · value {totals.value.toFixed(2)} · weight{" "}
            {totals.weight.toFixed(2)} kg
          </p>

          {/* upload zone */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="logistics_invoice">Logistics invoice</SelectItem>
                  <SelectItem value="shipping_receipt">Shipping receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="packing_list">Packing list</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Tagged Warehouse {batch.warehouse} automatically
              </span>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) uploadDocs(e.dataTransfer.files);
              }}
              onClick={() => uploadRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <input
                ref={uploadRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadDocs(e.target.files);
                  e.target.value = "";
                }}
              />
              {busy === "upload" ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Drop logistics invoices / shipping receipts here</span>
            </div>
          </div>

          {/* document list */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Warehouse</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const meta = DOC_TYPES[d.doc_type] ?? { label: d.doc_type, className: "" };
                  return (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2 truncate max-w-[280px]">{d.file_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge className={meta.className} variant="secondary">
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={warehouseClass(d.warehouse)}>
                          {d.warehouse}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(d.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => downloadDoc(d)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteDoc(d)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!docs.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No documents for this batch yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
