import { describe, it, expect } from "vitest";
import { computeLogistics, unitEconomics } from "./importCalculator";

const rates = { landRateCbm: 270, landRateKg: 1, airRateKg: 12, airDivisor: 6000 };
const carton = { cartonL: 73, cartonW: 41, cartonH: 40, cartonKg: 17.2, unitsPerCarton: 25 };

describe("import logistics – real example (4 cartons 73×41×40, 17.2kg)", () => {
  const l = computeLogistics(100, carton, rates);
  it("uses 4 cartons", () => expect(l.cartons).toBe(4));
  it("total CBM 0.479", () => expect(l.totalCbm).toBeCloseTo(0.479, 3));
  it("total kg 68.8", () => expect(l.totalKg).toBeCloseTo(68.8, 6));
  it("land = 129.3 USD by VOLUME", () => {
    expect(l.land.byVolume).toBeCloseTo(129.3, 1);
    expect(l.land.byWeight).toBeCloseTo(68.8, 6);
    expect(l.land.chargedBy).toBe("VOLUME");
  });
  it("air: 19.95 volumetric kg/carton beats 17.2, ~79.8 kg, ~957.7 USD", () => {
    expect(l.air.volumetricKgPerCarton).toBeCloseTo(19.95, 2);
    expect(l.air.chargedBy).toBe("VOLUMETRIC");
    expect(l.air.chargeableKg).toBeCloseTo(79.81, 2);
    expect(l.air.cost).toBeCloseTo(957.76, 2);
  });
  it("break-even density 270", () => expect(l.breakEvenDensity).toBe(270));
});

describe("unit economics", () => {
  const f = { cpaUsd: 1.5, cancelPct: 15, failPct: 22, unitsPerOrder: 1, courierFeeGel: 7, failedFeeGel: 7, cardFeePct: 0 };
  it("profit is zero at break-even CPA", () => {
    const u = unitEconomics(5, 39, 2.7, f);
    const z = unitEconomics(5, 39, 2.7, { ...f, cpaUsd: u.breakEvenCpaUsd });
    expect(z.profit).toBeCloseTo(0, 6);
  });
  it("ad cost per delivered = CPA×rate/delivered rate", () => {
    const u = unitEconomics(5, 39, 2.7, f);
    expect(u.adCost).toBeCloseTo((1.5 * 2.7) / (0.85 * 0.78), 6);
  });
});
