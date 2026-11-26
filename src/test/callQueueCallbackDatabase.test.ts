// Exercise real queue SQL in a disposable cluster, never against customer orders.
import { execFileSync } from "node:child_process";
import { chownSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let directory = "";
let running = false;
const run = (program: string, args: string[]) => execFileSync(program, args, { uid: 1000, gid: 1000, stdio: "pipe" });
const sql = (query: string) => execFileSync("/bin/psql", ["-h", directory, "-p", "55440", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], { env: { PATH: process.env.PATH }, encoding: "utf8" }).trim();
const callback = "00000000-0000-0000-0000-000000000091";
const fresh = "00000000-0000-0000-0000-000000000092";
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "callback-db-"));
  chownSync(directory, 1000, 1000);
  run("/bin/initdb", ["-D", join(directory, "data"), "-U", "postgres", "--auth=trust", "--no-locale"]);
  run("/bin/pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p 55440 -c listen_addresses=''`, "-w", "start"]);
  running = true;
  sql(`CREATE TABLE orders(id uuid primary key,status text,created_at timestamptz,call_outcome text,call_attempt_count int,next_call_after timestamptz,last_call_attempt_at timestamptz,queue_locked_by text,queue_locked_until timestamptz,queue_last_touched_by text,onway_sent_at timestamptz,merged_into_order_id uuid,onway_api_status text,tracking_number text,onway_tracking text,packed_at timestamptz,packing_wave_id uuid);
    CREATE TABLE call_queue_settings(retry_gap_minutes int,lock_minutes int,retry_every_n int,backlog_mix int,catch_up_enabled boolean,work_start text,work_end text,morning_block_until text);
    INSERT INTO call_queue_settings VALUES(120,10,4,2,true,'10:00','21:00','12:00');
    CREATE TABLE operator_shifts(operator text,paused boolean,ended_at timestamptz);
    INSERT INTO operator_shifts VALUES('test-operator',false,NULL);
    CREATE TABLE call_queue_pick_counts(operator text,day date,picks int,PRIMARY KEY(operator,day));
    CREATE FUNCTION call_queue_actor() RETURNS text LANGUAGE sql AS $$ SELECT 'test-operator'::text $$;
    CREATE FUNCTION call_queue_cfg() RETURNS call_queue_settings LANGUAGE sql AS $$ SELECT * FROM call_queue_settings LIMIT 1 $$;
    CREATE FUNCTION call_queue_is_open(o orders) RETURNS boolean LANGUAGE sql AS $$ SELECT o.status IN ('new','on_hold','pending_details','pending_bump') $$;
    CREATE FUNCTION is_test_order(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION call_queue_autoend_shifts() RETURNS int LANGUAGE sql AS $$ SELECT 0 $$;
    CREATE FUNCTION call_queue_store_match(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`);
  sql(readFileSync("drizzle/migrations/0100_call_queue_fresh_first_callbacks_last.sql", "utf8"));
  sql(readFileSync("drizzle/migrations/0102_call_queue_simple_mode.sql", "utf8"));
  sql(readFileSync("drizzle/migrations/0111_call_queue_callbacks_wait_until_due.sql", "utf8"));
  const original = readFileSync("drizzle/migrations/0035_call_queue.sql", "utf8");
  const release = original.match(/CREATE OR REPLACE FUNCTION public.call_queue_release\([\s\S]*?END \$\$;/)?.[0];
  if (!release) throw new Error("Missing existing release function");
  sql(release);
}, 30000);
afterAll(() => {
  if (running) run("/bin/pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});
describe.each([false, true])("callback SQL round trip (catch-up %s)", catchUp => {
  it("saving then releasing a callback hands out the next fresh lead", () => {
    const result = sql(`TRUNCATE orders,call_queue_pick_counts; UPDATE call_queue_settings SET catch_up_enabled=${catchUp};
      INSERT INTO orders(id,status,created_at,call_attempt_count,queue_locked_by,queue_locked_until) VALUES
      ('${callback}','new',now()-interval '1 minute',0,'test-operator',now()+interval '10 minutes'),
      ('${fresh}','new',now()-interval '2 minutes',0,NULL,NULL);
      UPDATE orders SET status='on_hold',call_outcome='callback',next_call_after=now()+interval '2 hours' WHERE id='${callback}';
      SELECT call_queue_release('${callback}');
      SELECT json_build_object('unlocked',(SELECT queue_locked_by IS NULL AND queue_locked_until IS NULL FROM orders WHERE id='${callback}'),'hidden',(SELECT call_queue_tier(o,'test-operator',120) IS NULL FROM orders o WHERE id='${callback}'),'next',call_queue_next('all')->>'order_id');`);
    const row = JSON.parse(result.split("\n").find(line => line.startsWith("{")) ?? "{}");
    expect(row).toEqual({ unlocked: true, hidden: true, next: fresh });
  });
  it("a callback is eligible exactly when due, not one millisecond earlier", () => {
    const result = sql(`TRUNCATE orders; INSERT INTO orders(id,status,created_at,call_outcome,next_call_after,queue_last_touched_by) VALUES('${callback}','on_hold',now()-interval '1 day','callback',now()+interval '1 millisecond','test-operator');
      SELECT call_queue_tier(o,'test-operator',120) IS NULL FROM orders o;
      UPDATE orders SET next_call_after=now();
      SELECT call_queue_tier(o,'test-operator',120) FROM orders o;`);
    expect(result.split("\n").filter(line => line === "t" || line === "1")).toEqual(["t", "1"]);
  });
});