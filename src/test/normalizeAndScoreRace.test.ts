import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/normalize-and-score/index.ts", "utf8")
  .replace(/^import .*;\n/gm, "");
const executable = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function scoreDuringChange(change: Record<string, unknown>, highRisk = true, initiallyConfirmed = false) {
  const row: Record<string, any> = {
    id: "race-order", created_at: new Date().toISOString(), city: "თბილისი",
    address_line1: "სატესტო მისამართი 123", customer_phone: "555123456",
    cookie_id_hash: "test-cookie", status: initiallyConfirmed ? "confirmed" : "new",
    is_confirmed: initiallyConfirmed, is_fulfilled: false, review_required: false,
    auto_confirmed: false, order_items: [],
  };
  const events: Record<string, any>[] = [];
  let resume: (() => void) | undefined;
  let signalStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const delayed = new Promise<void>((resolve) => { resume = resolve; });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
    rpc: async () => ({ data: true }),
    from(table: string) {
      let patch: Record<string, unknown> | undefined;
      const filters: ((r: Record<string, any>) => boolean)[] = [];
      const execute = () => {
        if (patch) {
          if (!filters.every((f) => f(row))) return { data: null };
          Object.assign(row, patch);
          return { data: { id: row.id } };
        }
        return { data: highRisk ? [{ ...row, id: "prior", created_at: "2026-11-01T00:00:00Z" }] : [] };
      };
      const q = {
        select: () => q,
        update: (v: Record<string, unknown>) => { patch = v; return q; },
        eq: (key: string, v: unknown) => { filters.push((r) => r[key] === v); return q; },
        neq: () => q, gte: () => q, lt: () => q, in: () => q, or: () => q,
        not: (key: string, _operator: string, values: string) => {
          const excluded = values.slice(1, -1).split(",");
          filters.push((r) => !excluded.includes(r[key]));
          return q;
        },
        single: async () => ({ data: structuredClone(row) }),
        maybeSingle: async () => execute(),
        insert: async (event: Record<string, any>) => { if (table === "order_events") events.push(event); return {}; },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return q;
    },
  };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  runInNewContext(executable, {
    createClient: () => client, isTestOrder: () => false,
    Deno: { env: { get: () => "test-only" }, serve: (fn: typeof handler) => { handler = fn; } },
    Request, Response, Date, console,
    fetch: async () => {
      signalStarted?.();
      await delayed;
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        city: "თბილისი", address: "ნორმალიზებული მისამართი", confidence: 1, notes: "normalized",
      }) } }] });
    },
  });
  if (!handler) throw new Error("Scoring handler missing");
  const pending = handler(new Request("http://test.local", {
    method: "POST", headers: { Authorization: "Bearer test-only" },
    body: JSON.stringify({ order_id: row.id }),
  }));
  await started;
  Object.assign(row, change);
  resume?.();
  const response = await pending;
  expect(response.status).toBe(200);
  return { row, events, result: await response.json() };
}

describe("normalize-and-score write-time protection", () => {
  it("keeps an operator confirmation while saving high-risk metadata and its event", async () => {
    const { row, events } = await scoreDuringChange({ status: "confirmed", is_confirmed: true });
    expect(row.status).toBe("confirmed");
    expect(row.is_confirmed).toBe(true);
    expect(row.review_required).toBe(false);
    expect(row.normalized_address).toBe("ნორმალიზებული მისამართი");
    expect(row.risk_level).toBe("high");
    expect(events.map((e) => e.event_type)).toEqual(["risk_scored"]);
  });
  it.each(["confirmed", "canceled", "cancelled", "merged", "fulfilled"])("does not put live %s orders on hold", async (status) => {
    const { row } = await scoreDuringChange({ status });
    expect(row.status).toBe(status);
    expect(row.review_required).toBe(false);
  });
  it("does not hold a newly fulfilled order", async () => {
    const { row } = await scoreDuringChange({ is_fulfilled: true });
    expect(row.status).toBe("new");
    expect(row.review_required).toBe(false);
  });
  it("still holds an eligible high-risk order", async () => {
    const { row } = await scoreDuringChange({});
    expect(row.status).toBe("on_hold");
    expect(row.review_required).toBe(true);
  });
  it("does not add an AUTO badge/event after an operator wins the low-risk race", async () => {
    const { row, events, result } = await scoreDuringChange({ status: "confirmed", is_confirmed: true }, false);
    expect(row.auto_confirmed).toBe(false);
    expect(events).toEqual([]);
    expect(result.auto_confirmed).toBe(false);
  });
  it("still auto-confirms an eligible clean order", async () => {
    const { row, events, result } = await scoreDuringChange({}, false);
    expect(row.status).toBe("confirmed");
    expect(row.is_confirmed).toBe(true);
    expect(row.auto_confirmed).toBe(true);
    expect(events.map((e) => e.event_type)).toEqual(["auto_confirm"]);
    expect(result.auto_confirmed).toBe(true);
  });
  it("preserves an already confirmed operator decision on re-normalization", async () => {
    const { row } = await scoreDuringChange({}, true, true);
    expect(row.status).toBe("confirmed");
    expect(row.review_required).toBe(false);
    expect(row.risk_level).toBe("high");
  });
});