import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X } from "lucide-react";
import * as XLSX from "xlsx";
import { logSystemEvent, logSystemEventFailed } from "@/lib/systemEventService";

const COLUMN_HEADERS: Record<string, string> = {
  A: "Shipping First Name",
  B: "Shipping Address 1 & 2",
  C: "Shipping City",
  D: "დამატებით ლოკაცია",
  E: "Shipping Address Phone",
  F: "წონა",
  G: "Order Item Quantity",
  H: "Order Number",
  I: "SKU",
  J: "დამატებიტი სერვისი",
  K: "Total Price Presentment Amount",
  L: "დამატებით სერვისებს და შიპინგს იხდის მიმღები",
  M: "ტერმინალი",
  N: "SPO",
  O: "Note",
  P: "გამგზავნის სახელი",
  Q: "გამგზავნის მისამართი",
  R: "გამგზავნის ქალაქი",
  S: "გამგზავნის ტელეფონი",
  T: "გამგზავნი კომპანია",
  U: "მომსახურების დონე",
  V: "თიფი",
};

interface ExportPreview {
  count: number;
  earliest: string | null;
  latest: string | null;
  totalSum: number;
}

interface OrdersExportModalProps {
  open: boolean;
  onClose: () => void;
}

const OrdersExportModal = ({ open, onClose }: OrdersExportModalProps) => {
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/export-courier?action=preview`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
      .then((r) => r.json())
      .then((data) => {
        setPreview(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  const handleDownload = async () => {
    setDownloading(true);
    const batchId = crypto.randomUUID();
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-courier?action=download`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const { rows, includeHeaders, columns } = data;

      const sheetData: string[][] = [];
      if (includeHeaders) {
        sheetData.push(columns.map((c: string) => COLUMN_HEADERS[c] || c));
      }
      sheetData.push(...rows);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `courier_export_${new Date().toISOString().slice(0, 10)}.xlsx`);

      await logSystemEvent({
        entityType: "export_batch",
        entityId: batchId,
        eventType: "COURIER_EXPORT_CREATE",
        actorId: "admin",
        payload: { order_count: rows.length },
      });

      onClose();
    } catch (e: any) {
      console.error("Export failed:", e);
      await logSystemEventFailed({
        entityType: "export_batch",
        entityId: batchId,
        eventType: "COURIER_EXPORT_CREATE",
        actorId: "admin",
        errorMessage: e?.message || String(e),
      });
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Export Confirmed Orders</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Orders ready</span>
                <span className="font-bold text-lg">{preview.count}</span>
              </div>
              {preview.earliest && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Earliest</span>
                  <span>{new Date(preview.earliest).toLocaleDateString("ka-GE")}</span>
                </div>
              )}
              {preview.latest && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Latest</span>
                  <span>{new Date(preview.latest).toLocaleDateString("ka-GE")}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total sum</span>
                <span className="font-bold">{preview.totalSum.toFixed(1)} ₾</span>
              </div>
            </div>

            {preview.count === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No orders ready for export. Orders must be confirmed, not fulfilled, and not under review.</p>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleDownload} disabled={downloading} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  {downloading ? "Exporting..." : `Export ${preview.count} orders`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Failed to load preview.</p>
        )}
      </div>
    </div>
  );
};

export default OrdersExportModal;
