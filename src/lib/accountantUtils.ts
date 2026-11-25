export type GroupByOption = "day" | "week" | "month" | "payout_date";
export type StoreOption = "all" | "TrendMart" | "BigMart";
export type SourceOption = "all" | "api" | "excel";
export type QuickRangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export interface AccountantFilters {
  preset: QuickRangeKey;
  from: string;
  to: string;
  groupBy: GroupByOption;
  store: StoreOption;
  source: SourceOption;
  skuSearch: string;
}

const STORAGE_KEY = "accountant_portal_filters_v1";

/** Format a UTC Date's YYYY-MM-DD in Asia/Tbilisi (UTC+4, no DST). */
export function getTbilisiTodayYmd(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmd(d);
}

/**
 * Expected Onway payout date: first Tuesday (ISO 2) or Friday (ISO 5)
 * strictly after the delivery date. Mirrors SQL `onway_expected_payout_date`.
 */
export function expectedOnwayPayoutDate(saleDateYmd: string): string {
  const d = parseYmd(saleDateYmd);
  const jsDow = d.getUTCDay(); // 0=Sun..6=Sat
  const isoDow = jsDow === 0 ? 7 : jsDow; // 1=Mon..7=Sun
  const delta: Record<number, number> = {
    1: 1, // Mon -> Tue
    2: 3, // Tue -> Fri
    3: 2, // Wed -> Fri
    4: 1, // Thu -> Fri
    5: 4, // Fri -> Tue
    6: 3, // Sat -> Tue
    7: 2, // Sun -> Tue
  };
  return addDaysYmd(saleDateYmd, delta[isoDow] ?? 1);
}

export function getQuickRange(preset: Exclude<QuickRangeKey, "custom">, now: Date = new Date()): { from: string; to: string } {
  const today = getTbilisiTodayYmd(now);
  const d = parseYmd(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  const jsDow = d.getUTCDay();
  const isoDow = jsDow === 0 ? 7 : jsDow; // 1=Mon..7=Sun

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yest = addDaysYmd(today, -1);
      return { from: yest, to: yest };
    }
    case "this_week": {
      const mon = addDaysYmd(today, -(isoDow - 1));
      const sun = addDaysYmd(mon, 6);
      return { from: mon, to: sun };
    }
    case "last_week": {
      const lastMon = addDaysYmd(today, -(isoDow - 1) - 7);
      const lastSun = addDaysYmd(lastMon, 6);
      return { from: lastMon, to: lastSun };
    }
    case "this_month": {
      const start = formatYmd(new Date(Date.UTC(y, m, 1)));
      const end = formatYmd(new Date(Date.UTC(y, m + 1, 0)));
      return { from: start, to: end };
    }
    case "last_month": {
      const start = formatYmd(new Date(Date.UTC(y, m - 1, 1)));
      const end = formatYmd(new Date(Date.UTC(y, m, 0)));
      return { from: start, to: end };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor(m / 3) * 3;
      const start = formatYmd(new Date(Date.UTC(y, qStartMonth, 1)));
      const end = formatYmd(new Date(Date.UTC(y, qStartMonth + 3, 0)));
      return { from: start, to: end };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

export function defaultAccountantFilters(now: Date = new Date()): AccountantFilters {
  const { from, to } = getQuickRange("this_month", now);
  return {
    preset: "this_month",
    from,
    to,
    groupBy: "day",
    store: "all",
    source: "all",
    skuSearch: "",
  };
}

export function loadAccountantFilters(): AccountantFilters {
  const fallback = defaultAccountantFilters();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AccountantFilters>;
    return {
      preset: parsed.preset ?? fallback.preset,
      from: typeof parsed.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.from) ? parsed.from : fallback.from,
      to: typeof parsed.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.to) ? parsed.to : fallback.to,
      groupBy: parsed.groupBy && ["day", "week", "month", "payout_date"].includes(parsed.groupBy) ? parsed.groupBy : fallback.groupBy,
      store: parsed.store && ["all", "TrendMart", "BigMart"].includes(parsed.store) ? parsed.store : fallback.store,
      source: parsed.source && ["all", "api", "excel"].includes(parsed.source) ? parsed.source : fallback.source,
      skuSearch: typeof parsed.skuSearch === "string" ? parsed.skuSearch : "",
    };
  } catch {
    return fallback;
  }
}

export function saveAccountantFilters(filters: AccountantFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Proportional revenue attribution across shipment lines with exact sum.
 * Mirrors SQL `_accountant_lines`: splits by price*qty (or qty if all prices <= 0),
 * rounds each line to 2 decimals, and adds any rounding remainder to the largest line.
 */
export function attributeRevenue(
  finalPrice: number,
  lines: Array<{ qty: number; unitPrice: number }>,
): number[] {
  if (lines.length === 0) return [];
  const targetCents = Math.round(finalPrice * 100);
  const priceWeights = lines.map((l) => Math.max(0, l.unitPrice) * Math.max(1, l.qty));
  const priceSum = priceWeights.reduce((a, b) => a + b, 0);
  const weights = priceSum > 0 ? priceWeights : lines.map((l) => Math.max(1, l.qty));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let largestIdx = 0;
  for (let i = 1; i < weights.length; i++) {
    if (weights[i]! > weights[largestIdx]!) largestIdx = i;
  }

  const baseCents = weights.map((w) => Math.round((targetCents * w) / totalWeight));
  const sumCents = baseCents.reduce((a, b) => a + b, 0);
  baseCents[largestIdx] = (baseCents[largestIdx] ?? 0) + (targetCents - sumCents);
  return baseCents.map((c) => Number((c / 100).toFixed(2)));
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    return Number.isFinite(val) ? val.toFixed(2) : "";
  }
  const s = String(val);
  // Prevent Excel formula execution on user/product text
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Build a UTF-8 BOM CSV string with comma separators and plain 2-decimal numbers. */
export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;
}

export function formatPlainNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
  return Number(n).toFixed(2);
}