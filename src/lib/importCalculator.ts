/** Pure math for the admin Import & Profit Calculator. No I/O. */

export type ShipMode = "land" | "air";

export interface PackingInput {
  cartonL?: number | null; cartonW?: number | null; cartonH?: number | null;
  unitsPerCarton?: number | null; cartonKg?: number | null;
  unitKg?: number | null; unitL?: number | null; unitW?: number | null; unitH?: number | null;
  totalCbmOverride?: number | null; totalKgOverride?: number | null;
  manualLogisticsPerUnitUsd?: number | null;
}
export interface RatesInput { landRateCbm: number; landRateKg: number; airRateKg: number; airDivisor: number }

const pos = (v: number | null | undefined): v is number => typeof v === "number" && isFinite(v) && v > 0;

export interface LogisticsResult {
  hasData: boolean; cartons: number; totalCbm: number; totalKg: number;
  land: { byVolume: number; byWeight: number; cost: number; chargedBy: "VOLUME" | "WEIGHT" };
  air: { volumetricKgPerCarton: number; actualKgPerCarton: number; chargeableKg: number; cost: number; chargedBy: "VOLUMETRIC" | "ACTUAL" };
  density: number | null; breakEvenDensity: number;
  manual: boolean; manualCost: number;
}

export function computeLogistics(qty: number, p: PackingInput, r: RatesInput): LogisticsResult {
  const hasCarton = pos(p.cartonL) && pos(p.cartonW) && pos(p.cartonH) && pos(p.unitsPerCarton);
  const hasUnitDims = pos(p.unitL) && pos(p.unitW) && pos(p.unitH);
  let cartons = 0, volPerCarton = 0, kgPerCarton = 0;
  if (hasCarton) {
    cartons = Math.ceil(qty / (p.unitsPerCarton as number));
    volPerCarton = (p.cartonL as number) * (p.cartonW as number) * (p.cartonH as number);
    kgPerCarton = pos(p.cartonKg) ? p.cartonKg : 0;
  } else if (hasUnitDims || pos(p.unitKg)) {
    cartons = qty; // each unit treated as its own parcel
    volPerCarton = hasUnitDims ? (p.unitL as number) * (p.unitW as number) * (p.unitH as number) : 0;
    kgPerCarton = pos(p.unitKg) ? p.unitKg : 0;
  }
  let totalCbm = (volPerCarton / 1_000_000) * cartons;
  let totalKg = kgPerCarton * cartons;
  if (pos(p.totalCbmOverride)) totalCbm = p.totalCbmOverride;
  if (pos(p.totalKgOverride)) totalKg = p.totalKgOverride;
  const hasData = totalCbm > 0 || totalKg > 0;

  const byVolume = totalCbm * r.landRateCbm;
  const byWeight = totalKg * r.landRateKg;
  const landCost = Math.max(byVolume, byWeight);

  // Air: per carton when carton data and no overrides; otherwise totals.
  const div = r.airDivisor || 6000;
  let volKgPC: number, actKgPC: number, chargeableKg: number;
  if (cartons > 0 && !pos(p.totalCbmOverride) && !pos(p.totalKgOverride)) {
    volKgPC = volPerCarton / div; actKgPC = kgPerCarton;
    chargeableKg = Math.max(volKgPC, actKgPC) * cartons;
  } else {
    volKgPC = (totalCbm * 1_000_000) / div; actKgPC = totalKg;
    chargeableKg = Math.max(volKgPC, actKgPC);
  }
  const manual = !hasData && pos(p.manualLogisticsPerUnitUsd);
  return {
    hasData, cartons, totalCbm, totalKg,
    land: { byVolume, byWeight, cost: landCost, chargedBy: byVolume >= byWeight ? "VOLUME" : "WEIGHT" },
    air: { volumetricKgPerCarton: volKgPC, actualKgPerCarton: actKgPC, chargeableKg, cost: chargeableKg * r.airRateKg, chargedBy: volKgPC > actKgPC ? "VOLUMETRIC" : "ACTUAL" },
    density: totalCbm > 0 ? totalKg / totalCbm : null,
    breakEvenDensity: r.landRateKg > 0 ? r.landRateCbm / r.landRateKg : 0,
    manual, manualCost: manual ? (p.manualLogisticsPerUnitUsd as number) * qty : 0,
  };
}

