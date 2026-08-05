import { useRef, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera, Loader2, CheckCircle2, AlertTriangle, RotateCcw,
  Flag, ScanLine, ListChecks,
} from "lucide-react";

/**
 * Product Scan — warehouse SKU verification + bin assignment.
 * Worker photographs the physical item, types the SKU written on the box,
 * AI vision compares against the catalog. High confidence -> confirm ->
 * writes bin_location and loops back to camera for the next scan.
 * Low confidence -> ranked candidates to pick from, or flag for review.
 */

type CheckResult =
  | { status: "matched"; scan_id: string; product: { id: string; sku: string; title: string }; confidence: number; reasoning?: string }
  | { status: "mismatch"; scan_id: string; typed_sku_found: boolean; original: { product: { id: string; sku: string; title: string }; confidence: number; reasoning?: string } | null; candidates: { id: string; sku: string; title: string; confidence: number }[] };

type Stats = { scanned: number; flagged: number };

export default function AdminProductScan() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [position, setPosition] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // product id being confirmed
  const [stats, setStats] = useState<Stats>({ scanned: 0, flagged: 0 });
  const [view, setView] = useState<"scan" | "review">("scan");
  const [flagged, setFlagged] = useState<any[]>([]);
  const skuRef = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(async () => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data } = await (supabase.from("product_scan_history") as any)
      .select("status")
      .gte("created_at", startOfDay.toISOString());
    const rows = data || [];
    setStats({ scanned: rows.filter((r: any) => r.status !== "pending").length, flagged: rows.filter((r: any) => r.status === "flagged").length });
  }, []);

  const loadFlagged = useCallback(async () => {
    const { data } = await (supabase.from("product_scan_history") as any)
      .select("id, created_at, typed_sku, position, photo_url, status, candidates, notes")
      .in("status", ["flagged", "mismatch"])
      .order("created_at", { ascending: false })
      .limit(30);
    setFlagged(data || []);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (view === "review") loadFlagged(); }, [view, loadFlagged]);

  const resetToCamera = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setSku("");
    setPosition("");
    setResult(null);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const onPhotoSelected = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setResult(null);
    setTimeout(() => skuRef.current?.focus(), 100);
  };

  const runCheck = async () => {
    if (!photoFile || !sku.trim() || !position.trim()) {
      toast({ title: "Fill in SKU and position first", variant: "destructive" });
      return;
    }
    setChecking(true);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `scans/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-scans").upload(path, photoFile, { contentType: photoFile.type || "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-scans").getPublicUrl(path);
      const photoUrl = pub.publicUrl;

      const { data, error } = await supabase.functions.invoke("scan-product", {
        body: { action: "check", sku: sku.trim(), position: position.trim(), photo_url: photoUrl, actor: "warehouse" },
      });
      if (error) throw error;
      setResult(data as CheckResult);
    } catch (e: any) {
      toast({ title: "Check failed", description: e.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const confirmMatch = async (scanId: string, productId: string) => {
    setConfirming(productId);
    const { error } = await supabase.functions.invoke("scan-product", {
      body: { action: "confirm", scan_id: scanId, product_id: productId, position, actor: "warehouse" },
    });
    setConfirming(null);
    if (error) { toast({ title: "Confirm failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Bin ${position} confirmed` });
    loadStats();
    resetToCamera();
  };

  const flagForReview = async (scanId: string) => {
    await supabase.functions.invoke("scan-product", { body: { action: "flag", scan_id: scanId } });
    toast({ title: "Flagged for review" });
    loadStats();
    resetToCamera();
  };

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5" />
          <h1 className="text-lg font-bold">Product Scan</h1>
        </div>
        <div className="flex gap-1.5">
          <Button variant={view === "scan" ? "default" : "outline"} size="sm" onClick={() => setView("scan")}>Scan</Button>
          <Button variant={view === "review" ? "default" : "outline"} size="sm" onClick={() => setView("review")}>
            <ListChecks className="w-3.5 h-3.5 mr-1" /> Review
          </Button>
        </div>
      </div>

      <div className="flex gap-3 text-sm text-muted-foreground px-1">
        <span>{stats.scanned} scanned today</span>
        <span className="text-amber-600">{stats.flagged} flagged</span>
      </div>

      {view === "scan" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotoSelected(f); e.target.value = ""; }}
          />

          {!photoPreview ? (
            <Card>
              <CardContent className="p-10 text-center">
                <Camera className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <Button size="lg" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-2" /> Take photo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <img src={photoPreview} alt="Captured product" className="w-full rounded-lg max-h-64 object-cover" />

                {!result && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">SKU on box</label>
                        <Input ref={skuRef} value={sku} onChange={(e) => setSku(e.target.value)} inputMode="numeric" placeholder="e.g. 37" className="text-base" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Position / bin</label>
                        <Input value={position} onChange={(e) => setPosition(e.target.value)} inputMode="text" placeholder="e.g. 37" className="text-base" />
                      </div>
                    </div>
                    <Button className="w-full" size="lg" onClick={runCheck} disabled={checking}>
                      {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {checking ? "Checking…" : "Done"}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={resetToCamera}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Retake
                    </Button>
                  </>
                )}

                {result?.status === "matched" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-green-800">Matches {result.product.title}</div>
                        <div className="text-sm text-green-700">{result.confidence}% confidence · SKU {result.product.sku} → bin {position}</div>
                      </div>
                    </div>
                    <Button className="w-full" size="lg" onClick={() => confirmMatch(result.scan_id, result.product.id)} disabled={!!confirming}>
                      {confirming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Confirm & next
                    </Button>
                  </div>
                )}

                {result?.status === "mismatch" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        {result.typed_sku_found && result.original
                          ? <>Doesn't look like SKU {sku} ({Math.round(result.original.confidence)}% match to {result.original.product.title})</>
                          : <>SKU {sku} not found in catalog</>}
                      </div>
                    </div>

                    {result.candidates.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">Did you mean:</div>
                        <div className="space-y-1.5">
                          {result.candidates.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => confirmMatch(result.scan_id, c.id)}
                              disabled={!!confirming}
                              className="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              <span className="text-sm">{c.title} <span className="text-muted-foreground">({c.sku})</span></span>
                              <span className="text-sm font-medium text-blue-700">{Math.round(c.confidence)}%</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button variant="outline" className="w-full" onClick={() => flagForReview(result.scan_id)}>
                      <Flag className="w-4 h-4 mr-2" /> None of these — flag for review
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={resetToCamera}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Retake / skip
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === "review" && (
        <Card>
          <CardContent className="p-4">
            <div className="font-medium mb-1">Needs review</div>
            <div className="text-xs text-muted-foreground mb-3">Flagged or unresolved mismatches</div>
            {flagged.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Nothing pending review.</div>
            ) : (
              <div className="space-y-2">
                {flagged.map((f) => (
                  <div key={f.id} className="flex gap-3 items-start border-t first:border-t-0 pt-2.5 first:pt-0">
                    <img src={f.photo_url} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
                    <div className="flex-1 text-sm">
                      <div>SKU typed: <span className="font-mono">{f.typed_sku}</span> · bin {f.position}</div>
                      <div className="text-xs text-muted-foreground">{f.status} · {new Date(f.created_at).toLocaleString()}</div>
                      {Array.isArray(f.candidates) && f.candidates.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Best guess: {f.candidates[0].title} ({Math.round(f.candidates[0].confidence)}%)
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
