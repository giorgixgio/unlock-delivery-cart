import { describe, expect, it } from "vitest";
import { SUMMARY_UTC_CRON, summaryWindow, isLeadCreation } from "../../supabase/functions/telegram-alerts/operatorSummary";
describe("Telegram owner alert rules", () => {
  it("schedules 7 PM Tbilisi at 15:00 UTC", () => {
    expect(SUMMARY_UTC_CRON).toBe("0 15 * * *");
    expect(new Date("2026-10-28T19:00:00+04:00").getUTCHours()).toBe(15);
  });
  it("uses Tbilisi midnight through report time", () => {
    expect(summaryWindow(new Date("2026-10-28T15:00:00Z"))).toEqual({
      day: "2026-10-28", from: "2026-10-28T00:00:00+04:00", to: "2026-10-28T15:00:00.000Z",
    });
  });
  it("does not notify for completed orders", () => {
    expect(isLeadCreation("pending_details")).toBe(true);
    expect(isLeadCreation("new")).toBe(false);
    expect(isLeadCreation("confirmed")).toBe(false);
    expect(isLeadCreation("shipped")).toBe(false);
  });
});