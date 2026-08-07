import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompression";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, Delete, Loader2, Zap } from "lucide-react";

type MatchedProduct = { id: string; sku: string; title: string; image: string | null };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/** Start of today, local time — used for the "today" counters. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function AdminFastInventoryCheck() {
  const { toast } = useToast();
  const [sku, setSku] = useState("");
  const [matched, setMatched] = useState<MatchedProduct | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "confirm" | "reject"; text: string } | null>(null);
  const [counts, setCounts] = useState({ confirmed: 0, flagged: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCounts = useCallback(async () => {
    const since = startOfToday();
    const [{ count: confirmed }, { count: flagged }] = await Promise.all([
      supabase
        .from("product_scan_history")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("created_at", since),
      supabase
        .from("unidentified_items")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
    ]);
    setCounts({ confirmed: confirmed ?? 0, flagged: flagged ?? 0 });
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Debounced exact-SKU lookup as digits are typed.
  useEffect(() => {
    const value = sku.trim();
    if (!value) {
      setMatched(null);
      setLooking(false);
      return;
    }
    setLooking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, sku, title, image")
        .eq("sku", value)
        .limit(1);
      const p = data?.[0];
      setMatched(p ? { id: p.id, sku: p.sku, title: p.title, image: p.image || null } : null);
      setLooking(false);
    }, 250);
    return () => clearTimeout(t);
  }, [sku]);

  const reset = () => {
    setSku("");
    setMatched(null);
  };

  const showFlash = (kind: "confirm" | "reject", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 1400);
  };

  const press = (d: string) => {
    if (busy) return;
    setSku((s) => (s.length >= 8 ? s : s + d));
  };
  const backspace = () => {
    if (busy) return;
    setSku((s) => s.slice(0, -1));
  };

  const onConfirm = async () => {
    if (!matched || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("fast-inventory-check", {
        body: { action: "confirm", sku: matched.sku, position: matched.sku, actor: "warehouse" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      showFlash("confirm", `SKU ${matched.sku} დადასტურდა`);
      setCounts((c) => ({ ...c, confirmed: c.confirmed + 1 }));
      reset();
    } catch (e: any) {
      toast({ title: "Confirm failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onRejectClick = () => {
    if (!matched || busy) return;
    fileRef.current?.click();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !matched) return;
    const typedSku = matched.sku;
    setBusy(true);
    try {
      const compressed = await compressImage(file, 1280, 0.82);
      const path = `scans/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("product-scans")
        .upload(path, compressed, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("product-scans")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signErr) throw signErr;

      const { data, error } = await supabase.functions.invoke("fast-inventory-check", {
        body: {
          action: "reject",
          sku: typedSku,
          position: typedSku,
          photo_url: signed.signedUrl,
          actor: "warehouse",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      showFlash("reject", "გაიგზავნა — მონიშნულია შესამოწმებლად");
      setCounts((c) => ({ ...c, flagged: c.flagged + 1 }));
      reset();
    } catch (err: any) {
      toast({ title: "Reject failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const ready = !!matched && !busy;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-3 p-3 select-none">
      <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5 text-foreground">
          <Zap className="h-4 w-4" /> Fast Check
        </span>
        <span>
          <span className="text-green-600 font-bold">{counts.confirmed}</span> confirmed ·{" "}
          <span className="text-red-600 font-bold">{counts.flagged}</span> flagged today
        </span>
      </div>

      {/* Typed SKU */}
      <Card className="flex h-24 items-center justify-center bg-foreground text-background">
        <span className="font-mono text-6xl font-black tracking-widest tabular-nums">
          {sku || "—"}
        </span>
      </Card>

      {/* Matched product */}
      <div className="min-h-[104px]">
        {flash ? (
          <Card
            className={`flex h-[104px] items-center justify-center text-xl font-bold text-white ${
              flash.kind === "confirm" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {flash.text}
          </Card>
        ) : matched ? (
          <Card className="flex h-[104px] items-center gap-3 overflow-hidden p-2">
            {matched.image ? (
              <img src={matched.image} alt={matched.title} className="h-full w-24 rounded object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                no photo
              </div>
            )}
            <p className="line-clamp-3 flex-1 text-base font-semibold leading-tight">{matched.title}</p>
          </Card>
        ) : (
          <Card className="flex h-[104px] items-center justify-center text-base text-muted-foreground">
            {looking && sku ? <Loader2 className="h-5 w-5 animate-spin" /> : sku ? "პროდუქტი ვერ მოიძებნა" : "აკრიფე SKU"}
          </Card>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.slice(0, 9).map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-16 rounded-xl bg-muted text-3xl font-bold active:scale-95 active:bg-muted-foreground/20"
          >
            {d}
          </button>
        ))}
        <button
          onClick={reset}
          className="h-16 rounded-xl bg-muted text-base font-bold text-muted-foreground active:scale-95"
        >
          CLR
        </button>
        <button
          onClick={() => press("0")}
          className="h-16 rounded-xl bg-muted text-3xl font-bold active:scale-95 active:bg-muted-foreground/20"
        >
          0
        </button>
        <button
          onClick={backspace}
          className="flex h-16 items-center justify-center rounded-xl bg-muted active:scale-95"
        >
          <Delete className="h-7 w-7" />
        </button>
      </div>

      {/* Actions */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
        <Button
          onClick={onConfirm}
          disabled={!ready}
          className="h-20 bg-green-600 text-xl font-bold text-white hover:bg-green-700 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Check className="mr-2 h-7 w-7" /> Confirm</>}
        </Button>
        <Button
          onClick={onRejectClick}
          disabled={!ready}
          className="h-20 bg-red-600 text-xl font-bold text-white hover:bg-red-700 disabled:opacity-40"
        >
          <X className="mr-2 h-7 w-7" /> Reject
        </Button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
    </div>
  );
}
