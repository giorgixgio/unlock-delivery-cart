import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ViewModifier {
  revenueMultiplier: number;
  orderCountMultiplier: number;
}

/**
 * Fetches dashboard view modifier for the current user.
 * Returns multipliers of 1.0 if no modifier exists (normal view).
 * This is completely invisible to target users.
 */
export function useViewModifier() {
  const [modifier, setModifier] = useState<ViewModifier>({
    revenueMultiplier: 1,
    orderCountMultiplier: 1,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) { setLoaded(true); return; }

        const { data } = await supabase
          .from("dashboard_view_modifiers" as any)
          .select("revenue_multiplier, order_count_multiplier")
          .eq("target_email", user.email)
          .maybeSingle();

        if (data) {
          setModifier({
            revenueMultiplier: Number((data as any).revenue_multiplier) || 1,
            orderCountMultiplier: Number((data as any).order_count_multiplier) || 1,
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
    () => modifier.revenueMultiplier !== 1 || modifier.orderCountMultiplier !== 1,
    [modifier.revenueMultiplier, modifier.orderCountMultiplier]
  );

  return { modifier, loaded, applyToRevenue, applyToCount, hasModifier };
}
