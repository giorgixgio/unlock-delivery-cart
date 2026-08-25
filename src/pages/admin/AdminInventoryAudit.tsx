import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { resignScanUrls } from "@/lib/scanPhotoUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Download, Loader2, Search, ZoomIn, X } from "lucide-react";

/**
 * Inventory Audit — one merged timeline of scan confirmations
 * (product_scan_history) and rejections (unidentified_items).
 */

type Entry = {
  id: string;
  source: "scan" | "unidentified";
  created_at: string;
  actor: string | null;
  typed_sku: string | null;
  corrected_sku: string | null;
  position: string | null;
  photo_url: string | null;
  status: string;
  resolution: string | null;
  resolved_title: string | null;
  notes: string | null;
  reason: string | null;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed / Match" },
  { value: "rejected_wrong", label: "Rejected — Wrong item" },
  { value: "rejected_notfound", label: "Rejected — Not in catalog" },
  { value: "rejected_resolved", label: "Rejected — Resolved" },
  { value: "rejected_new", label: "Rejected — Needs New Product" },
  { value: "duplicates", label: "Duplicates Resolved" },
];

const DUP_RE = /(Duplicate SKU resolved|SKU conflict resolved)/i;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminInventoryAudit() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const fromISO = new Date(`${from}T00:00:00`).toISOString();
    const toISO = new Date(`${to}T23:59:59.999`).toISOString();

    const [scans, unidentified] = await Promise.all([
      supabase
        .from("product_scan_history")
        .select("id, created_at, actor, typed_sku, corrected_sku, position, photo_url, status, notes")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false }),
      supabase
        .from("unidentified_items")
        .select("id, created_at, actor, typed_sku, position, photo_url, status, resolution, notes, reason, resolved_product_id, products:resolved_product_id (title, sku)")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false }),
    ]);

    setLoading(false);
    if (scans.error || unidentified.error) {
      toast({
        title: "Load failed",
        description: scans.error?.message || unidentified.error?.message,
        variant: "destructive",
      });
      return;
    }

    const merged: Entry[] = [
      ...((scans.data || []) as any[]).map((r) => ({
        id: `s-${r.id}`,
        source: "scan" as const,
        created_at: r.created_at,
        actor: r.actor,
        typed_sku: r.typed_sku,
        corrected_sku: r.corrected_sku,
        position: r.position,
        photo_url: r.photo_url || null,
        status: r.status,
        resolution: null,
        resolved_title: null,
        notes: r.notes,
        reason: null,
      })),
      ...((unidentified.data || []) as any[]).map((r) => ({
        id: `u-${r.id}`,
        source: "unidentified" as const,
        created_at: r.created_at,
        actor: r.actor,
        typed_sku: r.typed_sku,
        corrected_sku: r.products?.sku ?? null,
        position: r.position,
        photo_url: r.photo_url || null,
        status: r.status,
        resolution: r.resolution,
        resolved_title: r.products?.title ?? null,
        notes: r.notes,
        reason: r.reason ?? "wrong_item",
      })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    // Stored photo links are expired signed URLs — refresh them before rendering.
    const signed = await resignScanUrls(merged.map((e) => e.photo_url));
    setEntries(
      merged.map((e) => (e.photo_url && signed[e.photo_url] ? { ...e, photo_url: signed[e.photo_url] } : e)),
    );
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (debounced) {
        const hay = `${e.typed_sku ?? ""} ${e.corrected_sku ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      switch (filter) {
        case "confirmed":
          return e.source === "scan";
        case "rejected_wrong":
          return e.source === "unidentified" && e.reason !== "not_found";
        case "rejected_notfound":
          return e.source === "unidentified" && e.reason === "not_found";
        case "rejected_resolved":
          return e.source === "unidentified" && e.resolution === "matched_existing";
        case "rejected_new":
          return e.source === "unidentified" && e.resolution === "needs_new_product";
        case "duplicates":
          return DUP_RE.test(e.notes || "");
        default:
          return true;
      }
    });
  }, [entries, filter, debounced]);

  const summary = useMemo(() => {
    const confirmed = entries.filter((e) => e.source === "scan").length;
    const rejected = entries.filter((e) => e.source === "unidentified").length;
    const resolved = entries.filter((e) => e.source === "unidentified" && e.status === "resolved").length;
    const needsNew = entries.filter((e) => e.resolution === "needs_new_product").length;
    return { confirmed, rejected, resolved, needsNew };
  }, [entries]);

  const exportCsv = () => {
    const header = [
      "timestamp", "type", "reason", "typed_sku", "corrected_sku", "position",
      "status", "resolution", "matched_product", "actor", "notes", "photo_url",
    ];
    const lines = [header.join(",")];
    for (const e of filtered) {
      lines.push([
        new Date(e.created_at).toISOString(),
        e.source === "scan" ? "Confirmed" : "Rejected",
        e.source === "scan" ? "" : e.reason === "not_found" ? "Not in catalog" : "Wrong item",
        e.typed_sku, e.corrected_sku, e.position,
        e.status, e.resolution, e.resolved_title, e.actor, e.notes, e.photo_url,
      ].map(csvCell).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-audit_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardList className="h-5 w-5" /> Inventory Audit
        </h1>
        <Button onClick={exportCsv} disabled={!filtered.length} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Confirmed", value: summary.confirmed, cls: "text-green-600" },
          { label: "Rejected", value: summary.rejected, cls: "text-red-600" },
          { label: "Resolved", value: summary.resolved, cls: "text-blue-600" },
          { label: "Needs new product", value: summary.needsNew, cls: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU…"
            className="pl-8"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && !filtered.length && (
        <p className="py-10 text-center text-muted-foreground">No entries for this range.</p>
      )}

      {/* Timeline */}
      <div className="space-y-2">
        {filtered.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex gap-3 p-3">
              {e.photo_url ? (
                <button
                  onClick={() => setZoomImg(e.photo_url)}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded border"
                >
                  <img
                    src={e.photo_url}
                    alt={e.typed_sku ?? "scan"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={async (ev) => {
                      const img = ev.currentTarget;
                      if (img.dataset.retried) return;
                      img.dataset.retried = "1";
                      const fresh = await resignScanUrls([e.photo_url]);
                      const next = e.photo_url ? fresh[e.photo_url] : undefined;
                      if (next) img.src = next;
                    }}
                  />
                  <ZoomIn className="absolute bottom-1 right-1 h-4 w-4 rounded bg-background/80 p-0.5" />
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
                  no photo
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                      e.source === "scan"
                        ? "border-green-300 bg-green-100 text-green-800"
                        : "border-red-300 bg-red-100 text-red-800"
                    }`}
                  >
                    {e.source === "scan" ? "Confirmed / Match" : "Rejected"}
                  </span>
                  {e.source === "unidentified" && (
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                        e.reason === "not_found"
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-red-300 bg-red-100 text-red-800"
                      }`}
                    >
                      {e.reason === "not_found" ? "Not in catalog" : "Wrong item"}
                    </span>
                  )}
                  <span className="font-mono text-base font-bold">{e.typed_sku ?? "—"}</span>
                  {e.corrected_sku && e.corrected_sku !== e.typed_sku && (
                    <span className="font-mono text-sm text-blue-700">→ {e.corrected_sku}</span>
                  )}
                  {e.position && (
                    <span className="text-xs text-muted-foreground">pos {e.position}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{e.status}</span>
                  {DUP_RE.test(e.notes || "") && (
                    <span className="rounded border border-purple-300 bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                      Duplicate resolved
                    </span>
                  )}
                </div>

                {e.source === "unidentified" && e.resolution === "matched_existing" && (
                  <p className="text-sm text-emerald-700">
                    Matched to: <span className="font-medium">{e.resolved_title ?? "—"}</span>
                    {e.corrected_sku ? ` (SKU ${e.corrected_sku})` : ""}
                  </p>
                )}
                {e.source === "unidentified" && e.resolution === "needs_new_product" && (
                  <p className="text-sm font-semibold text-amber-700">⚑ Needs new product created</p>
                )}
                {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}{e.actor ? ` · ${e.actor}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {zoomImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomImg(null)}
        >
          <img src={zoomImg} alt="scan" className="max-h-full max-w-full rounded object-contain" />
          <button className="absolute right-4 top-4 rounded-full bg-background p-2" onClick={() => setZoomImg(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
