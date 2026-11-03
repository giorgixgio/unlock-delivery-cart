import { useEffect, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deployState, refreshNow, setDeployBusy, startVersionWatch, subscribeDeploy } from "@/lib/deployGuard";

let snap = deployState();
const get = () => { const n = deployState(); if (n.updateReady !== snap.updateReady || n.busy !== snap.busy || n.hardBusy !== snap.hardBusy) snap = n; return snap; };

/** Marks a screen as busy so a new version waits (kind "hard" never reloads). */
export function useDeployBusy(key: string, active: boolean, kind: "order" | "hard" = "order") {
  useEffect(() => { setDeployBusy(key, active, kind); return () => setDeployBusy(key, false, kind); }, [key, active, kind]);
}

export default function NewVersionBanner() {
  useEffect(() => { startVersionWatch(); }, []);
  const s = useSyncExternalStore(subscribeDeploy, get);
  if (!s.updateReady) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span className="flex-1">New version available — finish this order, then it will refresh</span>
      <Button size="sm" variant="outline" className="h-8" disabled={s.hardBusy} onClick={refreshNow}>Refresh now</Button>
    </div>
  );
}
