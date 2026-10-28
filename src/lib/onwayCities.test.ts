import { describe, it, expect } from "vitest";
import { searchOnwayCities, selectedCityValid } from "./onwayCities";
const cities = [{ id: "2", name: "ბათუმი", aliases: ["batumi"] }, { id: "4", name: "ქუთაისი", aliases: ["kutaisi"] }];
describe("Onway selected destinations", () => {
  it("filters Georgian partial input", () => expect(searchOnwayCities(cities, "ბათ").map(c => c.id)).toEqual(["2"]));
  it("filters Latin transliteration batumi", () => expect(searchOnwayCities(cities, "batumi").map(c => c.id)).toEqual(["2"]));
  it("filters Latin partial kutai", () => expect(searchOnwayCities(cities, "kutai").map(c => c.id)).toEqual(["4"]));
  it("rejects full address text instead of a selected city", () => expect(selectedCityValid(cities, "2", "ბათუმი რუსთაველის 5")).toBe(false));
  it("rejects typing an exact city without selection", () => expect(selectedCityValid(cities, null, "ბათუმი")).toBe(false));
  it("accepts only matching selected ID and name", () => expect(selectedCityValid(cities, "2", "ბათუმი")).toBe(true));
});