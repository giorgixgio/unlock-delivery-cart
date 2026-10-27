import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getCallSyncDeviceId,
  shouldReactToCall,
  type ActiveCallRecord,
} from "@/lib/callSync";

/**
 * Subscribe (Realtime) to active-call records for the logged-in operator.
 * Records from this same device and records older than ~30s are ignored.
 */
export function useCallSync(operatorId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [incoming, setIncoming] = useState<ActiveCallRecord | null>(null);
  const ownDeviceId = getCallSyncDeviceId();

  useEffect(() => {
    if (!operatorId) return;

    const channel = supabase
      .channel(`active-calls-${operatorId}-${ownDeviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "active_calls",
          filter: `operator_id=eq.${operatorId}`,
        },
        (payload) => {
          const rec = payload.new as ActiveCallRecord;
          if (shouldReactToCall(rec, ownDeviceId)) {
            setIncoming(rec);
          }
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [operatorId, ownDeviceId]);

  const dismiss = useCallback(() => setIncoming(null), []);

  return { connected, incoming, dismiss };
}
