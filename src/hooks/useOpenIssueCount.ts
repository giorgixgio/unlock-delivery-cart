import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OPEN_STATUSES } from "@/lib/supportTickets";

/** Open operator issue tickets, for the nav badge (polled once a minute). */
export function useOpenIssueCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { count } = await supabase.from("customer_requests").select("id", { count: "exact", head: true })
        .eq("kind", "operator_flag").in("status", OPEN_STATUSES);
      if (alive) setN(count ?? 0);
    };
    void load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  return n;
}
