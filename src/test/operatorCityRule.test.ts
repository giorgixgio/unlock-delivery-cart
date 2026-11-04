import { describe, it, expect } from "vitest";
import { findExactOnwayCity } from "@/lib/onwayCities";
const cities = [{ id: "1", name: "ქუთაისი", aliases: ["kutaisi"] }, { id: "2", name: "ზუგდიდი > ანაკლია", aliases: [] }];
describe("operator city must be an exact Onway name", () => {
  it("accepts exact Onway names", () => { expect(findExactOnwayCity(cities, " ქუთაისი ")?.id).toBe("1"); expect(findExactOnwayCity(cities, "ზუგდიდი > ანაკლია")?.id).toBe("2"); });
  it("rejects free text, aliases and partial names", () => { expect(findExactOnwayCity(cities, "kutaisi")).toBeUndefined(); expect(findExactOnwayCity(cities, "ქუთაის")).toBeUndefined(); expect(findExactOnwayCity(cities, "ანაკლია")).toBeUndefined(); expect(findExactOnwayCity(cities, "")).toBeUndefined(); });
});
