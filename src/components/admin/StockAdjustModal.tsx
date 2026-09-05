import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Minus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adjustProductStock, fetchStockLog, StockLogEntry } from "@/lib/stockService";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
  productTitle: string;
  currentStock: number;
  reserved?: number;
  onUpdated: (newStock: number) => void;
}

const TYPE_LABEL: Record<string, string> = {
  manual_set: "Set exact value",
  manual_adjust: "Adjusted by amount",
  order_confirm: "Order confirmed",
  order_cancel_restore: "Order cancelled",
};

const StockAdjustModal = ({ open, onClose, productId, productTitle, currentStock, reserved = 0, onUpdated }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [value, setValue] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<StockLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const loadLog = async () => {
    setLoadingLog(true);
    try { setLog(await fetchStockLog(productId)); }
    catch { /* log stays empty */ }
    finally { setLoadingLog(false); }
  };

  useEffect(() => {
    if (open) { setMode("set"); setValue(""); setDirection(1); setComment(""); void loadLog(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  const handleSubmit = async () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return toast({ title: "Enter a valid number", variant: "destructive" });
    setSaving(true);
    try {
      const newStock = await adjustProductStock(productId, mode, mode === "set" ? n : n * direction, comment);
      onUpdated(newStock);
      toast({ title: `Stock updated — now ${newStock}` });
      setValue(""); setComment("");
      await loadLog();
    } catch (err: any) {
      toast({ title: "Stock update failed", description: err?.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Stock — {productTitle}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="font-bold text-lg">{currentStock}</span> in stock
          {reserved > 0 && (
            <span className="text-muted-foreground"> · {reserved} reserved (confirmed, not yet shipped)</span>
          )}
        </div>

        <Tabs defaultValue="adjust">
          <TabsList className="w-full">
            <TabsTrigger value="adjust" className="flex-1">Adjust</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="adjust" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Button type="button" variant={mode === "set" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("set")}>
                Set exact value
              </Button>
              <Button type="button" variant={mode === "adjust" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("adjust")}>
                Adjust by amount
              </Button>
            </div>

            <div>
              <Label className="text-xs font-bold">{mode === "set" ? "New total stock" : "Amount"}</Label>
              <div className="flex gap-2">
                {mode === "adjust" && (
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant={direction === 1 ? "default" : "outline"} onClick={() => setDirection(1)} title="Increase">
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button type="button" size="icon" variant={direction === -1 ? "default" : "outline"} onClick={() => setDirection(-1)} title="Decrease">
                      <Minus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <Input type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Comment</Label>
              <Textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. new shipment arrived, damaged units removed"
              />
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save stock change"}
            </Button>
          </TabsContent>

          <TabsContent value="activity" className="mt-3">
            {loadingLog ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : log.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No stock changes recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {log.map((e) => (
                  <div key={e.id} className="rounded-md border border-border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{TYPE_LABEL[e.change_type] || e.change_type}</span>
                      <Badge variant={e.delta > 0 ? "default" : e.delta < 0 ? "destructive" : "outline"}>
                        {e.delta > 0 ? `+${e.delta}` : e.delta}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.previous_value ?? 0} → {e.new_value ?? 0} · {e.changed_by_email || "system"} ·{" "}
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                    {e.comment && <p className="text-xs mt-1">{e.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default StockAdjustModal;
