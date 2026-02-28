import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Printer, PackageCheck, FileDown, AlertTriangle, Clock, Unlock, Rocket, Download, Upload, CheckCircle2, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { openPackingListWindow as openPackingListGrouped } from "@/components/admin/PackingListView";
import type { StickerOrder } from "@/components/admin/StickerPrintView";
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
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import notoRegularUrl from "@/assets/fonts/NotoSansGeorgian-Regular.ttf";
import notoBoldUrl from "@/assets/fonts/NotoSansGeorgian-Bold.ttf";

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
  const [importResult, setImportResult] = useState<{ updated: number; skipped: number; overwritten?: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [singleQtyMode, setSingleQtyMode] = useState(false);
  const [packedMap, setPackedMap] = useState<Record<string, boolean>>({}); // key: `${orderId}::${sku}`
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

      const xlsxRows: string[][] = [];
      xlsxRows.push(sortedCols);

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
            case "item_quantities": return singleQtyMode ? "1" : String(totalQty);
            case "order_id": return ord.public_order_number || "";
            case "item_skus": return singleQtyMode ? `${skus} / ${ord.public_order_number}` : skus;
            case "total": return String(ord.total || 0);
            case "notes": return ord.notes_customer || "";
            default: return "";
          }
        });
        xlsxRows.push(row);
      }

      // Generate XLSX
      const ws = XLSX.utils.aoa_to_sheet(xlsxRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Courier");
      XLSX.writeFile(wb, `courier_batch_${id.slice(0, 8)}.xlsx`);

      await recordCourierExport(id, actor, orders.length);
      toast({ title: "Courier XLSX downloaded" });
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
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Parse as raw 2D array to find the real header row
      const rawData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
      if (rawData.length < 2) throw new Error("File must have at least a header row and 1 data row");

      // Find the header row: look for row containing tracking/order keywords
      // The file may have a merged title row first (e.g. "შეკვეთების ისტორია")
      const TRACKING_KEYWORDS = ["თრექინგი", "tracking", "tracking_number", "track"];
      const ORDER_KEYWORDS = ["შეკვეთის ნომერი", "order_id", "order", "h"];

      let headerRowIdx = -1;
      let trackingColIdx = -1;
      let orderColIdx = -1;

      for (let r = 0; r < Math.min(10, rawData.length); r++) {
        const row = rawData[r].map(c => String(c || "").trim().toLowerCase());
        const tIdx = row.findIndex(cell => TRACKING_KEYWORDS.some(k => cell.includes(k.toLowerCase())));
        const oIdx = row.findIndex(cell => ORDER_KEYWORDS.some(k => cell === k.toLowerCase() || cell.includes(k.toLowerCase())));
        if (tIdx !== -1 && oIdx !== -1) {
          headerRowIdx = r;
          trackingColIdx = tIdx;
          orderColIdx = oIdx;
          break;
        }
      }

      if (headerRowIdx === -1) throw new Error("Could not find tracking and order number columns in file. Expected columns: თრექინგი, შეკვეთის ნომერი (or tracking_number, order_id)");

      // Parse data rows (everything after header)
      const rows: { order_id: string; tracking_number: string }[] = [];
      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r];
        const tracking = String(row[trackingColIdx] || "").trim();
        const orderRef = String(row[orderColIdx] || "").trim();
        if (!orderRef || !tracking) continue;

        const matchedOrder = orders.find(o => o.public_order_number === orderRef || o.id === orderRef);
        if (matchedOrder) {
          rows.push({ order_id: matchedOrder.id, tracking_number: tracking });
        }
        // Skip orders not in this batch (e.g. from full courier export)
      }

      if (rows.length === 0) throw new Error("No valid rows found");

      const result = await importTrackingForBatch(id, actor, rows);
      setImportResult(result);
      const overwriteMsg = result.overwritten ? `, ${result.overwritten} overwritten` : "";
      toast({ title: "Tracking imported", description: `${result.updated} updated, ${result.skipped} skipped${overwriteMsg}` });
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

  /* ─── Packing List (grouped by 20, using shared component) ─── */
  const openPackingListWindow = () => {
    const stickerOrders: StickerOrder[] = orders.map(ord => {
      const items = snapshot.filter(s => s.order_id === ord.id);
      return {
        orderId: ord.id,
        publicOrderNumber: ord.public_order_number,
        customerName: ord.customer_name || "",
        address: ord.normalized_address || ord.address_line1 || "",
        city: ord.normalized_city || ord.city || "",
        phone: ord.customer_phone || "",
        tracking: ord.tracking_number || "",
        items: items.map(i => ({ sku: i.sku, quantity: i.qty, title: i.product_name })),
      };
    });
    openPackingListGrouped(stickerOrders, navigate);
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

  /* ─── Shipping Labels PDF (4×3 inch, one sticker per SKU line, Georgian + QR) ─── */
  const handleDownloadLabels = async () => {
    if (!id) return;
    setPrinting("labels");
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Load Georgian fonts (with fallback to standard fonts)
      let font, fontBold;
      try {
        const [regBytes, boldBytes] = await Promise.all([
          fetch(notoRegularUrl).then(r => r.arrayBuffer()),
          fetch(notoBoldUrl).then(r => r.arrayBuffer()),
        ]);
        font = await pdfDoc.embedFont(regBytes, { subset: true });
        fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
      } catch (fontErr) {
        console.warn("Georgian font embedding failed, falling back to Helvetica:", fontErr);
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }
      const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
      const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

      // 4 × 3 inches in points (1 inch = 72 pt)
      const W = 4 * 72; // 288
      const H = 3 * 72; // 216
      const M = 10; // margin

      // Build one sticker per SKU line item
      const stickers: { seq: number; ord: OrderInfo; sku: string; productName: string }[] = [];
      let seq = 1;
      const sortedOrders = [...orders].sort((a, b) => a.public_order_number.localeCompare(b.public_order_number));
      for (const ord of sortedOrders) {
        const items = snapshot.filter(s => s.order_id === ord.id);
        for (const item of items) {
          stickers.push({ seq: seq++, ord, sku: item.sku, productName: item.product_name });
        }
      }

      const totalPages = stickers.length;
      const today = new Date().toLocaleDateString("ka-GE");

      // Helper: draw text with word-wrap, returns new y
      const drawWrapped = (page: any, text: string, x: number, y: number, maxW: number, f: any, size: number, color = rgb(0, 0, 0)): number => {
        const words = text.split(" ");
        let line = "";
        for (const word of words) {
          const test = line ? line + " " + word : word;
          if (f.widthOfTextAtSize(test, size) > maxW) {
            if (line) { page.drawText(line, { x, y, font: f, size, color }); y -= size + 2; }
            line = word;
          } else { line = test; }
        }
        if (line) { page.drawText(line, { x, y, font: f, size, color }); y -= size + 2; }
        return y;
      };

      for (const s of stickers) {
        const page = pdfDoc.addPage([W, H]);
        let y = H - M - 8;

        // Top line: seq / total + date
        page.drawText(`#${s.seq} / ${totalPages}`, { x: M, y, font, size: 7, color: rgb(0.4, 0.4, 0.4) });
        const dateW = font.widthOfTextAtSize(today, 7);
        page.drawText(today, { x: W - M - dateW, y, font, size: 7, color: rgb(0.4, 0.4, 0.4) });
        y -= 10;
        page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

        // Sender
        y -= 2;
        page.drawText("გამგზ: BIGMART", { x: M, y, font: fontBold, size: 8, color: rgb(0.2, 0.2, 0.2) });
        y -= 12;

        // Recipient
        page.drawText(s.ord.customer_name, { x: M, y, font: fontBold, size: 10, color: rgb(0, 0, 0) });
        y -= 13;

        const addr = s.ord.normalized_address || s.ord.address_line1 || "";
        y = drawWrapped(page, addr, M, y, W - 2 * M, font, 8, rgb(0.1, 0.1, 0.1));

        const city = s.ord.normalized_city || s.ord.city || "";
        page.drawText(city, { x: M, y, font, size: 8, color: rgb(0.1, 0.1, 0.1) });
        y -= 11;

        page.drawText(s.ord.customer_phone, { x: M, y, font, size: 8, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;

        // Divider
        page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

        // ── QR Code + Tracking side by side ──
        const qrData = [
          "TRACK:" + (s.ord.tracking_number || ""),
          "SKU:" + s.sku,
          "ORD:" + s.ord.public_order_number,
          "ADDR:" + addr + ", " + city,
          "NAME:" + s.ord.customer_name,
          "SENDER:BIGMART",
          "QTY:1",
        ].join("|");

        const qrSize = 70; // points
        try {
          const qrDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 0, errorCorrectionLevel: "L" });
          const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
          const qrImage = await pdfDoc.embedPng(qrImageBytes);
          page.drawImage(qrImage, { x: M, y: y - qrSize + 4, width: qrSize, height: qrSize });
        } catch { /* QR generation failed, skip */ }

        // Tracking info (right of QR)
        const txStart = M + qrSize + 8;
        page.drawText("თრექინგი", { x: txStart, y, font, size: 6, color: rgb(0.6, 0.6, 0.6) });
        y -= 14;
        const trackText = s.ord.tracking_number || "N/A";
        page.drawText(trackText, { x: txStart, y, font: fontMonoBold, size: 11, color: rgb(0, 0, 0) });
        y -= 12;
        page.drawText("რაოდენობა: 1", { x: txStart, y, font, size: 7, color: rgb(0.35, 0.35, 0.35) });

        // Order number
        const ordText = `#${s.ord.public_order_number}`;
        const ordW = fontMono.widthOfTextAtSize(ordText, 8);
        page.drawText(ordText, { x: W - M - ordW, y, font: fontMono, size: 8, color: rgb(0.3, 0.3, 0.3) });

        // SKU at bottom — large, bold, centered
        const skuSize = 20;
        const skuW = fontBold.widthOfTextAtSize(s.sku, skuSize);
        const skuX = (W - skuW) / 2;
        const skuY = M + 6;
        page.drawLine({ start: { x: M, y: skuY + skuSize + 4 }, end: { x: W - M, y: skuY + skuSize + 4 }, thickness: 2, color: rgb(0, 0, 0) });
        page.drawText(s.sku, { x: skuX, y: skuY, font: fontBold, size: skuSize, color: rgb(0, 0, 0) });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `labels_${id.slice(0, 8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
      await logShippingLabelsGenerated(id, actor);
      toast({ title: "Shipping labels downloaded", description: `${totalPages} sticker(s) generated` });
      await load();
    } catch (e: any) { toast({ title: "Error generating PDF", description: e.message, variant: "destructive" }); }
    setPrinting(null);
  };

  /* ─── Picking Stickers PDF (4×3 inch, one per unit, sorted by SKU) ─── */
  const handlePickingStickers = async () => {
    if (!id) return;
    setPrinting("picking");
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      let font, fontBold;
      try {
        const [regBytes, boldBytes] = await Promise.all([
          fetch(notoRegularUrl).then(r => r.arrayBuffer()),
          fetch(notoBoldUrl).then(r => r.arrayBuffer()),
        ]);
        font = await pdfDoc.embedFont(regBytes, { subset: true });
        fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
      } catch {
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }

      const W = 4 * 72; // 288pt
      const H = 3 * 72; // 216pt
      const M = 12;

      // Build sticker entries: one per unit, sorted by SKU
      const entries: { sku: string; orderNum: string; customerName: string }[] = [];
      for (const item of snapshot) {
        const ord = orders.find(o => o.id === item.order_id);
        if (!ord) continue;
        for (let u = 0; u < item.qty; u++) {
          entries.push({
            sku: item.sku,
            orderNum: ord.public_order_number,
            customerName: ord.customer_name,
          });
        }
      }
      entries.sort((a, b) => (parseInt(a.sku) || 99999) - (parseInt(b.sku) || 99999));

      const total = entries.length;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const page = pdfDoc.addPage([W, H]);

        // ── Top line: seq / total ──
        const seqText = `${i + 1} / ${total}`;
        page.drawText(seqText, { x: W - M - font.widthOfTextAtSize(seqText, 8), y: H - M - 8, font, size: 8, color: rgb(0.5, 0.5, 0.5) });

        // ── SKU — huge, centered, top area ──
        const skuSize = 56;
        const skuW = fontBold.widthOfTextAtSize(e.sku, skuSize);
        page.drawText(e.sku, { x: (W - skuW) / 2, y: H - 80, font: fontBold, size: skuSize, color: rgb(0, 0, 0) });

        // ── Divider ──
        const divY = H - 95;
        page.drawLine({ start: { x: M, y: divY }, end: { x: W - M, y: divY }, thickness: 2, color: rgb(0, 0, 0) });

        // ── Order number — large ──
        const orderText = `#${e.orderNum}`;
        const orderSize = 36;
        const orderW = fontBold.widthOfTextAtSize(orderText, orderSize);
        page.drawText(orderText, { x: (W - orderW) / 2, y: divY - 45, font: fontBold, size: orderSize, color: rgb(0, 0, 0) });

        // ── Customer name — medium ──
        const nameSize = 16;
        const nameW = font.widthOfTextAtSize(e.customerName, nameSize);
        const nameX = Math.max(M, (W - nameW) / 2);
        page.drawText(e.customerName, { x: nameX, y: M + 10, font, size: nameSize, color: rgb(0.2, 0.2, 0.2) });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `picking_stickers_${id.slice(0, 8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Picking stickers downloaded", description: `${total} sticker(s) generated` });
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

  // Group snapshot by SKU — include per-order detail
  const skuMap = new Map<string, { orderDetails: { orderId: string; orderNum: string; qty: number }[]; totalQty: number; name: string }>();
  for (const item of snapshot) {
    const ord = orders.find((o) => o.id === item.order_id);
    const num = ord?.public_order_number || item.order_id.slice(0, 8);
    if (!skuMap.has(item.sku)) skuMap.set(item.sku, { orderDetails: [], totalQty: 0, name: item.product_name });
    const e = skuMap.get(item.sku)!;
    e.orderDetails.push({ orderId: item.order_id, orderNum: num, qty: item.qty });
    e.totalQty += item.qty;
  }
  const skuEntries = Array.from(skuMap.entries()).sort((a, b) => (parseInt(a[0]) || 99999) - (parseInt(b[0]) || 99999));

  // Compute which orders are fully packed (all their SKUs checked)
  const allSkusForOrder = new Map<string, string[]>();
  for (const item of snapshot) {
    if (!allSkusForOrder.has(item.order_id)) allSkusForOrder.set(item.order_id, []);
    allSkusForOrder.get(item.order_id)!.push(item.sku);
  }
  const isOrderFullyPacked = (orderId: string) => {
    const skus = allSkusForOrder.get(orderId) || [];
    return skus.length > 0 && skus.every(sku => packedMap[`${orderId}::${sku}`]);
  };

  const togglePacked = (orderId: string, sku: string) => {
    const key = `${orderId}::${sku}`;
    setPackedMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const packedOrderCount = orders.filter(o => isOrderFullyPacked(o.id)).length;

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
              <span className="text-muted-foreground">Courier XLSX</span>
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
            <Button className="w-full gap-2" variant="outline" onClick={handlePickingStickers} disabled={printing === "picking"}>
              {printing === "picking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Download Picking Stickers PDF
            </Button>
            <Button className="w-full gap-2" variant="outline" onClick={handleCourierCSV} disabled={exporting || batch.status === "OPEN"}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Courier XLSX
            </Button>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={singleQtyMode} onCheckedChange={(v) => setSingleQtyMode(v === true)} />
              <span className="text-xs text-muted-foreground">Qty=1, SKU / OrderID format</span>
            </label>
            {batch.status === "OPEN" && (
              <p className="text-xs text-muted-foreground">Lock batch before exporting CSV.</p>
            )}

            {/* Tracking Import */}
            <div className="pt-1 border-t border-border">
              <input type="file" ref={fileInputRef} accept=".xlsx,.xls" className="hidden" onChange={handleTrackingFile} />
              <Button className="w-full gap-2" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import Tracking XLSX
              </Button>
              {importResult && (
                <p className="text-xs text-emerald-600 mt-1">
                  ✓ {importResult.updated} updated, {importResult.skipped} skipped
                  {importResult.overwritten ? `, ${importResult.overwritten} overwritten` : ""}
                </p>
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

        <TabsContent value="packing-list">
          {packedOrderCount > 0 && (
            <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-bold">{packedOrderCount}/{orders.length}</span> orders fully packed
            </div>
          )}
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
                  <tr key={sku} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-extrabold text-lg">{sku}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entry.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {entry.orderDetails.map((od) => {
                          const key = `${od.orderId}::${sku}`;
                          const checked = !!packedMap[key];
                          const fullyPacked = isOrderFullyPacked(od.orderId);
                          return (
                            <button
                              key={od.orderId}
                              onClick={() => togglePacked(od.orderId, sku)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all ${
                                fullyPacked
                                  ? "bg-emerald-100 border-emerald-300 text-emerald-800 line-through opacity-60"
                                  : checked
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-muted/50 border-border text-foreground hover:bg-muted"
                              }`}
                            >
                              {(checked || fullyPacked) && <CheckCircle2 className="w-3 h-3" />}
                              #{od.orderNum} ×{od.qty}
                            </button>
                          );
                        })}
                      </div>
                    </td>
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