import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, Loader2, Tags, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { downloadCourierLabelsPdf, type CourierLabelOrder } from "@/components/CourierLabel";
import { buildTagsForRounds, downloadItemTagsPdf, type RoundUnit } from "@/components/ItemTags";

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
  /** parsed slot number per order id — only for round groups */
  slotByOrder?: Map<string, number>;
}

/** Parses the "[R##-##] ..." prefix stamped on the physical slip. */
function parseRoundSlot(text: string | null | undefined): { round: number; slot: number } | null {
  const m = /^\s*\[R(\d+)-(\d+)\]/.exec(text || "");
  if (!m) return null;
  return { round: Number(m[1]), slot: Number(m[2]) };
}

type ActionKind = "pdf" | "tags" | "finish";

interface ActionEntry {
  /** group key */
  key: string;
  title: string;
  kind: ActionKind;
  /** epoch ms */
  at: number;
  /** ms since the previous logged action */
  gapMs: number;
}


function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}სთ ${m % 60}წთ`;
  if (m > 0) return `${m}წთ ${s % 60}წმ`;
  return `${s}წმ`;
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
  const [unmatched, setUnmatched] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  // --- Warehouse progress tracking (shared across devices via the database) ---
  const [log, setLog] = useState<ActionEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const logRef = useRef(log);
  logRef.current = log;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /** Newest-first rows → entries with the gap since the previous action. */
  const mapRows = (
    data: { group_key: string; title: string; kind: string; created_at: string }[]
  ): ActionEntry[] =>
    data.map((r, i) => {
      const at = new Date(r.created_at).getTime();
      const prev = data[i + 1];
      return {
        key: r.group_key,
        title: r.title,
        kind: r.kind as ActionKind,
        at,
        gapMs: prev ? at - new Date(prev.created_at).getTime() : 0,
      };
    });

  const loadLog = async () => {
    const { data, error } = await supabase
      .from("courier_label_actions")
      .select("group_key,title,kind,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setLog(mapRows(data));
  };

  /** One-time import of this browser's old local-only log into the shared table. */
  const migrateLocalLog = async () => {
    let local: ActionEntry[] = [];
    try {
      local = JSON.parse(localStorage.getItem("courier_label_action_log_v1") || "[]");
    } catch {
      return;
    }
    if (!Array.isArray(local) || local.length === 0) return;

    const { data: existing } = await supabase
      .from("courier_label_actions")
      .select("group_key,kind");
    const seen = new Set((existing || []).map((r) => `${r.group_key}|${r.kind}`));

    const toInsert = local
      .filter((e) => e && e.key && e.kind && e.at && !seen.has(`${e.key}|${e.kind}`))
      .map((e) => ({
        group_key: e.key,
        title: e.title,
        kind: e.kind,
        actor: "imported",
        created_at: new Date(e.at).toISOString(),
      }));

    if (toInsert.length) {
      const { error } = await supabase.from("courier_label_actions").insert(toInsert);
      if (error) return;
      toast({ title: `აღდგენილია ${toInsert.length} ჩანაწერი` });
    }
    try {
      localStorage.removeItem("courier_label_action_log_v1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    (async () => {
      await migrateLocalLog();
      await loadLog();
    })();
    const channel = supabase
      .channel("courier_label_actions_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courier_label_actions" },
        () => loadLog()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const logAction = async (key: string, title: string, kind: ActionKind) => {
    // optimistic — realtime/refetch will reconcile
    const prev = logRef.current[0];
    const at = Date.now();
    setLog([{ key, title, kind, at, gapMs: prev ? at - prev.at : 0 }, ...logRef.current].slice(0, 200));
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("courier_label_actions")
      .insert({ group_key: key, title, kind, actor: auth?.user?.email ?? null });
    if (error) {
      toast({ title: "ჟურნალი ვერ შეინახა", description: error.message, variant: "destructive" });
    }
    loadLog();
  };

  const doneKinds = (key: string) =>
    new Set(log.filter((e) => e.key === key).map((e) => e.kind));

  /** Both print actions done → the round can be marked finished by the packer. */
  const isReadyToFinish = (g: LabelGroup) => {
    const d = doneKinds(g.key);
    return roundNumberOf(g) > 0 ? d.has("pdf") && d.has("tags") : d.has("pdf");
  };

  const isGroupFinished = (g: LabelGroup) => doneKinds(g.key).has("finish");

  const finishEntry = (key: string) => log.find((e) => e.key === key && e.kind === "finish");

  /** Time between this round's finish and the previous round's finish. */
  const roundGapMs = (key: string) => {
    const finishes = log.filter((e) => e.kind === "finish"); // newest first
    const i = finishes.findIndex((e) => e.key === key);
    if (i === -1 || i + 1 >= finishes.length) return 0;
    return finishes[i].at - finishes[i + 1].at;
  };

  const finishGroup = (g: LabelGroup) => {
    if (isGroupFinished(g)) return;
    logAction(g.key, g.title, "finish");
  };

  const clearLog = async () => {
    setLog([]);
    const { error } = await supabase
      .from("courier_label_actions")
      .delete()
      .not("id", "is", null);
    if (error) toast({ title: "ვერ გასუფთავდა", description: error.message, variant: "destructive" });
    loadLog();
  };


  /** Average time between consecutive round completions. */
  const avgRoundGapMs = (() => {
    const finishes = log.filter((e) => e.kind === "finish"); // newest first
    if (finishes.length < 2) return 0;
    const total = finishes[0].at - finishes[finishes.length - 1].at;
    return Math.round(total / (finishes.length - 1));
  })();





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

  // Build print groups from the round/slot code already printed on the slip:
  //  - courier_label_text starting with "[R##-##]" => that round, that slot
  //  - everything else => "Singles" (sorted by SKU ascending)
  // Multi-SKU orders without a parsable code are flagged as unmatched.
  const buildGroups = async (list: Row[]) => {
    if (list.length === 0) {
      setGroups([]);
      setUnmatched([]);
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
    const byRound = new Map<number, { row: Row; slot: number }[]>();
    const bad: Row[] = [];
    for (const r of list) {
      const parsed = parseRoundSlot(r.courier_label_text);
      if (parsed) {
        const arr = byRound.get(parsed.round) || [];
        arr.push({ row: r, slot: parsed.slot });
        byRound.set(parsed.round, arr);
        continue;
      }
      singles.push(r);
      if ((skuSet.get(r.id)?.size || 0) > 1) bad.push(r);
    }
    setUnmatched(bad);

    // Singles: one group, sorted by SKU ascending so same-SKU orders stack together.
    singles.sort((a, b) => repSku(a.id).localeCompare(repSku(b.id)));

    const next: LabelGroup[] = [];
    if (singles.length > 0) next.push({ key: "singles", title: "Singles", rows: singles });

    Array.from(byRound.keys())
      .sort((a, b) => a - b)
      .forEach((roundNum) => {
        const entries = (byRound.get(roundNum) || []).sort((a, b) => a.slot - b.slot);
        next.push({
          key: `round-${roundNum}`,
          title: `Round ${roundNum}`,
          rows: entries.map((e) => e.row),
          slotByOrder: new Map(entries.map((e) => [e.row.id, e.slot])),
        });
      });

    setGroups(next.filter((g) => g.rows.length > 0));
  };


  const roundNumberOf = (g: LabelGroup) => {
    const m = /^round-(\d+)$/.exec(g.key);
    return m ? Number(m[1]) : 0;
  };

  const downloadGroup = async (g: LabelGroup) => {
    setGroupBusy(g.key);
    try {
      // The [R##-##] code already lives at the start of courier_label_text —
      // never re-stamp or recompute it here.
      const labels = g.rows.map(toLabelOrder);
      await downloadCourierLabelsPdf(
        labels,
        `courier-labels-${g.key}-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      logAction(g.key, g.title, "pdf");
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGroupBusy(null);
    }
  };

  // Build one peel-and-stick item tag per physical unit for a multi-SKU round.
  // Round + slot come from the [R##-##] code parsed off the slip itself, so
  // tags and slips can never disagree.
  const downloadSkuTags = async (g: LabelGroup) => {
    const runNum = roundNumberOf(g);
    if (runNum <= 0) return;
    setGroupBusy(`${g.key}-tags`);
    try {
      const orderIds = g.rows.map((r) => r.id);
      const CHUNK = 200;
      const items: { order_id: string; sku: string; quantity: number }[] = [];
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const { data, error } = await (supabase.from("order_items") as any)
          .select("order_id, sku, quantity")
          .in("order_id", orderIds.slice(i, i + CHUNK));
        if (error) throw error;
        items.push(...((data as any[]) || []));
      }
      const skus = Array.from(new Set(items.map((it) => it.sku)));
      const binBySku = new Map<string, string>();
      for (let i = 0; i < skus.length; i += CHUNK) {
        const { data, error } = await (supabase.from("products") as any)
          .select("sku, bin_location")
          .in("sku", skus.slice(i, i + CHUNK));
        if (error) throw error;
        ((data as any[]) || []).forEach((p) => binBySku.set(p.sku, p.bin_location || ""));
      }
      // Slots parsed from the slip's [R##-##] code — same source the round
      // grouping and the printed slip use.
      const slotByOrder = g.slotByOrder ?? new Map<string, number>();
      const numByOrder = new Map<string, string | null>();
      g.rows.forEach((r) => numByOrder.set(r.id, r.public_order_number));
      const units: RoundUnit[] = items.map((it) => ({
        binLocation: binBySku.get(it.sku) || "",
        slotNumber: slotByOrder.get(it.order_id) || 1,
        quantity: Number(it.quantity) || 1,
        orderNumber: numByOrder.get(it.order_id) ?? null,
      }));
      const tags = buildTagsForRounds([{ runNumber: runNum, units }]);
      await downloadItemTagsPdf(
        tags,
        `sku-tags-${g.key}-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      logAction(g.key, g.title, "tags");
    } catch (e: any) {
      toast({ title: "Tag generation failed", description: e.message, variant: "destructive" });
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
          {unmatched.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <p className="font-medium text-destructive">
                {unmatched.length} multi-SKU order(s) have no [R##-##] code on the slip — printed
                with Singles, check them:
              </p>
              <p className="mt-1 text-muted-foreground break-words">
                {unmatched.map((r) => r.public_order_number || r.id).join(", ")}
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked orders to print.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => {
                const runNum = roundNumberOf(g);
                const done = doneKinds(g.key);
                const finished = isGroupFinished(g);
                const readyToFinish = !finished && isReadyToFinish(g);
                const fin = finishEntry(g.key);
                const gap = fin ? roundGapMs(g.key) : 0;
                const last = log.find((e) => e.key === g.key);
                return (
                <div
                  key={g.key}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    finished
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : done.size > 0
                        ? "border-primary/50 bg-primary/5"
                        : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium flex items-center gap-1.5">
                        {g.title}
                        {finished && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{g.rows.length} orders</p>
                    </div>
                    {finished ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        დასრულებული
                      </span>
                    ) : done.size > 0 ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        მიმდინარე
                      </span>
                    ) : null}
                  </div>
                  <div className={runNum > 0 ? "grid grid-cols-2 gap-2" : ""}>
                    <Button
                      size="sm"
                      className="w-full"
                      variant={done.has("pdf") ? "secondary" : "default"}
                      disabled={groupBusy !== null}
                      onClick={() => downloadGroup(g)}
                    >
                      {groupBusy === g.key ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : done.has("pdf") ? (
                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                      ) : (
                        <Printer className="mr-2 h-4 w-4" />
                      )}
                      {groupBusy === g.key
                        ? "Generating…"
                        : done.has("pdf")
                          ? "PDF ✓"
                          : "Download PDF"}
                    </Button>
                    {runNum > 0 && (
                      <Button
                        size="sm"
                        variant={done.has("tags") ? "secondary" : "outline"}
                        className="w-full"
                        disabled={groupBusy !== null}
                        onClick={() => downloadSkuTags(g)}
                      >
                        {groupBusy === `${g.key}-tags` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : done.has("tags") ? (
                          <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                        ) : (
                          <Tags className="mr-2 h-4 w-4" />
                        )}
                        {groupBusy === `${g.key}-tags`
                          ? "Generating…"
                          : done.has("tags")
                            ? "Tags ✓"
                            : "SKU tags"}
                      </Button>
                    )}
                  </div>
                  {readyToFinish && (
                    <Button
                      size="sm"
                      onClick={() => finishGroup(g)}
                      className="w-full animate-glow-pulse bg-success text-success-foreground hover:bg-success/90 font-semibold"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      რაუნდის დასრულება
                    </Button>
                  )}
                  {finished && fin ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        დასრულდა{" "}
                        {new Date(fin.at).toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {gap > 0 && <span>· წინა რაუნდიდან {fmtDuration(gap)}</span>}
                    </p>
                  ) : (
                    last && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        ბოლო მოქმედება {fmtDuration(now - last.at)} წინ
                      </p>
                    )
                  )}
                </div>
                );
              })}

            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> სამუშაო ჟურნალი (დრო მოქმედებებს შორის)
            </h2>
            {log.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearLog}>
                <RotateCcw className="mr-2 h-4 w-4" /> გასუფთავება
              </Button>
            )}
          </div>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ჯერ არაფერია დაბეჭდილი — დაწყებისას აქ გამოჩნდება დრო თითოეულ მოქმედებას შორის.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  ბოლო მოქმედებიდან გავიდა:{" "}
                  <span className="font-semibold tabular-nums">{fmtDuration(now - log[0].at)}</span>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  დასრულებული რაუნდები:{" "}
                  <span className="font-semibold tabular-nums">
                    {log.filter((e) => e.kind === "finish").length}
                  </span>
                  {avgRoundGapMs > 0 && (
                    <> · საშ. ტემპი <span className="font-semibold tabular-nums">{fmtDuration(avgRoundGapMs)}</span></>
                  )}
                </div>
              </div>
              <ol className="divide-y text-sm">
                {log.slice(0, 25).map((e) => (
                  <li key={`${e.key}-${e.kind}-${e.at}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">
                      <span className="font-medium">{e.title}</span> ·{" "}
                      {e.kind === "pdf" ? "PDF" : e.kind === "tags" ? "SKU tags" : (
                        <span className="font-semibold text-emerald-600">დასრულდა</span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {new Date(e.at).toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      {e.gapMs > 0 && <> · +{fmtDuration(e.gapMs)}</>}
                      {e.kind === "finish" && roundGapMs(e.key) > 0 && (
                        <> · რაუნდებს შორის {fmtDuration(roundGapMs(e.key))}</>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
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
