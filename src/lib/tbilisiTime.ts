/**
 * Tbilisi (UTC+04:00, no DST since 2005) day-boundary helpers.
 * Shared by the admin Dashboard and Operator Stats so both pages cut days identically.
 */
export const TBILISI_OFFSET_MS = 4 * 3600 * 1000;

/** Start of the Tbilisi calendar day containing `d`, as a UTC Date. */
export function tbilisiStartOfDay(d: Date): Date {
  const tbilisiMs = d.getTime() + TBILISI_OFFSET_MS;
  const dayStartUtcMs = Math.floor(tbilisiMs / 86400000) * 86400000;
  return new Date(dayStartUtcMs - TBILISI_OFFSET_MS);
}

/** End (inclusive, ms precision) of the Tbilisi calendar day containing `d`. */
export function tbilisiEndOfDay(d: Date): Date {
  return new Date(tbilisiStartOfDay(d).getTime() + 86400000 - 1);
}

/** Stable YYYY-MM-DD key of the Tbilisi calendar day for an ISO timestamp or Date. */
export function tbilisiDayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}
