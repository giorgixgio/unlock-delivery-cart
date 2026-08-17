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

  // Build print groups from actual order_items SKU counts:
  //  - 1 distinct SKU  => "Singles" (one group, sorted by SKU ascending)
  //  - >1 distinct SKU => multi, chunked into rounds of 10 in load order.
  const buildGroups = async (list: Row[]) => {
    if (list.length === 0) {
      setGroups([]);
      return;
    }
    const ids = list.map((r) => r.id);
    const CHUNK = 200;
    const skuSet = new Map<string, Set<string>>();
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await (supabase.from("order_items") as any)
          .select("order_id, sku")
          .in("order_id", ids.slice(i, i + CHUNK));
        if (error) throw error;
        ((data as any[]) || []).forEach((r) => {
          let s = skuSet.get(r.order_id);
          if (!s) {
            s = new Set<string>();
            skuSet.set(r.order_id, s);
          }
          s.add(r.sku);
        });
      }
    } catch (e: any) {
      toast({ title: "Failed to group orders", description: e.message, variant: "destructive" });
    }

    // Representative SKU for singles sorting (alphabetically smallest SKU).
    const repSku = (id: string) => {
      const s = skuSet.get(id);
      if (!s || s.size === 0) return "";
      return Array.from(s).sort()[0];
    };

    const singles: Row[] = [];
    const multi: Row[] = [];
    for (const r of list) {
      const cnt = skuSet.get(r.id)?.size || 0;
      if (cnt <= 1) singles.push(r);
      else multi.push(r);
    }

    // Singles: one group, sorted by SKU ascending so same-SKU orders stack together.
    singles.sort((a, b) => repSku(a.id).localeCompare(repSku(b.id)));

    const next: LabelGroup[] = [];
    if (singles.length > 0) next.push({ key: "singles", title: "Singles", rows: singles });

    // Multi-SKU: chunk sequentially into rounds of 10 in current load order.
    const ROUND_SIZE = 10;
    for (let i = 0; i < multi.length; i += ROUND_SIZE) {
      const roundNum = Math.floor(i / ROUND_SIZE) + 1;
      next.push({
        key: `round-${roundNum}`,
        title: `Round ${roundNum}`,
        rows: multi.slice(i, i + ROUND_SIZE),
      });
    }
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
          <h2 className="text-sm font-semibold">Print by group</h2>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked orders to print.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <div key={g.key} className="rounded-lg border p-3 space-y-2">
                  <div>
                    <p className="font-medium">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{g.rows.length} orders</p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={groupBusy !== null}
                    onClick={() => downloadGroup(g)}
                  >
                    {groupBusy === g.key ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="mr-2 h-4 w-4" />
                    )}
                    {groupBusy === g.key ? "Generating…" : "Download PDF"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Manual selection (reprint)</h2>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleAll} disabled={visibleRows.length === 0}>
                {selected.size === rows.length && rows.length > 0 ? "Deselect all" : "Select all"}
              </Button>
              <Button size="sm" onClick={handleDownload} disabled={generating || selectedRows.length === 0}>
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                {generating ? "Generating…" : `Download PDF${selectedRows.length ? ` (${selectedRows.length})` : ""}`}
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
