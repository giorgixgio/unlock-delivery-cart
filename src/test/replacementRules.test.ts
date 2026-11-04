import { describe, it, expect } from "vitest";
import { replacementCandidates, preselectCandidate, isDeliveredOrder } from "@/lib/replacementRules";
import { statusBadge } from "@/lib/queueSearchRules";

const base = { status: "shipped", total: 10, call_attempt_count: 0, onway_sent_at: "x", onway_last_status: null, shipment: null, failures: [], match_type: "phone" as const };
const o = (id: string, created_at: string, extra: any = {}) => ({ ...base, id, public_order_number: id, created_at, ...extra });

describe("replacement candidates", () => {
  it("offers only delivered phone matches, newest first", () => {
    const list = replacementCandidates([
      o("a", "2026-10-01", { status: "delivered" }),
      o("b", "2026-10-20", { onway_last_status: "ჩაბარდა" }),
      o("c", "2026-10-25"),
      o("d", "2026-10-26", { status: "delivered", match_type: "device" }),
      o("e", "2026-10-27", { status: "delivered", is_replacement: true }),
    ] as any);
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("preselects only when exactly one", () => {
    expect(preselectCandidate([{ id: "x" }])).toBe("x");
    expect(preselectCandidate([{ id: "x" }, { id: "y" }])).toBeNull();
    expect(preselectCandidate([])).toBeNull();
  });
  it("a delivered courier state counts as delivered", () => {
    expect(isDeliveredOrder({ ...base, shipment: { derived_state: "DELIVERED", status: null, at: null, source: null } } as any)).toBe(true);
  });
  it("converted lead is labelled, not cancelled", () => {
    expect(statusBadge({ status: "merged", tags: ["converted_to_replacement"] } as any).label).toContain("შეცვლად");
  });
});
