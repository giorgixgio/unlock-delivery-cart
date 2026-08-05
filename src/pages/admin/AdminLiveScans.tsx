import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Radio, Loader2, ChevronDown, ChevronRight, X } from "lucide-react";

/** Live Scans — realtime warehouse scan feed with mismatch triage. */

type Candidate = { id: string; sku: string; title: string; confidence: number; image?: string | null };

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
  candidates: Candidate[] | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 border-green-300",
  matched: "bg-emerald-100 text-emerald-800 border-emerald-300",
  mismatch: "bg-amber-100 text-amber-800 border-amber-300",
  flagged: "bg-red-100 text-red-800 border-red-300",
  conflict: "bg-orange-100 text-orange-800 border-orange-300",
};

const SELECT =
  "id, created_at, actor, typed_sku, corrected_sku, position, photo_url, confidence, status, candidates";

function normalize(raw: any): Row {
  return {
    ...raw,
    candidates: Array.isArray(raw?.candidates) ? (raw.candidates as Candidate[]) : null,
  } as Row;
}

export default function AdminLiveScans() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from("product_scan_history") as any)
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      toast({ title: "Load failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data || []).map(normalize));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime feed
  useEffect(() => {
    const channel = supabase
      .channel("live-scans")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_scan_history" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as any)?.id);
            }
            const row = normalize(payload.new);
            const rest = prev.filter((r) => r.id !== row.id);
            return [row, ...rest].sort(
              (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
            );
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const confirmCandidate = async (row: Row, c: Candidate) => {
    setBusyId(row.id);
    const { data, error } = await supabase.functions.invoke("scan-product", {
      body: {
        action: "confirm",
        scan_id: row.id,
        product_id: c.id,
        position: row.position,
        actor: row.actor || "live-scans",
      },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast({
        title: "Confirm failed",
        description: error?.message || (data as any)?.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Confirmed", description: `${c.title} → ${row.position}` });
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, status: "confirmed", corrected_sku: (data as any)?.corrected_sku ?? c.sku }
          : r,
      ),
    );
  };

  const pending = rows.filter((r) => r.status === "mismatch");
  const resolved = rows.filter((r) => r.status !== "mismatch");

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Radio className="w-5 h-5 text-red-500" /> Live Scans
        <span className="text-xs font-normal text-muted-foreground">live</span>
      </h1>

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Needs a decision */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Needs a decision ({pending.length})
        </h2>
        {!loading && pending.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nothing waiting. New mismatches appear here instantly.
            </CardContent>
          </Card>
        )}
        {pending.map((r) => (
          <Card key={r.id} className="border-amber-300">
            <CardContent className="p-3 space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setZoomImg(r.photo_url)}
                  className="shrink-0"
                  aria-label="Zoom scan photo"
                >
                  <img
                    src={r.photo_url}
                    alt="Scanned product"
                    className="w-20 h-20 rounded object-cover bg-muted"
                  />
                </button>
                <div className="text-sm space-y-0.5">
                  <div className="font-semibold">SKU {r.typed_sku || "—"}</div>
                  <div className="text-muted-foreground">Position {r.position || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                    {r.actor ? ` · ${r.actor}` : ""}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                {(r.candidates || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No candidates suggested.</p>
                )}
                {(r.candidates || []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => confirmCandidate(r, c)}
                    className="w-full flex items-center gap-3 rounded-md border border-border p-2 text-left hover:bg-accent disabled:opacity-50"
                  >
                    <img
                      src={c.image || r.photo_url}
                      alt=""
                      className="w-12 h-12 rounded object-cover bg-muted shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                    </div>
                    <span className="text-xs font-semibold shrink-0">
                      {Math.round(c.confidence)}%
                    </span>
                  </button>
                ))}
                {busyId === r.id && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recently resolved */}
      <section className="space-y-2">
        <Button
          variant="ghost"
          className="px-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? (
            <ChevronDown className="w-4 h-4 mr-1" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-1" />
          )}
          Recently resolved ({resolved.length})
        </Button>
        {showResolved &&
          resolved.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <button type="button" onClick={() => setZoomImg(r.photo_url)} className="shrink-0">
                  <img
                    src={r.photo_url}
                    alt=""
                    className="w-12 h-12 rounded object-cover bg-muted"
                  />
                </button>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">
                    SKU {r.typed_sku || "—"}
                    {r.corrected_sku && r.corrected_sku !== r.typed_sku && (
                      <span className="ml-2 text-xs text-green-700">→ {r.corrected_sku}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.position || "—"} · {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded border shrink-0 ${
                    STATUS_STYLES[r.status] || "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {r.status}
                </span>
              </CardContent>
            </Card>
          ))}
      </section>

      {zoomImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomImg(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white p-2"
            aria-label="Close"
            onClick={() => setZoomImg(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img src={zoomImg} alt="Scan" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
