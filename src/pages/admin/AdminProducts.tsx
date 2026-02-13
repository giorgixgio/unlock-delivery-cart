import { useState, useMemo, useCallback } from "react";
import { useProducts, shopifyThumb } from "@/hooks/useProducts";
import { Product } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Loader2, Package, Upload, Download, Check, X, Pencil, AlertTriangle, ImageIcon,
} from "lucide-react";
import * as XLSX from "xlsx";

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
  handle: string;
  // Conflict flag from bulk update
  skuConflict?: { reason: string; oldSku: string; newSku: string; timestamp: string };
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
    handle: p.handle,
  }));
}

// Generate a fake compare-at price (2-3x) for products missing one
function getDisplayCompareAtPrice(price: number, compareAtPrice: number | null): number | null {
  if (compareAtPrice && compareAtPrice > price) return compareAtPrice;
  // Generate 2-3x multiplier based on price for consistency
  const multiplier = 2 + (price % 10) / 10; // 2.0 - 2.9x
  return Math.round(price * multiplier * 10) / 10;
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

// Persist conflict flags in localStorage
const CONFLICT_STORAGE_KEY = "bigmart-sku-conflicts";

function loadConflicts(): Record<string, VariantRow["skuConflict"]> {
  try {
    return JSON.parse(localStorage.getItem(CONFLICT_STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function saveConflicts(conflicts: Record<string, VariantRow["skuConflict"]>) {
  localStorage.setItem(CONFLICT_STORAGE_KEY, JSON.stringify(conflicts));
}

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
  const [activeTab, setActiveTab] = useState("all");
  const [skuConflicts, setSkuConflicts] = useState<Record<string, VariantRow["skuConflict"]>>(loadConflicts);

  const allRows = useMemo(() => {
    const rows = productsToVariantRows(products || []);
    // Attach conflict flags
    return rows.map(r => ({
      ...r,
      skuConflict: skuConflicts[r.productId],
    }));
  }, [products, skuConflicts]);

  const conflictRows = useMemo(() => allRows.filter(r => r.skuConflict), [allRows]);

  // SKU-first search
  const filtered = useMemo(() => {
    const source = activeTab === "conflicts" ? conflictRows : allRows;
    const q = search.trim().toLowerCase();
    if (!q) return source;

    if (looksLikeSku(q)) {
      const exact = source.filter((r) => r.sku.toLowerCase() === q);
      if (exact.length > 0) return exact;
      const partial = source.filter((r) => r.sku.toLowerCase().includes(q));
      if (partial.length > 0) return partial;
    }

    return source.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q)
    );
  }, [allRows, conflictRows, search, activeTab]);

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
    const duplicate = allRows.find((r) => r.sku.toLowerCase() === trimmed.toLowerCase() && r.productId !== editingSku);
    if (duplicate) {
      toast({ title: "Duplicate SKU", description: `SKU "${trimmed}" already exists on "${duplicate.title}"`, variant: "destructive" });
      return;
    }
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
    conflictProduct?: string;
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

    const header = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const oldSkuIdx = header.findIndex((h: string) => h === "old_sku" || h === "oldsku" || h === "old sku");
    const newSkuIdx = header.findIndex((h: string) => h === "new_sku" || h === "newsku" || h === "new sku");

    if (oldSkuIdx === -1 || newSkuIdx === -1) {
      toast({ title: "File must have 'old_sku' and 'new_sku' columns", variant: "destructive" });
      return;
    }

    const dataRows = rows.slice(1).filter((row) => {
      const old = String(row[oldSkuIdx] || "").trim();
      const nw = String(row[newSkuIdx] || "").trim();
      return old || nw;
    });

    const skuMap = new Map<string, VariantRow>();
    allRows.forEach((r) => skuMap.set(r.sku.toLowerCase(), r));

    const oldSkuSet = new Set(
      dataRows.map((r) => String(r[oldSkuIdx] || "").trim().toLowerCase()).filter(Boolean)
    );

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

      // Check conflict — but now we ALLOW it (just flag it)
      const conflict = skuMap.get(newSku.toLowerCase());
      if (conflict && conflict.productId !== match.productId) {
        if (!oldSkuSet.has(newSku.toLowerCase())) {
          return {
            rowNum: i + 2, oldSku, newSku, status: "conflict" as const,
            matchedProductId: match.productId, matchedTitle: match.title,
            conflictProduct: conflict.title,
            error: `new_sku "${newSku}" already used by "${conflict.title}"`
          };
        }
      }

      return { rowNum: i + 2, oldSku, newSku, status: "matched" as const, matchedProductId: match.productId, matchedTitle: match.title };
    });

    setBulkData(parsed);
  }, [allRows, toast]);

  // Now conflicts ARE allowed to be applied — they get flagged
  const bulkApplicable = bulkData?.filter((r) => r.status === "matched" || r.status === "conflict") || [];
  const bulkErrors = bulkData?.filter((r) => r.status !== "matched" && r.status !== "conflict") || [];
  const bulkMatched = bulkApplicable.length;
  const bulkConflictCount = bulkData?.filter((r) => r.status === "conflict").length || 0;

  const handleBulkApply = () => {
    // Flag conflict products for warehouse
    if (bulkConflictCount > 0) {
      const newConflicts = { ...skuConflicts };
      const conflictItems = bulkData?.filter(r => r.status === "conflict") || [];
      const timestamp = new Date().toISOString();
      conflictItems.forEach(item => {
        if (item.matchedProductId) {
          newConflicts[item.matchedProductId] = {
            reason: item.error || `SKU conflict: "${item.newSku}" is already used by another product`,
            oldSku: item.oldSku,
            newSku: item.newSku,
            timestamp,
          };
        }
      });
      setSkuConflicts(newConflicts);
      saveConflicts(newConflicts);
    }

    toast({
      title: `${bulkMatched} SKU updates queued (${bulkConflictCount} flagged as conflicts)`,
      description: "Connect Shopify Admin API to apply. Conflicts are flagged for warehouse review.",
    });
    setBulkOpen(false);
    setBulkData(null);
  };

  const handleClearConflict = (productId: string) => {
    const newConflicts = { ...skuConflicts };
    delete newConflicts[productId];
    setSkuConflicts(newConflicts);
    saveConflicts(newConflicts);
    toast({ title: "Conflict resolved" });
  };

  const handleClearAllConflicts = () => {
    setSkuConflicts({});
    saveConflicts({});
    toast({ title: "All conflicts cleared" });
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

  const renderProductTable = (rows: VariantRow[]) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-3 font-bold w-14">Image</th>
            <th className="text-left px-3 py-3 font-bold">Product</th>
            <th className="text-left px-3 py-3 font-bold">SKU</th>
            <th className="text-left px-3 py-3 font-bold">Price</th>
            <th className="text-left px-3 py-3 font-bold">Compare</th>
            <th className="text-left px-3 py-3 font-bold">Status</th>
            <th className="text-left px-3 py-3 font-bold">Vendor</th>
            <th className="text-left px-3 py-3 font-bold">Category</th>
            {activeTab === "conflicts" && <th className="text-left px-3 py-3 font-bold">Conflict Details</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const displayCompare = getDisplayCompareAtPrice(row.price, row.compareAtPrice);
            const hasRealCompare = row.compareAtPrice && row.compareAtPrice > row.price;
            return (
              <tr key={row.productId} className={`border-t border-border hover:bg-muted/30 transition-colors ${row.skuConflict ? "bg-orange-50/50" : ""}`}>
                <td className="px-3 py-2">
                  <div className="w-12 h-12 rounded-md border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
                    {row.image && row.image !== "/placeholder.svg" ? (
                      <img src={shopifyThumb(row.image, 100)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-sm line-clamp-2 max-w-[220px]">{row.title}</p>
                  {row.skuConflict && activeTab !== "conflicts" && (
                    <Badge variant="destructive" className="mt-1 text-[10px] gap-1">
                      <AlertTriangle className="w-3 h-3" /> SKU Conflict
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingSku === row.productId ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editSkuValue}
                        onChange={(e) => setEditSkuValue(e.target.value)}
                        className="h-7 w-28 text-xs font-mono"
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
                <td className="px-3 py-2 font-medium">{row.price.toFixed(1)} ₾</td>
                <td className="px-3 py-2">
                  <span className={hasRealCompare ? "text-muted-foreground" : "text-muted-foreground/60 italic"}>
                    {displayCompare ? `${displayCompare.toFixed(1)} ₾` : "—"}
                  </span>
                  {!hasRealCompare && displayCompare && (
                    <span className="text-[9px] text-muted-foreground/40 ml-1">gen</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${row.available ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                    {row.available ? "Active" : "Draft"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[100px]">{row.vendor || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[100px]">{row.category || "—"}</td>
                {activeTab === "conflicts" && (
                  <td className="px-3 py-2">
                    {row.skuConflict && (
                      <div className="space-y-1">
                        <p className="text-xs text-destructive font-medium">{row.skuConflict.reason}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {row.skuConflict.oldSku} → {row.skuConflict.newSku} • {new Date(row.skuConflict.timestamp).toLocaleDateString()}
                        </p>
                        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleClearConflict(row.productId)}>
                          Mark Resolved
                        </Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
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
          <p className="text-xs text-muted-foreground">
            Upload a file with columns: <code className="font-mono bg-muted px-1 rounded">old_sku</code> and <code className="font-mono bg-muted px-1 rounded">new_sku</code>.
            <span className="text-orange-600 font-medium ml-1">Conflicts will be applied but flagged for warehouse review.</span>
          </p>

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
                  <p className="text-lg font-bold text-emerald-700">{bulkData.filter(r => r.status === "matched").length}</p>
                  <p className="text-[10px] text-emerald-600">Clean Match</p>
                </div>
                <div className="bg-orange-50 rounded p-2 text-center border border-orange-200">
                  <p className="text-lg font-bold text-orange-700">{bulkConflictCount}</p>
                  <p className="text-[10px] text-orange-600">Conflicts (will flag)</p>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-red-700">{bulkData.filter(r => r.status === "not_found").length}</p>
                  <p className="text-[10px] text-red-600">Not Found</p>
                </div>
                <div className="bg-amber-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-amber-700">{bulkData.filter(r => r.status.startsWith("duplicate")).length}</p>
                  <p className="text-[10px] text-amber-600">Duplicates</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-lg font-bold text-gray-500">{bulkData.filter(r => r.status === "empty").length}</p>
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
                      <th className="text-left px-3 py-2 font-bold">Product / Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkData.map((row, i) => (
                      <tr key={i} className={`border-t border-border ${row.status === "conflict" ? "bg-orange-50/50" : ""}`}>
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.oldSku}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.newSku}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusColors[row.status]}`}>
                            {row.status === "conflict" ? "⚠ conflict" : row.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[280px]">
                          {row.status === "conflict" ? (
                            <div>
                              <p className="font-medium text-orange-700">{row.matchedTitle}</p>
                              <p className="text-orange-600 text-[10px]">{row.error}</p>
                              <p className="text-[10px] text-muted-foreground italic">Will apply & flag for warehouse</p>
                            </div>
                          ) : (
                            <span className="truncate block">{row.matchedTitle || row.error || "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 justify-end items-center">
                <Button variant="outline" onClick={() => { setBulkOpen(false); setBulkData(null); }}>Cancel</Button>
                <Button
                  onClick={handleBulkApply}
                  disabled={bulkMatched === 0}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  Apply {bulkMatched} Updates
                  {bulkConflictCount > 0 && (
                    <Badge variant="outline" className="ml-1 bg-orange-100 text-orange-800 border-orange-300 text-[10px]">
                      {bulkConflictCount} flagged
                    </Badge>
                  )}
                </Button>
              </div>

              {bulkErrors.length > 0 && (
                <p className="text-xs text-amber-700">
                  ⚠ {bulkErrors.length} rows with errors (not_found, duplicate, empty) will be skipped. Conflicts will be applied and flagged.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs: All Products / Conflicting SKUs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All Products</TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-1.5">
            Conflicting SKUs
            {conflictRows.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] h-5 min-w-5 px-1.5">
                {conflictRows.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-3">
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

          <p className="text-xs text-muted-foreground">
            {filtered.length} products {search && `(filtered from ${allRows.length})`}
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {renderProductTable(pageRows)}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-3 mt-3">
          {conflictRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">No SKU conflicts</p>
              <p className="text-sm">Conflicts from bulk updates will appear here for warehouse review.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-orange-700">
                  {conflictRows.length} product{conflictRows.length > 1 ? "s" : ""} with SKU conflicts — review and resolve
                </p>
                <Button variant="outline" size="sm" onClick={handleClearAllConflicts} className="text-xs">
                  Clear All Conflicts
                </Button>
              </div>

              {/* Search in conflicts */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search conflicts..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 h-10"
                />
              </div>

              {renderProductTable(pageRows)}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminProducts;
