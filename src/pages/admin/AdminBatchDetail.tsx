import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Printer, PackageCheck, FileDown, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  fetchBatch, fetchBatchOrders, fetchSnapshot, fetchBatchEvents,
  printPackingList, printPackingSlips, logShippingLabelsGenerated,
  type BatchRow, type SnapshotItem, type BatchEvent,
} from "@/lib/batchService";
import { toast } from "@/hooks/use-toast";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface OrderInfo {
  id: string;
  public_order_number: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address_line1: string;
  tracking_number: string | null;
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

  const handlePrintList = async () => {
    if (!id || !batch) return;
    if (batch.packing_list_print_count > 0 && confirmReprint !== "list") {
      setConfirmReprint("list");
      return;
    }
    setPrinting("list");
    setConfirmReprint(null);
    try {
      await printPackingList(id, actor);
      toast({ title: "Packing list recorded" });
      openPackingListWindow();
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setPrinting(null);
  };

  const handlePrintSlips = async () => {
    if (!id || !batch) return;
    if (batch.packing_slips_print_count > 0 && confirmReprint !== "slips") {
      setConfirmReprint("slips");
      return;
    }
    setPrinting("slips");
    setConfirmReprint(null);
    try {
      await printPackingSlips(id, actor);
      toast({ title: "Packing slips recorded" });
      openPackingSlipsWindow();
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setPrinting(null);
  };

  /* ─── Packing List (HTML popup, grouped by SKU from snapshot) ─── */
  const openPackingListWindow = () => {
    const skuMap = new Map<string, { orders: { orderNumber: string; qty: number }[]; totalQty: number; name: string }>();
    for (const item of snapshot) {
      const ord = orders.find((o) => o.id === item.order_id);
      const orderNum = ord?.public_order_number || item.order_id.slice(0, 8);
      if (!skuMap.has(item.sku)) skuMap.set(item.sku, { orders: [], totalQty: 0, name: item.product_name });
      const entry = skuMap.get(item.sku)!;
      entry.orders.push({ orderNumber: orderNum, qty: item.qty });
      entry.totalQty += item.qty;
    }

    const skuEntries = Array.from(skuMap.entries()).sort((a, b) => (parseInt(a[0]) || 99999) - (parseInt(b[0]) || 99999));
    const today = new Date().toLocaleDateString("ka-GE");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing List</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;font-size:11pt}
.header{text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:3px solid #000}
.header h1{font-size:18pt}.header .meta{font-size:9pt;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;border:1px solid #ddd}
th{background:#f0f0f0;text-align:left;padding:8px 12px;font-size:10pt;border-bottom:2px solid #ccc}
td{padding:10px 12px;border-bottom:1px solid #eee;vertical-align:middle}
.sku-num{font-size:16pt;font-weight:900}.order-chip{display:inline-block;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:3px;padding:2px 6px;margin:2px 3px;font-size:9pt;font-weight:600}
.qty-cell{text-align:center;font-weight:bold;font-size:13pt}
@media print{body{padding:10px}}
</style></head><body>
<div class="header"><h1>📦 PACKING LIST</h1><div class="meta">${today} | ${orders.length} orders | Batch ${id?.slice(0, 8)}</div></div>
<table><thead><tr><th style="width:140px">SKU</th><th>Product</th><th>Orders</th><th style="width:60px;text-align:center">Total</th></tr></thead><tbody>
${skuEntries.map(([sku, e]) => `<tr><td><span class="sku-num">${sku}</span></td><td style="font-size:9pt;color:#666">${e.name}</td><td>${e.orders.map(o => `<span class="order-chip">#${o.orderNumber} ×${o.qty}</span>`).join(" ")}</td><td class="qty-cell">${e.totalQty}</td></tr>`).join("")}
</tbody></table></body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ─── Packing Slips (one per order, from snapshot) ─── */
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
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;font-size:10pt}
.slip{border:1px solid #ccc;padding:15px;margin-bottom:20px;border-radius:4px}
.slip-header{display:flex;justify-content:space-between;font-size:12pt;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px}
.info{margin-bottom:10px;line-height:1.5}.tracking{font-family:monospace;font-weight:bold;margin-top:4px}
table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:6px 10px;border-bottom:2px solid #ccc;font-size:9pt}
td{padding:8px 10px;border-bottom:1px solid #eee}
@media print{.slip{border:none;page-break-inside:avoid}}
</style></head><body>${slipsHtml}</body></html>`;

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

      // A6: 105mm x 148mm ≈ 297.64 x 419.53 points
      const W = 297.64;
      const H = 419.53;

      const sortedOrders = [...orders].sort((a, b) => a.public_order_number.localeCompare(b.public_order_number));

      for (const ord of sortedOrders) {
        const page = pdfDoc.addPage([W, H]);
        let y = H - 30;

        // Tracking (large)
        const trackingText = ord.tracking_number || "N/A";
        page.drawText(trackingText, { x: 15, y, font: fontBold, size: 16, color: rgb(0, 0, 0) });
        y -= 25;

        // Order ID
        page.drawText(`Order: #${ord.public_order_number}`, { x: 15, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= 20;

        // Line
        page.drawLine({ start: { x: 15, y }, end: { x: W - 15, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
        y -= 18;

        // Customer name
        page.drawText(ord.customer_name, { x: 15, y, font: fontBold, size: 12, color: rgb(0, 0, 0) });
        y -= 16;

        // Phone
        page.drawText(ord.customer_phone, { x: 15, y, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
        y -= 18;

        // Address (wrap roughly)
        const address = `${ord.address_line1}, ${ord.city}`;
        const words = address.split(" ");
        let line = "";
        for (const word of words) {
          const test = line ? line + " " + word : word;
          if (font.widthOfTextAtSize(test, 10) > W - 30) {
            page.drawText(line, { x: 15, y, font, size: 10, color: rgb(0.1, 0.1, 0.1) });
            y -= 14;
            line = word;
          } else {
            line = test;
          }
        }
        if (line) {
          page.drawText(line, { x: 15, y, font, size: 10, color: rgb(0.1, 0.1, 0.1) });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labels_${id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await logShippingLabelsGenerated(id, actor);
      toast({ title: "Shipping labels downloaded" });
      await load();
    } catch (e: any) {
      toast({ title: "Error generating PDF", description: e.message, variant: "destructive" });
    }
    setPrinting(null);
  };

  /* ─── Warnings ─── */
  const getWarnings = () => {
    if (!batch) return [];
    const warnings: string[] = [];
    const age = Date.now() - new Date(batch.created_at).getTime();
    if (batch.status === "OPEN" && age > 2 * 60 * 60 * 1000) {
      warnings.push("This batch has been OPEN for over 2 hours.");
    }
    if (batch.status === "LOCKED" && batch.packing_list_print_count === 0 && batch.packing_slips_print_count === 0) {
      warnings.push("Batch is LOCKED but nothing has been printed.");
    }
    if (batch.status === "RELEASED" && batch.packing_slips_print_count === 0) {
      warnings.push("Batch is RELEASED but packing slips were not printed.");
    }
    return warnings;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!batch) return <p className="p-6 text-center text-muted-foreground">Batch not found.</p>;

  const warnings = getWarnings();
  const _isLocked = batch.status !== "OPEN";

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusColor: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    LOCKED: "bg-amber-100 text-amber-800",
    RELEASED: "bg-emerald-100 text-emerald-800",
  };

  // Group snapshot by SKU for packing list tab
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
          {batch.status}
        </span>
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {w}
        </div>
      ))}

      {/* Reprint confirmation */}
      {confirmReprint && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>This has already been printed. Are you sure you want to reprint?</span>
          <Button size="sm" variant="destructive" onClick={confirmReprint === "list" ? handlePrintList : handlePrintSlips}>
            Yes, Reprint
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmReprint(null)}>Cancel</Button>
        </div>
      )}

      {/* Summary + Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Orders</span><span className="font-bold">{orders.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total items</span><span className="font-bold">{snapshot.reduce((s, i) => s + i.qty, 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unique SKUs</span><span className="font-bold">{skuMap.size}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Packing list printed</span><span>{batch.packing_list_print_count}x {batch.packing_list_printed_at ? `(${fmtDate(batch.packing_list_printed_at)})` : ""}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Slips printed</span><span>{batch.packing_slips_print_count}x {batch.packing_slips_printed_at ? `(${fmtDate(batch.packing_slips_printed_at)})` : ""}</span></div>
            {batch.released_at && <div className="flex justify-between"><span className="text-muted-foreground">Released</span><span className="font-bold text-emerald-600">{fmtDate(batch.released_at)}</span></div>}
          </CardContent>
        </Card>

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
                      {ord.tracking_number && <span className="font-mono text-xs text-muted-foreground">{ord.tracking_number}</span>}
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
