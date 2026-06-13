import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global on/off switch for landing-page upsells (the bundle/upsell sheet
 * shown after the COD phone-entry confirmation).
 *
 * Default: ON. A per-product override (`landing_upsell_enabled = true` on
 * `product_landing_config`) can force the upsell to show even when the
 * global toggle is OFF — but the global OFF wins over `null`/`false`.
 */
export function useGlobalUpsellsEnabled() {
  return useQuery({
    queryKey: ["site-setting", "landing_upsells_enabled"],
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "landing_upsells_enabled")
        .maybeSingle();
      if (!data) return true;
      const v = String((data as any).value ?? "").toLowerCase().trim();
      return v !== "false" && v !== "0" && v !== "off";
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Compute whether the upsell should be shown for a given landing. */
export function resolveUpsellEnabled(
  globalEnabled: boolean | undefined,
  perProductEnabled: boolean | null | undefined,
): boolean {
  // Per-product TRUE always wins (overrides global OFF).
  if (perProductEnabled === true) return true;
  return globalEnabled !== false; // default ON until we know otherwise
}
