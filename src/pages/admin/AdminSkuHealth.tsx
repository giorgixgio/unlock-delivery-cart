import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye, EyeOff, HeartPulse, Loader2, Search, X } from "lucide-react";
import SkuCheckDialog, { type SkuCheckProduct } from "@/components/admin/SkuCheckDialog";

const HIDDEN_KEY = "skuHealth:hiddenIds";

/** SKU Health — products never verified, and products whose SKU was reassigned. */

type Product = {
  id: string;
  title: string;
  sku: string | null;
  image: string | null;
  bin_location: string | null;
  sku_reassigned: boolean | null;
  previous_sku: string | null;
  sku_reassigned_at: string | null;
  available: boolean | null;
};

const SELECT =
  "id, title, sku, image, bin_location, sku_reassigned, previous_sku, sku_reassigned_at, available";

function toCsv(rows: string[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = c ?? "";
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}

function BinInput({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: (bin: string) => void;
}) {
  const [bin, setBin] = useState(product.bin_location ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = bin.trim();
    if (!value) return;
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({ bin_location: value })
      .eq("id", product.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Bin saved", description: `${product.sku ?? product.title} → ${value}` });
    onSaved(value);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={bin}
        onChange={(e) => setBin(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        placeholder="Bin"
        className="h-9 w-28 text-base"
      />
      <Button size="sm" onClick={save} disabled={saving || !bin.trim()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Found it — set bin"}
      </Button>
    </div>
  );
}

/** Auto-generated placeholder SKUs (>= 1000) are not real warehouse SKUs — show blank. */
const displaySku = (sku?: string | null) => {
  const s = (sku ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s) && Number(s) >= 1000) return "";
  return s;
};

const isRealSku = (sku?: string | null) => {
  const s = (sku ?? "").trim();
  if (!s) return false;
  if (/^\d+$/.test(s) && Number(s) >= 1000) return false;
  return true;
};


const AdminSkuHealth = () => {
  const [loading, setLoading] = useState(true);
  const [unverified, setUnverified] = useState<Product[]>([]);
  const [qUnverified, setQUnverified] = useState("");
  const [checking, setChecking] = useState<SkuCheckProduct | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
    } catch {
      return new Set<string>();
    }
  });
  const [showHidden, setShowHidden] = useState(false);

  const persistHidden = useCallback((next: Set<string>) => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next)));
    setHiddenIds(next);
  }, []);

  const hideRow = useCallback(
    (id: string) => {
      const next = new Set(hiddenIds);
      next.add(id);
      persistHidden(next);
    },
    [hiddenIds, persistHidden],
  );

  const unhideRow = useCallback(
    (id: string) => {
      const next = new Set(hiddenIds);
      next.delete(id);
      persistHidden(next);
    },
    [hiddenIds, persistHidden],
  );

  const unhideAll = useCallback(() => {
    persistHidden(new Set<string>());
  }, [persistHidden]);


  const load = useCallback(async () => {
    setLoading(true);
    const [confirmedRes, notReassignedRes, resolvedRes, overridesRes] =
      await Promise.all([
        supabase
          .from("product_scan_history")
          .select("confirmed_product_id")
          .not("confirmed_product_id", "is", null),

        supabase.from("products").select(SELECT),

        supabase
          .from("unidentified_items")
          .select("resolved_product_id")
          .eq("status", "resolved")
          .not("resolved_product_id", "is", null),
        supabase.from("product_stock_overrides").select("product_id, available"),
      ]);

    const err =
      confirmedRes.error ||
      notReassignedRes.error ||
      resolvedRes.error ||
      overridesRes.error;

    if (err) {
      toast({ title: "Load failed", description: err.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const confirmedIds = new Set(
      (confirmedRes.data ?? []).map((r: any) => r.confirmed_product_id as string),
    );
    const resolvedIds = new Set(
      (resolvedRes.data ?? []).map((r: any) => r.resolved_product_id as string),
    );
    const overrides = new Map<string, boolean>(
      (overridesRes.data ?? []).map((r: any) => [r.product_id as string, r.available as boolean]),
    );
    const inStock = (p: Product) => overrides.get(p.id) ?? p.available !== false;

    setUnverified(
      ((notReassignedRes.data ?? []) as Product[])
        .filter((p) => !confirmedIds.has(p.id) && !resolvedIds.has(p.id) && inStock(p))
        .sort((a, b) => {
          const aReal = isRealSku(a.sku);
          const bReal = isRealSku(b.sku);
          if (aReal !== bReal) return aReal ? -1 : 1;
          return (a.sku ?? "").localeCompare(b.sku ?? "", undefined, { numeric: true });
        }),
    );
    setLoading(false);

  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredUnverified = useMemo(() => {
    const t = qUnverified.trim().toLowerCase();
    if (!t) return unverified;
    return unverified.filter(
      (p) =>
        p.title.toLowerCase().includes(t) ||
        (p.sku ?? "").toLowerCase().includes(t) ||
        (p.bin_location ?? "").toLowerCase().includes(t),
    );
  }, [unverified, qUnverified]);


  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-extrabold text-foreground">SKU Health</h1>
      </div>

      <Tabs defaultValue="unverified">
        <TabsList>
          <TabsTrigger value="unverified">
            Unverified Original SKUs
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
              {unverified.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unverified" className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qUnverified}
                onChange={(e) => setQUnverified(e.target.value)}
                placeholder="Search title, SKU, bin…"
                className="pl-8 text-base"
              />
            </div>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("unverified_skus.csv", [
                  ["id", "title", "sku", "bin_location"],
                  ...filteredUnverified.map((p) => [
                    p.id,
                    p.title,
                    displaySku(p.sku),

                    p.bin_location ?? "",
                  ]),
                ])
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : filteredUnverified.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="space-y-2">
              {filteredUnverified.map((p) => {
                const sku = displaySku(p.sku);
                return (
                <Card
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setChecking({ id: p.id, title: p.title, sku: p.sku, image: p.image })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setChecking({ id: p.id, title: p.title, sku: p.sku, image: p.image });
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Thumb src={p.image} alt={p.title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                        {sku ? (
                          <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                            Unverified
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            No SKU
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        SKU: <span className="font-mono">{sku || "—"}</span> · Bin:{" "}
                        <span className="font-mono">{p.bin_location || "—"}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                );
              })}

            </div>
          )}
        </TabsContent>

      </Tabs>

      <SkuCheckDialog
        product={checking}
        onClose={() => setChecking(null)}
        onDone={(id) => setUnverified((prev) => prev.filter((x) => x.id !== id))}
      />
    </div>

  );
};

export default AdminSkuHealth;
