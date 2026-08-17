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
  created_at: string | null;
  applied_at: string | null;
  matched: number | null;
}

interface LabelGroup {
  key: string;
  title: string;
  rows: Row[];
}

export default function AdminCourierLabels() {
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [groups, setGroups] = useState<LabelGroup[]>([]);
  const [search, setSearch] = useState("");


  const loadBatches = async () => {
    // Tracking imports are written by MassFulfillModal into import_batches
    // (+ import_staging_rows), not by the import-courier edge function.
    const { data, error } = await (supabase.from("import_batches") as any)
      .select("id, file_name, created_at, applied_at, matched")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      toast({ title: "Failed to load uploads", description: error.message, variant: "destructive" });
    } else {
      setBatches((data as UploadBatch[]) || []);
    }
  };

  const ORDER_COLS =
    "id, public_order_number, customer_phone, tracking_number, courier_zone_id, courier_label_text, courier_label_date, normalized_address, raw_address, normalized_city, raw_city";

  const load = async (batchId: string | null) => {
    setLoading(true);
    try {
      if (batchId) {
        // Orders touched by this upload = staging rows that matched an order.
        const { data: staged, error: sErr } = await (supabase.from("import_staging_rows") as any)
          .select("matched_order_id")
          .eq("batch_id", batchId)
          .not("matched_order_id", "is", null)
          .limit(2000);
        if (sErr) throw sErr;
        const ids = Array.from(
          new Set(((staged as { matched_order_id: string }[]) || []).map((s) => s.matched_order_id))
        );
        if (ids.length === 0) {
          setRows([]);
          return;
        }
        const collected: Row[] = [];
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data, error } = await (supabase.from("orders") as any)
            .select(ORDER_COLS)
            .in("id", ids.slice(i, i + CHUNK));
          if (error) throw error;
          collected.push(...((data as Row[]) || []));
        }
        collected.sort((a, b) =>
          (b.public_order_number || "").localeCompare(a.public_order_number || "")
        );
        setRows(collected);
      } else {
        const { data, error } = await (supabase.from("orders") as any)
          .select(ORDER_COLS)
          .not("tracking_number", "is", null)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        setRows((data as Row[]) || []);
      }
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Build print groups: Singles + Round 1, then one group per extra round.
  const buildGroups = async (list: Row[]) => {
    if (list.length === 0) {
      setGroups([]);
      return;
    }
    const ids = list.map((r) => r.id);
    const CHUNK = 200;
    const classification = new Map<string, string>();
    const slotRunId = new Map<string, string>();
    const runNumber = new Map<string, number>();
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const [{ data: pwo }, { data: slots }] = await Promise.all([
          (supabase.from("packing_wave_orders") as any)
            .select("order_id, classification")
            .in("order_id", slice),
          (supabase.from("packing_run_slots") as any).select("order_id, run_id").in("order_id", slice),
        ]);
        ((pwo as any[]) || []).forEach((r) => classification.set(r.order_id, r.classification));
        ((slots as any[]) || []).forEach((r) => slotRunId.set(r.order_id, r.run_id));
      }
      const runIds = Array.from(new Set(Array.from(slotRunId.values())));
      for (let i = 0; i < runIds.length; i += CHUNK) {
        const { data: runs } = await (supabase.from("packing_runs") as any)
          .select("id, run_number")
          .in("id", runIds.slice(i, i + CHUNK));
        ((runs as any[]) || []).forEach((r) => runNumber.set(r.id, r.run_number));
      }
    } catch (e: any) {
      toast({ title: "Failed to group orders", description: e.message, variant: "destructive" });
    }

    const first: Row[] = [];
    const byRound = new Map<number, Row[]>();
    for (const r of list) {
      const isMulti = classification.get(r.id) === "multi_sku";
      const rn = isMulti ? runNumber.get(slotRunId.get(r.id) || "") : undefined;
      if (!isMulti || !rn || rn <= 1) {
        first.push(r);
      } else {
        if (!byRound.has(rn)) byRound.set(rn, []);
        byRound.get(rn)!.push(r);
      }
    }
    const next: LabelGroup[] = [{ key: "singles-r1", title: "Singles + Round 1", rows: first }];
    Array.from(byRound.keys())
      .sort((a, b) => a - b)
      .forEach((rn) => next.push({ key: `round-${rn}`, title: `Round ${rn}`, rows: byRound.get(rn)! }));
    setGroups(next.filter((g) => g.rows.length > 0));
  };

  const downloadGroup = async (g: LabelGroup) => {
    setGroupBusy(g.key);
    try {
      await downloadCourierLabelsPdf(
        g.rows.map(toLabelOrder),
        `courier-labels-${g.key}-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGroupBusy(null);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    load(activeBatch);
    setSelected(new Set());
  }, [activeBatch]);

  useEffect(() => {
    buildGroups(rows);
  }, [rows]);


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
      <h1 className="text-2xl font-semibold">Courier labels</h1>


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
                    {(() => {
                      const ts = b.applied_at || b.created_at;
                      return ts ? new Date(ts).toLocaleString() : "—";
                    })()}
                  </span>
                  <span className="text-[11px] opacity-70">{b.matched ?? 0} orders</span>

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
