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
  const [binCustom, setBinCustom] = useState(false); // bin mirrors SKU unless overridden
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // product id being confirmed
  const [stats, setStats] = useState<Stats>({ scanned: 0, flagged: 0 });
  const [view, setView] = useState<"scan" | "review">("scan");
  const [flagged, setFlagged] = useState<any[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fp, setFp] = useState({ total: 0, done: 0, running: false, doneMsg: false });

  const skuRef = useRef<HTMLInputElement>(null);

  // Pull the fullest possible message out of a supabase functions.invoke error.
  // The useful detail usually lives in error.context (a Response), not error.message.
  const describeError = async (e: any, label: string): Promise<string> => {
    const parts: string[] = [`${label}: ${e?.message || String(e)}`];
    const ctx = e?.context;
    try {
      if (ctx && typeof ctx.text === "function") {
        const body = await ctx.clone?.().text?.() ?? await ctx.text();
        if (body) parts.push(`HTTP ${ctx.status ?? "?"} body: ${body}`);
        else if (ctx.status) parts.push(`HTTP ${ctx.status} (empty body)`);
      } else if (ctx) {
        parts.push(`context: ${typeof ctx === "string" ? ctx : JSON.stringify(ctx)}`);
      }
    } catch (inner: any) {
      parts.push(`(could not read response body: ${inner?.message || String(inner)})`);
    }
    if (e?.status && !parts.some((p) => p.includes("HTTP"))) parts.push(`status: ${e.status}`);
    return parts.join("\n");
  };

  // Bin defaults to the typed SKU; only diverges when the worker opts in.
  const effectivePosition = (binCustom ? position : sku).trim();

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

  const loadFingerprintProgress = useCallback(async () => {
    const [{ count: total }, { count: done }] = await Promise.all([
      (supabase.from("products") as any).select("id", { count: "exact", head: true }),
      (supabase.from("products") as any).select("id", { count: "exact", head: true }).not("fingerprint_generated_at", "is", null),
    ]);
    setFp((s) => ({ ...s, total: total ?? 0, done: done ?? 0 }));
  }, []);

  // Backfill fingerprints in batches of 20 until the function reports 0 remaining.
  const runFingerprints = async () => {
    setFp((s) => ({ ...s, running: true, doneMsg: false }));
    try {
      for (let i = 0; i < 100; i++) {
        const { data, error } = await supabase.functions.invoke("generate-product-fingerprints", { body: { limit: 20 } });
        if (error) throw error;
        const remaining = Number(data?.remaining ?? 0);
        setFp((s) => ({ ...s, done: Math.max(s.total - remaining, 0) }));
        if (remaining <= 0 || Number(data?.processed ?? 0) === 0) break;
      }
      setFp((s) => ({ ...s, doneMsg: true }));
      await loadFingerprintProgress();
    } catch (e: any) {
      setErrorText(await describeError(e, "Fingerprint generation failed"));
    } finally {
      setFp((s) => ({ ...s, running: false }));
    }
  };

  useEffect(() => { loadStats(); loadFingerprintProgress(); }, [loadStats, loadFingerprintProgress]);
  useEffect(() => { if (view === "review") loadFlagged(); }, [view, loadFlagged]);


  const resetToCamera = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setSku("");
    setPosition("");
    setBinCustom(false);
    setResult(null);
    setErrorText(null);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const onPhotoSelected = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setResult(null);
    setErrorText(null);
    setTimeout(() => skuRef.current?.focus(), 100);
  };

  const runCheck = async () => {
    if (!photoFile || !sku.trim() || !effectivePosition) {
      toast({ title: "Fill in SKU and position first", variant: "destructive" });
      return;
    }
    setChecking(true);
    setErrorText(null);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `scans/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-scans").upload(path, photoFile, { contentType: photoFile.type || "image/jpeg" });
      if (upErr) throw upErr;
      // bucket is private — use a signed URL (valid 7 days) so the AI vision call can fetch it
      const { data: signed, error: signErr } = await supabase.storage
        .from("product-scans")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signErr) throw signErr;
      const photoUrl = signed.signedUrl;

      const { data, error } = await supabase.functions.invoke("scan-product", {
        body: { action: "check", sku: sku.trim(), position: effectivePosition, photo_url: photoUrl, actor: "warehouse" },
      });
      if (error) throw error;
      setResult(data as CheckResult);
    } catch (e: any) {
      const full = await describeError(e, "Check failed");
      setErrorText(full);
      toast({ title: "Check failed", description: e?.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const confirmMatch = async (scanId: string, productId: string) => {
    setConfirming(productId);
    setErrorText(null);
    const { error } = await supabase.functions.invoke("scan-product", {
      body: { action: "confirm", scan_id: scanId, product_id: productId, position: effectivePosition, actor: "warehouse" },
    });
    setConfirming(null);
    if (error) {
      setErrorText(await describeError(error, "Confirm failed"));
      toast({ title: "Confirm failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Bin ${effectivePosition} confirmed` });
    loadStats();
    resetToCamera();
  };

  const flagForReview = async (scanId: string) => {
    setErrorText(null);
    const { error } = await supabase.functions.invoke("scan-product", { body: { action: "flag", scan_id: scanId } });
    if (error) {
      setErrorText(await describeError(error, "Flag failed"));
      toast({ title: "Flag failed", description: error.message, variant: "destructive" });
      return;
    }
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

      <Card>
        <CardContent className="p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {fp.done} / {fp.total} products fingerprinted
            </div>
            <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${fp.total ? Math.round((fp.done / fp.total) * 100) : 0}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {fp.running
                ? "Generating… keep this page open."
                : fp.doneMsg
                  ? "Done."
                  : "Used to find candidate products when a SKU doesn't match."}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={fp.running} onClick={runFingerprints}>
            {fp.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate fingerprints"}
          </Button>
        </CardContent>
      </Card>



      {errorText && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-red-800 text-sm">Error</div>
            <pre className="text-xs text-red-700 whitespace-pre-wrap break-words mt-1 font-mono">{errorText}</pre>
            <button type="button" className="mt-2 text-xs underline text-red-700" onClick={() => setErrorText(null)}>dismiss</button>
          </div>
        </div>
      )}



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
                    <div>
                      <label className="text-xs text-muted-foreground">SKU on box</label>
                      <Input ref={skuRef} value={sku} onChange={(e) => setSku(e.target.value)} inputMode="numeric" placeholder="e.g. 37" className="text-base" />
                      {!binCustom ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Bin: <span className="font-mono">{sku.trim() || "—"}</span>{" "}
                          <button type="button" className="underline text-blue-700" onClick={() => { setPosition(sku.trim()); setBinCustom(true); }}>
                            different bin?
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <label className="text-xs text-muted-foreground">Position / bin</label>
                          <Input autoFocus value={position} onChange={(e) => setPosition(e.target.value)} inputMode="text" placeholder="e.g. A12" className="text-base" />
                          <button type="button" className="mt-1 text-xs underline text-muted-foreground" onClick={() => { setBinCustom(false); setPosition(""); }}>
                            use SKU as bin
                          </button>
                        </div>
                      )}
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
                        <div className="text-sm text-green-700">{result.confidence}% confidence · SKU {result.product.sku} → bin {effectivePosition}</div>
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
                              <span className="text-sm">
                                {c.title} <span className="text-muted-foreground">({c.sku})</span>
                                {c.sku && sku.trim() && c.sku !== sku.trim() && (
                                  <span className="block text-xs text-amber-700">
                                    Box labeled {sku.trim()} → actually {c.sku}
                                  </span>
                                )}
                              </span>
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
