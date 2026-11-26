import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { callbackQuickOption } from "@/lib/callAttemptService";

describe("Tbilisi callback quick options", () => {
  it("2h at 14:00 is 16:00", () => {
    expect(callbackQuickOption("in_2h", new Date("2026-11-26T14:00:00+04:00"))).toBe("2026-11-26T12:00:00.000Z");
  });
  it("3h at 14:40 is 17:40 with minutes preserved", () => {
    expect(callbackQuickOption("in_3h", new Date("2026-11-26T14:40:00+04:00"))).toBe("2026-11-26T13:40:00.000Z");
  });
  it("4h at 19:30 rolls to next day at 10:00", () => {
    expect(callbackQuickOption("in_4h", new Date("2026-11-26T19:30:00+04:00"))).toBe("2026-11-27T06:00:00.000Z");
  });
  it("tomorrow is next day at 12:00 Tbilisi", () => {
    expect(callbackQuickOption("tomorrow", new Date("2026-11-26T14:00:00+04:00"))).toBe("2026-11-27T08:00:00.000Z");
  });
  it("before-10:00 result rolls to next working day at 10:00", () => {
    expect(callbackQuickOption("in_2h", new Date("2026-11-26T23:30:00+04:00"))).toBe("2026-11-27T06:00:00.000Z");
  });
  it("allows exactly 21:00 but not one second later", () => {
    expect(callbackQuickOption("in_2h", new Date("2026-11-26T19:00:00+04:00"))).toBe("2026-11-26T17:00:00.000Z");
    expect(callbackQuickOption("in_2h", new Date("2026-11-26T19:00:01+04:00"))).toBe("2026-11-27T06:00:00.000Z");
  });
  it("rolls across month and year boundaries", () => {
    expect(callbackQuickOption("tomorrow", new Date("2026-12-31T23:00:00+04:00"))).toBe("2027-01-01T08:00:00.000Z");
  });
});