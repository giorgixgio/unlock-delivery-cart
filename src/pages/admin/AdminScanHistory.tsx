import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { History, Loader2, Search, ZoomIn, X } from "lucide-react";

/** Scan History — full audit trail of warehouse scans, newest first. */

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  actor: string | null;
  typed_sku: string | null;
  corrected_sku: string | null;
  position: string | null;
  photo_url: string;
  confidence: number | null;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 border-green-300",
  matched: "bg-emerald-100 text-emerald-800 border-emerald-300",
  mismatch: "bg-amber-100 text-amber-800 border-amber-300",
  flagged: "bg-red-100 text-red-800 border-red-300",
};

const sel = (s: string): string => s;

export default function AdminScanHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      setLoading(true);
      let q = (supabase.from("product_scan_history") as any).select(
        sel("id, created_at, actor, typed_sku, corrected_sku, position, photo_url, confidence, status"),
      );
      if (status !== "all") q = q.eq("status", status);
      if (debounced) q = q.or(`typed_sku.ilike.%${debounced}%,corrected_sku.ilike.%${debounced}%`);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      setLoading(false);
      if (error) {
        toast({ title: "Load failed", description: error.message, variant: "destructive" });
        return;
      }
      const batch = (data || []) as Row[];
      setDone(batch.length < PAGE_SIZE);
      setRows((prev) => (replace ? batch : [...prev, ...batch]));
    },
    [status, debounced],
  );

  // Reset + reload whenever filters change
  useEffect(() => {
    setRows([]);
    setDone(false);
    fetchPage(0, true);
  }, [fetchPage]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) fetchPage(rows.length, false);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, rows.length, fetchPage]);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <History className="w-5 h-5" /> Scan History
      </h1>

      <div className="flex gap-2 sticky top-0 z-10 bg-background py-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="mismatch">Mismatch</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!loading && rows.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No scans match this filter.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const corrected = r.corrected_sku && r.corrected_sku !== r.typed_sku;
          return (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="relative shrink-0">
                  <img src={r.photo_url} alt="" className="w-16 h-16 rounded object-cover bg-muted" />
                  <button
                    type="button"
                    onClick={() => setZoomImg(r.photo_url)}
                    className="absolute bottom-0.5 right-0.5 bg-background/85 rounded p-1 border border-border"
                    aria-label="Zoom photo"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={corrected ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                      SKU {r.typed_sku || "—"}
                    </span>
                    {corrected && (
                      <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-sm">
                        → {r.corrected_sku}
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium border rounded-full px-2 py-0.5 ${
                        STATUS_STYLES[r.status] || "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    bin {r.position || "—"}
                    {r.confidence != null ? ` · ${r.confidence}% confidence` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                    {r.actor ? ` · ${r.actor}` : ""}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}
      {!done && !loading && rows.length > 0 && (
        <div className="flex justify-center py-2">
          <Button variant="outline" onClick={() => fetchPage(rows.length, false)}>Load more</Button>
        </div>
      )}
      <div ref={sentinelRef} className="h-1" />

      {zoomImg && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <button type="button" onClick={() => setZoomImg(null)} className="absolute top-4 right-4 text-white p-2" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          <img src={zoomImg} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
