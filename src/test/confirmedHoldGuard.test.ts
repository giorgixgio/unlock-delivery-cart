// Real PostgreSQL regression tests in a disposable local cluster; never use the project database.
import { execFileSync } from "node:child_process";
import { chownSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let directory = "";
let running = false;
const id = "00000000-0000-0000-0000-000000000001";
const runAsTestUser = (program: string, args: string[]) => execFileSync(program, args, { uid: 1000, gid: 1000, stdio: "pipe" });
function sql(query: string) {
  return execFileSync("/bin/psql", ["-h", directory, "-p", "55439", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], {
    env: { PATH: process.env.PATH }, encoding: "utf8", stdio: "pipe",
  }).trim();
}
function readRow(query: string) {
  const output = sql(`${query}; SELECT row_to_json(o) FROM public.orders o WHERE id='${id}';`);
  const json = output.split("\n").reverse().find((line) => line.startsWith("{"));
  if (!json) throw new Error("Missing test row");
  return JSON.parse(json);
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "confirmed-hold-test-"));
  chownSync(directory, 1000, 1000);
  runAsTestUser("/bin/initdb", ["-D", join(directory, "data"), "-U", "postgres", "--auth=trust", "--no-locale"]);
  runAsTestUser("/bin/pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p 55439 -c listen_addresses=''`, "-w", "start"]);
  running = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${id}'::uuid $$;
    CREATE FUNCTION public.is_active_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.staff', true),'')='1' $$;
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY, status text, is_confirmed boolean, review_required boolean,
      is_fulfilled boolean DEFAULT false, risk_level text, version integer DEFAULT 1,
      assigned_to text, internal_note text, courier_name text, tracking_number text, tracking_url text,
      next_call_after timestamptz, call_outcome text, operator_review_status text,
      call_outcome_updated_at timestamptz, call_outcome_updated_by text
    );
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT, UPDATE ON public.orders TO authenticated;
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_staff ON public.orders TO authenticated
      USING (coalesce(current_setting('test.access', true),'')='1')
      WITH CHECK (coalesce(current_setting('test.access', true),'')='1');`);
  sql(readFileSync("drizzle/migrations/0101_protect_operator_confirmed_orders_from_scoring_holds.sql", "utf8"));
}, 30000);
afterAll(() => {
  if (running) runAsTestUser("/bin/pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});
beforeEach(() => sql(`TRUNCATE public.orders; INSERT INTO public.orders(id,status,is_confirmed,review_required) VALUES('${id}','confirmed',true,false);`));

describe("confirmed order hold backstop", () => {
  it("silently retains confirmation and review state while accepting risk metadata", () => {
    const row = readRow(`UPDATE public.orders SET status='on_hold',review_required=true,risk_level='high' WHERE id='${id}'`);
    expect(row.status).toBe("confirmed");
    expect(row.review_required).toBe(false);
    expect(row.risk_level).toBe("high");
  });
  it("allows holds on unconfirmed orders", () => {
    const row = readRow(`UPDATE public.orders SET is_confirmed=false,status='on_hold',review_required=true WHERE id='${id}'`);
    expect(row.status).toBe("on_hold");
    expect(row.review_required).toBe(true);
  });
  it("does not change an order already on hold", () => {
    const row = readRow(`SELECT set_config('app.allow_confirmed_hold','1',false);
      UPDATE public.orders SET status='on_hold' WHERE id='${id}';
      SELECT set_config('app.allow_confirmed_hold','',false);
      UPDATE public.orders SET review_required=true WHERE id='${id}'`);
    expect(row.status).toBe("on_hold");
    expect(row.review_required).toBe(true);
  });
  it("keeps settled statuses intact when background code attempts a hold", () => {
    for (const status of ["shipped", "delivered", "returned", "canceled", "merged", "fulfilled"]) {
      const row = readRow(`UPDATE public.orders SET status='${status}' WHERE id='${id}';
        UPDATE public.orders SET status='on_hold',review_required=true WHERE id='${id}'`);
      expect(row.status).toBe(status);
      expect(row.review_required).toBe(false);
    }
  });
  it("allows a versioned intentional staff hold and resets the override", () => {
    const row = readRow(`SET ROLE authenticated; SET test.staff='1'; SET test.access='1';
      SELECT public.orders_intentional_hold('${id}','{"status":"on_hold","internal_note":"manual hold"}',1);
      RESET ROLE;
      UPDATE public.orders SET status='confirmed' WHERE id='${id}';
      UPDATE public.orders SET status='on_hold',review_required=true WHERE id='${id}'`);
    expect(row.version).toBe(2);
    expect(row.internal_note).toBe("manual hold");
    expect(row.status).toBe("confirmed");
    expect(row.review_required).toBe(false);
  });
  it("allows the existing callback fields through the intentional hold action", () => {
    const row = readRow(`SET ROLE authenticated; SET test.staff='1'; SET test.access='1';
      SELECT public.orders_intentional_hold('${id}','{"status":"on_hold","call_outcome":"callback","operator_review_status":"callback","next_call_after":"2026-11-27T09:00:00Z","call_outcome_updated_by":"test-staff"}'); RESET ROLE`);
    expect(row.status).toBe("on_hold");
    expect(row.is_confirmed).toBe(true);
    expect(row.call_outcome).toBe("callback");
    expect(row.version).toBe(1);
  });
  it("rejects stale versions", () => {
    expect(() => sql(`SET test.staff='1'; SELECT public.orders_intentional_hold('${id}','{"status":"on_hold"}',0)`)).toThrow();
    expect(readRow("SELECT 1").status).toBe("confirmed");
  });
  it("does not bypass order RLS", () => {
    expect(() => sql(`SET ROLE authenticated; SET test.staff='1'; SELECT public.orders_intentional_hold('${id}','{"status":"on_hold"}',1)`)).toThrow();
    expect(readRow("SELECT 1").status).toBe("confirmed");
  });
  it("rejects non-staff callers and unrelated field changes", () => {
    expect(() => sql(`SELECT public.orders_intentional_hold('${id}','{"status":"on_hold"}',1)`)).toThrow();
    expect(() => sql(`SET test.staff='1'; SELECT public.orders_intentional_hold('${id}','{"status":"on_hold","is_confirmed":false}',1)`)).toThrow();
    expect(readRow("SELECT 1").is_confirmed).toBe(true);
  });
});