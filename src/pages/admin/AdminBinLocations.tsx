import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, Upload, Loader2, MapPin, AlertTriangle } from "lucide-react";

/**
 * Bin Locations
 * -------------------------------------------------------------------
 * Manage each product's physical warehouse shelf position (bin_location),
 * which is independent of the SKU. Powers pick-path sorting in both the
 * single-SKU and multi-SKU fulfillment lanes.
 *
 * Features:
 *   • Searchable table (SKU / title / bin)
 *   • Inline edit, saved on blur
 *   • CSV export of current mapping
 *   • CSV bulk import (matches rows by SKU) for re-mapping all products at once
 */

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  bin_location: string | null;
}

/** Natural/numeric-aware compare so "2" sorts before "10" and "A-2" before "A-10". */
function compareBin(a: string | null, b: string | null): number {
  const av = (a ?? "").trim();
  const bv = (b ?? "").trim();
  if (av === "" && bv === "") return 0;
  if (av === "") return 1; // blanks last
  if (bv === "") return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

export default function AdminBinLocations() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    // bin_location may not be in the generated Supabase types yet — cast to any.
    const { data, error } = await (supabase.from("products") as any)
      .select("id, sku, title, bin_location")
      .order("title");
    if (error) {
      console.error(error);
      toast({ title: "Failed to load products", variant: "destructive" });
    } else {
      setRows((data as ProductRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.sku?.toLowerCase().includes(q) ||
            r.title?.toLowerCase().includes(q) ||
            (r.bin_location ?? "").toLowerCase().includes(q)
        )
      : rows;
    return [...list].sort((a, b) => compareBin(a.bin_location, b.bin_location));
  }, [rows, search]);

  const unsetCount = useMemo(
    () => rows.filter((r) => !r.bin_location || r.bin_location.trim() === "").length,
    [rows]
  );

  const updateLocal = (id: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, bin_location: value } : r)));
  };

  const saveRow = async (id: string, value: string) => {
    const trimmed = value.trim();
    setSavingId(id);
    const { error } = await (supabase.from("products") as any)
      .update({ bin_location: trimmed === "" ? null : trimmed })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      console.error(error);
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const data = [...rows]
      .sort((a, b) => compareBin(a.bin_location, b.bin_location))
      .map((r) => ({
        sku: r.sku ?? "",
        title: r.title ?? "",
        bin_location: r.bin_location ?? "",
      }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ["sku", "title", "bin_location"] });
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bin-locations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      // Normalize header keys and pull sku + bin from flexible column names.
      const norm = (obj: Record<string, any>) => {
        const out: Record<string, string> = {};
        for (const k of Object.keys(obj)) out[k.trim().toLowerCase()] = String(obj[k] ?? "").trim();
        return out;
      };

      const bySku = new Map<string, string>();
      for (const r of rows) if (r.sku) bySku.set(r.sku.trim().toLowerCase(), r.id);

      const updates: { id: string; bin: string }[] = [];
      let unmatched = 0;
      for (const rowRaw of raw) {
        const row = norm(rowRaw);
        const sku = row["sku"] || row["handle"] || row["sku "] || "";
        const bin = row["bin_location"] || row["bin"] || row["location"] || row["position"] || "";
        if (!sku) continue;
        const id = bySku.get(sku.toLowerCase());
        if (!id) {
          unmatched++;
          continue;
        }
        updates.push({ id, bin });
      }

      if (updates.length === 0) {
        toast({
          title: "Nothing to import",
          description: "Need columns 'sku' and 'bin_location'. No SKUs matched.",
          variant: "destructive",
        });
        setImporting(false);
        return;
      }

      // Apply in small parallel chunks.
      let ok = 0;
      const chunkSize = 25;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((u) =>
            (supabase.from("products") as any)
              .update({ bin_location: u.bin === "" ? null : u.bin })
              .eq("id", u.id)
          )
        );
        ok += results.filter((r: any) => !r.error).length;
      }

      toast({
        title: `Imported ${ok} location${ok === 1 ? "" : "s"}`,
        description: unmatched > 0 ? `${unmatched} row(s) had no matching SKU` : undefined,
      });
      await load();
    } catch (e) {
      console.error(e);
      toast({ title: "Import failed", description: "Could not read the file.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Bin locations
          </h1>
          <p className="text-sm text-muted-foreground">
            Physical shelf position per product. Independent of SKU. Used to sort pick paths.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading}>
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing || loading}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1.5" />
            )}
            Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {unsetCount > 0 && !loading && (
        <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {unsetCount} product{unsetCount === 1 ? "" : "s"} have no bin location set.
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search SKU, title, or bin…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-[160px]">Bin location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                      No products found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                      <TableCell className="text-sm">{r.title}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            value={r.bin_location ?? ""}
                            onChange={(e) => updateLocal(r.id, e.target.value)}
                            onBlur={(e) => saveRow(r.id, e.target.value)}
                            placeholder="—"
                            className="h-8 w-28"
                          />
                          {savingId === r.id && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} products. Changes save automatically when you
        click out of a field. For bulk re-mapping, export the CSV, edit the <code>bin_location</code>{" "}
        column in a spreadsheet, and import it back.
      </p>
    </div>
  );
}
