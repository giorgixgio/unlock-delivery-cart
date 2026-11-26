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
    CREATE FUNCTION public._accountant_failed_shipments(date,date,text,text,text)
    RETURNS TABLE(failed_fee numeric,payout_date date) LANGUAGE sql AS $$ SELECT 12::numeric,current_date $$;`);
  sql(readFileSync("drizzle/migrations/0104_accountant_sku_paid_deliveries_only.sql", "utf8"));
}, 30000);

afterAll(() => {
  if (running) run("/bin/pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("paid successful delivery SKU accounting", () => {
  it("excludes pending quantities, counts and pending-only products", () => {
    expect(report().rows).toEqual([{ sku: "002", title: "Camera", units_sold: 3, orders_count: 2, net_payout_attributed: 90.75 }]);
    expect(report().total_units).toBe(3);
  });
  it("includes today's payouts and makes the footer equal paid product amounts", () => {
    const result = report();
    expect(result.total_net_payout).toBe(90.75);
    expect(result.rows.reduce((sum: number, row: { net_payout_attributed: number }) => sum + row.net_payout_attributed, 0)).toBe(90.75);
  });
  it("does not deduct failed-delivery fees or pending earnings", () => {
    const result = report();
    expect(result.paid_failed_delivery_fees).toBe(0);
    expect(result.pending_delivered_payout).toBe(0);
    expect(result.total_net_payout).toBe(90.75);
  });
  it("preserves the staff-only report permission", () => {
    expect(sql("SELECT has_function_privilege('anon','public.accountant_by_sku(date,date,text,text,text)','EXECUTE');")).toBe("f");
    expect(sql("SELECT has_function_privilege('authenticated','public.accountant_by_sku(date,date,text,text,text)','EXECUTE');")).toBe("t");
  });
});