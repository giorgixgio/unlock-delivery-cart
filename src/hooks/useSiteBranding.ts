import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSiteConfig, SiteConfig } from "@/config/siteConfig";

const LOGO_CACHE_KEY = "site-logo-urls-v1";

async function fetchLogoUrls(): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["logo_url_trendmart", "logo_url_bigmart"]);
  const map: Record<string, string> = {};
  for (const row of data || []) {
    if (row.value) map[row.key] = row.value;
  }
  try {
    localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  return map;
}

function readLogoCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LOGO_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** #RRGGBB -> Tailwind-token friendly "H S% L%" triplet */
function hexToHslTriplet(hex: string): { triplet: string; isLight: boolean } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return {
    triplet: `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`,
    isLight: l > 0.6,
  };
}
}

/**
 * Storefront branding: resolves the domain's site config and the
 * admin-uploaded logo, and applies brand CSS variables for BigMart.
 * Admin surfaces never call this, so /admin styling stays fixed.
 */
export function useSiteBranding(): SiteConfig {
  const base = getSiteConfig();
  const [logoUrl, setLogoUrl] = useState<string | null>(
    () => readLogoCache()[base.logoSettingKey] || null
  );

  useEffect(() => {
    let alive = true;
    fetchLogoUrls().then((map) => {
      if (alive) setLogoUrl(map[base.logoSettingKey] || null);
    });
    return () => {
      alive = false;
    };
  }, [base.logoSettingKey]);

  useEffect(() => {
    const root = document.documentElement;
    if (base.primaryColor) {
      root.style.setProperty("--brand-primary", base.primaryColor);
      const hsl = hexToHslTriplet(base.primaryColor);
      if (hsl) {
        root.style.setProperty("--primary", hsl.triplet);
        root.style.setProperty("--primary-foreground", hsl.isLight ? "0 0% 8%" : "0 0% 100%");
      }
    }
    if (base.accentColor) {
      root.style.setProperty("--brand-accent", base.accentColor);
      const hsl = hexToHslTriplet(base.accentColor);
      if (hsl) {
        root.style.setProperty("--accent", hsl.triplet);
        root.style.setProperty("--accent-foreground", hsl.isLight ? "0 0% 8%" : "0 0% 100%");
      }
    }
    // Only rebrand the tab title for the BigMart domain; TrendMart keeps today's titles.
    if (base.warehouse === "A") {
      document.title = document.title.replace(/TrendMart/gi, base.siteName) || base.siteName;
    }
  }, [base.primaryColor, base.accentColor, base.siteName, base.warehouse]);

  return { ...base, logoUrl };
}
