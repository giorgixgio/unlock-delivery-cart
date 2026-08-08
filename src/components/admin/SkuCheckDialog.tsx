import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompression";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

export type SkuCheckProduct = {
  id: string;
  title: string;
  sku: string | null;
  image: string | null;
};

/**
 * Same confirm / reject flow as the Fast Check page, opened from a product row.
 * Confirm marks the SKU as verified; reject asks for a photo and flags the item.
 */
export default function SkuCheckDialog({
  product,
  onClose,
  onDone,
}: {
  product: SkuCheckProduct | null;
  onClose: () => void;
  onDone: (productId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<"wrong_item" | "not_found">("wrong_item");

  const sku = (product?.sku ?? "").trim();
  const realSku = /^\d+$/.test(sku) && Number(sku) >= 1000 ? "" : sku;

  const onConfirm = async () => {
    if (!product || !realSku || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("fast-inventory-check", {
        body: { action: "confirm", sku: realSku, position: realSku, actor: "warehouse" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.status === "duplicate") {
        toast({
          title: "დუბლირებული SKU",
          description: "გამოიყენე სწრაფი შემოწმება ამ SKU-ის მოსაგვარებლად.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: `SKU ${realSku} დადასტურდა` });
      onDone(product.id);
      onClose();
    } catch (e: any) {
      toast({ title: "Confirm failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = (reason: "wrong_item" | "not_found") => {
    if (busy) return;
    reasonRef.current = reason;
    fileRef.current?.click();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !product) return;
    const typedSku = realSku || product.sku || product.id;
    const reason = reasonRef.current;
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
          reason,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: reason === "not_found" ? "მონიშნულია — ბაზაში არ არის" : "მონიშნულია შესამოწმებლად",
      });
      onDone(product.id);
      onClose();
    } catch (err: any) {
      toast({ title: "Reject failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      reasonRef.current = "wrong_item";
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            SKU <span className="font-mono">{realSku || "—"}</span>
          </DialogTitle>
        </DialogHeader>

        {product && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-border bg-muted">
                {product.image ? (
                  <img src={product.image} alt={product.title} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <p className="text-sm font-semibold leading-tight text-foreground">{product.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onConfirm}
                disabled={busy || !realSku}
                className="h-16 bg-green-600 text-base font-bold text-white hover:bg-green-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="mr-2 h-5 w-5" /> დადასტურება</>}
              </Button>
              <Button
                onClick={() => pickPhoto("wrong_item")}
                disabled={busy}
                className="h-16 bg-red-600 text-base font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                <X className="mr-2 h-5 w-5" /> უარყოფა
              </Button>
            </div>

            <Button
              onClick={() => pickPhoto("not_found")}
              disabled={busy}
              className="h-12 w-full bg-amber-500 text-base font-bold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              <AlertTriangle className="mr-2 h-5 w-5" /> ვერ მოიძებნა — მონიშნე
            </Button>

            {!realSku && (
              <p className="text-xs text-muted-foreground">
                ამ პროდუქტს რეალური SKU არ აქვს — დადასტურება მიუწვდომელია.
              </p>
            )}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      </DialogContent>
    </Dialog>
  );
}