export function logisticsUsd(l: LogisticsResult, mode: ShipMode): number {
  if (l.manual) return l.manualCost;
  if (!l.hasData) return 0;
  return mode === "air" ? l.air.cost : l.land.cost;
}

export interface FunnelInput {
  cpaUsd: number; cancelPct: number; failPct: number; unitsPerOrder: number;
  courierFeeGel: number; failedFeeGel: number; cardFeePct: number;
}

export interface UnitEconomics {
  confirmRate: number; deliveredRate: number; failedRate: number; leadsPerDelivered: number;
  revenue: number; productCost: number; adCost: number; failedCost: number; cardFee: number;
  profit: number; margin: number; breakEvenCpaUsd: number; maxFailPct: number | null;
}

export function unitEconomics(landedPerUnitGel: number, sellGel: number, rate: number, f: FunnelInput): UnitEconomics {
  const confirmRate = 1 - f.cancelPct / 100;
  const fail = f.failPct / 100;
  const deliveredRate = confirmRate * (1 - fail);
  const failedRate = confirmRate * fail;
  const upo = Math.max(1, f.unitsPerOrder || 1);
  const revenue = sellGel * upo;
  const productCost = landedPerUnitGel * upo;
  const cardFee = revenue * (f.cardFeePct / 100);
  const adCost = deliveredRate > 0 ? (f.cpaUsd * rate) / deliveredRate : Infinity;
  const failedCost = deliveredRate > 0 ? (failedRate / deliveredRate) * f.failedFeeGel : Infinity;
  const profit = revenue - productCost - f.courierFeeGel - adCost - failedCost - cardFee;
  const beforeAds = revenue - productCost - f.courierFeeGel - failedCost - cardFee;
  const breakEvenCpaUsd = deliveredRate > 0 && rate > 0 ? Math.max(0, (beforeAds * deliveredRate) / rate) : 0;
  const profitAtFail = (fp: number) => unitEconomics0(landedPerUnitGel, sellGel, rate, { ...f, failPct: fp });
  let maxFailPct: number | null = null;
  if (profitAtFail(0) > 0) {
    if (profitAtFail(99.9) > 0) maxFailPct = 99.9;
    else { let lo = 0, hi = 99.9; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (profitAtFail(m) > 0) lo = m; else hi = m; } maxFailPct = lo; }
  }
  return { confirmRate, deliveredRate, failedRate, leadsPerDelivered: deliveredRate > 0 ? 1 / deliveredRate : Infinity,
    revenue, productCost, adCost, failedCost, cardFee, profit, margin: revenue > 0 ? profit / revenue : 0, breakEvenCpaUsd, maxFailPct };
}

function unitEconomics0(landed: number, sell: number, rate: number, f: FunnelInput): number {
  const c = 1 - f.cancelPct / 100, fail = f.failPct / 100, d = c * (1 - fail);
  if (d <= 0) return -Infinity;
  const upo = Math.max(1, f.unitsPerOrder || 1), rev = sell * upo;
  return rev - landed * upo - f.courierFeeGel - (f.cpaUsd * rate) / d - ((c * fail) / d) * f.failedFeeGel - rev * (f.cardFeePct / 100);
}

export interface BatchTotals {
  deliveredOrders: number; leads: number; confirmed: number; failed: number;
  adSpend: number; courierFees: number; failedCosts: number; revenue: number;
  profit: number; roi: number; peakCash: number; totalCashOut: number;
}

export function batchTotals(qty: number, goodsGel: number, logisticsGel: number, u: UnitEconomics, f: FunnelInput): BatchTotals {
  const deliveredOrders = qty / Math.max(1, f.unitsPerOrder || 1);
  const leads = u.deliveredRate > 0 ? deliveredOrders / u.deliveredRate : 0;
  const adSpend = deliveredOrders * u.adCost;
  const courierFees = deliveredOrders * f.courierFeeGel;
  const failedCosts = deliveredOrders * u.failedCost;
  const revenue = deliveredOrders * u.revenue;
  const profit = deliveredOrders * u.profit;
  const totalCashOut = goodsGel + logisticsGel + adSpend + courierFees + failedCosts;
  return { deliveredOrders, leads, confirmed: leads * u.confirmRate, failed: leads * u.failedRate,
    adSpend, courierFees, failedCosts, revenue, profit, roi: totalCashOut > 0 ? profit / totalCashOut : 0,
    peakCash: goodsGel + logisticsGel + adSpend, totalCashOut };
}
