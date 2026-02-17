import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Printer, PackageCheck, FileDown, AlertTriangle, Clock, Unlock, Rocket, Download, Upload, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  fetchBatch, fetchBatchOrders, fetchSnapshot, fetchBatchEvents,
  printPackingList, printPackingSlips, logShippingLabelsGenerated,
  bulkReleaseBatch, undoReleaseBatch, recordCourierExport, importTrackingForBatch,
  TrackingConflictError,
  type BatchRow, type SnapshotItem, type BatchEvent,
} from "@/lib/batchService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface OrderInfo {
  id: string;
  public_order_number: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address_line1: string;
  address_line2?: string | null;
  tracking_number: string | null;
  total?: number;
  notes_customer?: string | null;
  normalized_address?: string | null;
  normalized_city?: string | null;
  released_at?: string | null;
}

const AdminBatchDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAdminAuth();
  const actor = user?.email || "admin";

  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotItem[]>([]);
  const [events, setEvents] = useState<BatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState<string | null>(null);
  const [confirmReprint, setConfirmReprint] = useState<string | null>(null);

  // Bulk release
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // Undo release
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [undoing, setUndoing] = useState(false);

  // Courier CSV
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Tracking import
  const [importResult, setImportResult] = useState<{ updated: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, o, s, e] = await Promise.all([
        fetchBatch(id),
        fetchBatchOrders(id),
        fetchSnapshot(id),
        fetchBatchEvents(id),
      ]);
      setBatch(b);
      setOrders(o as OrderInfo[]);
      setSnapshot(s);
      setEvents(e);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ─── Print Handlers ─── */
  const handlePrintList = async () => {
    if (!id || !batch) return;
    if (batch.packing_list_print_count > 0 && confirmReprint !== "list") {
      setConfirmReprint("list"); return;
    }
    setPrinting("list"); setConfirmReprint(null);
    try {
      await printPackingList(id, actor);
      toast({ title: "Packing list recorded" });
      openPackingListWindow();
      await load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setPrinting(null);
  };

  const handlePrintSlips = async () => {
    if (!id || !batch) return;
    if (batch.packing_slips_print_count > 0 && confirmReprint !== "slips") {
      setConfirmReprint("slips"); return;
    }
    setPrinting("slips"); setConfirmReprint(null);
    try {
      await printPackingSlips(id, actor);
      toast({ title: "Packing slips recorded" });
      openPackingSlipsWindow();
      await load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setPrinting(null);
  };

  /* ─── Bulk Release ─── */
  const handleBulkRelease = async () => {
    if (!id) return;
    setReleasing(true);
    try {
      await bulkReleaseBatch(id, actor);
      toast({ title: "Batch released", description: `${orders.length} orders released.` });
      setShowReleaseConfirm(false);
      await load();
    } catch (e: any) { toast({ title: "Release failed", description: e.message, variant: "destructive" }); }
    setReleasing(false);
  };

  /* ─── Undo Release ─── */
  const handleUndoRelease = async () => {
    if (!id || !undoReason.trim()) return;
    setUndoing(true);
    try {
      await undoReleaseBatch(id, actor, undoReason.trim());
      toast({ title: "Release undone", description: "Batch reverted to LOCKED." });
      setShowUndoModal(false); setUndoReason("");
      await load();
    } catch (e: any) { toast({ title: "Undo failed", description: e.message, variant: "destructive" }); }
    setUndoing(false);
  };

  /* ─── Courier CSV Download ─── */
  const handleCourierCSV = async () => {
    if (!id || !batch) return;

    // Lock warning for OPEN batches
    if (batch.status === "OPEN") {
      toast({ title: "Warning", description: "Batch is OPEN. Lock the batch first to avoid mismatches.", variant: "destructive" });
      return;
    }

    // Re-export confirmation
    if (batch.export_count > 0 && !showExportConfirm) {
      setShowExportConfirm(true);
      return;
    }

    setExporting(true); setShowExportConfirm(false);
    try {
      // Fetch courier template
      const { data: template } = await supabase
        .from("courier_export_settings")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .single();

      const dynamicMap = (template?.dynamic_columns_map || {}) as Record<string, string>;
      const fixedMap = (template?.fixed_columns_map || {}) as Record<string, string>;

      // Build rows
      const allCols = new Set([...Object.keys(dynamicMap), ...Object.keys(fixedMap)]);
      const sortedCols = Array.from(allCols).sort();

      const csvRows: string[][] = [];
      // Header
      csvRows.push(sortedCols);

      for (const ord of orders) {
        const orderItems = snapshot.filter(s => s.order_id === ord.id);
        const totalQty = orderItems.reduce((s, i) => s + i.qty, 0);
        const skus = orderItems.map(i => i.sku).join(", ");

        const row: string[] = sortedCols.map(col => {
          if (fixedMap[col] !== undefined) return fixedMap[col];
          const field = dynamicMap[col];
          if (!field) return "";
          switch (field) {
            case "customer_name": return ord.customer_name || "";
            case "normalized_address": return ord.normalized_address || ord.address_line1 || "";
            case "normalized_city": return ord.normalized_city || ord.city || "";
            case "customer_phone": return ord.customer_phone || "";
            case "item_quantities": return String(totalQty);
            case "order_id": return ord.public_order_number || "";
            case "item_skus": return skus;
            case "total": return String(ord.total || 0);
            case "notes": return ord.notes_customer || "";
            default: return "";
          }
        });
        csvRows.push(row);
      }

      // Generate CSV
      const csvContent = csvRows.map(row =>
        row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      ).join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `courier_batch_${id.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      await recordCourierExport(id, actor, orders.length);
      toast({ title: "Courier CSV downloaded" });
      await load();
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
    setExporting(false);
  };

  /* ─── Tracking Import ─── */
  const handleTrackingFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setImporting(true); setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error("File must have header + at least 1 row");

      const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
      const orderIdIdx = header.findIndex(h => h.includes("order") && h.includes("id") || h === "order_id" || h === "h");
      const trackingIdx = header.findIndex(h => h.includes("tracking") || h === "tracking_number");

      if (orderIdIdx === -1 || trackingIdx === -1) throw new Error("CSV must contain order_id and tracking_number columns");

      // Parse rows - match by public_order_number to get UUID
      const rows: { order_id: string; tracking_number: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.replace(/"/g, "").trim());
        const orderRef = cols[orderIdIdx];
        const tracking = cols[trackingIdx];
        if (!orderRef || !tracking) continue;

        // Find matching order in this batch
        const matchedOrder = orders.find(o => o.public_order_number === orderRef || o.id === orderRef);
        if (matchedOrder) {
          rows.push({ order_id: matchedOrder.id, tracking_number: tracking });
        } else {
          throw new Error(`Order "${orderRef}" not found in this batch`);
        }
      }

      if (rows.length === 0) throw new Error("No valid rows found");

      const result = await importTrackingForBatch(id, actor, rows);
      setImportResult(result);
      toast({ title: "Tracking imported", description: `${result.updated} updated, ${result.skipped} skipped` });
      await load();
    } catch (err: any) {
      if (err instanceof TrackingConflictError) {
        toast({
          title: `${err.conflicts.length} tracking conflict(s)`,
          description: err.conflicts.map(c => `Order ${c.order_id.slice(0, 8)}: ${c.existing} ≠ ${c.incoming}`).join("; "),
          variant: "destructive",
        });
      } else {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ─── Packing List (HTML popup) ─── */
  const openPackingListWindow = () => {
    const skuMapPrint = new Map<string, { orders: { orderNumber: string; qty: number }[]; totalQty: number; name: string }>();
    for (const item of snapshot) {
      const ord = orders.find((o) => o.id === item.order_id);
      const orderNum = ord?.public_order_number || item.order_id.slice(0, 8);
      if (!skuMapPrint.has(item.sku)) skuMapPrint.set(item.sku, { orders: [], totalQty: 0, name: item.product_name });
      const entry = skuMapPrint.get(item.sku)!;
      entry.orders.push({ orderNumber: orderNum, qty: item.qty });
      entry.totalQty += item.qty;
    }
    const skuPrintEntries = Array.from(skuMapPrint.entries()).sort((a, b) => (parseInt(a[0]) || 99999) - (parseInt(b[0]) || 99999));
    const today = new Date().toLocaleDateString("ka-GE");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing List</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;font-size:11pt}
.header{text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:3px solid #000}
.header h1{font-size:18pt}.header .meta{font-size:9pt;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;border:1px solid #ddd}
th{background:#f0f0f0;text-align:left;padding:8px 12px;font-size:10pt;border-bottom:2px solid #ccc}
td{padding:10px 12px;border-bottom:1px solid #eee;vertical-align:middle}
.sku-num{font-size:16pt;font-weight:900}.order-chip{display:inline-block;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:3px;padding:2px 6px;margin:2px 3px;font-size:9pt;font-weight:600}
.qty-cell{text-align:center;font-weight:bold;font-size:13pt}@media print{body{padding:10px}}</style></head><body>
<div class="header"><h1>📦 PACKING LIST</h1><div class="meta">${today} | ${orders.length} orders | Batch ${id?.slice(0, 8)}</div></div>
<table><thead><tr><th style="width:140px">SKU</th><th>Product</th><th>Orders</th><th style="width:60px;text-align:center">Total</th></tr></thead><tbody>
${skuPrintEntries.map(([sku, e]) => `<tr><td><span class="sku-num">${sku}</span></td><td style="font-size:9pt;color:#666">${e.name}</td><td>${e.orders.map(o => `<span class="order-chip">#${o.orderNumber} ×${o.qty}</span>`).join(" ")}</td><td class="qty-cell">${e.totalQty}</td></tr>`).join("")}
</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ─── Packing Slips (HTML popup) ─── */
  const openPackingSlipsWindow = () => {
    const today = new Date().toLocaleDateString("ka-GE");
    const slipsHtml = orders.map((ord, idx) => {
      const items = snapshot.filter((s) => s.order_id === ord.id);
      return `<div class="slip" ${idx > 0 ? 'style="page-break-before:always"' : ''}>
<div class="slip-header"><strong>#${ord.public_order_number}</strong><span>${today}</span></div>
<div class="info"><div><strong>${ord.customer_name}</strong></div><div>${ord.customer_phone}</div><div>${ord.address_line1}, ${ord.city}</div>
${ord.tracking_number ? `<div class="tracking">Tracking: ${ord.tracking_number}</div>` : ""}</div>
<table><thead><tr><th>SKU</th><th>Product</th><th style="text-align:center">Qty</th></tr></thead><tbody>
${items.map(i => `<tr><td style="font-weight:bold">${i.sku}</td><td>${i.product_name}</td><td style="text-align:center;font-weight:bold">${i.qty}</td></tr>`).join("")}
</tbody></table></div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing Slips</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;font-size:10pt}
.slip{border:1px solid #ccc;padding:15px;margin-bottom:20px;border-radius:4px}
.slip-header{display:flex;justify-content:space-between;font-size:12pt;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px}
.info{margin-bottom:10px;line-height:1.5}.tracking{font-family:monospace;font-weight:bold;margin-top:4px}
table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:6px 10px;border-bottom:2px solid #ccc;font-size:9pt}
td{padding:8px 10px;border-bottom:1px solid #eee}@media print{.slip{border:none;page-break-inside:avoid}}</style></head><body>${slipsHtml}</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ─── Shipping Labels PDF ─── */
  const handleDownloadLabels = async () => {
    if (!id) return;
    setPrinting("labels");
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const W = 297.64; const H = 419.53;
      const sortedOrders = [...orders].sort((a, b) => a.public_order_number.localeCompare(b.public_order_number));
      for (const ord of sortedOrders) {
        const page = pdfDoc.addPage([W, H]);
        let y = H - 30;
        page.drawText(ord.tracking_number || "N/A", { x: 15, y, font: fontBold, size: 16, color: rgb(0, 0, 0) });
        y -= 25;
        page.drawText(`Order: #${ord.public_order_number}`, { x: 15, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= 20;
        page.drawLine({ start: { x: 15, y }, end: { x: W - 15, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
        y -= 18;
        page.drawText(ord.customer_name, { x: 15, y, font: fontBold, size: 12, color: rgb(0, 0, 0) });
        y -= 16;
        page.drawText(ord.customer_phone, { x: 15, y, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
        y -= 18;
        const address = `${ord.address_line1}, ${ord.city}`;
        const words = address.split(" ");
        let line = "";
        for (const word of words) {
          const test = line ? line + " " + word : word;
          if (font.widthOfTextAtSize(test, 10) > W - 30) {
            page.drawText(line, { x: 15, y, font, size: 10, color: rgb(0.1, 0.1, 0.1) }); y -= 14; line = word;
          } else { line = test; }
        }
        if (line) page.drawText(line, { x: 15, y, font, size: 10, color: rgb(0.1, 0.1, 0.1) });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `labels_${id.slice(0, 8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
      await logShippingLabelsGenerated(id, actor);
      toast({ title: "Shipping labels downloaded" });
      await load();
    } catch (e: any) { toast({ title: "Error generating PDF", description: e.message, variant: "destructive" }); }
    setPrinting(null);
  };

  /* ─── Warnings ─── */
  const getWarnings = () => {
    if (!batch) return [];
    const warnings: { text: string; variant: "amber" | "red" }[] = [];
    const age = Date.now() - new Date(batch.created_at).getTime();
    if (batch.status === "OPEN" && age > 2 * 60 * 60 * 1000)
      warnings.push({ text: "This batch has been OPEN for over 2 hours.", variant: "amber" });
    if (batch.status === "LOCKED" && batch.packing_list_print_count === 0 && batch.packing_slips_print_count === 0)
      warnings.push({ text: "Batch is LOCKED but nothing has been printed.", variant: "amber" });
    if (batch.status === "RELEASED" && batch.packing_slips_print_count === 0)
      warnings.push({ text: "Batch is RELEASED but packing slips were not printed.", variant: "amber" });
    if (events.some((e) => e.event_type === "UNDO_RELEASE"))
      warnings.push({ text: "⚠️ This batch's release was previously undone. Review carefully before re-releasing.", variant: "red" });
    return warnings;
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!batch) return <p className="p-6 text-center text-muted-foreground">Batch not found.</p>;

  const warnings = getWarnings();
  const isReleased = batch.status === "RELEASED";
  const trackingCount = orders.filter(o => o.tracking_number).length;

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusColor: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    LOCKED: "bg-amber-100 text-amber-800",
    RELEASED: "bg-emerald-100 text-emerald-800",
  };

  // Group snapshot by SKU
  const skuMap = new Map<string, { orders: string[]; totalQty: number; name: string }>();
  for (const item of snapshot) {
    const ord = orders.find((o) => o.id === item.order_id);
    const num = ord?.public_order_number || item.order_id.slice(0, 8);
    if (!skuMap.has(item.sku)) skuMap.set(item.sku, { orders: [], totalQty: 0, name: item.product_name });
    const e = skuMap.get(item.sku)!;
    e.orders.push(`#${num} ×${item.qty}`);
    e.totalQty += item.qty;
  }
  const skuEntries = Array.from(skuMap.entries()).sort((a, b) => (parseInt(a[0]) || 99999) - (parseInt(b[0]) || 99999));

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/batches")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Batch {batch.id.slice(0, 8)}</h1>
          <p className="text-xs text-muted-foreground">Created {fmtDate(batch.created_at)} by {batch.created_by}</p>
        </div>
        <span className={`ml-auto px-3 py-1.5 rounded-full text-xs font-bold ${statusColor[batch.status] || "bg-muted"}`}>
          {batch.status} {isReleased && "✅"}
        </span>
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${w.variant === "red" ? "bg-destructive/10 border border-destructive/30 text-destructive" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{w.text}
        </div>
      ))}

      {/* Reprint confirmation */}
      {confirmReprint && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>This has already been printed. Are you sure you want to reprint?</span>
          <Button size="sm" variant="destructive" onClick={confirmReprint === "list" ? handlePrintList : handlePrintSlips}>Yes, Reprint</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmReprint(null)}>Cancel</Button>
        </div>
      )}

      {/* Bulk Release Confirmation */}
      {showReleaseConfirm && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <Rocket className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">This will mark all {orders.length} orders as Started (Released) and lock them from re-batching/editing. Continue?</p>
          </div>
          <Button size="sm" onClick={handleBulkRelease} disabled={releasing} className="gap-1">
            {releasing && <Loader2 className="w-3 h-3 animate-spin" />} Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowReleaseConfirm(false)}>Cancel</Button>
        </div>
      )}

      {/* Re-export confirmation */}
      {showExportConfirm && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Already exported at {fmtDate(batch.exported_at)} by {batch.exported_by}. Export again?</span>
          <Button size="sm" variant="destructive" onClick={handleCourierCSV}>Yes, Re-export</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowExportConfirm(false)}>Cancel</Button>
        </div>
      )}

      {/* Undo Release Modal */}
      {showUndoModal && (
        <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <Unlock className="w-5 h-5 text-destructive" />
            <p className="font-bold text-sm">Undo Release</p>
          </div>
          <p className="text-xs text-muted-foreground">This will revert the batch to LOCKED and clear released_at on all orders. A reason is required.</p>
          <textarea className="w-full border border-border rounded-md p-2 text-sm bg-background" rows={2} placeholder="Reason for undoing release..." value={undoReason} onChange={(e) => setUndoReason(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleUndoRelease} disabled={undoing || !undoReason.trim()} className="gap-1">
              {undoing && <Loader2 className="w-3 h-3 animate-spin" />} Confirm Undo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowUndoModal(false); setUndoReason(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Summary + Operations + Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Summary */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Orders</span><span className="font-bold">{orders.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total items</span><span className="font-bold">{snapshot.reduce((s, i) => s + i.qty, 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unique SKUs</span><span className="font-bold">{skuMap.size}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-bold">{trackingCount}/{orders.length}</span></div>
          </CardContent>
        </Card>

        {/* Operations Panel */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Operations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Packing list</span>
              {batch.packing_list_print_count > 0 ? (
                <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 className="w-3 h-3" /> {batch.packing_list_print_count}x · {fmtDate(batch.packing_list_printed_at)} · {batch.packing_list_printed_by?.split("@")[0]}
                </span>
              ) : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3" /> Not printed</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Packing slips</span>
              {batch.packing_slips_print_count > 0 ? (
                <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 className="w-3 h-3" /> {batch.packing_slips_print_count}x · {fmtDate(batch.packing_slips_printed_at)} · {batch.packing_slips_printed_by?.split("@")[0]}
                </span>
              ) : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3" /> Not printed</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Released</span>
              {batch.released_at ? (
                <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 className="w-3 h-3" /> {fmtDate(batch.released_at)} · {batch.released_by?.split("@")[0]}
                </span>
              ) : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3" /> No</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Courier CSV</span>
              {batch.export_count > 0 ? (
                <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 className="w-3 h-3" /> {batch.export_count}x · {fmtDate(batch.exported_at)} · {batch.exported_by?.split("@")[0]}
                </span>
              ) : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="w-3 h-3" /> Not exported</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tracking coverage</span>
              <span className={`text-xs font-bold ${trackingCount === orders.length ? "text-emerald-600" : "text-amber-600"}`}>
                {trackingCount}/{orders.length}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full gap-2" variant="outline" onClick={handlePrintList} disabled={printing === "list"}>
              {printing === "list" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Print Packing List
            </Button>
            <Button className="w-full gap-2" variant="outline" onClick={handlePrintSlips} disabled={printing === "slips"}>
              {printing === "slips" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              Print Packing Slips
            </Button>
            <Button className="w-full gap-2" variant="outline" onClick={handleDownloadLabels} disabled={printing === "labels"}>
              {printing === "labels" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Download Shipping Labels PDF
            </Button>
            <Button className="w-full gap-2" variant="outline" onClick={handleCourierCSV} disabled={exporting || batch.status === "OPEN"}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Courier CSV
            </Button>
            {batch.status === "OPEN" && (
              <p className="text-xs text-muted-foreground">Lock batch before exporting CSV.</p>
            )}

            {/* Tracking Import */}
            <div className="pt-1 border-t border-border">
              <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleTrackingFile} />
              <Button className="w-full gap-2" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import Tracking CSV
              </Button>
              {importResult && (
                <p className="text-xs text-emerald-600 mt-1">✓ {importResult.updated} updated, {importResult.skipped} skipped</p>
              )}
            </div>

            <div className="pt-1 border-t border-border space-y-2">
              {/* Mass Fulfill / Release */}
              {!isReleased && (
                <Button className="w-full gap-2" onClick={() => setShowReleaseConfirm(true)} disabled={releasing}>
                  <Rocket className="w-4 h-4" />
                  Mass Fulfill (Release Batch)
                </Button>
              )}
              {/* Undo Release */}
              {isReleased && (
                <Button className="w-full gap-2" variant="destructive" onClick={() => setShowUndoModal(true)}>
                  <Unlock className="w-4 h-4" />
                  Undo Release
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="packing-list">Packing List</TabsTrigger>
          <TabsTrigger value="slips">Slips Preview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Order #</th>
                  <th className="text-left px-4 py-3 font-bold">Customer</th>
                  <th className="text-left px-4 py-3 font-bold">Phone</th>
                  <th className="text-left px-4 py-3 font-bold">City</th>
                  <th className="text-left px-4 py-3 font-bold">Tracking</th>
                  <th className="text-left px-4 py-3 font-bold">Items</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => {
                  const itemCount = snapshot.filter((s) => s.order_id === ord.id).reduce((s, i) => s + i.qty, 0);
                  return (
                    <tr key={ord.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold text-primary cursor-pointer" onClick={() => navigate(`/admin/orders/${ord.id}`)}>
                        {ord.public_order_number}
                      </td>
                      <td className="px-4 py-3">{ord.customer_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ord.customer_phone}</td>
                      <td className="px-4 py-3">{ord.city}</td>
                      <td className="px-4 py-3 font-mono text-xs">{ord.tracking_number || "—"}</td>
                      <td className="px-4 py-3 font-bold">{itemCount}</td>
                      <td className="px-4 py-3">
                        {ord.released_at ? (
                          <Badge variant="default" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">Released ✅</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Packing List Tab */}
        <TabsContent value="packing-list">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-bold" style={{ width: 100 }}>SKU</th>
                  <th className="text-left px-4 py-3 font-bold">Product</th>
                  <th className="text-left px-4 py-3 font-bold">Orders</th>
                  <th className="text-left px-4 py-3 font-bold" style={{ width: 80 }}>Total Qty</th>
                </tr>
              </thead>
              <tbody>
                {skuEntries.map(([sku, entry]) => (
                  <tr key={sku} className="border-t border-border">
                    <td className="px-4 py-3 font-extrabold text-lg">{sku}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entry.name}</td>
                    <td className="px-4 py-3 text-xs">{entry.orders.join(", ")}</td>
                    <td className="px-4 py-3 font-bold text-center text-lg">{entry.totalQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Slips Preview Tab */}
        <TabsContent value="slips">
          <div className="space-y-4">
            {orders.map((ord) => {
              const items = snapshot.filter((s) => s.order_id === ord.id);
              return (
                <Card key={ord.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-sm font-bold">#{ord.public_order_number}</CardTitle>
                      <div className="flex items-center gap-2">
                        {ord.released_at && <Badge variant="default" className="bg-emerald-100 text-emerald-800 text-xs">Released ✅</Badge>}
                        {ord.tracking_number && <span className="font-mono text-xs text-muted-foreground">{ord.tracking_number}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{ord.customer_name} · {ord.customer_phone}</p>
                    <p className="text-xs text-muted-foreground">{ord.address_line1}, {ord.city}</p>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-1 font-medium text-xs text-muted-foreground">SKU</th>
                          <th className="text-left py-1 font-medium text-xs text-muted-foreground">Product</th>
                          <th className="text-center py-1 font-medium text-xs text-muted-foreground">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.id} className="border-b border-border/50">
                            <td className="py-1.5 font-bold">{i.sku}</td>
                            <td className="py-1.5 text-xs">{i.product_name}</td>
                            <td className="py-1.5 text-center font-bold">{i.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No events yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{ev.event_type}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(ev.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">by {ev.created_by || "system"}</p>
                    {Object.keys(ev.payload).length > 0 && (
                      <pre className="text-xs bg-muted/50 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(ev.payload, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminBatchDetail;