import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCourierDataset, unitsFor, type Shipment, type CourierDataset } from "@/hooks/useCourierDataset";
import { RETURN_IN_TRANSIT_STATUSES, daysSince } from "@/lib/courierStates";

export type AlertSetting = {
  rule_key: string; label: string; threshold_days: number; is_enabled: boolean; sort_order: number;
};

export type AlertItem = {
  rule_key: string;
  tracking: string;
  order_number: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  days: number;
  units: { sku: string; title: string; qty: number }[];
};

export function useAlertSettings() {
  return useQuery<AlertSetting[]>({
    queryKey: ["courier-alert-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courier_alert_settings").select("*").order("sort_order");
      if (error) throw error;
      return (data as any) || [];
    },
  });
}

/** Orders marked shipped in our system but absent from courier data. */
function useMissingShipped(days: number) {
  return useQuery({
    queryKey: ["courier-missing-shipped", days],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id, public_order_number, tracking_number, customer_phone, city, updated_at")
        .eq("is_fulfilled", true)
        .lt("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(500);
      return (data as any[]) || [];
    },
  });
}

export function useCourierAlerts() {
  const { data: ds, isLoading } = useCourierDataset();
  const { data: settings } = useAlertSettings();
  const missingDays = settings?.find((s) => s.rule_key === "shipped_missing_in_courier")?.threshold_days ?? 2;
  const { data: shippedOrders } = useMissingShipped(missingDays);

  const alerts = useMemo<AlertItem[]>(() => {
    if (!ds || !settings) return [];
    const enabled = new Map(settings.filter((s) => s.is_enabled).map((s) => [s.rule_key, s.threshold_days]));
    const out: AlertItem[] = [];
    const byTracking = new Map<string, Shipment>();
    for (const s of ds.shipments) byTracking.set(s.tracking_number, s);

    const push = (rule: string, s: Shipment, days: number, dsx: CourierDataset) => {
      out.push({
        rule_key: rule,
        tracking: s.tracking_number,
        order_number: s.order_number,
        phone: s.phone,
        city: s.city,
        status: s.current_courier_status,
        days,
        units: unitsFor(dsx, s),
      });
    };

    for (const s of ds.shipments) {
      const age = daysSince(s.status_changed_at || s.latest_status_date || s.order_date);
      if (age == null) continue;
      const status = (s.current_courier_status || "").trim();

      if (!s.is_return) {
        const t1 = enabled.get("warehouse_stuck");
        if (t1 != null && status === "საწყობში" && age > t1) push("warehouse_stuck", s, age, ds);

        const t2 = enabled.get("failed_attempt_stuck");
        if (t2 != null && s.derived_state === "FAILED_ATTEMPT" && age > t2) push("failed_attempt_stuck", s, age, ds);

        const t3 = enabled.get("no_status_change");
        if (t3 != null && (s.derived_state === "IN_PROGRESS" || s.derived_state === "FAILED_ATTEMPT") && age > t3) {
          push("no_status_change", s, age, ds);
        }

        if (enabled.has("delivered_with_return") && s.derived_state === "DELIVERED" && s.linked_return_tracking_number) {
          const ret = byTracking.get(s.linked_return_tracking_number);
          if (ret && ret.derived_state !== "RETURN_CANCELLED") push("delivered_with_return", s, age, ds);
        }
      } else {
        const t4 = enabled.get("return_in_transit");
        if (t4 != null && RETURN_IN_TRANSIT_STATUSES.includes(status) && age > t4) push("return_in_transit", s, age, ds);
      }
    }

    if (enabled.has("shipped_missing_in_courier") && shippedOrders) {
      const known = new Set(ds.shipments.map((s) => s.tracking_number));
      const knownOrders = new Set(ds.shipments.map((s) => s.order_number).filter(Boolean) as string[]);
      for (const o of shippedOrders) {
        if (o.tracking_number && known.has(o.tracking_number)) continue;
        if (knownOrders.has(o.public_order_number)) continue;
        out.push({
          rule_key: "shipped_missing_in_courier",
          tracking: o.tracking_number || "—",
          order_number: o.public_order_number,
          phone: o.customer_phone,
          city: o.city,
          status: null,
          days: daysSince(o.updated_at) ?? 0,
          units: (ds.itemsByOrder.get(o.id) || []).map((i) => ({ sku: i.sku, title: i.title, qty: i.quantity })),
        });
      }
    }

    return out.sort((a, b) => b.days - a.days);
  }, [ds, settings, shippedOrders]);

  return { alerts, settings: settings || [], isLoading };
}

export function useCourierAlertCount() {
  const { alerts } = useCourierAlerts();
  return alerts.length;
}
