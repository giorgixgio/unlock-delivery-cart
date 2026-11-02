import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Headphones, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { queueAssign } from "@/lib/callQueueService";
import { OUTCOME_LOCK_REASON } from "@/lib/outcomeLock";

/** Shown to managers when call outcomes are locked; optionally hands the order to them in the queue. */
export default function OutcomeLockBanner({ orderId, onNavigate }: { orderId?: string; onNavigate?: () => void }) {
  const { user } = useAdminAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    if (orderId && user?.email) { try { await queueAssign(orderId, user.email); } catch { /* still open the queue */ } }
    setBusy(false);
    onNavigate?.();
    navigate("/admin/call-queue");
  };
  return (
    <div className="rounded-lg border border-blue-300 bg-blue-50 text-blue-900 px-3 py-2 flex items-center gap-2 text-sm font-semibold">
      <Headphones className="w-4 h-4 shrink-0" />
      <span className="flex-1">{OUTCOME_LOCK_REASON}</span>
      <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={open}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open in Call Queue"}
      </Button>
    </div>
  );
}
