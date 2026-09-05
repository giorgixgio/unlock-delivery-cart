/**
 * Multi-domain site identity.
 * trendmart.ge -> Warehouse B (existing catalog, existing theme untouched)
 * bigmart.ge   -> Warehouse A (new catalog, yellow/blue theme)
 */

export type Warehouse = "A" | "B";

export interface SiteConfig {
  warehouse: Warehouse;
  siteName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  /** site_settings key holding the admin-uploaded logo URL */
  logoSettingKey: "logo_url_trendmart" | "logo_url_bigmart";
}

export const SITE_CONFIG: Record<string, SiteConfig> = {
  "trendmart.ge": {
    warehouse: "B",
    siteName: "TrendMart",
    logoUrl: null,
    primaryColor: null, // keep existing theme exactly as-is
    accentColor: null,
    logoSettingKey: "logo_url_trendmart",
  },
  "bigmart.ge": {
    warehouse: "A",
    siteName: "BigMart",
    logoUrl: null,
    primaryColor: "#FFD500", // bright yellow
    accentColor: "#0057D9", // bold blue
    logoSettingKey: "logo_url_bigmart",
  },
  default: {
    warehouse: "B",
    siteName: "TrendMart",
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
    logoSettingKey: "logo_url_trendmart",
  },
};

const OVERRIDE_KEY = "site-warehouse-override";

/** ?site=A / ?site=B lets us preview either brand before the domains are live. */
function readOverride(): Warehouse | null {
  if (typeof window === "undefined") return null;
  try {
    const param = new URLSearchParams(window.location.search).get("site");
    if (param) {
      const v = param.toUpperCase();
      if (v === "A" || v === "B") {
        sessionStorage.setItem(OVERRIDE_KEY, v);
        return v;
      }
    }
    const stored = sessionStorage.getItem(OVERRIDE_KEY);
    if (stored === "A" || stored === "B") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function getSiteConfig(): SiteConfig {
  const override = readOverride();
  if (override) {
    return override === "A" ? SITE_CONFIG["bigmart.ge"] : SITE_CONFIG["trendmart.ge"];
  }
  const host =
    typeof window !== "undefined"
      ? window.location.hostname.toLowerCase().replace(/^www\./, "")
      : "";
  return SITE_CONFIG[host] || SITE_CONFIG.default;
}

export function getSiteWarehouse(): Warehouse {
  return getSiteConfig().warehouse;
}
