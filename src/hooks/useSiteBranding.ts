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
    if (base.primaryColor) root.style.setProperty("--brand-primary", base.primaryColor);
    if (base.accentColor) root.style.setProperty("--brand-accent", base.accentColor);
    document.title = base.siteName;
  }, [base.primaryColor, base.accentColor, base.siteName]);

  return { ...base, logoUrl };
}
