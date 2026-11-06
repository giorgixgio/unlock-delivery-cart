import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Headphones } from "lucide-react";
import {
  fetchCallQueueSettings, saveCallQueueSettings, getCallQueueTestMode, setCallQueueTestMode,
  type CallQueueSettings,
} from "@/lib/callQueueService";

/** Admin-only rollout card for Call Queue (test). Renders nothing for other roles. */
export default function CallQueueAdminCard() {
  const { role, user } = useAdminAuth();
  const { toast } = useToast();
  const [testMode, setTestMode] = useState(getCallQueueTestMode());
  const [settings, setSettings] = useState<CallQueueSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [masterAsk, setMasterAsk] = useState<boolean | null>(null);
  const [night, setNight] = useState({ night_from: "", night_to: "", night_first_call_after: "", night_retry_slot: "" });
  const [order, setOrder] = useState({ morning_block_until: "12:00", retry_every_n: "4" });
  useEffect(() => {
    if (settings) setOrder({ morning_block_until: settings.morning_block_until, retry_every_n: String(settings.retry_every_n) });
  }, [settings]);
  useEffect(() => {
    if (settings) setNight({ night_from: settings.night_from, night_to: settings.night_to, night_first_call_after: settings.night_first_call_after, night_retry_slot: settings.night_retry_slot });
  }, [settings]);

  useEffect(() => {
    if (role !== "admin") return;
    fetchCallQueueSettings().then(setSettings).catch(() => {});
  }, [role]);

  if (role !== "admin") return null;

  const toggleTest = (on: boolean) => { setCallQueueTestMode(on); setTestMode(on); };

  const saveMaster = async (on: boolean) => {
    if (!settings) return;
    setBusy("master");
    const ok = await saveCallQueueSettings({ operators_use_queue: on }, user?.email || "admin");
    setBusy(null); setMasterAsk(null);
    if (!ok) { toast({ title: "Couldn't save", variant: "destructive" }); return; }
    setSettings({ ...settings, operators_use_queue: on });
    toast({ title: on ? "Operators now use the Call Queue" : "Operators back on the Orders page" });
    setCallQueueTestMode(getCallQueueTestMode());
  };

  const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const saveOrder = async () => {
    if (!settings) return;
    const n = Number(order.retry_every_n);
    if (!validTime(order.morning_block_until) || !Number.isInteger(n) || n < 1 || n > 20) { toast({ title: "Use HH:MM and a whole number 1–20", variant: "destructive" }); return; }
    setBusy("order");
    const ok = await saveCallQueueSettings({ morning_block_until: order.morning_block_until, retry_every_n: n }, user?.email || "admin");
    setBusy(null);
    if (!ok) { toast({ title: "Couldn't save", variant: "destructive" }); return; }
    setSettings({ ...settings, morning_block_until: order.morning_block_until, retry_every_n: n });
    toast({ title: "Saved" });
  };
  const saveNight = async () => {
    if (!settings) return;
    if (!Object.values(night).every(validTime)) { toast({ title: "Use HH:MM times", variant: "destructive" }); return; }
    setBusy("night");
    const ok = await saveCallQueueSettings(night, user?.email || "admin");
    setBusy(null);
    if (!ok) { toast({ title: "Couldn't save", variant: "destructive" }); return; }
    setSettings({ ...settings, ...night });
    toast({ title: "Night lead times saved" });
  };

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground p-3 sm:p-4 max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4" />
          <div>
            <div className="text-sm font-bold">Call Queue (test)</div>
            <div className="text-xs text-muted-foreground">Operators get orders only after pressing Start shift.</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          Me
          <Switch checked={testMode} onCheckedChange={toggleTest} />
        </label>
      </div>
      {testMode && (
        <Link to="/admin/call-queue" className="mt-2 inline-block text-xs font-bold text-primary underline">
          Open Call Queue →
        </Link>
      )}
      <div className="mt-3 border-t border-border pt-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">Operators use Call Queue</div>
          <div className="text-xs text-muted-foreground">On: every operator (not managers/admins) works only from the queue; Orders list hidden for them.</div>
        </div>
        <Switch checked={!!settings?.operators_use_queue} disabled={!settings || busy === "master"} onCheckedChange={(v) => setMasterAsk(v)} />
      </div>
      <div className="mt-3 border-t border-border pt-2 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">Night leads (Tbilisi time)</div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["night_from", "Night from"], ["night_to", "Night to"],
            ["night_first_call_after", "First call after"], ["night_retry_slot", "No-answer retry at"],
          ] as const).map(([k, label]) => (
            <label key={k} className="text-xs space-y-1">
              <span className="text-muted-foreground">{label}</span>
              <Input value={night[k]} onChange={(e) => setNight({ ...night, [k]: e.target.value })} placeholder="HH:MM" className="h-9 text-base" />
            </label>
          ))}
        </div>
        <Button size="sm" variant="outline" disabled={!settings || busy === "night"} onClick={saveNight}>Save night times</Button>
      </div>
      <div className="mt-3 border-t border-border pt-2 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">Queue order</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Morning block until (retries first)</span>
            <Input value={order.morning_block_until} onChange={(e) => setOrder({ ...order, morning_block_until: e.target.value })} placeholder="HH:MM" className="h-9 text-base" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Every Nth order is a retry</span>
            <Input inputMode="numeric" value={order.retry_every_n} onChange={(e) => setOrder({ ...order, retry_every_n: e.target.value })} className="h-9 text-base" />
          </label>
        </div>
        <Button size="sm" variant="outline" disabled={!settings || busy === "order"} onClick={saveOrder}>Save queue order</Button>
      </div>
      <AlertDialog open={masterAsk !== null} onOpenChange={(o) => !o && setMasterAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{masterAsk ? "Switch all operators to the Call Queue?" : "Switch operators back to the Orders page?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {masterAsk
                ? "Operators will no longer see the Orders list and will open on the Call Queue. Managers and admins keep both. Takes effect within a minute."
                : "Operators will see the Orders page again; only admins in test mode can open the queue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => masterAsk !== null && saveMaster(masterAsk)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
