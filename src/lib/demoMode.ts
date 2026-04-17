/**
 * Demo Mode Guard
 * --------------------------------------------------------------
 * When the signed-in admin has `is_demo = true`, every read against
 * sales/operations tables must return empty results — without ever
 * touching real rows in the database.
 *
 * We achieve this by:
 *   1. Holding a single boolean flag `demoModeActive` in module state.
 *   2. Exposing `wrapSupabaseForDemo()` which patches `supabase.from`
 *      so SELECT/COUNT calls on guarded tables resolve with `[]` / 0.
 *
 * Writes (insert/update/delete) are still allowed, because the goal
 * is only to hide existing data — not to break the UI's mutation
 * paths (which would surface confusing errors).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables whose READ traffic must be zeroed for demo accounts. */
const GUARDED_TABLES = new Set<string>([
  "orders",
  "order_items",
  "order_events",
  "batches",
  "batch_orders",
  "batch_events",
  "batch_order_items_snapshot",
  "batch_print_jobs",
  "system_events",
  "export_batches",
  "export_rows",
  "import_batches",
  "import_staging_rows",
  "grid_events",
  "product_stats",
]);

let demoModeActive = false;
let patched = false;

/** Internal helper: build a thenable that mimics PostgREST's empty response. */
function emptyResult(opts: { count: boolean; single: boolean }) {
  const payload = {
    data: opts.single ? null : [],
    error: null,
    count: opts.count ? 0 : null,
    status: 200,
    statusText: "OK",
  };

  // Minimal chainable shim: any further filter/order/etc. returns the
  // same shim and remains awaitable.
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(payload);
      }
      if (prop === "catch" || prop === "finally") {
        return () => proxy;
      }
      if (prop === "single" || prop === "maybeSingle") {
        return () => emptyResult({ count: opts.count, single: true });
      }
      // Any other call (eq, in, gte, order, limit, select, ...) keeps
      // the empty-result chain alive.
      return (..._args: unknown[]) => proxy;
    },
  };

  const proxy: any = new Proxy({}, handler);
  return proxy;
}

/** Returns true when the signed-in admin is a demo account. */
export function isDemoMode(): boolean {
  return demoModeActive;
}

/** Toggle demo mode. Called by AdminAuthContext after sign-in resolution. */
export function setDemoMode(active: boolean) {
  demoModeActive = active;
}

/**
 * Patch the Supabase client's `from()` method exactly once so that any
 * read against guarded tables short-circuits while demo mode is on.
 * Mutations still hit the real database.
 */
export function wrapSupabaseForDemo(client: SupabaseClient) {
  if (patched) return;
  patched = true;

  const originalFrom = client.from.bind(client);

  (client as any).from = (table: string) => {
    const builder = originalFrom(table as any);
    if (!demoModeActive || !GUARDED_TABLES.has(table)) {
      return builder;
    }

    // Wrap the QueryBuilder so reads return empty, writes pass through.
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === "select") {
          return (..._args: unknown[]) =>
            emptyResult({ count: true, single: false });
        }
        // insert / update / upsert / delete / rpc fall through untouched.
        return Reflect.get(target, prop, receiver);
      },
    });
  };
}