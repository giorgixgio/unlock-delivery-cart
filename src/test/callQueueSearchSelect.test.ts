import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** Row column names of a table in the generated Supabase types. */
function columnsOf(table: string): Set<string> {
  const types = read("integrations/supabase/types.ts");
  const start = types.indexOf(`      ${table}: {\n        Row: {`);
  const body = types.slice(start, types.indexOf("Insert:", start));
  return new Set([...body.matchAll(/^\s{10}([a-z_0-9]+)\??:/gm)].map((m) => m[1]));
}

function searchSelect(): string {
  const m = read("pages/admin/AdminCallQueue.tsx").match(/export const SEARCH_SELECT =\s*"([^"]+)"/);
  if (!m) throw new Error("SEARCH_SELECT not found");
  return m[1];
}

describe("Call Queue SEARCH_SELECT", () => {
  it("only selects real orders / order_items columns", () => {
    const sel = searchSelect();
    const orders = columnsOf("orders");
    const items = columnsOf("order_items");
    const nested = sel.match(/order_items\(([^)]*)\)/);
    const top = sel.replace(/,?\s*order_items\([^)]*\)/, "").split(",").map((s) => s.trim()).filter(Boolean);
    const missing = top.map((c) => (c.includes(":") ? c.split(":")[1] : c)).filter((c) => !orders.has(c));
    expect(missing).toEqual([]);
    const missingItems = (nested?.[1] || "").split(",").map((s) => s.trim()).filter((c) => c && !items.has(c));
    expect(missingItems).toEqual([]);
    expect(orders.has("current_courier_status")).toBe(false);
  });
});
