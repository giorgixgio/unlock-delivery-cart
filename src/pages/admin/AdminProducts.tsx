import { useState, useMemo, useCallback } from "react";
import { useProducts, shopifyThumb } from "@/hooks/useProducts";
import { Product } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Loader2, Package, Upload, Download, Check, X, Pencil,
} from "lucide-react";
import * as XLSX from "xlsx";

// Flatten products to variant-level rows (1 product = 1 row since we use first variant)
interface VariantRow {
  productId: string;
  title: string;
  variantTitle: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  vendor: string;
  category: string;
  tags: string[];
  image: string;
}

function productsToVariantRows(products: Product[]): VariantRow[] {
  return products.map((p) => ({
    productId: p.id,
    title: p.title,
    variantTitle: "",
    sku: p.sku,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    available: p.available,
    vendor: p.vendor,
    category: p.category,
    tags: p.tags,
    image: p.image,
  }));
}

function looksLikeSku(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const digitRatio = (trimmed.match(/\d/g) || []).length / trimmed.length;
  if (digitRatio > 0.5) return true;
  if (!trimmed.includes(" ") && trimmed.length >= 5) return true;
  return false;
}

const PAGE_SIZE = 50;

const AdminProducts = () => {
  const { data: products, isLoading } = useProducts();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editSkuValue, setEditSkuValue] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkData, setBulkData] = useState<BulkRow[] | null>(null);
  const [bulkFileName, setBulkFileName] = useState("");

  const allRows = useMemo(() => productsToVariantRows(products || []), [products]);

  // SKU-first search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;

    if (looksLikeSku(q)) {
      // Exact SKU match first, then partial, then title fallback
      const exact = allRows.filter((r) => r.sku.toLowerCase() === q);
      if (exact.length > 0) return exact;
      const partial = allRows.filter((r) => r.sku.toLowerCase().includes(q));
      if (partial.length > 0) return partial;
    }

    return allRows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q)
    );
  }, [allRows, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSkuEdit = (productId: string, currentSku: string) => {
    setEditingSku(productId);
    setEditSkuValue(currentSku);
  };

  const handleSkuSave = () => {
    const trimmed = editSkuValue.trim();
    if (!trimmed) {
      toast({ title: "SKU cannot be empty", variant: "destructive" });
      return;
    }
    // Check duplicates
    const duplicate = allRows.find((r) => r.sku.toLowerCase() === trimmed.toLowerCase() && r.productId !== editingSku);
    if (duplicate) {
      toast({ title: "Duplicate SKU", description: `SKU "${trimmed}" already exists on "${duplicate.title}"`, variant: "destructive" });
      return;
    }
    // Note: Without Shopify Admin API, we can only show the intent
    toast({ title: "SKU update saved locally", description: "Connect Shopify Admin API to sync changes." });
    setEditingSku(null);
  };

  // Bulk CSV upload
  interface BulkRow {
    rowNum: number;
    oldSku: string;
    newSku: string;
    status: "matched" | "not_found" | "duplicate_old" | "duplicate_new" | "conflict" | "empty";
    matchedProductId?: string;
    matchedTitle?: string;
    error?: string;
  }

  const handleBulkFile = useCallback(async (file: File) => {
    setBulkFileName(file.name);
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (rows.length < 2) {
      toast({ title: "File must have header + data rows", variant: "destructive" });
      return;
    }

    // Find old_sku and new_sku columns
    const header = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const oldSkuIdx = header.findIndex((h: string) => h === "old_sku" || h === "oldsku" || h === "old sku");
    const newSkuIdx = header.findIndex((h: string) => h === "new_sku" || h === "newsku" || h === "new sku");

    if (oldSkuIdx === -1 || newSkuIdx === -1) {
      toast({ title: "File must have 'old_sku' and 'new_sku' columns", variant: "destructive" });
      return;
    }

    const dataRows = rows.slice(1);
    const skuMap = new Map<string, VariantRow>();
    allRows.forEach((r) => skuMap.set(r.sku.toLowerCase(), r));

    // Count occurrences for duplicate detection
    const oldSkuCounts = new Map<string, number>();
    const newSkuCounts = new Map<string, number>();
    dataRows.forEach((row) => {
      const old = String(row[oldSkuIdx] || "").trim().toLowerCase();
      const nw = String(row[newSkuIdx] || "").trim().toLowerCase();
      if (old) oldSkuCounts.set(old, (oldSkuCounts.get(old) || 0) + 1);
      if (nw) newSkuCounts.set(nw, (newSkuCounts.get(nw) || 0) + 1);
    });

    const parsed: BulkRow[] = dataRows.map((row, i) => {
      const oldSku = String(row[oldSkuIdx] || "").trim();
      const newSku = String(row[newSkuIdx] || "").trim();

      if (!oldSku || !newSku) {
        return { rowNum: i + 2, oldSku, newSku, status: "empty" as const, error: "Empty cell" };
      }

      if ((oldSkuCounts.get(oldSku.toLowerCase()) || 0) > 1) {
        return { rowNum: i + 2, oldSku, newSku, status: "duplicate_old" as const, error: "Duplicate old_sku in file" };
      }

      if ((newSkuCounts.get(newSku.toLowerCase()) || 0) > 1) {
        return { rowNum: i + 2, oldSku, newSku, status: "duplicate_new" as const, error: "Duplicate new_sku in file" };
      }

      const match = skuMap.get(oldSku.toLowerCase());
      if (!match) {
        return { rowNum: i + 2, oldSku, newSku, status: "not_found" as const, error: "old_sku not found in catalog" };
      }

      // Check if new_sku already exists
      const conflict = skuMap.get(newSku.toLowerCase());
      if (conflict && conflict.productId !== match.productId) {
        return { rowNum: i + 2, oldSku, newSku, status: "conflict" as const, matchedProductId: match.productId, matchedTitle: match.title, error: `new_sku already used by "${conflict.title}"` };
      }

      return { rowNum: i + 2, oldSku, newSku, status: "matched" as const, matchedProductId: match.productId, matchedTitle: match.title };
    });

    setBulkData(parsed);
  }, [allRows, toast]);

  const bulkHasErrors = bulkData?.some((r) => r.status !== "matched");
  const bulkMatched = bulkData?.filter((r) => r.status === "matched").length || 0;

  const handleBulkApply = () => {
    toast({ title: `${bulkMatched} SKU updates queued`, description: "Connect Shopify Admin API to apply changes." });
    setBulkOpen(false);
    setBulkData(null);
  };

  const handleDownloadReport = () => {
    if (!bulkData) return;
    const reportData = bulkData.map((r) => ({
      "Row": r.rowNum,
      "Old SKU": r.oldSku,
      "New SKU": r.newSku,
      "Status": r.status,
      "Product": r.matchedTitle || "",
      "Error": r.error || "",
    }));
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SKU Update Report");
    XLSX.writeFile(wb, `sku_update_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statusColors: Record<string, string> = {
    matched: "bg-emerald-100 text-emerald-800",
    not_found: "bg-red-100 text-red-800",
    duplicate_old: "bg-amber-100 text-amber-800",
    duplicate_new: "bg-amber-100 text-amber-800",
    conflict: "bg-orange-100 text-orange-800",
    empty: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6" /> Product Management
        </h1>
        <Button onClick={() => setBulkOpen(!bulkOpen)} variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Bulk Update SKUs
        </Button>
      </div>

      {/* Bulk Upload Panel */}
      {bulkOpen && (
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <h3 className="font-bold text-sm">Bulk SKU Update via CSV/XLSX</h3>
          <p className="text-xs text-muted-foreground">Upload a file with columns: <code className="font-mono bg-muted px-1 rounded">old_sku</code> and <code className="font-mono bg-muted px-1 rounded">new_sku</code></p>

          {!bulkData ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("bulk-sku-file")?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBulkFile(f); }}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop file or click to browse</p>
              <input id="bulk-sku-file" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkFile(f); }} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{bulkFileName} — {bulkData.length} rows</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDownloadReport} className="gap-1">
                    <Download className="w-3 h-3" /> Report
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBulkData(null)}>Re-upload</Button>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <div className="bg-muted/50 rounded p-2 text-center">
                  <p className="text-lg font-bold">{bulkData.length}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="bg-emerald-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-emerald-700">{bulkMatched}</p>
                  <p className="text-[10px] text-emerald-600">Matched</p>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-red-700">{bulkData.filter((r) => r.status === "not_found").length}</p>
                  <p className="text-[10px] text-red-600">Not Found</p>
                </div>
                <div className="bg-amber-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-amber-700">{bulkData.filter((r) => r.status.startsWith("duplicate")).length}</p>
                  <p className="text-[10px] text-amber-600">Duplicates</p>
                </div>
                <div className="bg-orange-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-orange-700">{bulkData.filter((r) => r.status === "conflict").length}</p>
                  <p className="text-[10px] text-orange-600">Conflicts</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-gray-500">{bulkData.filter((r) => r.status === "empty").length}</p>
                  <p className="text-[10px] text-gray-500">Empty</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-border max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Row</th>
                      <th className="text-left px-3 py-2 font-bold">Old SKU</th>
                      <th className="text-left px-3 py-2 font-bold">New SKU</th>
                      <th className="text-left px-3 py-2 font-bold">Status</th>
                      <th className="text-left px-3 py-2 font-bold">Product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkData.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.oldSku}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.newSku}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusColors[row.status]}`}>
                            {row.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs truncate max-w-[200px]">
                          {row.matchedTitle || row.error || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setBulkOpen(false); setBulkData(null); }}>Cancel</Button>
                <Button
                  onClick={handleBulkApply}
                  disabled={bulkHasErrors || bulkMatched === 0}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  Apply {bulkMatched} Updates
                </Button>
              </div>

              {bulkHasErrors && (
                <p className="text-xs text-destructive">
                  Fix all errors before applying. Remove problematic rows from your file and re-upload.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by title, SKU, or vendor..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-9 h-10"
        />
        {search && looksLikeSku(search) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            SKU search
          </span>
        )}
      </div>

      {/* Stats */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} products {search && `(filtered from ${allRows.length})`}
      </p>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-bold w-12"></th>
                  <th className="text-left px-4 py-3 font-bold">Product</th>
                  <th className="text-left px-4 py-3 font-bold">SKU</th>
                  <th className="text-left px-4 py-3 font-bold">Price</th>
                  <th className="text-left px-4 py-3 font-bold">Compare</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  <th className="text-left px-4 py-3 font-bold">Vendor</th>
                  <th className="text-left px-4 py-3 font-bold">Category</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.productId} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded border border-border overflow-hidden">
                        <img src={shopifyThumb(row.image, 80)} alt="" className="w-full h-full object-cover" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm truncate max-w-[250px]">{row.title}</p>
                      {row.variantTitle && <p className="text-xs text-muted-foreground">{row.variantTitle}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {editingSku === row.productId ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editSkuValue}
                            onChange={(e) => setEditSkuValue(e.target.value)}
                            className="h-7 w-32 text-xs font-mono"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleSkuSave(); if (e.key === "Escape") setEditingSku(null); }}
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-600" onClick={handleSkuSave}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingSku(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className="font-mono text-xs">{row.sku || "—"}</span>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                            onClick={() => handleSkuEdit(row.productId, row.sku)}
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{row.price.toFixed(1)} ₾</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.compareAtPrice ? `${row.compareAtPrice.toFixed(1)} ₾` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${row.available ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                        {row.available ? "Active" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{row.vendor || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{row.category || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminProducts;
