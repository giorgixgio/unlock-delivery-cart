import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createSupportTicket, ISSUE_REASONS, type IssueReason } from "@/lib/supportTickets";

/** Low-key hand-off: creates an operator_flag ticket and takes the lead out of the call queue. */
export default function IssueFlagButton({ orderId, source, onCreated, className }: { orderId: string; source: "call_queue" | "quick_review"; onCreated?: () => void; className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<IssueReason | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const r = await createSupportTicket(orderId, reason, text, source);
      toast({ title: r.existing ? "ამ შეკვეთაზე მიმართვა უკვე არსებობს" : "მიმართვა გადაეცა მხარდაჭერას", description: "შეკვეთა რიგიდან გავიდა." });
      setOpen(false); setReason(null); setText("");
      onCreated?.();
    } catch (e: any) {
      toast({ title: "ვერ შეიქმნა", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={`text-muted-foreground ${className || ""}`}>⚑ Issue</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="flex flex-wrap gap-1.5">
          {ISSUE_REASONS.map(([k, label]) => (
            <Button key={k} type="button" size="sm" variant={reason === k ? "default" : "outline"} onClick={() => setReason(k)}>{label}</Button>
          ))}
        </div>
        <Input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="კომენტარი (არასავალდებულო)" className="text-base" />
        <Button className="w-full" disabled={!reason || busy} onClick={submit}>გადაცემა</Button>
      </PopoverContent>
    </Popover>
  );
}
