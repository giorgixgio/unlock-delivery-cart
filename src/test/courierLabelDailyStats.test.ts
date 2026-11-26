import { execFileSync } from "node:child_process";
import { chownSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let directory = "";
let running = false;
const run = (program: string, args: string[]) => execFileSync(program, args, { uid: 1000, gid: 1000, stdio: "pipe" });
const sql = (query: string) => execFileSync("/bin/psql", ["-h", directory, "-p", "55441", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8", stdio: "pipe" }).trim();
const report = (store = "B") => JSON.parse(sql(`SELECT public.courier_label_daily_stats('${store}','2026-11-26');`));
const action = (key: string, kind: string, warehouse: string | null = "B") => `INSERT INTO public.courier_label_actions(group_key,title,kind,warehouse) VALUES('${key}','${key}','${kind}',${warehouse ? `'${warehouse}'` : "NULL"});`;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "label-daily-test-"));
  chownSync(directory, 1000, 1000);
  run("/bin/initdb", ["-D", join(directory, "data"), "-U", "postgres", "--auth=trust", "--no-locale"]);
  run("/bin/pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p 55441 -c listen_addresses=''`, "-w", "start"]);
  running = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION public.is_active_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.staff',true),'1') <> '0' $$;
    CREATE FUNCTION public.is_active_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.is_test_order(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000009'::uuid $$;
    CREATE TABLE public.import_batches(id uuid PRIMARY KEY,store text,created_at timestamptz,applied_at timestamptz);
    CREATE TABLE public.import_staging_rows(batch_id uuid,matched_order_id uuid,applied boolean,applied_at timestamptz);
    CREATE TABLE public.orders(id uuid PRIMARY KEY,total numeric,tracking_number text,onway_tracking text);
    CREATE TABLE public.products(sku text,warehouse text);
    CREATE TABLE public.order_items(order_id uuid,sku text);
    CREATE TABLE public.courier_shipments(tracking_number text,onway_parent_tracking text,is_return boolean,cod_amount numeric,company_receives numeric);
    CREATE TABLE public.courier_label_actions(id serial,group_key text,title text,kind text,actor text,created_at timestamptz DEFAULT now());
    INSERT INTO public.import_batches VALUES
      ('00000000-0000-0000-0000-0000000000b1','B','2026-11-25 19:00Z','2026-11-25 20:00Z'),
      ('00000000-0000-0000-0000-0000000000b2','B','2026-11-26 10:00Z','2026-11-26 10:00Z');
    INSERT INTO public.orders SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,CASE n WHEN 1 THEN 60 WHEN 2 THEN 40 WHEN 3 THEN 30 WHEN 4 THEN 100 ELSE 999 END,'track-'||n,NULL FROM generate_series(1,9)n;
    INSERT INTO public.products VALUES('B-sku','B'),('A-sku','A');
    INSERT INTO public.order_items SELECT id,CASE WHEN tracking_number='track-4' THEN 'A-sku' ELSE 'B-sku' END FROM public.orders WHERE tracking_number<>'track-3';
    INSERT INTO public.import_staging_rows SELECT '00000000-0000-0000-0000-0000000000b1',id,true,'2026-11-25 20:00Z' FROM public.orders WHERE tracking_number IN ('track-1','track-2','track-3','track-4','track-9');
    INSERT INTO public.import_staging_rows VALUES
      ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000001',true,'2026-11-26 10:00Z'),
      ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000005',true,'2026-11-26 20:00Z'),
      ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000006',true,'2026-11-25 19:59:59Z'),
      ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000007',false,'2026-11-26 10:00Z');
    INSERT INTO public.courier_shipments VALUES('track-1',NULL,false,60,50),('box-2a','track-2',false,30,24),('box-2b','track-2',false,10,8),('track-4',NULL,false,100,90),('return-1','track-1',true,999,999);`);
  sql(readFileSync("drizzle/migrations/0109_courier_label_daily_stats_and_auto_finish.sql", "utf8"));
}, 30000);

afterAll(() => {
  if (running) run("/bin/pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("Daily uploaded batch totals", () => {
  it("counts applied real orders once across batches, on the Tbilisi day only", () => {
    expect(report().order_count).toBe(3);
    expect(report().batch_count).toBe(2);
    expect(report().total_with_fee).toBe(130);
  });
  it("uses courier net for all boxes, excludes returns, and does not invent missing fees", () => {
    const result = report();
    expect(result.known_net).toBe(82);
    expect(result.courier_fees).toBe(18);
    expect(result.pending_fee_orders).toBe(1);
    expect(result.total_without_fee).toBeNull();
  });
  it("shows the complete net once all courier amounts are known", () => {
    const result = JSON.parse(sql(`BEGIN; INSERT INTO public.courier_shipments VALUES('track-3',NULL,false,30,22); SELECT public.courier_label_daily_stats('B','2026-11-26'); ROLLBACK;`).split("\n").find(line => line.startsWith("{")) ?? "{}");
    expect(result.total_without_fee).toBe(104);
    expect(result.pending_fee_orders).toBe(0);
  });
  it("respects current item warehouses instead of batch labels", () => {
    expect(report("A").order_count).toBe(1);
    expect(report("A").total_with_fee).toBe(100);
    expect(report("A").total_without_fee).toBe(90);
  });
  it("keeps financial totals staff-only", () => {
    expect(sql("SELECT has_function_privilege('anon','public.courier_label_daily_stats(text,date)','EXECUTE');")).toBe("f");
    expect(() => sql("SET test.staff='0'; SELECT public.courier_label_daily_stats('B','2026-11-26');")).toThrow();
  });
});

describe("Starting another packing batch finishes previous work", () => {
  it("finishes started groups across uploads, but not other warehouses or untouched groups", () => {
    sql(action("upload-1::singles", "pdf") + action("upload-A::singles", "pdf", "A") + action("upload-untouched::_opened", "opened") + action("upload-2::singles", "pdf"));
    expect(sql("SELECT count(*) FROM public.courier_label_actions WHERE group_key='upload-1::singles' AND kind='finish';")).toBe("1");
    expect(sql("SELECT count(*) FROM public.courier_label_actions WHERE group_key IN ('upload-A::singles','upload-untouched::_opened','upload-2::singles') AND kind='finish';")).toBe("0");
  });
  it("a second print action or reprint does not finish the current next group", () => {
    sql(action("upload-1::singles", "pdf") + action("upload-2::singles", "tags"));
    expect(sql("SELECT count(*) FROM public.courier_label_actions WHERE group_key='upload-2::singles' AND kind='finish';")).toBe("0");
  });
  it("starting a new round also closes unfinished earlier rounds", () => {
    sql(action("upload-2::round-1", "tags"));
    expect(sql("SELECT count(*) FROM public.courier_label_actions WHERE group_key='upload-2::singles' AND kind='finish';")).toBe("1");
    sql(action("upload-2::round-2", "pdf"));
    expect(sql("SELECT count(*) FROM public.courier_label_actions WHERE group_key='upload-2::round-1' AND kind='finish';")).toBe("1");
  });
});