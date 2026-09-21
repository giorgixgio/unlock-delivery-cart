import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RETURN_IN_TRANSIT_STATUSES } from "@/lib/courierStates";

/**
 * Lightweight alert count for the nav badge — count-only queries, no dataset load.
 * The Alerts page itself computes the full, exact list.
 */
export function useCourierAlertBadge() {
  return useQuery<number>({
    queryKey: ["courier-alert-badge"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: settings } = await supabase
        .from("courier_alert_settings").select("rule_key, threshold_days, is_enabled");
      const get = (k: string) => {
        const r = (settings as any[])?.find((s) => s.rule_key === k);
        return r?.is_enabled ? r.threshold_days as number : null;
      };
      const cutoff = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
      let total = 0;

      const warehouse = get("warehouse_stuck");
      if (warehouse != null) {
        const { count } = await supabase.from("courier_shipments")
          .select("id", { count: "exact", head: true })
          .eq("is_return", false).eq("current_courier_status", "საწყობში")
          .lt("status_changed_at", cutoff(warehouse));
        total += count || 0;
      }

      const attempt = get("failed_attempt_stuck");
      if (attempt != null) {
        const { count } = await supabase.from("courier_shipments")
          .select("id", { count: "exact", head: true })
          .eq("is_return", false).eq("derived_state", "FAILED_ATTEMPT")
          .lt("status_changed_at", cutoff(attempt));
        total += count || 0;
      }

      const stale = get("no_status_change");
      if (stale != null) {
        const { count } = await supabase.from("courier_shipments")
          .select("id", { count: "exact", head: true })
          .eq("is_return", false).eq("derived_state", "IN_PROGRESS")
          .lt("status_changed_at", cutoff(stale));
        total += count || 0;
      }

      const ret = get("return_in_transit");
      if (ret != null) {
        const { count } = await supabase.from("courier_shipments")
          .select("id", { count: "exact", head: true })
          .eq("is_return", true).in("current_courier_status", RETURN_IN_TRANSIT_STATUSES)
          .lt("status_changed_at", cutoff(ret));
        total += count || 0;
      }

      return total;
    },
  });
}
