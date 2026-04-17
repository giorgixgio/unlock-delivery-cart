/**
 * Presentation Mode
 * --------------------------------------------------------------
 * For specific admin accounts (e.g. lado@bigmart.ge), every read of
 * the `orders` and `order_items` tables is silently filtered down to
 * a stable, date-seeded random subset whose total adds up to roughly
 *   (real_total) * revenue_multiplier  (±10%)
 *
 * Real database rows are never modified — this is a pure read-side
 * filter installed on the Supabase client via a `from()` Proxy.
 *
 * Design notes:
 *   • The allow-list of order IDs is computed once per UTC day per
 *     (email, multiplier) tuple and cached in module state. All
 *     subsequent queries (dashboard, orders list, batches, anywhere)
 *     reuse the same set, so the "subset" looks consistent across
 *     navigations and refreshes for the duration of the day.
 *   • Allow-list refresh is triggered lazily by reading the FULL
 *     orders table once when the engine is "warmed up" after sign-in.
 *   • If the warm-up hasn't completed yet, we conservatively return
 *     empty results for guarded reads — never real data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const GUARDED_TABLES = new Set<string>(["orders", "order_items"]);

interface PresentationConfig {
  email: string;
  multiplier: number;
}

interface AllowList {
  /** UTC day key the list was computed for (YYYY-MM-DD). */
  dayKey: string;
  /** Multiplier the list was computed for. */
  multiplier: number;
  /** Set of order ids the demo account is allowed to "see". */
  orderIds: Set<string>;
  /** Sum of `total` across the chosen orders (display value already scaled). */
  scaledTotal: number;
}

let active: PresentationConfig | null = null;
let allowList: AllowList | null = null;
let warmupPromise: Promise<void> | null = null;
let patched = false;
let rawClient: SupabaseClient | null = null;

/* ---------------------- public API ---------------------- */

export function isPresentationActive(): boolean {
  return active !== null;
}

export function getPresentationMultiplier(): number {
  return active?.multiplier ?? 1;
}

/** Scale a raw revenue figure for display. Safe to call always. */
export function scaleRevenue(value: number): number {
  if (!active) return value;
  return value * active.multiplier;
}

/**
 * Activate or deactivate presentation mode for the signed-in user.
 * Called from AdminAuthContext after we know the user's email.
 */
export function setPresentationMode(config: PresentationConfig | null) {
  const same =
    active?.email === config?.email &&
    active?.multiplier === config?.multiplier;
  if (same) return;

  active = config;
  allowList = null;
  warmupPromise = null;

  if (active && rawClient) {
    // Kick off the allow-list build immediately so the first read has it.
    void ensureAllowList();
  }
}

/* ---------------------- internals ---------------------- */

function dayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a stable subset of order ids whose total adds up to roughly
 * `targetScaledTotal` (within ±10%). Greedy fill driven by a seeded
 * shuffle so the same subset is chosen on every refresh / page nav.
 */
function buildAllowList(
  orders: Array<{ id: string; total: number | string }>,
  multiplier: number,
  email: string,
): AllowList {
  const real = orders.map((o) => ({
    id: o.id,
    total: Number(o.total) || 0,
  }));
  const realTotal = real.reduce((s, o) => s + o.total, 0);
  const targetScaled = realTotal * multiplier;

  // Seeded shuffle so the chosen subset is stable per-day-per-account.
  const rng = seededRng(`${email}|${multiplier}|${dayKey()}`);
  const shuffled = [...real].sort(() => rng() - 0.5);

  const minTarget = targetScaled * 0.9;
  const maxTarget = targetScaled * 1.1;

  const chosen = new Set<string>();
  let running = 0;

  for (const o of shuffled) {
    if (running >= minTarget) break;
    if (running + o.total > maxTarget && chosen.size > 0) continue;
    chosen.add(o.id);
    running += o.total;
  }

  return {
    dayKey: dayKey(),
    multiplier,
    orderIds: chosen,
    scaledTotal: running,
  };
}

