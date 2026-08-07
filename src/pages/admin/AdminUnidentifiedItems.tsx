import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HelpCircle, Loader2, ChevronDown, ChevronRight, X, Search } from "lucide-react";

/** Unidentified Items — review queue for rejected scans awaiting identification. */

type Candidate = {
  id: string;
  sku: string | null;
  title: string;
  image?: string | null;
  confidence?: number | null;
};

type Row = {
  id: string;
  created_at: string;
  typed_sku: string;
  position: string | null;
  photo_url: string;
  actor: string | null;
  status: string;
  fingerprint_candidates: Candidate[] | null;
  fingerprint_status: string | null;
  resolved_product_id: string | null;
  resolved_at: string | null;
  resolution: string | null;
  notes: string | null;
};

type ProductLite = { id: string; sku: string | null; title: string; image: string | null };

const SELECT =
  "id, created_at, typed_sku, position, photo_url, actor, status, fingerprint_candidates, fingerprint_status, resolved_product_id, resolved_at, resolution, notes";

function normalize(raw: any): Row {
  return {
    ...raw,
    fingerprint_candidates: Array.isArray(raw?.fingerprint_candidates)
      ? (raw.fingerprint_candidates as Candidate[])
      : null,
  } as Row;
}

function ManualSearch({
  onPick,
  disabled,
}: {
  onPick: (p: ProductLite) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await (supabase.from("products") as any)
        .select("id, sku, title, image")
        .or(`title.ilike.%${term}%,sku.ilike.%${term}%`)
        .limit(10);
      if (cancelled) return;
      setSearching(false);
      setResults((data || []) as ProductLite[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search catalog by title or SKU…"
          className="pl-8"
        />
        {searching && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {results.length > 0 && (
        <div className="divide-y rounded-md border">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted disabled:opacity-50"
            >
              {p.image ? (
                <img src={p.image} alt={p.title} className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">SKU {p.sku ?? "—"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUnidentifiedItems() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from("unidentified_items") as any)
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
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

  useEffect(() => {
    const channel = supabase
      .channel("unidentified-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "unidentified_items" },
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

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const resolved = useMemo(() => rows.filter((r) => r.status !== "pending").slice(0, 50), [rows]);

  const matchExisting = async (row: Row, product: { id: string; title: string }) => {
    setBusyId(row.id);
    const { error: pErr } = await (supabase.from("products") as any)
      .update({ sku: row.typed_sku, bin_location: row.position, sku_locked: true })
      .eq("id", product.id);
    if (pErr) {
      setBusyId(null);
      toast({ title: "Update failed", description: pErr.message, variant: "destructive" });
      return;
    }
    const { error } = await (supabase.from("unidentified_items") as any)
      .update({
        status: "resolved",
        resolution: "matched_existing",
        resolved_product_id: product.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Resolve failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Matched", description: `${product.title} → SKU ${row.typed_sku}` });
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status: "resolved",
              resolution: "matched_existing",
              resolved_product_id: product.id,
              resolved_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  };

  const markNeedsNew = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await (supabase.from("unidentified_items") as any)
      .update({
        status: "resolved",
        resolution: "needs_new_product",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Flagged", description: "Marked as needing a new product." });
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status: "resolved",
              resolution: "needs_new_product",
              resolved_at: new Date().toISOString(),
            }
          : r,
      ),
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Unidentified Items</h1>
        <span className="ml-auto text-sm text-muted-foreground">{pending.length} pending</span>
      </div>

      {loading && (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && pending.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing pending — the queue is clear.
          </CardContent>
        </Card>
      )}

      {pending.map((row) => (
        <Card key={row.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex gap-3">
              <button type="button" onClick={() => setZoomImg(row.photo_url)} className="shrink-0">
                <img
                  src={row.photo_url}
                  alt={`Scan ${row.typed_sku}`}
                  className="h-24 w-24 rounded-md border object-cover"
                />
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <div className="text-lg font-semibold">SKU {row.typed_sku}</div>
                <div className="text-muted-foreground">Position: {row.position ?? "—"}</div>
                <div className="text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </div>
                {row.actor && <div className="text-muted-foreground">By {row.actor}</div>}
              </div>
            </div>

            {row.fingerprint_status === "pending" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
              </div>
            )}
            {row.fingerprint_status === "failed" && (
              <div className="text-xs text-muted-foreground">Auto-search failed</div>
            )}
            {row.fingerprint_status === "done" && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Suggested matches
                </div>
                {(row.fingerprint_candidates?.length ?? 0) === 0 ? (
                  <div className="text-xs text-muted-foreground">No candidates found</div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {row.fingerprint_candidates!.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => matchExisting(row, { id: c.id, title: c.title })}
                        className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted disabled:opacity-50"
                      >
                        {c.image ? (
                          <img
                            src={c.image}
                            alt={c.title}
                            className="h-12 w-12 rounded object-cover"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomImg(c.image!);
                            }}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.title}</div>
                          <div className="text-xs text-muted-foreground">SKU {c.sku ?? "—"}</div>
                        </div>
                        {typeof c.confidence === "number" && (
                          <span className="rounded border px-2 py-0.5 text-xs">
                            {Math.round(c.confidence)}%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <ManualSearch
              disabled={busyId === row.id}
              onPick={(p) => matchExisting(row, { id: p.id, title: p.title })}
            />

            <Button
              variant="outline"
              className="w-full"
              disabled={busyId === row.id}
              onClick={() => markNeedsNew(row)}
            >
              Not in catalog — needs new product
            </Button>
          </CardContent>
        </Card>
      ))}

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          {showResolved ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Resolved ({resolved.length})
        </button>
        {showResolved && (
          <div className="mt-2 space-y-2">
            {resolved.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                <img
                  src={r.photo_url}
                  alt={`Scan ${r.typed_sku}`}
                  className="h-10 w-10 cursor-zoom-in rounded object-cover"
                  onClick={() => setZoomImg(r.photo_url)}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">SKU {r.typed_sku}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.resolution === "needs_new_product" ? "Needs new product" : "Matched existing"}
                    {r.resolved_at ? ` · ${new Date(r.resolved_at).toLocaleString()}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {resolved.length === 0 && (
              <div className="text-xs text-muted-foreground">Nothing resolved yet.</div>
            )}
          </div>
        )}
      </div>

      {zoomImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomImg(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-background p-2"
            onClick={() => setZoomImg(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoomImg} alt="Zoomed" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
