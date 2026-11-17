import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: "lead-1" })) } }));
import { normalizeScratchPhone, shouldInsertScratchLead, leadMatchesOrder, linkLeadToOrder, buildOneTapOrder, shouldShowScratchPopup, metaAllowedForPhone, applyScratchTestParam, isScratchTester, submitScratchLead } from "@/lib/scratchLeads";
import { trackPhoneSubmitted } from "@/lib/funnelTracking";
import type { Product } from "@/lib/constants";

const disc = { id: "p1", sku: "G888-T4656-0012_4", title: "ხის დისკი", price: 24, image: "" } as Product;
const fbq = vi.fn();
beforeEach(() => { fbq.mockClear(); (window as any).fbq = fbq; localStorage.clear(); });

describe("scratch leads", () => {
  it("validates Georgian mobiles like checkout", () => {
    expect(normalizeScratchPhone("+995 555 12 34 99")).toBe("555123499");
    expect(normalizeScratchPhone("455123499")).toBeNull();
    expect(normalizeScratchPhone("55512")).toBeNull();
  });
  it("dedupes leads/orders within 24h", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(shouldInsertScratchLead([{ created_at: "2026-11-17T01:00:00Z" }], now)).toBe(false);
    expect(shouldInsertScratchLead([{ created_at: "2026-11-16T11:00:00Z" }], now)).toBe(true);
    expect(shouldInsertScratchLead([], now)).toBe(true);
  });
  it("links an open lead to the order by phone", () => {
    const lead = { phone: "555123499", status: "new", order_id: null };
    expect(leadMatchesOrder(lead, "+995555123499")).toBe(true);
    expect(linkLeadToOrder(lead, "o1")).toMatchObject({ status: "ordered", order_id: "o1" });
    expect(leadMatchesOrder({ ...lead, status: "declined" }, "555123499")).toBe(false);
  });
  it("one-tap order uses saved phone and adds the gift line", () => {
    const o = buildOneTapOrder(disc, 2, "555123499", 44, "wood");
    expect(o.customerPhone).toBe("555123499");
    expect(o.items).toHaveLength(2);
    expect(o.items[1]).toMatchObject({ quantity: 1, isGift: true });
    expect(o.items[1].product.price).toBe(0);
    expect(o.total).toBe(49);
    expect(o.promo).toBe("scratch_0012_4");
  });
  it("tester flag forces popup and ignores revealed state", () => {
    expect(shouldShowScratchPopup({ revealed: true, active: true }, true)).toBe(true);
    expect(shouldShowScratchPopup({ revealed: true, active: false }, false)).toBe(false);
    expect(applyScratchTestParam("?scratch_test=1")).toBe(true);
    expect(isScratchTester()).toBe(true);
    applyScratchTestParam("?scratch_test=0");
    expect(isScratchTester()).toBe(false);
  });
  it("ScratchLead custom event fires instead of Lead", async () => {
    await submitScratchLead("555123499", "wood");
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("trackCustom", "ScratchLead", expect.anything());
    expect(fbq.mock.calls.some((c) => c[1] === "Lead" || c[1] === "Purchase")).toBe(false);
  });
  it("no Meta events for the tester number", async () => {
    expect(metaAllowedForPhone("550501194")).toBe(false);
    await submitScratchLead("550501194", "wood");
    trackPhoneSubmitted({ orderId: "o", orderNumber: "1", productId: "p", productName: "x", baseValue: 24, landingSlug: "w", skipMeta: true });
    trackPhoneSubmitted({ orderId: "o", orderNumber: "1", productId: "p", productName: "x", baseValue: 24, landingSlug: "w" });
    expect(fbq).not.toHaveBeenCalled();
    expect(isScratchTester()).toBe(true);
  });
});