/** Returns the allow-list, building it once per day if needed. */
async function ensureAllowList(): Promise<AllowList | null> {
  if (!active || !rawClient) return null;
  const today = dayKey();
  if (
    allowList &&
    allowList.dayKey === today &&
    allowList.multiplier === active.multiplier
  ) {
    return allowList;
  }
  if (warmupPromise) {
    await warmupPromise;
    return allowList;
  }

  const cfg = active;
  warmupPromise = (async () => {
    // Use the un-patched bypass path (rawFrom captured at install time).
    const builder = rawFrom!("orders").select("id, total");
    const { data, error } = await builder;
    if (error || !data) {
      // On error, leave allowList null → reads will return empty.
      allowList = {
        dayKey: today,
        multiplier: cfg.multiplier,
        orderIds: new Set(),
        scaledTotal: 0,
      };
      return;
    }
    allowList = buildAllowList(
      data as Array<{ id: string; total: number | string }>,
      cfg.multiplier,
      cfg.email,
    );
  })();

  await warmupPromise;
  warmupPromise = null;
  return allowList;
}

/** Captured pre-patch reference so the engine can fetch raw data. */
let rawFrom: SupabaseClient["from"] | null = null;

/* ---------------------- thenable shim ---------------------- */

/**
 * Builds a thenable that mimics PostgREST's response shape but resolves
 * to a filtered set of rows. Any further chained filter call (eq, in,
 * order, limit, etc.) returns the same shim and remains awaitable.
 */
function makeFilteredResult(
  table: string,
  orderIdGetter: (row: any) => string,
): any {
  // Lazy resolution — the actual DB query happens when awaited.
  let resolved: Promise<{ data: any[]; count: number; error: null; status: number; statusText: string }> | null = null;

  function resolve() {
    if (resolved) return resolved;
    resolved = (async () => {
      const list = await ensureAllowList();
      const ids = list?.orderIds ?? new Set<string>();
      // If there are zero allowed orders, short-circuit to empty.
      if (ids.size === 0) {
        return { data: [], count: 0, error: null, status: 200, statusText: "OK" };
      }
      // Use raw client to do an `in()` query restricted to allowed ids.
      // We mirror the calling shape: select * with the appropriate column.
      const filterCol = table === "orders" ? "id" : "order_id";
      const { data, error, count } = await rawFrom!(table)
        .select("*", { count: "exact" })
        .in(filterCol, Array.from(ids));
      if (error) {
        return { data: [], count: 0, error: null, status: 200, statusText: "OK" };
      }
      return {
        data: data || [],
        count: count ?? (data?.length ?? 0),
        error: null,
        status: 200,
        statusText: "OK",
      };
    })();
    return resolved;
  }

  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          resolve().then(onFulfilled, onRejected);
      }
      if (prop === "catch") return (cb: (e: unknown) => unknown) => resolve().catch(cb);
      if (prop === "finally") return (cb: () => void) => resolve().finally(cb);
      if (prop === "single" || prop === "maybeSingle") {
        return () =>
          new Proxy({}, {
            get(_t2, p2) {
              if (p2 === "then") {
                return (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
                  resolve()
                    .then((r) => ({ ...r, data: r.data[0] ?? null }))
                    .then(onFulfilled, onRejected);
              }
              return () => proxy;
            },
          });
      }
      // Any other chained filter (eq/in/order/limit/...) — keep chain alive.
      return (..._args: unknown[]) => proxy;
    },
  };
  const proxy: any = new Proxy({}, handler);
  // Help orderIdGetter signature stay referenced (no-op).
  void orderIdGetter;
  return proxy;
}

/* ---------------------- Supabase patcher ---------------------- */

export function wrapSupabaseForPresentation(client: SupabaseClient) {
  if (patched) return;
  patched = true;
  rawClient = client;

  const originalFrom = client.from.bind(client);
  rawFrom = originalFrom;

  (client as any).from = (table: string) => {
    const builder = originalFrom(table as any);
    if (!active || !GUARDED_TABLES.has(table)) {
      return builder;
    }

    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === "select") {
          // Intercept reads — return a filtered, awaitable shim.
          return (..._args: unknown[]) => makeFilteredResult(table, (r) => r.id);
        }
        // insert / update / delete / upsert pass through untouched.
        return Reflect.get(target, prop, receiver);
      },
    });
  };
}
