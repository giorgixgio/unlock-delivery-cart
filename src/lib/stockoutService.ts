import { supabase } from "@/integrations/supabase/client";

/** UTM + Meta attribution helpers. Reads from URL + sessionStorage fallback. */
export function collectAttribution() {
  const params: Record<string, string | undefined> = {};
  try {
    const sp = new URLSearchParams(window.location.search);
    for (const k of [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "fbclid",
    ]) {
      const v = sp.get(k);
      if (v) params[k] = v;
    }
    // Meta ad params (various names)
    params.meta_campaign_id = sp.get("campaign_id") || sp.get("utm_campaign_id") || undefined;
    params.meta_adset_id = sp.get("adset_id") || sp.get("utm_adset_id") || undefined;
    params.meta_ad_id = sp.get("ad_id") || sp.get("utm_ad_id") || undefined;

    // Persist new values so navigation within the funnel keeps attribution
    for (const [k, v] of Object.entries(params)) {
      if (v) sessionStorage.setItem(`attr_${k}`, v);
    }
    // Fill missing from sessionStorage
    for (const k of [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "fbclid", "meta_campaign_id", "meta_adset_id", "meta_ad_id",
    ]) {
      if (!params[k]) {
        const saved = sessionStorage.getItem(`attr_${k}`);
        if (saved) params[k] = saved;
      }
    }
  } catch {}
  return params;
}

export interface RecordStockoutInput {
  productId: string;
  productHandle?: string | null;
  sku?: string | null;
  productName?: string;
  variantId?: string | null;
  phone: string;
  quantity?: number;
  source?: string;
  landingPageUrl?: string;
  sessionId?: string;
  blockedReason?: "out_of_stock"; // only allowed value — guarded server-side too
  stockAtAttempt?: number | null;
  stockStatusAtAttempt?: string | null;
}

export async function recordStockoutAttempt(input: RecordStockoutInput) {
  const attr = collectAttribution();
  const payload = {
    product_handle: input.productHandle ?? undefined,
    product_name: input.productName,
    variant_id: input.variantId ?? undefined,
    quantity_attempted: input.quantity ?? 1,
    landing_page_url: input.landingPageUrl ?? window.location.href,
    source: input.source ?? "landing",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    session_id: input.sessionId,
    blocked_reason: input.blockedReason ?? "out_of_stock",
    stock_at_attempt: input.stockAtAttempt ?? undefined,
    stock_status_at_attempt: input.stockStatusAtAttempt ?? "out_of_stock",
    ...attr,
  };

  const { data, error } = await (supabase as any).rpc("record_stockout_attempt", {
    p_product_id: input.productId,
    p_product_handle: input.productHandle ?? null,
    p_sku: input.sku ?? null,
    p_phone: input.phone,
    p_payload: payload,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { id: string; deduped: boolean; attempt_count: number };
}

export async function markStockoutWaitlist(attemptId: string) {
  const { error } = await (supabase as any).rpc("mark_stockout_waitlist", { p_attempt_id: attemptId });
  if (error) throw error;
}

// ── Admin queries ──

export interface StockoutAttemptRow {
  id: string;
  created_at: string;
  last_attempt_at: string;
  product_id: string | null;
  product_handle: string | null;
  sku: string | null;
  product_name: string | null;
  phone_number: string | null;
  phone_normalized: string | null;
  attempt_count: number;
  quantity_attempted: number;
  landing_page_url: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  fbclid: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  waitlist_requested: boolean;
}

export async function fetchStockoutAttempts(sinceDays = 7) {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const { data, error } = await (supabase as any)
    .from("stockout_attempts")
    .select("*")
    .gte("last_attempt_at", since)
    .order("last_attempt_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data || []) as StockoutAttemptRow[];
}

export async function updateStockoutStatus(ids: string[], status: string, reviewer?: string, note?: string) {
  const patch: Record<string, unknown> = { status, reviewed_at: new Date().toISOString() };
  if (reviewer) patch.reviewed_by = reviewer;
  if (note !== undefined) patch.note = note;
  const { error } = await (supabase as any)
    .from("stockout_attempts")
    .update(patch)
    .in("id", ids);
  if (error) throw error;
}

export interface StockoutProductAgg {
  productId: string | null;
  sku: string | null;
  productName: string | null;
  attemptsToday: number;
  uniquePhonesToday: number;
  attempts7d: number;
  uniquePhones7d: number;
  uniqueLastHour: number;
  uniqueLast24h: number;
  lastAttemptAt: string;
  topCampaign: string | null;
  worstStatus: string;
  attemptIds: string[];
}

export function aggregateByProduct(rows: StockoutAttemptRow[]): StockoutProductAgg[] {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const hourAgo = now - 3600_000;
  const dayAgo = now - 86400_000;

  const groups = new Map<string, StockoutAttemptRow[]>();
  for (const r of rows) {
    const key = r.product_id || `sku:${r.sku || "unknown"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const STATUS_RANK: Record<string, number> = { unresolved: 0, restock_needed: 1, reviewed: 2, ad_turned_off: 3, ignored: 4 };

  const out: StockoutProductAgg[] = [];
  for (const [, rs] of groups) {
    const first = rs[0];
    const todayRows = rs.filter((r) => new Date(r.last_attempt_at).getTime() >= todayMs);
    const lastHourRows = rs.filter((r) => new Date(r.last_attempt_at).getTime() >= hourAgo);
    const last24hRows = rs.filter((r) => new Date(r.last_attempt_at).getTime() >= dayAgo);

    const uniquePhones = (arr: StockoutAttemptRow[]) =>
      new Set(arr.map((r) => r.phone_normalized).filter(Boolean)).size;

    // Top campaign
    const camp = new Map<string, number>();
    for (const r of rs) {
      const c = r.meta_campaign_id || r.utm_campaign;
      if (c) camp.set(c, (camp.get(c) || 0) + 1);
    }
    let topCampaign: string | null = null;
    let max = 0;
    for (const [k, v] of camp) if (v > max) { max = v; topCampaign = k; }

    const worst = rs.reduce((acc, r) => {
      const rank = STATUS_RANK[r.status] ?? 99;
      return rank < acc.rank ? { rank, status: r.status } : acc;
    }, { rank: 99, status: "unresolved" }).status;

    out.push({
      productId: first.product_id,
      sku: first.sku,
      productName: first.product_name,
      attemptsToday: todayRows.reduce((s, r) => s + r.attempt_count, 0),
      uniquePhonesToday: uniquePhones(todayRows),
      attempts7d: rs.reduce((s, r) => s + r.attempt_count, 0),
      uniquePhones7d: uniquePhones(rs),
      uniqueLastHour: uniquePhones(lastHourRows),
      uniqueLast24h: uniquePhones(last24hRows),
      lastAttemptAt: rs.reduce((max, r) => (r.last_attempt_at > max ? r.last_attempt_at : max), rs[0].last_attempt_at),
      topCampaign,
      worstStatus: worst,
      attemptIds: rs.map((r) => r.id),
    });
  }
  out.sort((a, b) => b.uniquePhonesToday - a.uniquePhonesToday || (b.lastAttemptAt > a.lastAttemptAt ? 1 : -1));
  return out;
}

export function isStockoutAlert(agg: StockoutProductAgg) {
  return agg.uniqueLastHour >= 3 || agg.uniqueLast24h >= 5;
}
