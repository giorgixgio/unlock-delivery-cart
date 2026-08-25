import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { resignScanUrls } from "@/lib/scanPhotoUrl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUp as ImageCheck, Loader2, RefreshCw, ZoomIn, X } from "lucide-react";

/**
 * Photo Review — confirmed warehouse scans whose photo hasn't been promoted
 * to the catalog yet. Nothing is written to a product until "Apply selected".
 */

type Row = {
  id: string;
  created_at: string;
  typed_sku: string | null;
  corrected_sku: string | null;
  photo_url: string;
  confirmed_product_id: string | null;
  product: { id: string; sku: string; title: string; image: string | null } | null;
};

/** Signed scan URLs expire; copy the file into the public catalog bucket instead. */
const scanPathFromUrl = (url: string): string | null => {
  const m = url.match(/\/product-scans\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function AdminPhotoReview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("product_scan_history") as any)
      .select("id, created_at, typed_sku, corrected_sku, photo_url, confirmed_product_id, product:products!product_scan_history_confirmed_product_id_fkey(id, sku, title, image)")
      .eq("status", "confirmed")
      .eq("applied_as_reference", false)
      .not("confirmed_product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast({ title: "Load failed", description: error.message, variant: "destructive" });
      return;
    }
    const list = (data || []) as Row[];
    const signed = await resignScanUrls(list.map((r) => r.photo_url));
    setRows(list.map((r) => (signed[r.photo_url] ? { ...r, photo_url: signed[r.photo_url] } : r)));
    setSelected({});
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedIds = rows.filter((r) => selected[r.id]).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(rows.map((r) => [r.id, true])));
  };

  const applySelected = async () => {
    const targets = rows.filter((r) => selected[r.id] && r.confirmed_product_id);
    if (!targets.length) return;
    setApplying(true);
    let ok = 0;
    const failures: string[] = [];

    for (const row of targets) {
      try {
        let imageUrl = row.photo_url;
        const path = scanPathFromUrl(row.photo_url);
        if (path) {
          const dl = await supabase.storage.from("product-scans").download(path);
          if (dl.error) throw dl.error;
          const dest = `scans/${path}`;
          const up = await supabase.storage
            .from("product-images")
            .upload(dest, dl.data, { contentType: dl.data.type || "image/jpeg", upsert: true });
          if (up.error) throw up.error;
          imageUrl = supabase.storage.from("product-images").getPublicUrl(dest).data.publicUrl;
        }

        const { error: prodErr } = await (supabase.from("products") as any)
          .update({ image: imageUrl })
          .eq("id", row.confirmed_product_id);
        if (prodErr) throw prodErr;

        const { error: histErr } = await (supabase.from("product_scan_history") as any)
          .update({ applied_as_reference: true, applied_at: new Date().toISOString() })
          .eq("id", row.id);
        if (histErr) throw histErr;
        ok++;
      } catch (e: any) {
        failures.push(`${row.product?.sku || row.typed_sku}: ${e?.message || String(e)}`);
      }
    }

    setApplying(false);
    toast({
      title: `Applied ${ok}/${targets.length}`,
      description: failures.length ? failures.slice(0, 3).join(" · ") : "Catalog images updated.",
      variant: failures.length ? "destructive" : undefined,
    });
    load();
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ImageCheck className="w-5 h-5" /> Photo Review
        </h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Confirmed scans not yet used as catalog photos. Nothing changes until you apply.
      </p>

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-background py-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            Select all ({rows.length})
          </label>
          <Button onClick={applySelected} disabled={applying || selectedIds.length === 0}>
            {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageCheck className="w-4 h-4 mr-2" />}
            Apply selected ({selectedIds.length})
          </Button>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nothing pending — every confirmed scan has been reviewed.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <Checkbox
                checked={!!selected[r.id]}
                onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))}
              />
              <div className="relative shrink-0">
                <img src={r.photo_url} alt="" className="w-20 h-20 rounded object-cover bg-muted" />
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
                <div className="font-medium truncate">{r.product?.title || "Unknown product"}</div>
                <div className="text-sm text-muted-foreground">
                  SKU {r.product?.sku || r.corrected_sku || r.typed_sku}
                </div>
                <div className="text-xs text-muted-foreground">
                  scanned {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {r.product?.image && (
                <div className="relative shrink-0 hidden sm:block">
                  <img src={r.product.image} alt="" className="w-14 h-14 rounded object-cover bg-muted opacity-70" />
                  <span className="absolute -top-2 left-0 text-[10px] text-muted-foreground">current</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {zoomImg && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <button
            type="button"
            onClick={() => setZoomImg(null)}
            className="absolute top-4 right-4 text-white p-2"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={zoomImg} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
