import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BundleOption {
  qty: number;
  label: string;
  discount_pct: number;
}

export interface BumpConfig {
  enabled: boolean;
  type: string;
  discount_pct: number;
  bump_qty: number;
  title: string;
  subtitle: string;
}

export interface LandingSection {
  type: "benefits" | "video" | "reviews" | "faq";
  items?: string[];
  url?: string;
  source?: string;
}

export interface LandingConfig {
  hero_title?: string;
  hero_subtitle?: string;
  sections?: LandingSection[];
  bundle?: {
    enabled: boolean;
    default_qty: number;
    bundle_options: BundleOption[];
  };
  bump?: BumpConfig;
}

export interface ProductLandingConfig {
  id: string;
  product_handle: string;
  landing_variant: string;
  landing_config: LandingConfig | null;
  landing_use_cod_modal: boolean;
  landing_bypass_min_cart: boolean;
}

export function useLandingConfig(handle: string | undefined) {
  return useQuery({
    queryKey: ["landing-config", handle],
    queryFn: async (): Promise<ProductLandingConfig | null> => {
      if (!handle) return null;
      const { data, error } = await supabase
        .from("product_landing_config")
        .select("*")
        .eq("product_handle", handle)
        .maybeSingle();
      if (error) {
        console.warn("Failed to fetch landing config:", error);
        return null;
      }
      if (!data) return null;
      return {
        ...data,
        landing_config: data.landing_config as LandingConfig | null,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!handle,
  });
}
