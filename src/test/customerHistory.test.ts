import { describe, it, expect } from "vitest";
import { historyBadge, reasonOf, stageOf, type HistOrder } from "@/lib/customerHistory";

const base = (o: Partial<HistOrder>): HistOrder => ({
  id: "x", public_order_number: "1", created_at: "2026-11-01", status: "fulfilled", total: 10, call_attempt_count: 0,
  match_type: "phone", onway_sent_at: null, onway_last_status: null, shipment: null, failures: [], ...o,
});
const ship = (derived_state: string, status = "") => ({ derived_state, status, at: null, source: "api" });

describe("customer history badge", () => {
  it("refused at door when final failure carries refusal code 1", () => {
    expect(historyBadge([base({ shipment: ship("FAILED_FINAL"), failures: [{ at: "", status: "არ ჩაბარდა", code: "1", comment: null, ai_reason: null }] })])?.kind).toBe("refused");
  });
  it("final failure without reason is not a refusal", () => {
    expect(historyBadge([base({ shipment: ship("FAILED_FINAL") })])?.kind).toBe("failed_not_refusal");
  });
  it("failed attempt that is not final counts as still on the way", () => {
    expect(historyBadge([base({ shipment: ship("FAILED_ATTEMPT") })])?.kind).toBe("on_the_way");
  });
  it("on the way beats delivered", () => {
    expect(historyBadge([base({ shipment: ship("DELIVERED") }), base({ shipment: ship("IN_PROGRESS", "საწყობში") })])?.kind).toBe("on_the_way");
  });
  it("delivered gives green", () => {
    expect(historyBadge([base({ shipment: ship("DELIVERED") })])?.kind).toBe("delivered");
  });
  it("no history or device-only matches give no badge", () => {
    expect(historyBadge([])).toBeNull();
    expect(historyBadge([base({ match_type: "device", shipment: ship("DELIVERED") })])).toBeNull();
  });
  it("never guesses a reason", () => {
    expect(reasonOf({ at: "", status: "არ ჩაბარდა", code: null, comment: null, ai_reason: "refused" })).toBe("unknown");
    expect(reasonOf({ at: "", status: "", code: "3", comment: null, ai_reason: null })).toBe("no_answer");
  });
  it("sent to Onway without a status yet is 'created'", () => {
    expect(stageOf(base({ onway_sent_at: "2026-11-04" }))).toBe("created");
  });
});
