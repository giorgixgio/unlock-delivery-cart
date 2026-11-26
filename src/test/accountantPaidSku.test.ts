import { execFileSync } from "node:child_process";
import { chownSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let directory = "";
let running = false;
const run = (program: string, args: string[]) => execFileSync(program, args, { uid: 1000, gid: 1000, stdio: "pipe" });
const sql = (query: string) => execFileSync("/bin/psql", ["-h", directory, "-p", "55440", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8", stdio: "pipe" }).trim();
const report = () => JSON.parse(sql("SELECT public.accountant_by_sku('2026-01-01','2026-12-31');"));

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "paid-sku-test-"));
  chownSync(directory, 1000, 1000);
  run("/bin/initdb", ["-D", join(directory, "data"), "-U", "postgres", "--auth=trust", "--no-locale"]);
  run("/bin/pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p 55440 -c listen_addresses=''`, "-w", "start"]);
  running = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION public.is_accountant_or_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public._accountant_lines(date,date,text,text,text)
    RETURNS TABLE(shipment_id uuid,payout_date date,sku text,title text,qty int,attributed_amount numeric)
    LANGUAGE sql AS $$ SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000001'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date,'002','Camera',2,60.25::numeric),
      ('00000000-0000-0000-0000-000000000002'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date-1,'002','Camera',1,30.50::numeric),
      ('00000000-0000-0000-0000-000000000003'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date+1,'002','Camera',10,300::numeric),
      ('00000000-0000-0000-0000-000000000004'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date+1,'pending-only','Pending product',5,150::numeric)
    ) AS fixtures(shipment_id,payout_date,sku,title,qty,attributed_amount) $$;
    CREATE TABLE public.products(id uuid, sku text, title text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.order_items(id serial, order_id uuid, product_id uuid, sku text, title text, quantity int, is_gift boolean);
    CREATE TABLE public.courier_shipments(id uuid, original_order_id uuid, sku text, comment_items jsonb);
    INSERT INTO public.products VALUES ('00000000-0000-0000-0000-0000000000a1','002','Camera');
    INSERT INTO public.order_items(order_id,product_id,sku,title,quantity,is_gift) VALUES
      ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','002','Camera',1,false);
    INSERT INTO public.courier_shipments VALUES
      ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1',null,null),
      ('00000000-0000-0000-0000-0000000000f2',null,'002',null),
      ('00000000-0000-0000-0000-0000000000f3',null,'002',null),
      ('00000000-0000-0000-0000-0000000000f4',null,'failed-only',null);
    CREATE FUNCTION public._accountant_failed_shipments(date,date,text,text,text)
    RETURNS TABLE(shipment_id uuid,payout_date date,failed_fee numeric) LANGUAGE sql AS $$ SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-0000000000f1'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date,6::numeric),
      ('00000000-0000-0000-0000-0000000000f2'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date-2,6::numeric),
      ('00000000-0000-0000-0000-0000000000f3'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date+1,6::numeric),
      ('00000000-0000-0000-0000-0000000000f4'::uuid,(now() AT TIME ZONE 'Asia/Tbilisi')::date,5.5::numeric)
    ) AS f(shipment_id,payout_date,failed_fee) $$;`);
  sql(readFileSync("drizzle/migrations/0108_accountant_sku_rows_sum_to_bank_total.sql", "utf8"));
}, 30000);

afterAll(() => {
  if (running) run("/bin/pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("By SKU shows only money received in the bank", () => {
  it("excludes future payouts, their quantities and pending-only products", () => {
    const result = report();
    expect(result.rows.map((r: { sku: string }) => r.sku)).toEqual(["002"]);
    expect(result.rows[0].units_sold).toBe(3);
    expect(result.rows[0].orders_count).toBe(2);
    expect(result.total_units).toBe(3);
  });
  it("total is only the bank money: paid deliveries minus charges Onway already kept", () => {
    const result = report();
    // 60.25 + 30.50 paid in - 6 - 6 - 5.5 failed charges already kept; the 6 GEL due tomorrow is ignored
    expect(result.rows[0].net_payout_attributed).toBe(73.25);
    expect(result.total_net_payout).toBe(73.25);
  });
  it("lists no failed-only products and reports no separate deduction lines", () => {
    const result = report();
    expect(result.rows.map((r: { sku: string }) => r.sku)).not.toContain("failed-only");
    expect(result.total_delivered_payout).toBe(73.25);
    expect(result.paid_failed_delivery_fees).toBe(0);
    expect(result.pending_delivered_payout).toBe(0);
  });
  it("preserves the staff-only report permission", () => {
    expect(sql("SELECT has_function_privilege('anon','public.accountant_by_sku(date,date,text,text,text)','EXECUTE');")).toBe("f");
    expect(sql("SELECT has_function_privilege('authenticated','public.accountant_by_sku(date,date,text,text,text)','EXECUTE');")).toBe("t");
  });
});