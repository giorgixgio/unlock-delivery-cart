import { describe, it, expect } from "vitest";
import {
  onwayPayloadToShipment, parseOnwayStamp, parseCommentItems, stateFor, legacyOf, type StatusMapRow,
} from "../../supabase/functions/_shared/courierShipment";

const map = new Map<string, StatusMapRow>([
  ["გაფორმებული", { courier_status: "გაფორმებული", outbound_state: "IN_PROGRESS", outbound_is_final: false, return_state: "IN_PROGRESS", return_is_final: false }],
  ["ასაღები", { courier_status: "ასაღები", outbound_state: "IN_PROGRESS", outbound_is_final: false, return_state: "IN_PROGRESS", return_is_final: false }],
  ["აღების გადადება", { courier_status: "აღების გადადება", outbound_state: "IN_PROGRESS", outbound_is_final: false, return_state: "IN_PROGRESS", return_is_final: false }],
  ["აღების გაუქმება", { courier_status: "აღების გაუქმება", outbound_state: "CANCELLED_EXCLUDED", outbound_is_final: true, return_state: "RETURN_CANCELLED", return_is_final: true }],
  ["ფილიალიდან გაცემა", { courier_status: "ფილიალიდან გაცემა", outbound_state: "RETURNED_FAILED", outbound_is_final: true, return_state: "RETURN_COLLECTED", return_is_final: true }],
]);

const h = (status: string, date: string, hour: string, id = "1") => ({ status, comment: "", date, hour, timezone: "+04", order_status_id: id, image: "" });
// Real logged payload for test shipment 106139357 (order 122579).
const real = {
  order_info: {
    trackingnumber: "106139357", parent_trackingnumber: "", from_name: "ტრენდმარტი", from_phone: "555555555",
    to_name: "577282846", to_phone: "577282846", to_city: "ბათუმი", to_address: "დემეტრე თავდადებულის ქუჩა, 8",
    from_date: "2026-10-30", order_detail: "[S-0023] 002 - 1", order_number: "122579", cash_amount: "34.00", status: "აღების გაუქმება",
  },
  history: [
    h("აღების გაუქმება", "30.10.2026", "12:53", "38"), h("ასაღები", "30.10.2026", "12:46"), h("ასაღები", "30.10.2026", "11:50"),
    h("აღების გადადება", "29.10.2026", "17:51", "53"), h("ასაღები", "29.10.2026", "12:46"), h("გაფორმებული", "28.10.2026", "17:03", "37"),
  ],
};

describe("Onway payload -> courier shipment", () => {
  it("parses dd.mm.yyyy HH:MM +04 to real UTC", () => {
    expect(parseOnwayStamp("30.10.2026", "12:53", "+04")).toBe("2026-10-30T08:53:00.000Z");
  });

  it("maps the real test shipment to one cancelled-before-courier outbound row with 6 history entries", () => {
    const r = onwayPayloadToShipment(real, map)!;
    expect(r.row.tracking_number).toBe("106139357");
    expect(r.row.current_courier_status).toBe("აღების გაუქმება");
    expect(r.row.derived_state).toBe("CANCELLED_EXCLUDED");
    expect(r.row.is_return).toBe(false);
    expect(r.row.phone).toBe("577282846");
    expect(r.row.cod_amount).toBe(34);
    expect(r.row.comment_items).toEqual([{ code: "002", qty: 1 }]);
    expect(r.row.source_status_at).toBe("2026-10-30T08:53:00.000Z");
    expect(r.history).toHaveLength(6);
    expect(new Set(r.history.map((x) => `${x.courier_status}|${x.status_date}`)).size).toBe(6);
    expect(r.unknownStatuses).toEqual([]);
  });

  it("is deterministic, so replaying the same payload builds the identical row", () => {
    expect(onwayPayloadToShipment(real, map)).toEqual(onwayPayloadToShipment(real, map));
  });

  it("derives the same state as the Excel path for the same status", () => {
    for (const s of map.keys()) for (const ret of [false, true]) {
      const payload = { ...real, order_info: { ...real.order_info, status: s, parent_trackingnumber: ret ? "999" : "" } };
      const r = onwayPayloadToShipment(payload, map)!;
      const excel = stateFor(map, s, ret).state;
      expect(r.row.derived_state).toBe(excel);
      expect(r.row.derived_status).toBe(legacyOf(excel, ret).derived);
    }
  });

  it("treats parent_trackingnumber as a return and uses the customer (sender) phone, never 555555555", () => {
    const ret = {
      order_info: { trackingnumber: "200", parent_trackingnumber: "106139357", from_name: "ნინო", from_phone: "599123456",
        to_name: "ტრენდმარტი", to_phone: "555555555", order_detail: "002 - 1", status: "ფილიალიდან გაცემა" },
      history: [h("ფილიალიდან გაცემა", "05.11.2026", "10:00")],
    };
    const r = onwayPayloadToShipment(ret, map)!;
    expect(r.row.is_return).toBe(true);
    expect(r.row.onway_parent_tracking).toBe("106139357");
    expect(r.row.phone).toBe("599123456");
    expect(r.row.derived_state).toBe("RETURN_COLLECTED");
  });

  it("flags unknown statuses and keeps them in progress", () => {
    const r = onwayPayloadToShipment({ ...real, order_info: { ...real.order_info, status: "ახალი" }, history: [h("ახალი", "01.11.2026", "10:00")] }, map)!;
    expect(r.unknownStatuses).toEqual(["ახალი"]);
    expect(r.row.derived_state).toBe("IN_PROGRESS");
  });

  it("keeps the importer's comment parsing", () => {
    expect(parseCommentItems("[S-1] 0015 - 2, 0016x1")).toEqual([{ code: "0015", qty: 2 }, { code: "0016", qty: 1 }]);
  });
});
