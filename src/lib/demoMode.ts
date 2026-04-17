/**
 * Demo Mode (no-op)
 * --------------------------------------------------------------
 * Demo accounts are now handled purely at the routing layer:
 * the login flow redirects them to a fully static
 * /admin/demo-dashboard page that performs no DB queries.
 *
 * This module is kept so existing imports continue to compile,
 * but it intentionally does nothing — no Supabase wrapping,
 * no query filtering. All real data flows through untouched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function isDemoMode(): boolean {
  return false;
}

export function setDemoMode(_active: boolean): void {
  // no-op
}

export function wrapSupabaseForDemo(_client: SupabaseClient): void {
  // no-op
}
