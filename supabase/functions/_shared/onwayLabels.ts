// Capture-only helper for OnWay api/order/labels (status 37 "გაფორმებული" orders).
// Never calls add/cancel/edit routes; always wrapped in try/catch so callers are unaffected.
import { proxyFetch } from "./proxyFetch.ts";

const ONWAY_LABELS_URL = "https://onway.ge/index.php?route=api/order/labels";
const MAX_RAW_LOG_CHARS = 50_000;

export interface ParsedLabelRow {
  tracking: string;
  matchTrackings: string[];
  box_index: number;
  box_count: number;
  payload: Record<string, unknown>;
}

export interface LabelFetchResult {
  ok: boolean;
  http_status: number | null;
  order_count: number;
  matched_count: number;
  stored_count: number;
  error: string | null;
}

export function maskOnwaySecrets(raw: string, username: string, key: string): string {
  let out = raw;
  if (key) out = out.split(key).join("***");
  if (username) out = out.split(username).join("***");
  return out.length > MAX_RAW_LOG_CHARS ? out.slice(0, MAX_RAW_LOG_CHARS) : out;
}

function strVal(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function posInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1) return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 1) return n;
    }
  }
  return null;
}

function parseSlashBox(v: unknown): { index: number; count: number } | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const index = Number(m[1]);
  const count = Number(m[2]);
  return index >= 1 && count >= index ? { index, count } : null;
}

function pickCi(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const direct = strVal(row[k]);
    if (direct) return direct;
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase(), v);
  for (const k of keys) {
    const hit = strVal(lower.get(k.toLowerCase()));
    if (hit) return hit;
  }
  return "";
}

function pickCiRaw(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase(), v);
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const OWN_TRACKING_KEYS = ["trackingnumber", "traking", "tracking", "tracking_number", "barcode", "code"];
const PARENT_TRACKING_KEYS = ["parent_trackingnumber", "parent_traking", "parent_tracking", "main_trackingnumber", "main_tracking"];
const BOX_INDEX_KEYS = ["box_index", "box_number", "box_no", "parcel_index", "parcel_number", "piece_number", "part", "box_num"];
const BOX_COUNT_KEYS = ["box_count", "boxes", "total_boxes", "parcel_count", "parcels", "pieces", "quantity", "count"];
const BOX_SLASH_KEYS = ["box", "parcel", "numbering", "box_label", "piece"];

export function extractLabelTracking(row: Record<string, unknown>): {
  tracking: string;
  parentTracking: string;
  matchTrackings: string[];
} | null {
  const own = pickCi(row, OWN_TRACKING_KEYS);
  const parent = pickCi(row, PARENT_TRACKING_KEYS);
  const tracking = own || parent;
  if (!tracking) return null;
  const set = new Set<string>();
  if (parent) set.add(parent);
  if (own) set.add(own);
  for (const k of [...PARENT_TRACKING_KEYS, ...OWN_TRACKING_KEYS]) {
    const v = pickCi(row, [k]);
    if (v) set.add(v);
  }
  return { tracking, parentTracking: parent, matchTrackings: [...set] };
}

export function parseLabelRows(orders: unknown[]): ParsedLabelRow[] {
  interface Draft {
    tracking: string;
    parentTracking: string;
    groupKey: string;
    matchTrackings: string[];
    explicitIndex: number | null;
    explicitCount: number | null;
    payload: Record<string, unknown>;
  }

  const drafts: Draft[] = [];
  for (const item of orders) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const tr = extractLabelTracking(row);
    if (!tr) continue;

    let explicitIndex = posInt(pickCiRaw(row, BOX_INDEX_KEYS));
    let explicitCount = posInt(pickCiRaw(row, BOX_COUNT_KEYS));
    for (const k of BOX_SLASH_KEYS) {
      const slash = parseSlashBox(pickCiRaw(row, [k]));
      if (slash) {
        if (explicitIndex == null) explicitIndex = slash.index;
        if (explicitCount == null) explicitCount = slash.count;
        break;
      }
    }

    drafts.push({
      tracking: tr.tracking,
      parentTracking: tr.parentTracking,
      groupKey: tr.parentTracking || tr.tracking,
      matchTrackings: tr.matchTrackings,
      explicitIndex,
      explicitCount,
      payload: row,
    });
  }

  // Group siblings by parentTracking (or tracking when no parent) so multi-box splits get consistent numbering.
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) {
    const list = groups.get(d.groupKey) || [];
    list.push(d);
    groups.set(d.groupKey, list);
  }

  const results: ParsedLabelRow[] = [];
  for (const list of groups.values()) {
    const usedByTracking = new Map<string, Set<number>>();
    const maxExplicitCount = list.reduce((m, d) => Math.max(m, d.explicitCount ?? 1), 1);
    const inferredCount = Math.max(list.length, maxExplicitCount);

    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const used = usedByTracking.get(d.tracking) || new Set<number>();
      let boxIndex = d.explicitIndex ?? (i + 1);
      while (used.has(boxIndex)) boxIndex++;
      used.add(boxIndex);
      usedByTracking.set(d.tracking, used);

      results.push({
        tracking: d.tracking,
        matchTrackings: d.matchTrackings,
        box_index: boxIndex,
        box_count: Math.max(inferredCount, boxIndex),
        payload: d.payload,
      });
    }
  }

  return results;
}

