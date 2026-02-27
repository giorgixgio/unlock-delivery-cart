import { useState, useEffect } from "react";
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

        // This query will return nothing for users without a modifier row
        // (RLS restricts to super admin only, but we query silently)
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

  const applyToRevenue = (val: number) => val * modifier.revenueMultiplier;
  const applyToCount = (val: number) => Math.round(val * modifier.orderCountMultiplier);
  const hasModifier = modifier.revenueMultiplier !== 1 || modifier.orderCountMultiplier !== 1;

  return { modifier, loaded, applyToRevenue, applyToCount, hasModifier };
}
