import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import { logSystemEvent, logSystemEventFailed } from "@/lib/systemEventService";

const ONWAY_COLUMN_HEADERS: Record<string, string> = {
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

type CourierService = "onway" | "trackings";

const COURIER_OPTIONS: { value: CourierService; label: string; description: string }[] = [
  { value: "onway", label: "ONWAY", description: "22-column XLSX template" },
  { value: "trackings", label: "TRACKINGS.GE", description: "29-column XLSM template" },
];

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
  const [courier, setCourier] = useState<CourierService>("onway");

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
    const fileName = `${courier}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-courier?action=download&courier=${courier}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const { rows, includeHeaders, columns, orderIds } = data;

      const sheetData: string[][] = [];
      if (includeHeaders) {
        if (courier === "onway") {
          sheetData.push(columns.map((c: string) => ONWAY_COLUMN_HEADERS[c] || c));
        } else {
          // TRACKINGS.GE columns are already Georgian labels
          sheetData.push(columns);
        }
      }
      sheetData.push(...rows);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, fileName);

      // Create export batch record
      await (supabase.from("export_batches") as any).insert({
        id: batchId,
        created_by: "admin",
        order_count: rows.length,
        template_name: courier,
        file_name: fileName,
        status: "completed",
      });

      if (orderIds && Array.isArray(orderIds)) {
        const exportRows = orderIds.map((oid: string, i: number) => ({
          batch_id: batchId,
          order_id: oid,
          public_order_number: rows[i]?.[courier === "onway" ? columns.indexOf("H") : 26] || "",
          snapshot_json: { row_data: rows[i] },
        }));
        if (exportRows.length > 0) {
          await (supabase.from("export_rows") as any).insert(exportRows);
        }
      }

      await logSystemEvent({
        entityType: "export_batch",
        entityId: batchId,
        eventType: "COURIER_EXPORT_CREATE",
        actorId: "admin",
        payload: { order_count: rows.length, file_name: fileName, courier },
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
          <h2 className="text-lg font-bold">Export to Courier</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Courier selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Courier Service</label>
          <div className="grid grid-cols-2 gap-2">
            {COURIER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCourier(opt.value)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  courier === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Truck className={`w-4 h-4 ${courier === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-bold text-sm">{opt.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{opt.description}</p>
              </button>
            ))}
          </div>
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
              <p className="text-sm text-muted-foreground text-center">No orders ready for export.</p>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleDownload} disabled={downloading} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  {downloading ? "Exporting..." : `Export ${preview.count} → ${courier === "onway" ? "ONWAY" : "TRACKINGS.GE"}`}
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
