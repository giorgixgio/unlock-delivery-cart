import { describe, it, expect } from "vitest";
import { summarizeDay, type TodayShipment } from "@/lib/courierToday";

const s = (o: Partial<TodayShipment>): TodayShipment => ({
  tracking_number: Math.random().toString(), order_number: null, current_courier_status: "x", derived_state: "IN_PROGRESS",
  is_return: false, customer_name: null, phone: null, city: null, cod_amount: 10, company_receives: 6,
  latest_status_date: null, status_changed_at: null, final_status_date: null, ...o,
});

describe("summarizeDay", () => {
  it("counts today's outcomes by Tbilisi day and open parcels by status", () => {
    const r = summarizeDay([
      s({ derived_state: "DELIVERED", status_changed_at: "2026-11-04T08:00:00Z", cod_amount: 30, company_receives: 24 }),
      s({ derived_state: "DELIVERED", status_changed_at: "2026-11-03T19:30:00Z" }), // 23:30 Tbilisi Nov 3
      s({ derived_state: "FAILED_FINAL", status_changed_at: "2026-11-04T09:00:00Z" }),
      s({ derived_state: "IN_PROGRESS", current_courier_status: "საწყობში" }),
      s({ derived_state: "FAILED_ATTEMPT", current_courier_status: "ვერ ჩაბარდა", status_changed_at: "2026-11-04T10:00:00Z" }),
      s({ derived_state: "DELIVERED", is_return: true, status_changed_at: "2026-11-04T08:00:00Z" }),
    ], "2026-11-04");
    expect(r.today.delivered).toEqual({ count: 1, cod: 30, net: 24 });
    expect(r.today.failed_final.count).toBe(1);
    expect(r.today.failed_attempt.count).toBe(1);
    expect(r.open.count).toBe(2);
    expect(r.successRate).toBe(0.5);
  });

  it("totals what Onway remits to us separately from the collected order total", () => {
    const r = summarizeDay([
      s({ current_courier_status: "საწყობში", cod_amount: 34, company_receives: 25.5 }),
      s({ current_courier_status: "საწყობში", cod_amount: 53, company_receives: 43.5 }),
      s({ current_courier_status: "გაგზავნილი ფილიალში", cod_amount: 29, company_receives: 23.5 }),
    ], "2026-11-04");
    expect(r.open).toEqual({ count: 3, cod: 116, net: 92.5 });
    expect(r.byStatus).toEqual([
      { status: "საწყობში", count: 2, cod: 87, net: 69, bucket: "in_progress" },
      { status: "გაგზავნილი ფილიალში", count: 1, cod: 29, net: 23.5, bucket: "in_progress" },
    ]);
  });
});
