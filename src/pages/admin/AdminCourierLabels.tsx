import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, Loader2 } from "lucide-react";
import { downloadCourierLabelsPdf, type CourierLabelOrder } from "@/components/CourierLabel";

/**
 * Print courier shipping labels for orders that already have a tracking
 * number (imported back from the courier's tracking-augmented CSV).
 * Select some or all, then Print — one label per physical sticker.
 */

interface Row {
  id: string;
  public_order_number: string | null;
  customer_phone: string | null;
  tracking_number: string | null;
  courier_zone_id: number | null;
  courier_label_text: string | null;
  courier_label_date: string | null;
  normalized_address: string | null;
  raw_address: string | null;
  normalized_city: string | null;
  raw_city: string | null;
}

interface UploadBatch {
  id: string;
  file_name: string | null;
  uploaded_at: string | null;
  order_count: number | null;
}

export default function AdminCourierLabels() {
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");

  const loadBatches = async () => {
    const { data, error } = await (supabase.from("courier_import_batches") as any)
      .select("id, file_name, uploaded_at, order_count")
      .order("uploaded_at", { ascending: false })
      .limit(30);
    if (error) {
      toast({ title: "Failed to load uploads", description: error.message, variant: "destructive" });
    } else {
      setBatches((data as UploadBatch[]) || []);
    }
  };

  const load = async (batchId: string | null) => {
    setLoading(true);
    let q = (supabase.from("orders") as any)
      .select(
        "id, public_order_number, customer_phone, tracking_number, courier_zone_id, courier_label_text, courier_label_date, normalized_address, raw_address, normalized_city, raw_city"
      )
      .not("tracking_number", "is", null);
    if (batchId) q = q.eq("courier_import_batch_id", batchId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    load(activeBatch);
    setSelected(new Set());
  }, [activeBatch]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  const toLabelOrder = (r: Row): CourierLabelOrder => ({
    id: r.id,
    tracking_number: r.tracking_number,
    courier_zone_id: r.courier_zone_id,
    courier_label_text: r.courier_label_text,
    courier_label_date: r.courier_label_date,
    customer_phone: r.customer_phone,
    address: r.normalized_address || r.raw_address || "",
    city: r.normalized_city || r.raw_city || "",
  });

  const term = search.trim().toLowerCase();
  const visibleRows = term
    ? rows.filter((r) =>
        [r.public_order_number, r.customer_phone, r.tracking_number, r.normalized_city, r.raw_city]
          .some((v) => (v || "").toLowerCase().includes(term))
      )
    : rows;

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const handleDownload = async () => {
    setGenerating(true);
    try {
      await downloadCourierLabelsPdf(
        selectedRows.map(toLabelOrder),
        `courier-labels-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Courier labels</h1>
        <Button onClick={handleDownload} disabled={generating || selectedRows.length === 0}>
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          {generating
            ? "Generating…"
            : `Download PDF ${selectedRows.length > 0 ? `(${selectedRows.length})` : ""}`}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">Recent uploads</h2>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courier uploads yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeBatch === null ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveBatch(null)}
              >
                All tracked orders
              </Button>
              {batches.map((b) => (
                <Button
                  key={b.id}
                  variant={activeBatch === b.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveBatch(b.id)}
                  className="flex-col items-start h-auto py-1.5"
                >
                  <span className="text-xs">
                    {b.uploaded_at ? new Date(b.uploaded_at).toLocaleString() : "—"}
                  </span>
                  <span className="text-[11px] opacity-70">{b.order_count ?? 0} orders</span>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleAll} disabled={visibleRows.length === 0}>
                {selected.size === rows.length && rows.length > 0 ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order / phone / tracking"
                className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
              />
              <span className="text-muted-foreground">{visibleRows.length} shown</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">
              {rows.length === 0
                ? "No orders with a tracking number yet — import the courier's tracking file first."
                : "No orders match your search."}
            </div>
          ) : (
            <div className="divide-y">
              {visibleRows.map((r) => (
                <label key={r.id} className="flex items-start gap-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {r.public_order_number} · {r.customer_phone}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.normalized_city || r.raw_city} · zone {r.courier_zone_id ?? "?"} · #
                      {r.tracking_number}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