export function extractOrdersArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.orders)) return obj.orders;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

export async function fetchAndStoreOnwayLabels(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { username: string; key: string },
): Promise<LabelFetchResult> {
  let httpStatus: number | null = null;
  let rawText = "";
  let maskedRaw = "";
  let fetchError: string | null = null;
  let orderCount = 0;
  let matchedCount = 0;
  let storedCount = 0;

  try {
    try {
      const r = await proxyFetch(ONWAY_LABELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: opts.username, key: opts.key }),
        signal: AbortSignal.timeout(12_000),
      });
      httpStatus = r.status;
      rawText = await r.text();
    } catch (e) {
      fetchError = String(e);
    }

    maskedRaw = maskOnwaySecrets(rawText, opts.username, opts.key);

    let rows: ParsedLabelRow[] = [];
    if (!fetchError && rawText) {
      try {
        const parsed = JSON.parse(rawText);
        const rawOrders = extractOrdersArray(parsed);
        orderCount = rawOrders.length;
        rows = parseLabelRows(rawOrders);
      } catch (e) {
        fetchError = `JSON parse error: ${String(e)}`;
      }
    }

    try {
      await supabase.from("onway_label_fetches").insert({
        http_status: httpStatus,
        order_count: orderCount,
        raw: maskedRaw || null,
        error: fetchError,
      });
    } catch (e) {
      console.error("onway_label_fetches insert failed:", e);
    }

    if (!rows.length) {
      return { ok: !fetchError, http_status: httpStatus, order_count: orderCount, matched_count: 0, stored_count: 0, error: fetchError };
    }

    // Match returned rows to our orders by onway_tracking (ignore rows that don't match).
    const allCandidates = [...new Set(rows.flatMap((r) => r.matchTrackings))];
    const orderIdByTracking = new Map<string, string>();
    for (let i = 0; i < allCandidates.length; i += 200) {
      const chunk = allCandidates.slice(i, i + 200);
      const { data: matchedOrders, error: qErr } = await supabase
        .from("orders")
        .select("id, onway_tracking")
        .in("onway_tracking", chunk);
      if (qErr) {
        fetchError = `orders lookup failed: ${qErr.message}`;
        break;
      }
      for (const o of matchedOrders || []) {
        if (o.onway_tracking) orderIdByTracking.set(String(o.onway_tracking).trim(), String(o.id));
      }
    }

    const nowIso = new Date().toISOString();
    const toUpsert: Record<string, unknown>[] = [];
    for (const row of rows) {
      let orderId: string | undefined;
      for (const cand of row.matchTrackings) {
        orderId = orderIdByTracking.get(cand);
        if (orderId) break;
      }
      if (!orderId) continue;
      matchedCount++;
      toUpsert.push({
        order_id: orderId,
        tracking: row.tracking,
        box_index: row.box_index,
        box_count: row.box_count,
        payload: row.payload,
        fetched_at: nowIso,
      });
    }

    if (toUpsert.length) {
      const { error: upErr } = await supabase
        .from("onway_label_data")
        .upsert(toUpsert, { onConflict: "tracking,box_index" });
      if (upErr) {
        fetchError = `onway_label_data upsert failed: ${upErr.message}`;
        console.error(fetchError);
      } else {
        storedCount = toUpsert.length;
      }
    }

    return {
      ok: !fetchError,
      http_status: httpStatus,
      order_count: orderCount,
      matched_count: matchedCount,
      stored_count: storedCount,
      error: fetchError,
    };
  } catch (e) {
    const msg = String(e);
    console.error("fetchAndStoreOnwayLabels unexpected error:", msg);
    return {
      ok: false,
      http_status: httpStatus,
      order_count: orderCount,
      matched_count: matchedCount,
      stored_count: storedCount,
      error: msg,
    };
  }
}